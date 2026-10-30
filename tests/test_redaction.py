"""anonymize_pii: Aadhaar / phone / PAN / e-mail / victim-name patterns, spans, and no false positives."""
import pytest

from ocr_engine import anonymize_pii, clean_ocr_text, is_sexual_offence_matter


def _red(text):
    r = anonymize_pii(text)
    return r["anonymized_text"], {m["type"] for m in r["matches"]}, r


@pytest.mark.parametrize("raw", ["4829 1048 9921", "4829-1048-9921", "482910489921", "4829  1048  9921"])
def test_aadhaar_variants(raw):
    out, kinds, r = _red(f"Aadhaar: {raw}.")
    assert kinds == {"AADHAAR"} and "4829" not in out and "[REDACTED_AADHAAR_XXXX]" in out
    assert r["total_redactions"] == 1


@pytest.mark.parametrize("raw", ["+91 98290 12345", "+91-9829012345", "+919829012345", "09829012345", "9829012345", "98290-12345"])
def test_phone_variants(raw):
    out, kinds, _ = _red(f"Call {raw} now")
    assert kinds == {"PHONE"} and "[REDACTED_PHONE_XXXX]" in out and "98290" not in out


def test_pan_case_insensitive():
    for pan in ("ABCPB4829K", "abcpb4829k"):
        out, kinds, _ = _red(f"PAN {pan}.")
        assert kinds == {"PAN"} and pan not in out


def test_email():
    out, kinds, _ = _red("write to Clerk.Name@court.gov.in today")
    assert kinds == {"EMAIL"} and "court.gov.in" not in out


@pytest.mark.parametrize("text", [
    "Card 1234567812345678 charged", "Card 1234 5678 9012 3456 charged", "CNR 12345678901234567890",
    "Order No. 4521 of 2023 dated 14.03.2023", "Rs. 25,00,000/- only",
])
def test_no_false_positive(text):
    out, kinds, r = _red(text)
    assert r["total_redactions"] == 0 and out == text


def test_spans_point_into_original_and_shape():
    text = "A 4829 1048 9921 B ABCPB4829K C 9829012345"
    r = anonymize_pii(text)
    assert [(m["type"], text[m["start"]:m["end"]]) for m in r["matches"]] == [
        ("AADHAAR", "4829 1048 9921"), ("PAN", "ABCPB4829K"), ("PHONE", "9829012345")]
    assert {"anonymized_text", "total_redactions", "audit_redaction_details", "matches", "redactions"} <= set(r)
    assert r["audit_redaction_details"] == [{"type": t, "count": 1} for t in ("AADHAAR", "PAN", "PHONE")]


def test_names_are_not_redacted():
    out, _, r = _red("Shri Omprakash Bishnoi appeared.")
    assert out == "Shri Omprakash Bishnoi appeared." and r["total_redactions"] == 0


def test_clean_text_does_not_rewrite_ordinary_words():
    out = clean_ocr_text("The air quality was described. Airport; part. 5 Art. 14")
    assert "air quality" in out and "described" in out and "Airport" in out and "part. 5" in out
    assert "Article 14" in out


@pytest.mark.parametrize("cue", ["prosecutrix", "victim", "survivor", "minor victim", "minor girl", "minor complainant"])
def test_victim_name_redacted_after_cue_word(cue):
    out, kinds, _ = _red(f"The {cue} Priya Sharma was assaulted near the market.")
    assert kinds == {"VICTIM_NAME"} and "Priya Sharma" not in out and "[REDACTED_VICTIM_NAME_XXXX]" in out


def test_victim_name_with_namely_and_comma():
    out, _, r = _red("The victim, namely Anita Devi, stated that the accused entered her house.")
    assert "Anita Devi" not in out and r["total_redactions"] == 1


@pytest.mark.parametrize("text", [
    "The victim compensation scheme under Section 357A applies here.",
    "Victim No. 2 identified the accused in the test identification parade.",
    "The victim identity protection order was issued by the trial court.",
])
def test_victim_cue_false_positives_not_redacted(text):
    out, kinds, r = _red(text)
    assert kinds == set() and r["total_redactions"] == 0 and out == text


def test_sexual_offence_matter_flag():
    assert is_sexual_offence_matter("The accused is charged under Section 376 IPC for rape.")
    assert is_sexual_offence_matter("Proceedings under the POCSO Act against the accused.")
    assert not is_sexual_offence_matter("This is a plain bail application for a Section 420 IPC cheating case.")
    assert not is_sexual_offence_matter("")
