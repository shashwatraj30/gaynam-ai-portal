"""Documents feature journey (v3: Documents + parity), plan docs/AGENT_BRIEF_V3.md / docs/API_V3_CONTRACT.md.

Clerk/Researcher (UPLOAD_PLEADING + DRAFT_FULL): upload the sample pleading -> land on the document workspace
-> Details tab (and fill any field OCR/parsing missed) -> Issues tab: add an issue, acknowledge, confirm ->
Research tab: run research, pin an authority -> rail shows the pin -> Start draft -> studio with params
pre-filled -> Prepare draft (template fallback, no Gemini key in the e2e fixture) -> Send for review ->
Review: "Return to clerk" without a reason is blocked (validation shown, dialog stays open), with a reason
succeeds -> back in the studio, the version history drawer lists at least 2 versions.

Plus a short negative test: a Student (no UPLOAD_PLEADING) does not see "Documents" in the sidebar, and a
direct hash to #/documents shows the forbidden page.
"""
import re

from playwright.sync_api import expect

from conftest import api_token
from helpers import CONSOLE_IGNORE, api_status, dialog, goto, wait_ready

# The sample pleading (backend/documents.py SAMPLE_PLEADING) carries the same "denial of the inquiry
# report ... natural justice" ground as the curated ECIL v. Karunakar landmark (tests/build_fixture.py,
# judgment id 1; see test_journeys.test_judges_day's "natural justice inquiry report" search), so an issue
# phrased the same way is expected to return at least one research result to pin.
ISSUE_TEXT = "Whether denial of the inquiry report to the petitioner violates the principles of natural justice."
RETURN_REASON = "Please re-check the facts section and resubmit for review."


def _stub_sync_status(page):
    """Work around a pre-existing bug (see docs/E2E_RUN_REPORT.md "Documents feature - issues found",
    frontend/app/js/api.js's generic 403 handler + frontend/app/js/ui/topbar.js's refreshFreshness()):
    the topbar's background freshness indicator calls GET /api/sync/status on every page for every role,
    and a role without MANAGE_CORPUS/VIEW_AUDIT (e.g. Clerk) gets a 403 from that unrelated call, which
    api.js's generic error handler turns into a hard redirect to #/forbidden -- even while the user is on
    a page they otherwise have full permission for. Stubbing the endpoint lets the rest of this journey
    (which is what this test is actually verifying) run without being derailed by that unrelated bug.
    """
    page.route(re.compile(r"/api/sync/status"), lambda route: route.fulfill(
        status=200, content_type="application/json", body='{"sync_state": {"status": "idle"}, "mode": "simulated"}'))


def test_documents_full_journey_clerk(page, login, browser_name, base_url, tmp_path):
    # 1. Sign in as a Clerk (Siddharth Mathur: UPLOAD_PLEADING + DRAFT_FULL, no FINALIZE_JUDGMENT).
    # Token injection (the `login` fixture), not the real sign-in page: see docs/E2E_RUN_REPORT.md
    # "Documents feature - issues found" for a boot-time session/event-loop bug that makes the real
    # sign-in page (sign_in_via_ui) unusable right now for every role, not just this journey.
    _stub_sync_status(page)
    login("Clerk")

    # 2. #/documents: upload the sample pleading via the "Sample pleading" button (realistic OCR'd text,
    # not a raw file), which uploads then navigates to the new document's workspace.
    goto(page, "/documents")
    expect(page.get_by_role("heading", level=1, name="Documents")).to_be_visible()
    page.get_by_role("button", name="Sample pleading").click()
    page.wait_for_url(re.compile(r"#/documents/[^/]+$"), timeout=30000)
    wait_ready(page)
    doc_id = page.url.rsplit("/", 1)[1]

    # 3. Details tab (default on load): shows the extracted fields; fill in anything OCR/field-parsing did
    # not find so research/drafting is not blocked by an incidental parsing gap.
    page.get_by_role("tab", name=re.compile("^Details")).click()
    court_in = page.get_by_label("Court", exact=True)
    case_no_in = page.get_by_label("Case number", exact=True)
    case_title_in = page.get_by_label("Cause title", exact=True)
    facts_in = page.get_by_label("Facts", exact=True)
    expect(case_title_in).to_be_visible()
    dirty = False
    if not court_in.input_value().strip():
        court_in.fill("High Court of Judicature for Rajasthan at Jodhpur"); dirty = True
    if not case_no_in.input_value().strip():
        case_no_in.fill("S.B. Civil Writ Petition No. 4521/2023"); dirty = True
    if not case_title_in.input_value().strip():
        case_title_in.fill("Rajendra Prasad Meena v. State of Rajasthan"); dirty = True
    if not facts_in.input_value().strip():
        facts_in.fill("The petitioner was dismissed from service without being supplied the inquiry report.")
        dirty = True
    if dirty:
        page.get_by_role("button", name="Save changes").click()
        expect(page.get_by_text(re.compile(r"^Saved as version"))).to_be_visible(timeout=10000)

    # 4. Issues tab: add an issue if none was parsed, tick the acknowledgement and confirm.
    page.get_by_role("tab", name=re.compile("^Issues")).click()
    issues_ta = page.get_by_label("Issues, one per line")
    if not issues_ta.input_value().strip():
        issues_ta.fill(ISSUE_TEXT)
    confirmed_issue = issues_ta.input_value().splitlines()[0].strip()
    ack = page.get_by_label(re.compile("^I have checked these issues"))
    ack.check()
    page.get_by_role("button", name="Confirm for research and drafting").click()
    expect(page.get_by_text(re.compile(r"^Confirmed as version"))).to_be_visible(timeout=10000)

    # 5. Research tab: run research for the confirmed issues, then pin one authority.
    page.get_by_role("tab", name=re.compile("^Research")).click()
    page.get_by_role("button", name="Run research for these issues").click()
    expect(page.locator(".rs-results").first).to_be_visible(timeout=20000)
    page.get_by_role("button", name="Pin", exact=True).first.click()
    expect(page.get_by_text(re.compile(r"Pinned authorities \(1 of 5\)"))).to_be_visible(timeout=10000)

    # 6. Start draft -> the drafting studio, with params carried over from the document.
    start_btn = page.get_by_role("button", name="Start draft")
    expect(start_btn).to_be_enabled()
    start_btn.click()
    page.wait_for_url(re.compile(r"#/drafts/new$"))
    wait_ready(page)
    expect(page.locator("h1")).not_to_have_text("New draft")
    page.get_by_role("tab", name="Parameters").click()
    expect(page.get_by_label("Case title")).not_to_have_value("")
    expect(page.get_by_label("Issues (one per line)")).to_have_value(re.compile(re.escape(confirmed_issue)))
    page.get_by_role("tab", name="Draft").click()
    expect(page.get_by_text(confirmed_issue, exact=False)).to_be_visible()

    # 7. Prepare draft. The e2e fixture app has no Gemini key, so this is the honest template fallback
    # (same assertion as test_journeys.test_judges_day).
    page.get_by_role("button", name="Prepare draft").first.click()
    expect(page.get_by_text("Template fallback").first).to_be_visible(timeout=30000)
    page.wait_for_url(re.compile(r"#/drafts/\d+$"))
    draft_id = int(page.url.rsplit("/", 1)[1])
    expect(page.get_by_text(re.compile(r"^Saved"))).to_be_visible(timeout=10000)

    # 8. Save (autosave already ran; make it explicit) then send for review.
    page.get_by_role("button", name="Save now").click()
    page.get_by_role("button", name="Send for review").click()
    dialog(page).get_by_role("button", name="Send for review").click()
    page.wait_for_url(re.compile(r"/review$"))
    wait_ready(page)

    # 9. Review: "Return to clerk" without a reason is blocked -- the confirm button inside the dialog
    # shows a validation message and the dialog stays open -- then succeeds once a reason is given.
    page.get_by_role("button", name="Return to clerk").click()
    dlg = dialog(page)
    expect(dlg).to_be_visible()
    dlg.get_by_role("button", name="Return to clerk").click()
    expect(dlg.get_by_text("Write at least 5 characters.")).to_be_visible()
    expect(dlg).to_be_visible()  # still open: blocked, not silently accepted
    dlg.get_by_label("Reason for returning").fill(RETURN_REASON)
    dlg.get_by_role("button", name="Return to clerk").click()
    expect(dialog(page)).to_have_count(0)
    expect(page.get_by_text("Returned to the clerk.", exact=True)).to_be_visible(timeout=10000)

    # 10. Back in the studio: the returned-reason banner shows, then the version history drawer lists
    # at least 2 versions (prepare+autosave, send for review, return all bump the version).
    # "Back to studio" is a plain href link (ui/button.js renders <a> when href is set), role=link.
    page.get_by_role("link", name="Back to studio").click()
    page.wait_for_url(re.compile(rf"#/drafts/{draft_id}$"))
    wait_ready(page)
    expect(page.get_by_text(RETURN_REASON, exact=False)).to_be_visible()
    page.get_by_role("button", name="History").click()
    hist = dialog(page)
    expect(hist.get_by_text("Version history")).to_be_visible(timeout=10000)
    expect(hist.locator(".studio-hist__item").first).to_be_visible(timeout=10000)
    count = hist.locator(".studio-hist__item").count()
    assert count >= 2, f"expected at least 2 versions (prepare/save, send for review, return), got {count}"

    token = page.evaluate("() => sessionStorage.getItem('gyanam.token')")
    assert api_status(base_url, f"/api/documents/{doc_id}", token) == 200
    assert not page.tracker.errors(ignore=CONSOLE_IGNORE + ("status of 409", "status of 422"))


def test_student_cannot_see_documents(page, login, base_url):
    _stub_sync_status(page)
    login("Student")
    goto(page, "/")
    nav = page.get_by_role("navigation", name="Main")
    expect(nav.get_by_role("link", name=re.compile("^Documents"))).to_have_count(0)
    page.goto("/app/#/documents")
    page.wait_for_function("() => location.hash.startsWith('#/forbidden')")
    page.wait_for_selector("h1")
    assert "Something went wrong" not in page.inner_text("body")
    token, _ = api_token(base_url, "Student")
    assert api_status(base_url, "/api/documents", token) == 403
