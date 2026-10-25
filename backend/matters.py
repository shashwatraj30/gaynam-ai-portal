"""Matter grouping helpers (UI redesign plan B5).

A "matter" is a set of drafts that share a normalised ``case_number``.
There is no matters table; the key is derived (and optionally stored in
``draft_judgments.matter_key``).
"""
import re
from typing import Any, Dict, Iterable, List, Optional

# Case numbers that are placeholders and do not identify a real matter.
PLACEHOLDER_KEYS = {"scanned-document-intake", "unknown", "na", "n-a", "none", "tbd"}

# Legacy status values mapped on read (plan B7).
STATUS_MAP = {
    "CHAMBER_REVIEW": "IN_REVIEW",
    "UNDER_REVIEW": "IN_REVIEW",
    "SIGNED": "FINAL_SEALED",
}

NEXT_ACTION = {
    "DRAFT": "Continue drafting",
    "IN_REVIEW": "Awaiting bench review",
    "RETURNED": "Revise and resubmit",
    "BENCH_APPROVED": "Ready for final sealing",
    "FINAL_SEALED": "Sealed: export or archive",
}

# "(... P.S.)", "(with P.S.)", "(AIRport P.S.)" : parentheticals containing letters.
# "(1993) 4 SCC 727" has a numeric-only parenthetical, which is part of the number.
_PAREN = re.compile(r"\(([^()]*)\)")
# Trailing "- G.D. Entry No. 712/17" (dash may be a mojibake replacement char).
_GD_ENTRY = re.compile(r"\s*[-–—�?]*\s*g\.?\s*d\.?\s*entry\s*no\.?.*$", re.I)


def _strip_alpha_parens(s: str) -> str:
    def repl(m):
        return " " if re.search(r"[^\W\d_]", m.group(1)) else m.group(0)
    prev = None
    while prev != s:
        prev, s = s, _PAREN.sub(repl, s)
    return s


def normalise_matter_key(case_number: Optional[str]) -> str:
    """Stable grouping key for a case number. None/empty -> ''."""
    if not case_number or not isinstance(case_number, str):
        return ""
    s = case_number.casefold()
    s = _strip_alpha_parens(s)
    s = _GD_ENTRY.sub("", s)
    s = s.replace("�", " ")
    s = s.replace(".", "")                       # S.B. -> sb, No. -> no
    s = re.sub(r"[^\w]+|_+", "-", s, flags=re.UNICODE)  # spaces, slashes, punctuation
    return s.strip("-")


def canonical_status(status: Optional[str]) -> str:
    st = (status or "DRAFT").strip().upper()
    return STATUS_MAP.get(st, st)


def next_action_label(status: Optional[str]) -> str:
    return NEXT_ACTION.get(canonical_status(status), "Open matter")


def draft_matter_key(row: Any) -> str:
    """Stored matter_key if present, else computed from case_number."""
    try:
        stored = row["matter_key"]
    except (KeyError, IndexError):
        stored = None
    return (stored or "").strip() or normalise_matter_key(row["case_number"])


def group_drafts_by_matter(rows: Iterable[Any]) -> Dict[str, List[Any]]:
    """Group draft rows (sqlite3.Row or dict) by matter key, preserving input order.

    Drafts whose case_number normalises to '' are grouped under 'unfiled'.
    """
    groups: Dict[str, List[Any]] = {}
    for r in rows:
        key = draft_matter_key(r) or "unfiled"
        groups.setdefault(key, []).append(r)
    return groups
