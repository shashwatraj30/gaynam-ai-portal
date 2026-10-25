import re
import sqlite3
from typing import List, Dict, Any
from database import get_connection

# Comprehensive Regex patterns for Indian Legal Citations
# Covers SCC, SCR, INSC, AIR (SC & all High Courts), Neutral Citations, RLW, DLT, CrLJ, SCALE, etc.
CITATION_PATTERNS = [
    r'\(\d{4}\)\s+\d+\s+SCC\s+(?:\([A-Za-z]+\)\s+)?\d+',                    # (2017) 10 SCC 1 or (2020) 5 SCC (Cri) 120
    r'\d{4}\s+Supp\s+\(\d+\)\s+SCC\s+\d+',                                  # 1992 Supp (1) SCC 529
    r'\[\d{4}\]\s+\d+\s+S\.?C\.?R\.?\s+\d+',                                # [1954] 1 S.C.R. 1005
    r'\(\d{4}\)\s+Supp\s+SCR\s+\d+',                                        # (1966) Supp SCR 286
    r'\d{4}\s+SCR\s+\(\d+\)\s+\d+',                                         # 1964 SCR (6) 261
    r'\b\d{4}\s*INSC\s*\d+\b',                                              # 2000INSC361 or 2023 INSC 842
    r'AIR\s+\d{4}\s+(?:SC|SCW|All|Bom|Cal|Del|Raj|Mad|Kar|Ker|P&H|Pat|Ori|Guj|AP|Hyd|J&K|MP|Gau|HP|Chh|Jhar|Utt|NUC)\s+\d+', # AIR 1978 SC 597
    r'\d{4}\s+\(\d+\)\s+RLW\s+(?:\(Raj\.?\)\s+)?\d+',                       # 2022 (2) RLW (Raj.) 1104
    r'\d{4}\s+SCC\s+OnLine\s+[A-Za-z]+\s+\d+',                              # 2023 SCC OnLine Raj 1420
    r'\d{4}\s+\(\d+\)\s+(?:DLT|MhLJ|GLR|KLT|ALD|ALT|BLJR|PLJR|WBLR)\s+\d+', # Regional reporters
    r'\d{4}\s+Cri\.?\s*L\.?J\.?\s+\d+',                                     # 2021 Cri LJ 1452
    r'\(\d{4}\)\s+\d+\s+SCALE\s+\d+',                                       # (2019) 6 SCALE 210
    r'\b\d{4}:[A-Z]{2,6}(?:-[A-Z]{1,4})?:\d+\b',                            # Neutral Citation e.g. 2024:RJ-JD:12045
]


def _infer_district(row_dict: Dict[str, Any]) -> str:
    """Resolve district / bench origin from case metadata."""
    try:
        from judgment_engine import resolve_case_district
        return resolve_case_district(row_dict)
    except Exception:
        court = (row_dict.get("court") or "").lower()
        if "rajasthan" in court:
            return "Jodhpur / Jaipur, Rajasthan"
        if "supreme court" in court:
            return "New Delhi (Supreme Court)"
        return "Appellate Jurisdiction"


def _format_verified_response(query_str: str, case_data: Dict[str, Any]) -> Dict[str, Any]:
    status = case_data.get("precedent_status") or "FOLLOWED"
    overruled_by = case_data.get("overruled_by")
    matched_citation = case_data.get("citation") or case_data.get("equivalent_citations") or query_str

    base_case_payload = {
        "id": case_data.get("id"),
        "case_id": case_data.get("case_id"),
        "title": case_data.get("title"),
        "court": case_data.get("court"),
        "bench": case_data.get("bench"),
        "judges": case_data.get("judges"),
        "judgment_date": case_data.get("judgment_date"),
        "year": case_data.get("year"),
        "citation": matched_citation,
        "equivalent_citations": case_data.get("equivalent_citations"),
        "subject_category": case_data.get("subject_category"),
        "ratio_decidendi": case_data.get("ratio_decidendi"),
        "headnote": case_data.get("headnote"),
        "precedent_status": status,
        "overruled_by": overruled_by,
        "cnr_number": case_data.get("cnr_number"),
        "docket_number": case_data.get("docket_number"),
        "source_url": case_data.get("source_url"),
        "provenance_authority": case_data.get("provenance_authority"),
        "district": _infer_district(case_data),
    }

    if status == "OVERRULED":
        return {
            "citation": matched_citation,
            "query_citation": query_str,
            "verified": True,
            "status": "OVERRULED_WARNING",
            "confidence_score": 1.0,
            "message": f"⚠️ CRITICAL JUDICIAL ALERT: '{case_data.get('title')}' ({matched_citation}) has been EXPRESSLY OVERRULED by {overruled_by or 'a Larger Constitution Bench'}. Do NOT rely on this as binding law.",
            "case_data": base_case_payload,
        }
    elif status == "DISTINGUISHED":
        return {
            "citation": matched_citation,
            "query_citation": query_str,
            "verified": True,
            "status": "DISTINGUISHED_CAUTION",
            "confidence_score": 0.95,
            "message": f"⚡ CAUTION: '{case_data.get('title')}' ({matched_citation}) has been distinguished on facts in subsequent decisions. Verify factual parity.",
            "case_data": base_case_payload,
        }
    else:
        return {
            "citation": matched_citation,
            "query_citation": query_str,
            "verified": True,
            "status": "VERIFIED_ACTIVE",
            "confidence_score": 1.0,
            "message": f"✓ VERIFIED AUTHENTIC PRECEDENT: '{case_data.get('title')}' ({matched_citation}) decided by {case_data.get('court')} [{case_data.get('bench')}]. Active & Good Law.",
            "case_data": base_case_payload,
        }


def extract_citations_from_text(text: str) -> List[str]:
    found = []
    for pattern in CITATION_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for m in matches:
            clean_m = re.sub(r'\s+', ' ', m.strip())
            if clean_m not in found:
                found.append(clean_m)
    return found


def verify_citation(citation_str: str) -> Dict[str, Any]:
    """
    Verifies a single citation string or case title/docket against the authenticated
    Gyanam AI Precedent Corpus (1,18,000+ Supreme Court & High Court judgments).
    """
    conn = get_connection()
    cursor = conn.cursor()

    clean_cit = re.sub(r'\s+', ' ', (citation_str or '').strip())
    if not clean_cit:
        conn.close()
        return {
            "citation": "",
            "query_citation": "",
            "verified": False,
            "status": "HALLUCINATED_OR_UNVERIFIED",
            "confidence_score": 0.0,
            "message": "Empty citation string provided.",
            "case_data": None,
        }

    # 1. Exact or substring match on citation, equivalent_citations, cnr_number, or docket_number
    cursor.execute("""
        SELECT * FROM judgments
        WHERE citation LIKE ?
           OR equivalent_citations LIKE ?
           OR cnr_number LIKE ?
           OR docket_number LIKE ?
        ORDER BY CASE WHEN citation = ? THEN 0 ELSE 1 END, citing_cases_count DESC
        LIMIT 1
    """, (f"%{clean_cit}%", f"%{clean_cit}%", f"%{clean_cit}%", f"%{clean_cit}%", clean_cit))
    row = cursor.fetchone()

    # 2. Normalized alphanumeric match (e.g. "2000 INSC 361" vs "2000INSC361" or "S.C.R." vs "SCR")
    if not row:
        norm_cit = re.sub(r'[^A-Za-z0-9]', '', clean_cit).upper()
        if len(norm_cit) >= 5:
            cursor.execute("""
                SELECT * FROM judgments
                WHERE UPPER(REPLACE(REPLACE(REPLACE(REPLACE(citation, ' ', ''), '.', ''), '(', ''), ')', '')) LIKE ?
                   OR UPPER(REPLACE(REPLACE(REPLACE(REPLACE(equivalent_citations, ' ', ''), '.', ''), '(', ''), ')', '')) LIKE ?
                LIMIT 1
            """, (f"%{norm_cit}%", f"%{norm_cit}%"))
            row = cursor.fetchone()

    # 3. Fallback search by Case Title or FTS5 match if user entered party names or partial citation
    if not row:
        cursor.execute("""
            SELECT * FROM judgments
            WHERE title LIKE ?
            ORDER BY citing_cases_count DESC, year DESC
            LIMIT 1
        """, (f"%{clean_cit}%",))
        row = cursor.fetchone()

    if not row:
        safe_tokens = [re.sub(r'[^a-zA-Z0-9]', '', w) for w in clean_cit.split() if len(re.sub(r'[^a-zA-Z0-9]', '', w)) >= 2]
        if safe_tokens:
            fts_q = " AND ".join([f'"{t}"' for t in safe_tokens[:5]])
            try:
                cursor.execute("""
                    SELECT j.* FROM judgments_fts f
                    JOIN judgments j ON f.rowid = j.id
                    WHERE judgments_fts MATCH ?
                    ORDER BY rank
                    LIMIT 1
                """, (fts_q,))
                row = cursor.fetchone()
            except Exception:
                row = None

    conn.close()

    if not row:
        return {
            "citation": clean_cit,
            "query_citation": clean_cit,
            "verified": False,
            "status": "HALLUCINATED_OR_UNVERIFIED",
            "confidence_score": 0.0,
            "message": f"ALERT: Citation '{clean_cit}' not found in the verified Supreme Court / High Court repository. Potential AI hallucination or typographical error.",
            "case_data": None,
        }

    return _format_verified_response(clean_cit, dict(row))


def verify_all_text_citations(text: str) -> List[Dict[str, Any]]:
    citations = extract_citations_from_text(text)
    results = []
    for cit in citations:
        results.append(verify_citation(cit))
    return results


if __name__ == "__main__":
    sample_text = """
    As held by the Supreme Court in Justice K.S. Puttaswamy (Retd.) v. Union of India, (2017) 10 SCC 1, privacy is fundamental.
    Earlier in ADM Jabalpur v. Shivkant Shukla, (1976) 2 SCC 521 and 2000INSC361, a different view was taken.
    Also see fake citation (2024) 99 SCC 9999.
    """
    for r in verify_all_text_citations(sample_text):
        print(f"[{r['status']}] {r['citation']} -> {r['message']}")
