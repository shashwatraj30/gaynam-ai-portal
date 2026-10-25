"""Make the UAT master database from a copy of the real one (RUNBOOK section 3).

    python docs/uat/prepare_uat_db.py --source data\\vidhi_legal.db --out C:\\gyanam-uat\\master\\uat_master.db

Steps:
 1. Consistent copy with the SQLite online-backup API (safe even if the server is running; -wal/-shm are folded in).
 2. Remove drafts that came from scanned police FIRs or other real-looking documents (case numbers starting
    "FIR No.", or "Scanned Document Intake"), because UAT must not expose real case data (UAT_PLAN section 4.1).
 3. Remove audit_logs / ledger rows that mention those drafts, FIR text, uploads or OCR runs, then RE-CHAIN the
    remaining ledger rows with the same formula as backend/audit_dpdp.py so "Verify the chain" still says intact.
    This only ever happens on the UAT copy. Never run it against the real database.
Prints a summary and exits non-zero if the copy does not verify.
"""
import argparse
import hashlib
import os
import re
import sqlite3
import sys

GENESIS = "GENESIS_NLUJ_KELYVO_LEDGER_BLOCK_0000000"
KEYWORDS = ("West Bengal", "FIR", "G.D.", "Scanned Document", "Airport P.S.")
DROP_ACTIONS = ("OCR_PROCESSED_BRIEF", "UPLOAD_PLEADING", "ANONYMIZE_TEXT")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    if os.path.abspath(a.source) == os.path.abspath(a.out):
        sys.exit("--out must differ from --source")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    if os.path.exists(a.out):
        os.remove(a.out)

    src = sqlite3.connect(f"file:{a.source}?mode=ro", uri=True)
    dst = sqlite3.connect(a.out)
    src.backup(dst)
    src.close()

    cur = dst.cursor()
    bad = [r[0] for r in cur.execute(
        "SELECT id FROM draft_judgments WHERE case_number LIKE 'FIR No.%' OR case_number = 'Scanned Document Intake' "
        "OR case_number LIKE 'FIR%'")]
    print(f"drafts removed: {len(bad)}")
    for i in bad:
        cur.execute("DELETE FROM draft_judgments WHERE id = ?", (i,))
        try:
            cur.execute("DELETE FROM draft_versions WHERE draft_id = ?", (i,))
        except sqlite3.OperationalError:
            pass

    id_pat = re.compile(r"Draft (?:ID |#)(\d+)\b")

    def risky(action, details):
        d = details or ""
        if action in DROP_ACTIONS:
            return True
        if any(k in d for k in KEYWORDS):
            return True
        m = id_pat.search(d)
        return bool(m and int(m.group(1)) in set(bad))

    n = 0
    for rid, action, details in cur.execute("SELECT id, action, details FROM audit_logs").fetchall():
        if risky(action, details):
            cur.execute("DELETE FROM audit_logs WHERE id = ?", (rid,))
            n += 1
    print(f"audit_logs rows removed: {n}")

    rows = cur.execute("SELECT id, timestamp, user_name, user_role, action, details, ip_address "
                       "FROM cryptographic_audit_ledger ORDER BY id").fetchall()
    keep = [r for r in rows if not risky(r[4], r[5])]
    print(f"ledger blocks removed: {len(rows) - len(keep)}, kept: {len(keep)}")
    prev = GENESIS
    for rid, ts, user, role, action, details, ip in keep:
        cur_hash = hashlib.sha256(f"{prev}|{ts}|{user}|{role}|{action}|{details}|{ip}".encode("utf-8")).hexdigest()
        cur.execute("UPDATE cryptographic_audit_ledger SET prev_hash = ?, current_hash = ? WHERE id = ?",
                    (prev, cur_hash, rid))
        prev = cur_hash
    for rid, *_ in rows:
        if rid not in {k[0] for k in keep}:
            cur.execute("DELETE FROM cryptographic_audit_ledger WHERE id = ?", (rid,))
    dst.commit()

    # Verify with the same walk the app uses.
    prev = GENESIS
    ok = True
    for rid, ts, user, role, action, details, ip, ph, ch in cur.execute(
            "SELECT id, timestamp, user_name, user_role, action, details, ip_address, prev_hash, current_hash "
            "FROM cryptographic_audit_ledger ORDER BY id"):
        want = hashlib.sha256(f"{ph}|{ts}|{user}|{role}|{action}|{details}|{ip}".encode("utf-8")).hexdigest()
        if ph != prev or want != ch:
            ok = False
            break
        prev = ch
    cur.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    cur.execute("VACUUM")
    dst.close()
    left = sqlite3.connect(a.out).execute("SELECT status, COUNT(*) FROM draft_judgments GROUP BY 1").fetchall()
    print("drafts left by status:", left)
    print("ledger verifies:", ok)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
