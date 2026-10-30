"""Bug 8: the router clears the outlet and shows a loading placeholder while an async render() is pending,
and a stale (abandoned) navigation can never paint over the page the user is actually on."""
import re

from helpers import goto, wait_ready

OBSERVER = """() => {
  window.__h1s = [];
  const note = () => document.querySelectorAll('h1').forEach((e) => window.__h1s.push(e.textContent.trim()));
  new MutationObserver(note).observe(document.body, {childList: true, subtree: true});
}"""


def _hold_alerts(page):
    held = []
    page.route(re.compile(r"/api/alerts"), lambda route: held.append(route))
    return held


def _release(page, held):
    for r in held:
        try:
            r.continue_()
        except Exception:
            pass
    held.clear()


def test_placeholder_replaces_previous_page_while_pending(page, login):
    login("Justice")
    goto(page, "/settings")
    held = _hold_alerts(page)
    page.evaluate("() => { location.hash = '#/alerts'; }")
    page.wait_for_function("() => document.title.startsWith('Alerts') || !!document.querySelector('#main [role=status], main [role=status]')",
                           timeout=15000)
    page.wait_for_function("() => location.hash === '#/alerts'")
    for _ in range(40):
        if held:
            break
        page.wait_for_timeout(100)
    assert held, "alerts API call never issued"
    out = page.evaluate("""() => {
      const main = document.querySelector('main') || document.body;
      return {busy: main.querySelector('[aria-busy="true"]') !== null,
              status: !!main.querySelector('[role=status]'),
              settingsGone: !Array.from(main.querySelectorAll('h1')).some((e) => /Settings/.test(e.textContent)),
              crumb: document.body.innerText.includes('Alerts')};
    }""")
    assert out["status"] and out["busy"], out
    assert out["settingsGone"], "previous page content still visible under the new URL"
    _release(page, held)
    wait_ready(page)
    assert page.title() == "Alerts · Gyanam AI"
    assert page.evaluate("() => document.activeElement && document.activeElement.tagName") == "H1"
    assert page.locator("[aria-busy='true']").count() == 0


def test_abandoned_navigation_never_paints(page, login):
    login("Justice")
    goto(page, "/research")
    page.evaluate(OBSERVER)
    held = _hold_alerts(page)
    page.evaluate("() => { location.hash = '#/alerts'; }")
    for _ in range(40):
        if held:
            break
        page.wait_for_timeout(100)
    assert held, "alerts API call never issued"
    page.evaluate("() => { location.hash = '#/settings'; }")
    page.wait_for_function("() => document.title.startsWith('Settings')")
    _release(page, held)
    page.wait_for_timeout(800)
    assert page.title() == "Settings · Gyanam AI"
    assert page.locator("h1").first.inner_text().strip() == "Settings"
    seen = page.evaluate("() => window.__h1s")
    assert "Alerts" not in seen, seen
    assert page.locator("[aria-busy='true']").count() == 0


def test_other_async_pages_normal_speed(page, login):
    login("Justice")
    for route, title in (("/research", "Research"), ("/documents", "Documents"), ("/drafts", "Drafts"), ("/matters", "Matters")):
        goto(page, route)
        assert page.title().startswith(title), (route, page.title())
        assert page.locator("h1").count() >= 1
        assert page.locator("[aria-busy='true']").count() == 0
        assert page.evaluate("() => document.activeElement.tagName") == "H1"
