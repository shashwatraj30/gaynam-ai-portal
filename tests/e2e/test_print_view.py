"""Bug 7: the review page's "Open print view" must open a real window (window.open runs synchronously in the click)."""
import re

from playwright.sync_api import expect

PRINT_ROUTE = "**/api/draft/export/print/*"


def _open_review(page, base_url, login, ids):
    login("Justice")
    page.goto(f"{base_url}/#/drafts/{ids['review_draft']}/review")
    btn = page.get_by_role("button", name="Open print view")
    expect(btn).to_be_visible()
    return btn


def test_print_view_opens_window_with_content(page, context, base_url, login, ids):
    btn = _open_review(page, base_url, login, ids)
    with context.expect_page() as info:
        btn.click()
    popup = info.value
    popup.wait_for_url(re.compile(r"^blob:"))
    popup.wait_for_load_state()
    expect(popup.get_by_text("OFFICIAL COURT PUBLICATION VIEW")).to_be_visible()
    body = popup.inner_text("body")
    assert "J U D G M E N T" in body and "SHA-256 Hash" in body
    assert "Loading" not in body


def test_print_view_failure_closes_window_and_toasts(page, context, base_url, login, ids):
    btn = _open_review(page, base_url, login, ids)
    page.route(PRINT_ROUTE, lambda r: r.fulfill(status=500, content_type="application/json",
                                                 body='{"detail":"boom"}'))
    with context.expect_page() as info:
        btn.click()
    popup = info.value
    page.wait_for_function("true")
    for _ in range(50):
        if popup.is_closed():
            break
        page.wait_for_timeout(100)
    assert popup.is_closed()
    assert [p for p in context.pages if not p.is_closed()] == [page]
    expect(page.locator("[role=status], [role=alert], .toast").filter(has_text=re.compile("boom|error|wrong|fail", re.I)).first).to_be_visible()


def test_print_view_popup_blocked_handle_null(page, context, base_url, login, ids):
    btn = _open_review(page, base_url, login, ids)
    page.evaluate("window.open = () => null")
    btn.click()
    expect(page.get_by_text("Pop-up blocked")).to_be_visible()
    assert page.tracker.pageerrors == []
    assert len(context.pages) == 1
