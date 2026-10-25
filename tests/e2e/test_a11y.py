"""axe-core on every route at 1440 and 390 px, in English and Hindi. Serious or critical violations fail (plan 10.5)."""
import pytest

from conftest import api_token, seed_script
from helpers import CONSOLE_IGNORE, create_draft, dialog, format_violations, goto, routes, run_axe, wait_ready

pytestmark = pytest.mark.a11y

_IDS = {"judgment": 1, "draft": 1, "review_draft": 4, "matter": "macp-3-2021"}
# (name, route, role); the sign-in page is public (role None). Pick the most capable allowed role per page.
PAGES = [("signin", "/signin", None)] + [
    (name, route, roles[0] if name not in ("audit",) else "Justice")
    for name, route, roles in routes(_IDS) if name not in ("forbidden", "not-found")
] + [("forbidden", "/forbidden", "Student"), ("not-found", "/not-found", "Justice")]
WIDTHS = {"1440": (1440, 900), "390": (390, 844)}


def _open(browser, base_url, role, width, lang):
    w, h = WIDTHS[width]
    # reduced motion: axe must not sample colours mid fade-in of a dialog
    ctx = browser.new_context(viewport={"width": w, "height": h}, base_url=base_url, reduced_motion="reduce")
    ctx.set_default_timeout(15000)
    ctx.add_init_script(f"try{{localStorage.setItem('gyanam.lang','{lang}')}}catch(e){{}}")
    if role:
        tok, user = api_token(base_url, role)
        ctx.add_init_script(seed_script(tok, user))
    page = ctx.new_page()
    return ctx, page


@pytest.mark.parametrize("lang", ["en", "hi"])
@pytest.mark.parametrize("width", list(WIDTHS))
@pytest.mark.parametrize("name,route,role", PAGES, ids=[p[0] for p in PAGES])
def test_axe_page(browser, base_url, browser_name, name, route, role, width, lang):
    ctx, page = _open(browser, base_url, role, width, lang)
    try:
        goto(page, route)
        page.wait_for_timeout(400)
        violations = run_axe(page)
        assert not violations, f"{name} @{width} [{lang}]\n" + format_violations(violations)
    finally:
        ctx.close()


@pytest.mark.parametrize("width", list(WIDTHS))
def test_axe_open_overlays(browser, base_url, browser_name, width):
    """The command palette and a confirm dialog are separate DOM trees; scan them open."""
    ctx, page = _open(browser, base_url, "Justice", width, "en")
    try:
        goto(page, "/")
        page.keyboard.press("Control+k")
        page.get_by_role("combobox", name="Search commands").wait_for()
        v = run_axe(page)
        assert not v, "palette\n" + format_violations(v)
        page.keyboard.press("Escape")
        page.get_by_role("combobox", name="Search commands").wait_for(state="hidden")
        goto(page, f"/drafts/{create_draft(base_url, api_token(base_url, 'Justice')[0], 'A11y Dialog v. State', 'A11Y/1/2026')}")
        page.get_by_role("button", name="Send for review").click()
        dialog(page).wait_for()
        v = run_axe(page)
        assert not v, "confirm dialog\n" + format_violations(v)
    finally:
        ctx.close()
