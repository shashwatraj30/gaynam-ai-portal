"""Direct unit tests for the FIR-vs-pleading classifier and the generic-first / FIR-overlay field merge."""
import document_parser as dp
import _fir_fixtures as F

# Golden outputs captured from extract_fields() BEFORE the classifier rewrite (byte-identical regression guard).
GOLD_FIR_FORM = {'court': '', 'case_number': 'FIR No. 17/2026 (Bhowanipore P.S.)', 'case_title': 'State of West Bengal v. Samir Das & Ors.', 'petitioner': 'State of West Bengal', 'respondent': 'Samir Das & Ors.', 'facts': 'The complainant states that on the night of 3rd April two persons broke into his shop and took away cash.\nHe identified the accused from the CCTV footage.', 'prayer': '', 'statutory_provisions': 'Section 379 IPC; Section 34 IPC', 'petitioner_arguments': '', 'respondent_arguments': ''}
GOLD_FIR_NUMBERED = {'court': '', 'case_number': 'FIR No. 06/2026 (Shastri Nagar P.S.)', 'case_title': 'State of Rajasthan v. Ramesh Soni & Ors.', 'petitioner': 'State of Rajasthan', 'respondent': 'Ramesh Soni & Ors.', 'facts': 'Complainant alleges cheating in a land deal.', 'prayer': '', 'statutory_provisions': '', 'petitioner_arguments': '', 'respondent_arguments': ''}


# ---- _fir_score ----
def test_fir_score_real_firs_high():
    assert dp._fir_score(F.FIR_FORM) == 4  # capped
    assert dp._fir_score(F.FIR_NUMBERED) >= 2


def test_fir_score_bail_application_low():
    assert dp._fir_score(F.BAIL_APPLICATION) == 1  # only the "FIR No." phrase


def test_fir_score_hybrid_ignores_quoted_headings():
    # Headings quoted mid-sentence in the argument text are not line-anchored, so only the two phrase markers count.
    assert dp._fir_score(F.HYBRID) == 2
    assert dp._fir_score("") == 0


# ---- _has_pleading_cause_title ----
def test_cause_title_versus_past_line_60():
    lines = F.BAIL_APPLICATION.splitlines()
    idx = next(i for i, l in enumerate(lines) if l.strip() == "VERSUS")
    assert idx > 60
    assert dp._has_pleading_cause_title(F.BAIL_APPLICATION)


def test_cause_title_between_block_past_line_60():
    lines = F.BETWEEN_PLEADING.splitlines()
    assert next(i for i, l in enumerate(lines) if l.strip() == "BETWEEN:") > 60
    assert dp._has_pleading_cause_title(F.BETWEEN_PLEADING)


def test_no_cause_title_in_firs():
    assert not dp._has_pleading_cause_title(F.FIR_FORM)
    assert not dp._has_pleading_cause_title(F.FIR_NUMBERED)


def test_short_doc_still_scans_60_lines():
    text = chr(10).join(["x"] * 55 + ["A Person", "versus", "B Person"])
    assert dp._has_pleading_cause_title(text)


# ---- _is_fir ----
def test_is_fir_matrix():
    assert dp._is_fir(F.FIR_FORM) and dp._is_fir(F.FIR_NUMBERED)
    assert not dp._is_fir(F.BAIL_APPLICATION)
    assert not dp._is_fir(F.BETWEEN_PLEADING)  # score 2 but BETWEEN cause title
    assert not dp._is_fir(F.HYBRID)  # score 2 but versus cause title
    assert not dp._is_fir("")


# ---- extract_fields ----
def test_real_fir_output_unchanged():
    for text, gold in ((F.FIR_FORM, GOLD_FIR_FORM), (F.FIR_NUMBERED, GOLD_FIR_NUMBERED)):
        fields, issues = dp.extract_fields(text)
        assert fields == gold and issues == []


def test_bail_application_not_misrouted():
    f, issues = dp.extract_fields(F.BAIL_APPLICATION)
    assert f["case_number"] == "BAIL APPLICATION NO. 1234 OF 2026"
    assert f["petitioner"] == "Ravi Kumar" and f["respondent"] == "State of Rajasthan"
    assert f["case_title"] == "Ravi Kumar v. State of Rajasthan"
    for k in ("court", "facts", "prayer", "petitioner_arguments", "respondent_arguments"):
        assert f[k], k
    assert "HIGH COURT" in f["court"] and "FIR No" not in f["case_number"]
    assert issues and issues[0].startswith("Whether the applicant")


def test_between_pleading_not_misrouted():
    f, _ = dp.extract_fields(F.BETWEEN_PLEADING)
    assert f["case_number"] == "CIVIL WRIT PETITION NO. 4321 OF 2026"
    assert f["petitioner"] == "Mahesh Gupta" and f["respondent"].startswith("State of Rajasthan")
    for k in ("court", "facts", "prayer", "petitioner_arguments", "respondent_arguments"):
        assert f[k], k


def test_hybrid_stays_pleading():
    f, _ = dp.extract_fields(F.HYBRID)
    assert f["case_number"] == "CRIMINAL MISC. PETITION NO. 999 OF 2026"
    assert f["petitioner"] == "Anil Sharma" and f["respondent"] == "State of Rajasthan"


def test_parse_generic_matches_extract_for_pleading():
    f, _ = dp.extract_fields(F.HYBRID)
    assert dp._parse_generic(F.HYBRID) == f


def test_legacy_extract_pleading_structure_populated():
    from ocr_engine import extract_pleading_structure
    s = extract_pleading_structure(F.BAIL_APPLICATION)
    assert s["grounds_of_challenge"].startswith("(A) Whether the applicant is entitled to bail")
    assert s["prayer_relief"].startswith("It is therefore prayed")
    assert s["case_number"] == "BAIL APPLICATION NO. 1234 OF 2026" and s["petitioner"] == "Ravi Kumar"
    fir = extract_pleading_structure(F.FIR_FORM)
    assert fir["case_number"] == GOLD_FIR_FORM["case_number"] and fir["facts_summary"] == GOLD_FIR_FORM["facts"]


def test_module_selftest_block_runs():
    import runpy, io, contextlib
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        runpy.run_module("document_parser", run_name="__main__")
    assert "Parsed Pleading" in buf.getvalue()
