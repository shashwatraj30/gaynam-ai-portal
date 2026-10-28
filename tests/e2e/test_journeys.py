"""Golden journey (the judge's day, plan 10.4) and the role journeys (Student, Auditor, Administrator)."""
import os
import re
import zipfile

from playwright.sync_api import expect

from conftest import api_token
from helpers import (CONSOLE_IGNORE, PASTED_PLEADING, api_get, api_status, dialog, goto, sign_in_via_ui, wait_ready)


def test_judges_day(page, browser_name, base_url, tmp_path):
    """12 steps: sign in, search, read, check a citation, new matter from pasted text, template draft,
    edit + autosave, claim check, send for review, approve, export, audit."""
    # 1. Sign in through the real sign-in page (no token injection)
    sign_in_via_ui(page, "Sharma")
    expect(page.locator("h1")).to_contain_text("Justice R.K. Sharma")

    # 2. Home shows the judge's matters
    expect(page.get_by_text("Your matters")).to_be_visible()

    # 3. Search; the curated landmark comes back
    goto(page, "/research")
    page.get_by_label("Your question").fill("natural justice inquiry report")
    page.locator("main button[type=submit]").click()
    expect(page.get_by_text("Managing Director, ECIL v. B. Karunakar").first).to_be_visible()

    # 4. Open the curated judgment: ratio tab, citation and source PDF section
    page.get_by_role("link", name="Open reader").first.click()
    expect(page.get_by_role("heading", level=1)).to_contain_text("Karunakar")
    expect(page.get_by_role("tab", name="Ratio")).to_be_visible()
    expect(page.get_by_text("Source judgment (PDF)")).to_be_visible()

    # 5. Check a citation: the overruled one is flagged as such
    goto(page, "/judgments/check")
    page.get_by_label("Citation", exact=True).fill("(1990) 1 SCC 100")
    page.locator("main button[type=submit]").click()
    expect(page.get_by_text("Overruled by New Rule v. State")).to_be_visible()

    # 6. New matter from pasted text -> check fields -> confirm issues -> studio
    goto(page, "/matters/new")
    page.get_by_label("Pleading or brief text").fill(PASTED_PLEADING)
    page.get_by_role("button", name="Read this text").click()
    expect(page.get_by_role("heading", name="Check what we read").first).to_be_visible()
    page.get_by_label("Cause title").fill("Ramesh Kumar v. State of Rajasthan")
    page.get_by_role("button", name="Continue to confirm issues").click()
    page.get_by_label("Issues for determination").fill("Whether the petitioner is entitled to bail under Section 439 CrPC.")
    page.get_by_label("I have checked these issues", exact=False).check()
    page.get_by_role("button", name="Confirm and open the drafting studio").click()
    page.wait_for_url(re.compile(r"#/drafts/new"))

    # 7. Prepare the draft: no model key in the fixture, so the template fallback is used and labelled
    page.get_by_role("button", name="Prepare draft").first.click()
    expect(page.get_by_text("Template fallback").first).to_be_visible(timeout=30000)
    page.wait_for_url(re.compile(r"#/drafts/\d+$"))
    draft_id = int(page.url.rsplit("/", 1)[1])

    # 8. Edit one section; autosave reports Saved; a reload keeps the text
    sec = page.locator("#sec-15")
    sec.fill(sec.input_value() + " See also Old Rule v. State (1990) 1 SCC 100.")
    expect(page.get_by_text("Unsaved changes")).to_be_visible()
    expect(page.get_by_text(re.compile(r"^Saved"))).to_be_visible(timeout=10000)
    page.reload()
    wait_ready(page)
    expect(page.locator("#sec-15")).to_have_value(re.compile("Old Rule v. State"))

    # 9. Claim check: the overruled citation is flagged
    page.get_by_role("button", name="Check whole draft").click()
    expect(page.get_by_text(re.compile(r"Overruled: 1"))).to_be_visible()
    expect(page.get_by_text("Replace with overruling judgment")).to_be_visible()

    # 10. Send for review (confirm dialog) then Approve (confirm dialog)
    page.get_by_role("button", name="Send for review").click()
    dialog(page).get_by_role("button", name="Send for review").click()
    page.wait_for_url(re.compile(r"/review$"))
    wait_ready(page)
    page.get_by_role("button", name="Approve").click()
    expect(dialog(page)).to_be_visible()
    dialog(page).get_by_role("button", name="Approve").click()
    expect(page.get_by_text("Approved by bench").first).to_be_visible()

    # 11. Export DOCX (a real .docx) and the print view (HTTP 200 with the user's token)
    with page.expect_download() as dl:
        page.get_by_role("button", name="Download DOCX").click()
    path = str(tmp_path / "out.docx")
    dl.value.save_as(path)
    assert dl.value.suggested_filename.endswith(".docx")
    assert os.path.getsize(path) > 5000
    with zipfile.ZipFile(path) as z:
        assert "word/document.xml" in z.namelist()
    token = page.evaluate("() => sessionStorage.getItem('gyanam.token')")
    assert api_status(base_url, f"/api/draft/export/print/{draft_id}", token) == 200

    # 12. Audit trail shows the real user, and the chain verifies
    goto(page, "/audit")
    rows = page.get_by_role("row").filter(has_text="Hon'ble Mr. Justice R.K. Sharma")
    expect(rows.first).to_be_visible()
    expect(rows.filter(has_text="Draft generated").first).to_be_visible()
    page.get_by_role("button", name="Verify the chain").click()
    expect(page.get_by_text("Chain intact")).to_be_visible()
    assert not page.tracker.errors(ignore=CONSOLE_IGNORE + ("status of 403", "status of 409"))


def test_metadata_judgment_has_pdf_and_no_ratio(page, login):
    """A metadata-only row shows the source PDF block and the honest 'metadata record' note, not a fake ratio."""
    login("Justice")
    goto(page, "/judgments/20")
    expect(page.get_by_text("This is a metadata record", exact=False).first).to_be_visible()
    expect(page.get_by_text("Source judgment (PDF)")).to_be_visible()


def test_student_journey(page, login, base_url):
    login("Student")
    goto(page, "/")
    nav = page.get_by_role("navigation", name="Main")
    for hidden in ("Matters", "Drafts", "Chamber", "Alerts", "Audit trail"):
        expect(nav.get_by_role("link", name=re.compile(rf"^{hidden}"))).to_have_count(0)
    expect(nav.get_by_role("link", name="Research")).to_be_visible()
    page.goto("/app/#/drafts")
    page.wait_for_function("() => location.hash.startsWith('#/forbidden')")
    expect(page.get_by_role("heading", level=1)).to_be_visible()
    token, _ = api_token(base_url, "Student")
    assert api_status(base_url, "/api/drafts", token) == 403
    assert api_status(base_url, "/api/admin/users", token) == 403


def test_auditor_journey(page, browser_name, base_url, tmp_path):
    sign_in_via_ui(page, "Singhal")
    # lands on the audit trail without a hash
    assert page.url.endswith("#/audit"), page.url
    expect(page.get_by_role("heading", level=1)).to_have_text("Audit trail")
    page.get_by_role("button", name="Verify the chain").click()
    expect(page.get_by_text("Chain intact")).to_be_visible()
    with page.expect_download() as dl:
        page.get_by_role("button", name=re.compile("^Export")).first.click()
    path = str(tmp_path / "audit.csv")
    dl.value.save_as(path)
    head = open(path, encoding="utf-8-sig").read(400)
    assert "," in head and len(head) > 20
    # the auditor cannot reach research
    page.goto("/app/#/research")
    page.wait_for_function("() => location.hash.startsWith('#/forbidden')")


def test_admin_suspend_and_activate(page, login, base_url):
    login("Admin")
    goto(page, "/chamber")
    row = page.get_by_role("row").filter(has_text="Ananya Rathore")
    try:
        row.get_by_role("button", name="Suspend").click()
        expect(dialog(page)).to_contain_text("Suspend")
        dialog(page).get_by_role("button", name="Suspend").click()
        expect(row.get_by_text("Suspended")).to_be_visible()
    finally:
        # always restore: the Student token is shared by other tests
        if row.get_by_role("button", name="Activate").count():
            row.get_by_role("button", name="Activate").click()
            expect(dialog(page)).to_be_visible()
            dialog(page).get_by_role("button", name="Activate").click()
    expect(row.get_by_role("button", name="Suspend")).to_be_visible()
    assert not [e for e in page.tracker.errors(ignore=CONSOLE_IGNORE)]
