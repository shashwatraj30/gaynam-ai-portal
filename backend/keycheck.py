"""Gemini key sanity check. The key that was once committed to this repo is blocked by its SHA-256 (never store the key itself)."""
import hashlib
from typing import Optional

LEAKED_KEY_SHA256 = {"9addd359762d1fbd84c90f306262c46cd9cb2faeb51bf11e7c2083375541eee4"}


def is_usable_gemini_key(key: Optional[str]) -> bool:
    if not key or not isinstance(key, str):
        return False
    k = key.strip()
    if len(k) < 25:
        return False
    return hashlib.sha256(k.encode("utf-8")).hexdigest() not in LEAKED_KEY_SHA256
