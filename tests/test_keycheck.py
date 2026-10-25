import hashlib
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import keycheck


def test_unknown_long_key_is_usable_even_with_aq_prefix():
    assert keycheck.is_usable_gemini_key("AQ.Ab8" + "x" * 40)


def test_short_or_empty_keys_are_rejected():
    for k in (None, "", "   ", "short", 123):
        assert not keycheck.is_usable_gemini_key(k)


def test_leaked_key_is_blocked_by_hash(monkeypatch):
    fake = "fake-leaked-key-" + "y" * 20
    monkeypatch.setattr(keycheck, "LEAKED_KEY_SHA256", {hashlib.sha256(fake.encode()).hexdigest()})
    assert not keycheck.is_usable_gemini_key(fake)
    assert not keycheck.is_usable_gemini_key("  " + fake + "\n")
