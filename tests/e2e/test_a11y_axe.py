"""Focused axe-core sweep (Chromium only): admin on 11 routed pages x {1280px, 375px, data-fontsize=xlarge}.

Uses the vendored tests/e2e/vendor/axe.min.js (injected via evaluate; never fetched from a CDN).
Fails on serious/critical violations. Findings are written to docs/A11Y_FINDINGS.md by hand from this output.
"""
import json
import os

import pytest

from conftest import api_token, seed_script
from helpers import AXE_PATH, format_violations, goto, lp, run_axe

pytestmark = pytest.mark.a11y

PAGES = [("home", "/"), ("research", "/research"), ("studio", "/drafts/1"), ("drafts", "/drafts"),
         ("intake", "/matters/new"), ("audit", "/audit"), ("settings", "/settings"), ("library", "/library"),
         ("alerts", "/alerts"), ("matters", "/matters"), ("citation-check", "/judgments/check")]
MODES = {"1280": (1280, 800, None), "375": (375, 812, None), "xlarge": (1280, 800, "xlarge")}


def _find_chromium():
    """Executable override: GYANAM_E2E_CHROMIUM, else any installed ms-playwright chromium (the pinned
    playwright revision may be newer than what is installed; we never download browsers)."""
    import glob
    env = os.environ.get("GYANAM_E2E_CHROMIUM")
    if env:
        return env
    root = os.path.join(os.environ.get("LOCALAPPDATA", ""), "ms-playwright")
    for pat in ("chromium-*/chrome-win64/chrome.exe", "chromium-*/chrome-linux/chrome"):
        hits = sorted(glob.glob(os.path.join(root, pat)))
        if hits:
            return hits[-1]
    return None


@pytest.fixture(scope="session")
def browser(_pw, browser_name):
    if browser_name != "chromium":
        pytest.skip("axe sweep is Chromium only")
    exe = _find_chromium()
    try:
        b = _pw.chromium.launch(headless=True)
    except Exception:
        if not exe:
            pytest.skip("no Chromium installed for playwright")
        b = _pw.chromium.launch(headless=True, executable_path=exe)
    yield b
    b.close()


@pytest.fixture(autouse=True)
def _chromium_only(browser_name):
    if browser_name != "chromium":
        pytest.skip("axe sweep is Chromium only")
    if not os.path.exists(AXE_PATH):
        pytest.skip(f"axe-core not found at {AXE_PATH}; not fetching from a CDN")


@pytest.mark.parametrize("mode", list(MODES))
@pytest.mark.parametrize("name,route", PAGES, ids=[p[0] for p in PAGES])
def test_axe_admin(browser, base_url, name, route, mode):
    w, h, fs = MODES[mode]
    ctx = browser.new_context(viewport={"width": w, "height": h}, base_url=base_url, reduced_motion="reduce")
    ctx.set_default_timeout(15000)
    tok, user = api_token(base_url, "Admin")
    ctx.add_init_script(seed_script(tok, user))
    if fs:
        ctx.add_init_script(f"try{{localStorage.setItem('gyanam.fontsize','{fs}')}}catch(e){{}}")
    page = ctx.new_page()
    try:
        goto(page, route)
        if fs:
            page.evaluate("(s) => { document.documentElement.dataset.fontsize = s; }", fs)
        page.wait_for_timeout(400)
        vs = run_axe(page)
        assert not vs, f"{name} @{mode}\n" + format_violations(vs)
    finally:
        ctx.close()


# ---------------------------------------------------------------------------------------------------------
# REPORT-ONLY collection mode (never fails on violations). Enable with GYANAM_AXE_ALL=1.
# Runs axe with every impact (incl. moderate/minor) and the best-practice + wcag22aa tags, over the same
# 11 pages x 3 modes plus Hindi (home/studio/intake), sidebar-collapsed, open palette, intake "View full
# size" dialog (best effort) and the admin role-preview banner. Writes tests/e2e/.artifacts/axe_all.json.
# ---------------------------------------------------------------------------------------------------------
ALL_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]
OUT_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".artifacts", "axe_all.json")
_COLLECTED = []   # flat finding rows
_NOTES = []       # scenarios that could not be reached etc.

_all_only = pytest.mark.skipif(os.environ.get("GYANAM_AXE_ALL") != "1", reason="set GYANAM_AXE_ALL=1 for the report-only axe collection")


def _run_axe_all(page):
    if not page.evaluate("() => typeof window.axe !== 'undefined'"):
        with open(AXE_PATH, encoding="utf-8") as f:
            page.evaluate(f.read())
    return page.evaluate(
        "async (tags) => { const r = await axe.run(document, {runOnly: {type: 'tag', values: tags}}); "
        "return r.violations.map(v => ({id: v.id, impact: v.impact, help: v.help, tags: v.tags, nodes: v.nodes.map(n => ({"
        "target: n.target.join(' '), summary: (n.failureSummary || '').slice(0, 300)}))})); }", ALL_TAGS)


def _record(scenario, page_name, mode, violations):
    for v in violations:
        for n in v["nodes"]:
            _COLLECTED.append({"rule": v["id"], "impact": v["impact"], "help": v["help"],
                               "best_practice": "best-practice" in v["tags"], "scenario": scenario,
                               "page": page_name, "mode": mode, "selector": n["target"], "fix": n["summary"]})
    _flush()


def _flush():
    os.makedirs(lp(os.path.dirname(OUT_JSON)), exist_ok=True)
    with open(lp(OUT_JSON), "w", encoding="utf-8") as f:
        json.dump({"tags": ALL_TAGS, "notes": _NOTES, "findings": _COLLECTED}, f, indent=1, ensure_ascii=False)


def _ctx(browser, base_url, w, h, fs=None, lang=None, storage=None, role="Admin"):
    ctx = browser.new_context(viewport={"width": w, "height": h}, base_url=base_url, reduced_motion="reduce")
    ctx.set_default_timeout(15000)
    tok, user = api_token(base_url, role)
    ctx.add_init_script(seed_script(tok, user))
    if fs:
        ctx.add_init_script(f"try{{localStorage.setItem('gyanam.fontsize','{fs}')}}catch(e){{}}")
    if lang:
        ctx.add_init_script(f"try{{localStorage.setItem('gyanam.lang','{lang}')}}catch(e){{}}")
    for k, v in (storage or {}).items():
        ctx.add_init_script(f"try{{localStorage.setItem('{k}','{v}')}}catch(e){{}}")
    return ctx


def _safe(scenario, name, mode, fn):
    try:
        fn()
    except Exception as e:  # report-only: record why a scenario was not reachable, never fail
        _NOTES.append({"scenario": scenario, "page": name, "mode": mode, "error": str(e)[:300]})
        try:
            _flush()
        except Exception:
            pass


@_all_only
@pytest.mark.parametrize("mode", list(MODES))
@pytest.mark.parametrize("name,route", PAGES, ids=[p[0] for p in PAGES])
def test_axe_collect_all_pages(browser, base_url, name, route, mode):
    w, h, fs = MODES[mode]
    ctx = _ctx(browser, base_url, w, h, fs=fs)
    page = ctx.new_page()

    def go():
        goto(page, route)
        if fs:
            page.evaluate("(s) => { document.documentElement.dataset.fontsize = s; }", fs)
        page.wait_for_timeout(400)
        _record("page", name, mode, _run_axe_all(page))
    try:
        _safe("page", name, mode, go)
    finally:
        ctx.close()


@_all_only
@pytest.mark.parametrize("name,route", [p for p in PAGES if p[0] in ("home", "studio", "intake")], ids=["home", "studio", "intake"])
def test_axe_collect_all_hindi(browser, base_url, name, route):
    ctx = _ctx(browser, base_url, 1280, 800, lang="hi")
    page = ctx.new_page()

    def go():
        goto(page, route)
        page.wait_for_timeout(400)
        _record("hindi", name, "1280", _run_axe_all(page))
    try:
        _safe("hindi", name, "1280", go)
    finally:
        ctx.close()


@_all_only
@pytest.mark.parametrize("name,route", [("home", "/"), ("research", "/research"), ("studio", "/drafts/1")], ids=["home", "research", "studio"])
def test_axe_collect_all_sidebar_collapsed(browser, base_url, name, route):
    ctx = _ctx(browser, base_url, 1280, 800, storage={"gyanam.sidebar": "collapsed"})
    page = ctx.new_page()

    def go():
        goto(page, route)
        page.wait_for_timeout(400)
        _record("sidebar-collapsed", name, "1280", _run_axe_all(page))
    try:
        _safe("sidebar-collapsed", name, "1280", go)
    finally:
        ctx.close()


@_all_only
def test_axe_collect_all_palette(browser, base_url):
    ctx = _ctx(browser, base_url, 1280, 800)
    page = ctx.new_page()

    def go():
        goto(page, "/")
        page.keyboard.press("Control+k")
        page.get_by_role("combobox", name="Search commands").wait_for()
        page.wait_for_timeout(300)
        _record("palette-open", "home", "1280", _run_axe_all(page))
    try:
        _safe("palette-open", "home", "1280", go)
    finally:
        ctx.close()


@_all_only
def test_axe_collect_all_fullsize_dialog(browser, base_url, tmp_path):
    from helpers import blank_png
    ctx = _ctx(browser, base_url, 1280, 800, role="Clerk")
    page = ctx.new_page()

    def go():
        goto(page, "/matters/new")
        page.locator("input[type=file]").set_input_files(blank_png(str(tmp_path / "scan.png")))
        btn = page.get_by_role("button", name="View full size")
        btn.wait_for(timeout=20000)
        btn.click()
        page.locator("[role=dialog], [role=alertdialog]").last.wait_for()
        page.wait_for_timeout(300)
        _record("fullsize-dialog", "intake", "1280", _run_axe_all(page))
    try:
        _safe("fullsize-dialog", "intake", "1280", go)
    finally:
        ctx.close()


@_all_only
@pytest.mark.parametrize("width", [1280, 375])
def test_axe_collect_all_role_preview(browser, base_url, width):
    ctx = _ctx(browser, base_url, width, 800 if width > 400 else 812)
    page = ctx.new_page()

    def go():
        goto(page, "/")
        page.locator("#g-preview-select").select_option("STUDENT")
        page.locator(".g-preview-banner").wait_for()
        page.wait_for_timeout(400)
        _record("role-preview-banner", "home", str(width), _run_axe_all(page))
    try:
        _safe("role-preview-banner", "home", str(width), go)
    finally:
        ctx.close()


# The Admin role cannot open the drafter-only routes (they render the Forbidden page for Admin), so the
# Admin sweep above says little about studio/drafts/intake/alerts/matters. Re-scan them as Clerk.
DRAFTER_PAGES = [p for p in PAGES if p[0] in ("studio", "drafts", "intake", "alerts", "matters")]


@_all_only
@pytest.mark.parametrize("lang", ["en", "hi"])
@pytest.mark.parametrize("mode", list(MODES))
@pytest.mark.parametrize("name,route", DRAFTER_PAGES, ids=[p[0] for p in DRAFTER_PAGES])
def test_axe_collect_all_clerk_pages(browser, base_url, name, route, mode, lang):
    w, h, fs = MODES[mode]
    ctx = _ctx(browser, base_url, w, h, fs=fs, lang=None if lang == "en" else lang, role="Clerk")
    page = ctx.new_page()
    label = "clerk" if lang == "en" else "clerk-hindi"

    def go():
        goto(page, route)
        if fs:
            page.evaluate("(s) => { document.documentElement.dataset.fontsize = s; }", fs)
        page.wait_for_timeout(400)
        _record(label, name, mode, _run_axe_all(page))
    try:
        _safe(label, name, mode, go)
    finally:
        ctx.close()
