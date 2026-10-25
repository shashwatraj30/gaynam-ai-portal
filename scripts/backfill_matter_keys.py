#!/usr/bin/env python3
"""Backfill draft_judgments.matter_key (plan B5).

Dry-run by default: prints the proposed groups for manual review.
Use --apply to write. Always back up first (scripts/backup_db.sh), and
prefer running against a copy via --db.

    python scripts/backfill_matter_keys.py [--db PATH] [--apply] [--overwrite]
"""
import argparse
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "backend"))
from matters import PLACEHOLDER_KEYS, normalise_matter_key  # noqa: E402


def default_db() -> str:
    env = os.environ.get("GYANAM_DB_PATH")
    if env:
        return env
    try:
        from database import DB_PATH
        if os.path.exists(DB_PATH):
            return DB_PATH
    except Exception:
        pass
    return os.path.join(HERE, "..", "data", "vidhi_legal.db")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=None, help="SQLite file (default: GYANAM_DB_PATH or the app DB)")
    ap.add_argument("--apply", action="store_true", help="write matter_key (default is dry-run)")
    ap.add_argument("--overwrite", action="store_true", help="also replace existing non-empty matter_key values")
    args = ap.parse_args()

    db = os.path.abspath(args.db or default_db())
    print(f"DB: {db}")
    print("MODE: APPLY" if args.apply else "MODE: dry-run (no changes; pass --apply to write)")
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    cols = {r[1] for r in conn.execute("PRAGMA table_info(draft_judgments)")}
    if not cols:
        print("draft_judgments table not found")
        return 1
    has_col = "matter_key" in cols
    sel = "id, case_number, case_title, status" + (", matter_key" if has_col else "")
    rows = conn.execute(f"SELECT {sel} FROM draft_judgments ORDER BY id").fetchall()

    groups, updates = {}, []
    for r in rows:
        existing = (r["matter_key"] if has_col else None) or ""
        new = normalise_matter_key(r["case_number"])
        key = existing if (existing and not args.overwrite) else new
        groups.setdefault(key or "(empty)", []).append(r)
        if key and key != existing:
            updates.append((key, r["id"]))

    print(f"\n{len(rows)} drafts -> {len(groups)} matter groups\n")
    for key, rs in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        flag = "  [PLACEHOLDER - review]" if key in PLACEHOLDER_KEYS or key == "(empty)" else ""
        print(f"{key}  ({len(rs)} drafts){flag}")
        raw = sorted({(r["case_number"] or "") for r in rs})
        if len(raw) > 1 or flag:
            for c in raw:
                print(f"    raw case_number: {c!r}")
        print("    drafts: " + ", ".join(f"#{r['id']}" for r in rs))
    print(f"\n{len(updates)} rows would change.")

    if not args.apply:
        return 0
    if not has_col:
        conn.execute("ALTER TABLE draft_judgments ADD COLUMN matter_key TEXT")
        print("Added column draft_judgments.matter_key")
    conn.executemany("UPDATE draft_judgments SET matter_key = ? WHERE id = ?", updates)
    conn.commit()
    print(f"Updated {len(updates)} rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
