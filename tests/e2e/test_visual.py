"""Visual regression (plan 10.5): baselines at 1440, 1024 and 390 for the key pages, threshold 0.2 %.

Baselines live in tests/e2e/baselines/<browser>-<platform>/<page>-<width>.png because font rasterisation
differs per OS and browser. A missing baseline for the current browser/platform SKIPS (it never silently
passes); create it with ``--update-baselines``. See tests/e2e/README_E2E.md.
"""
import datetime
import os
import sys

import pytest

import helpers
from conftest import api_token, launch_app, seed_script
from helpers import compare_baseline, goto

pytestmark = pytest.mark.visual

SIZES = {"1440": (1440, 900), "1024": (1024, 768), "390": (390, 844)}
# (name, route, role, ready selector, volatile selectors to hide)
PAGES = [
    ("signin", "/signin", None, ".signin__card", []),
    ("home", "/", "Justice", "h1", [".g-fresh"]),
    ("research", "/research", "Justice", "h1", [".g-fresh"]),
    ("judgment", "/judgments/1", "Justice", "h1", [".g-fresh"]),
    ("citation-check", "/judgments/check", "Justice", "h1", [".g-fresh"]),
    ("matters", "/matters", "Justice", "h1", [".g-fresh"]),
    ("intake", "/matters/new", "Clerk", "h1", [".g-fresh"]),
    ("drafts", "/drafts", "Justice", "h1", [".g-fresh"]),
    ("studio", "/drafts/1", "Justice", "h1", [".g-fresh"]),
    ("review", "/drafts/4/review", "Justice", "h1", [".g-fresh"]),
    ("graph", "/graph", "Justice", "h1", [".g-fresh"]),
    ("alerts", "/alerts", "Justice", "h1", [".g-fresh"]),
    ("audit", "/audit", "Auditor", "h1", [".g-fresh", ".g-table-wrap", ".audit__verify, [aria-label='Chain integrity']"]),
    ("chamber", "/chamber", "Admin", "h1", [".g-fresh"]),
    ("library", "/library", "Student", "h1", [".g-fresh"]),
    ("settings", "/settings", "Student", "h1", [".g-fresh"]),
    ("forbidden", "/forbidden", "Student", "h1", [".g-fresh"]),
    ("not-found", "/not-found", "Student", "h1", [".g-fresh"]),
]


@pytest.fixture(scope="module")
def base_url():
    """A private, untouched app instance: other modules create drafts and audit rows that would change pages."""
    yield from launch_app()


def _platform():
    return {"win32": "win", "darwin": "mac"}.get(sys.platform, "linux")


@pytest.mark.parametrize("width", list(SIZES))
@pytest.mark.parametrize("name,route,role,ready,hide", PAGES, ids=[p[0] for p in PAGES])
def test_visual(browser, browser_name, base_url, request, name, route, role, ready, hide, width):
    update = request.config.getoption("--update-baselines")
    key = f"{browser_name}-{_platform()}/{name}-{width}"
    base_dir = os.path.join(helpers.BASELINE_DIR, f"{browser_name}-{_platform()}")
    if not update and not os.path.exists(helpers.lp(os.path.join(base_dir, f"{name}-{width}.png"))):
        pytest.skip(f"no baseline {key}; run with --update-baselines to create it")
    w, h = SIZES[width]
    ctx = browser.new_context(viewport={"width": w, "height": h}, base_url=base_url, reduced_motion="reduce",
                              locale="en-IN", timezone_id="Asia/Kolkata", device_scale_factor=1)
    try:
        ctx.clock.set_fixed_time(datetime.datetime(2026, 10, 26, 10, 30, 0))
        if role:
            tok, user = api_token(base_url, role)
            ctx.add_init_script(seed_script(tok, user))
        page = ctx.new_page()
        goto(page, route)
        page.wait_for_selector(ready)
        page.wait_for_timeout(500)
        page.mouse.move(0, 0)
        # volatile regions (clock text, live audit rows) are painted over: the app CSP forbids injecting a <style>
        shot = page.screenshot(full_page=True, animations="disabled", caret="hide",
                               mask=[page.locator(sel) for sel in hide], mask_color="#000000")
        ok, msg = compare_baseline(f"{browser_name}-{_platform()}/{name}-{width}", shot, update=update,
                                   out_dir=os.path.join(helpers.HERE, ".artifacts"))
        assert ok, msg
    finally:
        ctx.close()
