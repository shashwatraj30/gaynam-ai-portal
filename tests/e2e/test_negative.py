"""Negative paths (plan 10.4): invalid/expired token, offline, 409 conflict, empty search, OCR fallback, 404."""
import json
import re
import time

import pytest
from playwright.sync_api import expect

from conftest import api_token, seed_script
from helpers import CONSOLE_IGNORE, blank_png, create_draft, dialog, goto


def _seed(context, token):
    context.add_init_script(
        "(()=>{try{sessionStorage.setItem('gyanam.token'," + json.dumps(token) + ");}catch(e){}})();")


def test_invalid_token_goes_to_signin(page, context):
    _seed(context, "not-a-real-token")
    page.goto("/app/#/research")
    page.wait_for_url(re.compile(r"#/signin"))
    expect(page.get_by_role("heading", level=1)).to_be_visible()
    assert page.evaluate("() => sessionStorage.getItem('gyanam.token')") in (None, "")


def test_expired_token_goes_to_signin(page, context):
    jwt = pytest.importorskip("jwt")
    token = jwt.encode({"user_id": "usr_nluj_001", "role": "HON_JUSTICE", "sub": "usr_nluj_001",
                        "exp": int(time.time()) - 3600, "iat": int(time.time()) - 7200},
                       "e2e-secret-not-for-production", algorithm="HS256")
    _seed(context, token)
    page.goto("/app/#/drafts")
    page.wait_for_url(re.compile(r"#/signin"))
    assert "next=" in page.url  # the deep link is remembered for after sign in
    assert page.evaluate("() => sessionStorage.getItem('gyanam.token')") in (None, "")


def test_token_revoked_mid_session_returns_to_signin(page, login):
    """A 401 from any API call clears the session and shows the sign in page."""
    login("Justice")
    goto(page, "/research")
    page.route("**/api/search", lambda route: route.fulfill(
        status=401, content_type="application/json",
        body=json.dumps({"detail": "Session expired. Please re-authenticate.", "code": "AUTH_INVALID_TOKEN"})))
    page.get_by_label("Your question").fill("bail")
    page.locator("main button[type=submit]").click()
    page.wait_for_url(re.compile(r"#/signin"))


def test_offline_banner(page, context, login, browser_name):
    login("Justice")
    goto(page, "/research")
    banner = page.get_by_text("You are offline", exact=False)
    expect(banner).to_be_hidden()
    context.set_offline(True)
    page.get_by_label("Your question").fill("bail")
    page.locator("main button[type=submit]").click()
    expect(banner).to_be_visible()
    context.set_offline(False)
    page.evaluate("() => window.dispatchEvent(new Event('online'))")
    expect(banner).to_be_hidden()


def test_conflict_dialog_when_saving_in_two_contexts(browser, base_url, login, context, page):
    """Two sessions edit the same draft; the second save gets 409 and the 'changed elsewhere' dialog."""
    login("Justice")
    ctx_b = browser.new_context(viewport={"width": 1440, "height": 900}, base_url=base_url)
    tok, user = api_token(base_url, "Justice")
    ctx_b.add_init_script(seed_script(tok, user))
    page_b = ctx_b.new_page()
    draft_id = create_draft(base_url, tok)
    try:
        for p in (page, page_b):
            goto(p, f"/drafts/{draft_id}")
            expect(p.locator("#sec-4")).to_be_visible()
        a = page.locator("#sec-4")
        a.fill(a.input_value() + " Edited in session A.")
        expect(page.get_by_text(re.compile(r"^Saved"))).to_be_visible(timeout=10000)
        b = page_b.locator("#sec-4")
        b.fill(b.input_value() + " Edited in session B.")
        d = dialog(page_b)
        expect(d).to_contain_text("changed elsewhere", timeout=15000)
        d.get_by_role("button", name="Reload their version").click()
        expect(page_b.locator("#sec-4")).to_have_value(re.compile("Edited in session A"))
    finally:
        ctx_b.close()


def test_empty_search_state(page, login):
    login("Justice")
    goto(page, "/research")
    page.get_by_label("Your question").fill("zzqxjvk nonexistent phrase")
    page.locator("main button[type=submit]").click()
    expect(page.get_by_text("No authorities found")).to_be_visible()
    assert not page.tracker.errors(ignore=CONSOLE_IGNORE)


def test_ocr_fallback_shows_failed_banner(page, login, tmp_path):
    # The engine never fabricates text: a blank scan yields an honest "could not be read" state,
    # not a silently-substituted canned sample. The empty case_title/facts fields then block
    # "Continue to confirm issues" via normal required-field validation (no disabled attribute).
    login("Clerk")
    goto(page, "/matters/new")
    png = blank_png(str(tmp_path / "blank_scan.png"))
    page.locator("input[type=file]").set_input_files(png)
    expect(page.get_by_text("The text could not be read", exact=False).first).to_be_visible(timeout=60000)
    page.get_by_role("button", name="Continue to confirm issues").click()
    expect(page.get_by_text("Check what we read")).to_be_visible()
    expect(page.get_by_text("This field is required.", exact=False).first).to_be_visible()


def test_unknown_route_is_404_page(page, login):
    login("Justice")
    page.goto("/app/#/definitely/not/a/page")
    page.wait_for_selector("h1")
    expect(page.get_by_role("heading", level=1)).to_have_text("Page not found")
