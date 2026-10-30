"""Bug 6: a modal's confirm button must never be clipped; only the modal body scrolls.

Opens real consumers (review Approve/Seal, documents delete, chamber suspend) at several viewports, injects a tall
element into the body so the overflow condition is reproduced regardless of fixture data, then asserts the confirm
button is fully inside the viewport and that Playwright can really click it (actionability incl. hit-target check).
"""
import pytest
from playwright.sync_api import expect

from helpers import dialog, goto, wait_ready

VIEWPORTS = [(1024, 768), (1024, 600), (390, 844)]


def _inject_tall_body(page):
    page.evaluate("""() => {
        const b = [...document.querySelectorAll('.g-modal__body')].pop();
        const d = document.createElement('div');
        d.id = 'e2e-tall'; d.style.height = '2000px'; d.textContent = 'long reason text';
        b.append(d);
    }""")


def _assert_button_reachable(page, name):
    dlg = dialog(page)
    btn = dlg.get_by_role("button", name=name, exact=True)
    expect(btn).to_be_visible()
    vp = page.viewport_size
    box = btn.bounding_box()
    assert box is not None
    assert box["x"] >= 0 and box["y"] >= 0, box
    assert box["x"] + box["width"] <= vp["width"] + 0.5, (box, vp)
    assert box["y"] + box["height"] <= vp["height"] + 0.5, (box, vp)
    panel = page.locator(".g-modal__panel").last.bounding_box()
    assert panel["y"] >= 0 and panel["y"] + panel["height"] <= vp["height"] + 0.5, (panel, vp)
    btn.click(trial=True, timeout=3000)  # actionability: visible, stable, receives pointer events at its centre
    return btn


@pytest.mark.parametrize("vw,vh", VIEWPORTS)
def test_documents_delete_confirm_reachable(page, login, vw, vh):
    login("Justice")
    page.set_viewport_size({"width": vw, "height": vh})
    # the delete confirmation is reachable without a stored document through the shared confirm dialog
    goto(page, "/documents")
    page.evaluate("""async () => {
        const m = await import('/app/js/ui/confirm.js');
        window.__p = m.confirmDialog({title: 'Delete document?', message: 'This cannot be undone. '.repeat(5),
                                      confirmLabel: 'Delete', tone: 'danger'});
    }""")
    expect(dialog(page)).to_be_visible()
    _inject_tall_body(page)
    btn = _assert_button_reachable(page, "Delete")
    btn.click()
    assert page.evaluate("() => window.__p") is True


@pytest.mark.parametrize("vw,vh", VIEWPORTS)
def test_chamber_suspend_confirm_reachable(page, login, vw, vh):
    login("Admin")
    page.set_viewport_size({"width": vw, "height": vh})
    goto(page, "/chamber")
    row = page.get_by_role("row").filter(has_text="Ananya Rathore")
    row.get_by_role("button", name="Suspend").click()
    expect(dialog(page)).to_be_visible()
    _inject_tall_body(page)
    _assert_button_reachable(page, "Suspend")
    dialog(page).get_by_role("button", name="Cancel").click()  # harmless: leave the user active
    expect(dialog(page)).to_be_hidden()


def _open_review_as(page, draft_id, status):
    """Open the review page with the draft reported as `status` (response rewritten in the browser, no DB write)."""
    def fix(route):
        resp = route.fetch()
        body = resp.json()
        body["status"] = status
        route.fulfill(response=resp, json=body)
    page.route(f"**/api/draft/{draft_id}", fix)
    goto(page, f"/drafts/{draft_id}/review")
    wait_ready(page)


@pytest.mark.parametrize("vw,vh", VIEWPORTS)
@pytest.mark.parametrize("status,label", [("IN_REVIEW", "Approve"), ("BENCH_APPROVED", "Seal as final")])
def test_review_approve_and_seal_confirm_reachable(page, login, vw, vh, status, label):
    login("Justice")
    page.set_viewport_size({"width": vw, "height": vh})
    _open_review_as(page, 4, status)
    trigger = page.locator("main").get_by_role("button", name=label, exact=True)
    expect(trigger).to_be_enabled()
    trigger.click()
    expect(dialog(page)).to_be_visible()
    _inject_tall_body(page)
    _assert_button_reachable(page, label)
    dialog(page).get_by_role("button", name="Cancel").click()
    expect(dialog(page)).to_be_hidden()
