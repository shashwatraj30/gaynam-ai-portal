"""
GYANAM AI — NLU JODHPUR EDITION (POWERED BY KELYVO)
DPDP ACT 2023 COMPLIANCE & CRYPTOGRAPHIC AUDIT LEDGER
-----------------------------------------------------------------
Fulfills the stringent data fiduciary mandates of:
1. The Digital Personal Data Protection Act, 2023 (Sections 4, 7, 8 & 9):
   - Strict purpose limitation (Judicial research & judgment preparation only).
   - Zero external model fine-tuning (Air-gapped local processing).
   - Real-time PII Anonymization & Redaction engine.
2. Cryptographic Tamper-Evident Hash Chain:
   - Each audit log entry is linked to its predecessor via SHA-256 hash chaining.
   - Provides undeniable evidentiary integrity under Section 65B of Indian Evidence Act / Section 63 BSA 2023.
"""

import os
import sys
import hashlib
import json
from datetime import datetime
from typing import Dict, Any, List

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_connection

def init_cryptographic_ledger():
    """Initializes the tamper-evident ledger table if not already created."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cryptographic_audit_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        user_name TEXT NOT NULL,
        user_role TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        current_hash TEXT NOT NULL
    );
    """)
    conn.commit()
    conn.close()

init_cryptographic_ledger()

import threading

_ledger_lock = threading.Lock()

def record_tamper_evident_event(user_name: str, user_role: str, action: str, details: str, ip: str = "127.0.0.1") -> str:
    """Records an audit event with SHA-256 hash chaining (Thread-safe)."""
    with _ledger_lock:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Get previous block hash
        cursor.execute("SELECT current_hash FROM cryptographic_audit_ledger ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        prev_hash = row[0] if row else "GENESIS_NLUJ_KELYVO_LEDGER_BLOCK_0000000"
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        block_content = f"{prev_hash}|{timestamp}|{user_name}|{user_role}|{action}|{details}|{ip}"
        current_hash = hashlib.sha256(block_content.encode('utf-8')).hexdigest()
        
        cursor.execute("""
        INSERT INTO cryptographic_audit_ledger (
            timestamp, user_name, user_role, action, details, ip_address, prev_hash, current_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, (timestamp, user_name, user_role, action, details, ip, prev_hash, current_hash))
        
        conn.commit()
        conn.close()
        return current_hash

def verify_ledger_integrity() -> Dict[str, Any]:
    """Scans entire audit ledger and verifies mathematical proof of non-tampering."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, timestamp, user_name, user_role, action, details, ip_address, prev_hash, current_hash FROM cryptographic_audit_ledger ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    
    if not rows:
        return {
            "status": "VALID",
            "total_blocks": 0,
            "message": "Audit ledger initialized. Genesis block ready."
        }
        
    expected_prev = "GENESIS_NLUJ_KELYVO_LEDGER_BLOCK_0000000"
    for r in rows:
        rec_id, ts, user, role, action, details, ip, prev_h, curr_h = r
        if prev_h != expected_prev:
            return {
                "status": "CORRUPTED",
                "compromised_block_id": rec_id,
                "message": f"Block chain linkage broken at Record #{rec_id}."
            }
        recalc_content = f"{prev_h}|{ts}|{user}|{role}|{action}|{details}|{ip}"
        recalculated_hash = hashlib.sha256(recalc_content.encode('utf-8')).hexdigest()
        if recalculated_hash != curr_h:
            return {
                "status": "CORRUPTED",
                "compromised_block_id": rec_id,
                "message": f"Hash mismatch detected at Record #{rec_id}. Tampering detected."
            }
        expected_prev = curr_h
        
    return {
        "status": "VERIFIED_SECURE",
        "total_blocks_verified": len(rows),
        "latest_block_hash": expected_prev,
        "compliance_standard": "DPDP Act 2023 §8(4) & Indian Evidence Act §65B",
        "verification_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

def get_ledger_blocks(limit: int = 25) -> List[Dict[str, Any]]:
    """Returns the latest ledger blocks."""
    conn = get_connection()
    cursor = conn.cursor()
    limit = max(1, min(int(limit or 25), 500))
    cursor.execute("SELECT * FROM cryptographic_audit_ledger ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]
