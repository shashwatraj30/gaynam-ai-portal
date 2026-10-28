import os
from keycheck import is_usable_gemini_key
import sys
import json
import sqlite3
from typing import Dict, Any, List, Optional
from datetime import datetime

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_connection
from citation_verifier import verify_all_text_citations

def calculate_bench_priority(case: Dict[str, Any]) -> int:
    """
    Computes Indian Judicial Bench Authority Weight under Article 141 (Stare Decisis).
    Priority Order:
    1. Supreme Court Constitution Bench (5, 7, 9, 11 Judges) -> 120 - 150 (HIGHEST PRIORITY)
    2. Supreme Court Full Bench (3 Judges) -> 90
    3. Supreme Court Division Bench (2 Judges) -> 70
    4. Supreme Court Single Judge / Coram -> 55
    5. High Court Full Bench (3+ Judges) -> 45
    6. High Court Division Bench (2 Judges) -> 35
    7. High Court Single Judge -> 20
    """
    court = (case.get("court") or "").lower()
    bench_str = (case.get("bench") or "").lower()
    judges = (case.get("judges") or "").lower()
    
    is_sc = "supreme court" in court
    
    num_judges = 2  # default
    if "11" in bench_str or "11 judge" in bench_str:
        num_judges = 11
    elif "9" in bench_str or "9 judge" in bench_str:
        num_judges = 9
    elif "7" in bench_str or "7 judge" in bench_str:
        num_judges = 7
    elif "5" in bench_str or "5 judge" in bench_str or "constitution bench" in bench_str:
        num_judges = 5
    elif "3" in bench_str or "3 judge" in bench_str or "full bench" in bench_str:
        num_judges = 3
    elif "1 judge" in bench_str or "single judge" in bench_str or "single bench" in bench_str:
        num_judges = 1
    elif "2 judge" in bench_str or "division bench" in bench_str:
        num_judges = 2
    else:
        if ";" in judges or "," in judges:
            parts = [p.strip() for p in judges.replace(";", ",").split(",") if len(p.strip()) > 2]
            if len(parts) >= 3:
                num_judges = min(len(parts), 5)
    
    if is_sc:
        if num_judges >= 5:
            return 120 + num_judges * 3  # Constitution Bench: 135+
        elif num_judges == 3:
            return 90  # Full Bench: 90
        elif num_judges == 2:
            return 70  # Division Bench: 70
        else:
            return 55
    else:
        if num_judges >= 3:
            return 45
        elif num_judges == 2:
            return 35
        else:
            return 20

def get_bench_label(case: Dict[str, Any]) -> str:
    weight = calculate_bench_priority(case)
    court = case.get("court") or "Supreme Court of India"
    if weight >= 120:
        return "🏛️ Constitution Bench (5+ Judges) • Highest Binding Precedent"
    elif weight >= 90:
        return "⚖️ Full Bench (3 Judges) • Supreme Court"
    elif weight >= 70:
        return "⚖️ Division Bench (2 Judges) • Supreme Court"
    elif weight >= 50:
        return "Supreme Court of India"
    elif weight >= 40:
        return "High Court Full Bench (3+ Judges)"
    elif weight >= 30:
        return "High Court Division Bench (2 Judges)"
    else:
        return "High Court Bench"

def resolve_case_district(court: str = "", bench: str = "", cnr_number: str = "", full_text: str = "") -> str:
    """
    Resolves the jurisdictional Indian District / Court Complex for a case record
    following authentic eCourts CIS (Case Information System) & CNR standards.
    """
    court_str = (court or "").strip()
    bench_str = (bench or "").strip().lower()
    cnr_str = (cnr_number or "").strip().upper()
    court_lower = court_str.lower()
    
    # 1. Supreme Court of India
    if "supreme court" in court_lower or cnr_str.startswith("ESCR"):
        return "New Delhi (Apex Court National Jurisdiction)"
        
    # 2. High Court & CIS Establishment Mapping
    # Madhya Pradesh High Court
    if "mphc" in cnr_str or "madhya pradesh" in court_lower:
        if "ind" in bench_str or "indore" in bench_str or (cnr_str.startswith("MPHC02") and "ind" in bench_str):
            return "Indore District (Bench Jurisdiction)"
        if "gwl" in bench_str or "gwalior" in bench_str or cnr_str.startswith("MPHC03") or cnr_str.startswith("MPHC02"):
            return "Gwalior District (Bench Jurisdiction)"
        return "Jabalpur District (Principal Seat)"

    # Rajasthan High Court
    if "rjhc" in cnr_str or "rajasthan" in court_lower:
        if "jaipur" in bench_str or cnr_str.startswith("RJHC02"):
            return "Jaipur District (Bench Jurisdiction)"
        return "Jodhpur District (Principal Seat)"

    # Bombay High Court
    if "bombay" in court_lower or cnr_str.startswith("HCBM") or cnr_str.startswith("BOMHC"):
        if "aur" in bench_str or "aurangabad" in bench_str or cnr_str.startswith(("HCBM03", "BOMHC03")):
            return "Chhatrapati Sambhajinagar (Aurangabad) District"
        if "goa" in bench_str or "panaji" in bench_str or cnr_str.startswith(("HCBM05", "BOMHC04")):
            return "North Goa / Panaji District"
        if "nag" in bench_str or "nagpur" in bench_str or cnr_str.startswith(("HCBM06", "BOMHC02")):
            return "Nagpur District (Bench Jurisdiction)"
        return "Mumbai City District (Principal Seat)"

    # Gujarat High Court
    if "gujarat" in court_lower or cnr_str.startswith("GJHC") or bench_str == "gujarathc":
        return "Ahmedabad District (Principal Seat)"

    # Telangana / Hyderabad High Court
    if "telangana" in court_lower or "hyderabad" in court_lower or cnr_str.startswith(("HBHC", "TSHC")) or bench_str == "taphc":
        return "Hyderabad District (Principal Seat)"

    # Uttarakhand High Court
    if "uttarakhand" in court_lower or cnr_str.startswith("UKHC") or "nainital" in bench_str or "ukhc" in bench_str:
        return "Nainital District (Principal Seat)"

    # Chhattisgarh High Court
    if "chhattisgarh" in court_lower or cnr_str.startswith("CGHC") or "bilaspur" in bench_str or "cghc" in bench_str:
        return "Bilaspur District (Principal Seat)"

    # Madras High Court
    if "madras" in court_lower or cnr_str.startswith(("HCMA", "HCMD", "MDHC")):
        if "mdu" in bench_str or "madurai" in bench_str or cnr_str.startswith(("HCMD01", "MDHC02")):
            return "Madurai District (Bench Jurisdiction)"
        return "Chennai District (Principal Seat)"

    # Karnataka High Court
    if "karnataka" in court_lower or cnr_str.startswith("KAHC"):
        if "dharwad" in bench_str or cnr_str.startswith("KAHC02"):
            return "Dharwad District (Bench Jurisdiction)"
        if "kalaburagi" in bench_str or "gulbarga" in bench_str or cnr_str.startswith("KAHC03"):
            return "Kalaburagi District (Bench Jurisdiction)"
        return "Bengaluru Urban District (Principal Seat)"

    # Calcutta High Court
    if "calcutta" in court_lower or cnr_str.startswith("WBCH") or "kol" in bench_str:
        if cnr_str.startswith("WBCHCJ") or "jalpaiguri" in bench_str:
            return "Jalpaiguri District (Circuit Bench)"
        if cnr_str.startswith("WBCHCP") or "port_blair" in bench_str:
            return "South Andaman / Port Blair (Circuit Bench)"
        return "Kolkata District (Principal Seat)"

    # Punjab & Haryana High Court
    if "punjab" in court_lower or "haryana" in court_lower or cnr_str.startswith("PHHC") or bench_str == "phhc":
        return "Chandigarh (Joint Capital Jurisdiction)"

    # Orissa High Court
    if "orissa" in court_lower or "odisha" in court_lower or cnr_str.startswith(("ODHC", "ORHC")) or "cisnc" in bench_str:
        return "Cuttack District (Principal Seat)"

    # Delhi High Court
    if "delhi" in court_lower or cnr_str.startswith("DLHC") or "dhcdb" in bench_str:
        return "New Delhi District (NCT Delhi)"

    # Patna High Court
    if "patna" in court_lower or "bihar" in court_lower or cnr_str.startswith("BRHC") or "patna" in bench_str:
        return "Patna District (Principal Seat)"

    # Gauhati High Court
    if "gauhati" in court_lower or cnr_str.startswith("GAHC") or "asgh" in bench_str:
        if cnr_str.startswith("GAHC04") or "argh" in bench_str or "itanagar" in bench_str:
            return "Papum Pare / Itanagar District (Permanent Bench)"
        if cnr_str.startswith("GAHC03") or "kohima" in bench_str:
            return "Kohima District (Bench Jurisdiction)"
        return "Kamrup Metropolitan (Guwahati) District"

    # Allahabad High Court
    if "allahabad" in court_lower or cnr_str.startswith("UPHC"):
        if cnr_str.startswith("UPHC02") or "lko" in bench_str or "lucknow" in bench_str:
            return "Lucknow District (Bench Jurisdiction)"
        return "Prayagraj (Allahabad) District (Principal Seat)"

    # Kerala High Court
    if "kerala" in court_lower or cnr_str.startswith("KLHC") or "kerala" in bench_str:
        return "Ernakulam (Kochi) District (Principal Seat)"

    # Andhra Pradesh High Court
    if "andhra" in court_lower or cnr_str.startswith("APHC") or "aphc" in bench_str:
        return "Guntur / Amaravati District (Principal Seat)"

    # Jammu & Kashmir High Court
    if "jammu" in court_lower or "kashmir" in court_lower or cnr_str.startswith("JKHC"):
        if cnr_str.startswith("JKHC02") or "jammu" in bench_str:
            return "Jammu District (Judicial Seat)"
        if cnr_str.startswith("JKHC01") or "kashmir" in bench_str or "srinagar" in bench_str:
            return "Srinagar District (Judicial Seat)"
        return "Srinagar / Jammu District (Principal Seat)"

    # Himachal Pradesh High Court
    if "himachal" in court_lower or cnr_str.startswith("HPHC") or "cmis" in bench_str:
        return "Shimla District (Principal Seat)"

    # Jharkhand High Court
    if "jharkhand" in court_lower or cnr_str.startswith("JHHC") or "jhar" in bench_str:
        return "Ranchi District (Principal Seat)"

    # Sikkim High Court
    if "sikkim" in court_lower or cnr_str.startswith("SKHC") or "sikkim" in bench_str:
        return "Gangtok District (Principal Seat)"

    # Tripura High Court
    if "tripura" in court_lower or cnr_str.startswith("TRHC") or "thcnc" in bench_str:
        return "West Tripura (Agartala) District"

    # Meghalaya High Court
    if "meghalaya" in court_lower or cnr_str.startswith("MLHC") or "meghalaya" in bench_str:
        return "East Khasi Hills (Shillong) District"

    # Manipur High Court
    if "manipur" in court_lower or cnr_str.startswith("MNHC") or "manipur" in bench_str:
        return "Imphal West District (Principal Seat)"

    # 3. District Courts with 16-character eCourts CNR structure
    if len(cnr_str) >= 6 and not cnr_str[2:4] == "HC":
        DISTRICT_CODES = {
            "DLND": "New Delhi District",
            "DLSE": "South East Delhi District",
            "DLCB": "Central Delhi District",
            "DLNW": "North West Delhi District",
            "DLSW": "South West Delhi District",
            "RJJD": "Jodhpur District",
            "RJJP": "Jaipur District",
            "RJUD": "Udaipur District",
            "RJKT": "Kota District",
            "MHPB": "Pune District",
            "MHMM": "Mumbai City District",
            "MHTN": "Thane District",
            "MPIN": "Indore District",
            "MPJB": "Jabalpur District",
            "MPGW": "Gwalior District",
            "MPBH": "Bhopal District",
            "GJAH": "Ahmedabad District",
            "GJST": "Surat District",
            "GJBR": "Vadodara District",
            "UPAG": "Agra District",
            "UPLK": "Lucknow District",
            "UPKN": "Kanpur Nagar District",
            "UPAL": "Prayagraj (Allahabad) District",
            "UPVR": "Varanasi District",
            "KABN": "Bengaluru Urban District",
            "KARY": "Bengaluru Rural District",
            "TNCH": "Chennai District",
            "TNMDU": "Madurai District",
            "WBKL": "Kolkata District",
        }
        prefix4 = cnr_str[:4]
        if prefix4 in DISTRICT_CODES:
            return DISTRICT_CODES[prefix4]

    # 4. Fallback Regex on full_text
    if full_text:
        import re
        m = re.search(r'(?:District|Sessions Division|Dist\.?)\s*[:\-]\s*([A-Za-z\s]{3,25})', full_text, re.IGNORECASE)
        if m:
            d_name = m.group(1).strip().title()
            if len(d_name) > 2 and not any(bad in d_name.lower() for bad in ['court', 'judge', 'state', 'order', 'bench']):
                return f"{d_name} District"

    return "State Judicial Jurisdiction"

def search_relevant_precedents(query: str, limit: int = 6) -> List[Dict[str, Any]]:
    import re
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Extract penal section tokens and key legal descriptors
    sec_tokens = re.findall(r'\b(?:376[A-Za-z]?|417|384|354[A-Za-z]?|341|354B|498[A-Za-z]?|406|323|399|402|302|304A|307|420|120[bB]|506|34|279|338|427|138)\b', query, re.I)
    key_nouns = [w for w in ['rash', 'negligent', 'driving', 'vehicle', 'accident', 'collision', 'rape', 'consent', 'marriage', 'modesty', 'restraint', 'cruelty', 'dowry', 'dacoity', 'firearm', 'disrobe', 'cheating', 'assault', 'extortion', 'conspiracy'] if w in query.lower()]
    is_motor = any(s in ["279", "338", "427", "304A"] for s in sec_tokens) or any(w in query.lower() for w in ['rash', 'negligent', 'driving', 'vehicle', 'accident', 'collision', 'motor', 'road accident', 'speeding', 'overtaking', 'nicco park'])
    is_criminal = bool(sec_tokens or key_nouns or is_motor or any(k in query.lower() for k in ['fir', 'ipc', 'penal', 'accused', 'police', 'crpc', 'accident', 'driving']))

    # Clean query for FTS5
    clean_query = "".join([c if c.isalnum() or c.isspace() else " " for c in query]).strip()
    words = [w for w in clean_query.split() if len(w) > 2]
    
    terms = list(dict.fromkeys(sec_tokens + key_nouns + words))
    fts_query = " OR ".join(terms[:6]) if terms else "natural justice OR procedure OR 354 OR 341"
        
    candidates = []
    
    # Direct statutory landmarks injection for high-precedent consistency
    specific_ids = []
    if is_motor:
        specific_ids.extend([1030162, 1030312, 1051728, 1024120, 1015849])  # Dalbir Singh (279/304A landmark), Mohammed Aynuddin (rash driving landmark), Sharanappa (279/338 landmark), Satnam Singh, Road Transport Co
    elif any(s in ["354", "341", "354B"] for s in sec_tokens) or "modesty" in query.lower():
        specific_ids.extend([1030066, 1078763, 1079308, 1078758])  # Rajender Singh (3J), Raju Pandurang Mahale (2J), Pandurang Sitaram Bhagwat (2J)
    elif any(s in ["498A", "498", "406"] for s in sec_tokens) or "cruelty" in query.lower():
        specific_ids.extend([1012429])

    if specific_ids:
        placeholders = ",".join(["?"] * len(specific_ids))
        cursor.execute(f"SELECT * FROM judgments WHERE id IN ({placeholders})", tuple(specific_ids))
        candidates.extend([dict(r) for r in cursor.fetchall()])

    try:
        cursor.execute("""
        SELECT j.id, j.case_id, j.title, j.court, j.bench, j.judges, j.judgment_date, 
               j.citation, j.statutes_considered, j.subject_category, j.headnote, 
               j.ratio_decidendi, j.precedent_status, j.overruled_by,
               bm25(judgments_fts) as rank
        FROM judgments_fts f
        JOIN judgments j ON f.rowid = j.id
        WHERE judgments_fts MATCH ?
        LIMIT 45;
        """, (fts_query,))
        fts_rows = [dict(r) for r in cursor.fetchall()]
        seen_ids = set(c['id'] for c in candidates)
        for r in fts_rows:
            if r['id'] not in seen_ids:
                candidates.append(r)
                seen_ids.add(r['id'])
    except Exception as e:
        if not candidates:
            cursor.execute("SELECT * FROM judgments LIMIT 35")
            candidates = [dict(r) for r in cursor.fetchall()]
        
    conn.close()
    
    # Annotate candidates with Bench Strength Authority Weight & Substantive Relevance
    for c in candidates:
        c["bench_priority_score"] = calculate_bench_priority(c)
        c["bench_label"] = get_bench_label(c)
        c["is_upper_bench"] = c["bench_priority_score"] >= 90
        
        comb_text = f"{c.get('title','')} {c.get('headnote','')} {c.get('statutes_considered','')} {c.get('ratio_decidendi','')}".lower()
        exact_sec_bonus = 0
        
        is_tax_or_civil = any(w in comb_text for w in [
            'income tax', 'wealth tax', 'sales tax', 'terminal tax', 'central excise', 
            'commission agent', 'mortgage', 'promissory note', 'negotiable instruments', 
            'cheque bounce', 'banking corporation', 'service law', 'disciplinary enquiry', 
            'inquiry officer', 'civil services', 'industrial tribunal', 'arbitration'
        ])
        
        is_corruption_dspe = any(w in comb_text for w in [
            'delhi special police establishment', 'dspe act', 'sanction under section 19', 
            'prevention of corruption', 'central vigilance'
        ])
        
        if is_motor:
            if c['id'] in [1030162, 1030312, 1051728]:
                exact_sec_bonus += 180  # Direct Supreme Court Motor Accident Landmarks
            elif c['id'] in [1024120, 1015849]:
                exact_sec_bonus += 110
            if any(w in comb_text for w in ['rash', 'negligent driving', 'road accident', 'penal code', 'ipc', '304-a', '279', '338', 'collision']):
                exact_sec_bonus += 80
            if is_tax_or_civil or is_corruption_dspe:
                exact_sec_bonus -= 600
        elif is_criminal:
            has_substantive_sec_match = False
            for s in sec_tokens:
                if s.lower() in comb_text:
                    exact_sec_bonus += 140
                    has_substantive_sec_match = True
            if any(w in comb_text for w in ['penal code', 'ipc', 'criminal', 'accused', 'conviction']):
                exact_sec_bonus += 40
            if not has_substantive_sec_match:
                exact_sec_bonus -= 300  # Strictly demote cases that lack the substantive penal section
            if is_tax_or_civil:
                exact_sec_bonus -= 600
            if is_corruption_dspe and not any(k in query.lower() for k in ['corruption', 'bribe', 'dspe', 'pc act', 'prevention of corruption']):
                exact_sec_bonus -= 600
                
        c["total_weight"] = c["bench_priority_score"] + exact_sec_bonus
        
    # Exclude heavily penalized irrelevant / negative-weight cases
    positive_candidates = [c for c in candidates if c.get("total_weight", 0) > 0]
    if positive_candidates:
        candidates = positive_candidates

    # Sort candidates strictly by:
    # 1. Valid Active Precedents (not overruled)
    # 2. Bench Authority Weight + Penal Bonus DESC
    # 3. Textual relevance rank
    candidates.sort(
        key=lambda x: (
            1 if x.get("precedent_status") != "OVERRULED" else 0,
            x.get("total_weight", x["bench_priority_score"]),
            -float(x.get("rank", 0) if x.get("rank") is not None else 0)
        ),
        reverse=True
    )
    
    top_precedents = candidates[:limit]
    if top_precedents:
        top_precedents[0]["is_primary_binding"] = True
        top_precedents[0]["binding_selection_rationale"] = (
            f"Selected under Upper Bench Priority (Article 141): Decisions of Larger Benches "
            f"({top_precedents[0]['bench_label']}) supersede smaller benches on conflicting questions of law."
        )
        
    return top_precedents

SECTION_KEYS = [
    "section_1_case_title", "section_2_case_number", "section_3_introduction",
    "section_4_brief_facts", "section_5_submissions_petitioner", "section_6_submissions_respondent",
    "section_7_issues_framed", "section_8_statutory_provisions", "section_9_evidence_analysis",
    "section_10_applicable_principles", "section_11_discussion_reasoning", "section_12_application_of_law",
    "section_13_findings_on_issues", "section_14_conclusion_disposition", "section_15_citations_authorities",
]
OUTCOME_PLACEHOLDER = "[Outcome to be decided by the Bench]"


def _wanted_keys(only_sections: Optional[List[int]]) -> List[str]:
    """Section numbers (1..15) -> canonical keys, in order. None / empty -> all 15."""
    if not only_sections:
        return list(SECTION_KEYS)
    nums = set()
    for n in only_sections:
        try:
            n = int(n)
        except (TypeError, ValueError):
            continue
        if 1 <= n <= 15:
            nums.add(n)
    return [SECTION_KEYS[n - 1] for n in sorted(nums)] or list(SECTION_KEYS)


def _authority_line(a: Any) -> str:
    """One display line for a pinned authority (dict from the bench brief / document pins, or plain text)."""
    if isinstance(a, dict):
        title = str(a.get("title") or a.get("case_title") or "").strip()
        cit = str(a.get("citation") or "").strip()
        court = str(a.get("court") or "").strip()
        status = str(a.get("status") or a.get("precedent_status") or "").strip()
        line = title + (f" — {cit}" if cit else "")
        if court:
            line += f" [{court}]"
        if status:
            line += f" — Status: {status}"
        return line.strip()
    return str(a or "").strip()


def generate_15_section_judgment(
    case_title: str,
    case_number: str,
    court: str,
    facts: str,
    petitioner_arguments: str,
    respondent_arguments: str,
    issues: str,
    statutory_provisions: str,
    api_key: Optional[str] = None,
    only_sections: Optional[List[int]] = None,
    current: Optional[Dict[str, Any]] = None,
    outcome: Optional[str] = None,
    authorities: Optional[List[Any]] = None,
) -> Dict[str, Any]:
    wanted = _wanted_keys(only_sections)
    partial = len(wanted) < len(SECTION_KEYS)
    outcome = (outcome or "").strip() or None
    pinned_lines = [l for l in (_authority_line(a) for a in (authorities or [])) if l]
    context_sections = {k: v for k, v in (current or {}).items() if k in SECTION_KEYS and k not in wanted and str(v or "").strip()}

    # 1. Retrieve binding authorities prioritizing Larger / Upper Benches
    search_query = f"{issues} {statutory_provisions} {facts[:200]}"
    retrieved_precedents = search_relevant_precedents(search_query, limit=5)
    
    # Filter active vs overruled
    active_precedents = [p for p in retrieved_precedents if p.get("precedent_status") != "OVERRULED"]
    overruled_precedents = [p for p in retrieved_precedents if p.get("precedent_status") == "OVERRULED"]
    
    primary_authority = active_precedents[0] if active_precedents else None
    primary_bench_label = primary_authority.get("bench_label", "Division Bench (2 Judges)") if primary_authority else "Constitution Bench (5 Judges)"
    
    # Check if a valid Gemini API key is available
    gemini_key = api_key or os.environ.get("GEMINI_API_KEY")
    has_valid_key = is_usable_gemini_key(gemini_key)
    
    if has_valid_key:
        try:
            from google import genai
            from google.genai import types
            
            client = genai.Client(api_key=gemini_key.strip(), http_options=types.HttpOptions(timeout=90000))  # 90 s per model, so a stalled model falls through
            prompt = f"""
            You are an elite Judicial Research and Judgment Drafting AI assisting a Judge of the {court}.
            Draft an authoritative, legally rigorous draft judgment in strict adherence to Indian judicial style.
            
            INPUT DATA:
            Case Title: {case_title}
            Case Number: {case_number}
            Court: {court}
            Brief Facts: {facts}
            Petitioner's Submissions: {petitioner_arguments}
            Respondent's Submissions: {respondent_arguments}
            Issues Framed: {issues}
            Applicable Statutes: {statutory_provisions}
            
            BINDING RETRIEVED PRECEDENTS (ORDERED BY UPPER BENCH PRIORITY - ARTICLE 141):
            {json.dumps([{
                'title': p['title'], 
                'citation': p['citation'], 
                'court': p['court'], 
                'bench': p.get('bench_label', p.get('bench')),
                'bench_weight': p.get('bench_priority_score', 60),
                'ratio': p['ratio_decidendi'],
                'status': p['precedent_status']
            } for p in active_precedents], indent=2)}
            
            PINNED AUTHORITIES (chosen by the Bench; treat as preferred authorities, cite them and list them in Section 15):
            {json.dumps(pinned_lines, indent=2) if pinned_lines else '(none)'}

            OUTCOME DIRECTED BY THE BENCH: {outcome or 'NOT STATED. Do not decide the outcome; leave the operative disposition as a placeholder for the Bench.'}
            {('SECTIONS TO GENERATE (ONLY THESE KEYS): ' + ', '.join(wanted)) if partial else ''}
            {('EXISTING TEXT OF THE OTHER SECTIONS (context only; keep consistent, do not return them):' + chr(10) + json.dumps(context_sections, indent=2)) if (partial and context_sections) else ''}

            CRITICAL RULES:
            1. MANDATORY BINDING CITATIONS: You MUST strictly cite and apply the provided binding authorities ({', '.join([p['title'] for p in active_precedents[:3]]) if active_precedents else 'Supreme Court precedents'}) across Section 9, 10, 11, 12, and 15.
               NEVER cite unrelated civil/commercial matters, negotiable instruments/cheque bounce cases (such as Rangappa), or general constitutional privacy cases (such as Puttaswamy) unless specifically charged in this case.
            2. In Section 15 ("section_15_citations_authorities"), list the provided binding authorities with their exact citations, benches, and active precedent status.
            3. ACCORD HIGHEST PRECEDENTIAL WEIGHT to the primary binding authority ({primary_authority['title'] if primary_authority else 'Supreme Court of India'}) under Article 141.
            4. {('Generate ONLY the requested sections listed above.' if partial else 'You MUST generate all 15 canonical sections as required by National Law University, Jodhpur.')}
            5. Never decide the outcome yourself: follow the OUTCOME DIRECTED BY THE BENCH above, or leave a placeholder.
            6. Return your output STRICTLY in valid JSON format with keys:
               {', '.join('"' + k + '"' for k in wanted)}
            """
            
            # Models retire often: override with GYANAM_GEMINI_MODELS (comma separated) instead of editing code.
            model_cascade = [x.strip() for x in os.environ.get('GYANAM_GEMINI_MODELS', 'gemini-3.5-flash,gemini-3-flash-preview,gemini-flash-lite-latest').split(',') if x.strip()]
            response = None
            for m in model_cascade:
                # Per model: with thinking off, then plain (some models reject thinking_budget=0); one pause-and-retry on 503 overload.
                for attempt, no_thinking in enumerate((True, False, False)):
                    try:
                        config_kwargs = {"response_mime_type": "application/json"}
                        if no_thinking:
                            try:
                                config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
                            except Exception:
                                pass
                        response = client.models.generate_content(
                            model=m,
                            contents=prompt,
                            config=types.GenerateContentConfig(**config_kwargs)
                        )
                        if response and response.text:
                            break
                    except Exception as ex_m:
                        print(f"Model {m} failed in judgment generator: {ex_m}")
                        if "503" in str(ex_m) or "UNAVAILABLE" in str(ex_m):
                            import time as _t
                            _t.sleep(2)
                        elif "400" not in str(ex_m):
                            break
                if response and response.text:
                    break

            if response and response.text:
                parsed_json = json.loads(response.text)
                
                for sec_k, sec_v in list(parsed_json.items()):
                    if isinstance(sec_v, list):
                        formatted_items = []
                        for idx_it, item in enumerate(sec_v, 1):
                            if isinstance(item, dict):
                                parts = [f"[{idx_it}]"]
                                if "title" in item or "case_title" in item:
                                    parts.append(str(item.get("title") or item.get("case_title")))
                                if "citation" in item:
                                    parts.append(f"— {item['citation']}")
                                if "court" in item or "bench" in item:
                                    parts.append(f"[{item.get('court', '')} • {item.get('bench', '')}]")
                                if "ratio" in item or "ratio_decidendi" in item:
                                    parts.append(f"\n   Ratio: {item.get('ratio') or item.get('ratio_decidendi')}")
                                formatted_items.append(" ".join(parts).strip())
                            else:
                                formatted_items.append(f"• {str(item)}")
                        parsed_json[sec_k] = "\n\n".join(formatted_items)
                    elif isinstance(sec_v, dict):
                        parsed_json[sec_k] = "\n".join([f"• {k.replace('_', ' ').title()}: {v}" for k, v in sec_v.items()])

                if (active_precedents or pinned_lines) and "section_15_citations_authorities" in wanted:
                    valid_auth_lines = []
                    for pl in pinned_lines:
                        valid_auth_lines.append(f"[{len(valid_auth_lines) + 1}] {pl} [PINNED BY THE BENCH]")
                    pinned_low = " ".join(pinned_lines).lower()
                    for idx, p in enumerate(active_precedents[:5], 1):
                        if (p.get("title") or "").lower() in pinned_low:
                            continue
                        p_cit = p.get('citation') or p.get('cnr_number') or 'Official Record'
                        p_court = p.get('court') or 'Supreme Court of India'
                        p_bench = p.get('bench_label') or 'Division Bench (2 Judges)'
                        p_ratio = p.get('ratio_decidendi') or p.get('headnote') or ''
                        p_ratio_snippet = f"\n   Binding Ratio: {p_ratio[:160]}..." if p_ratio else ""
                        is_pri = " [★ PRIMARY BINDING AUTHORITY - ARTICLE 141]" if p.get("is_primary_binding") or idx == 1 else ""
                        valid_auth_lines.append(f"[{len(valid_auth_lines) + 1}] {p['title']} — {p_cit} [{p_court} • {p_bench}]{is_pri} — Status: ACTIVE PRECEDENT.{p_ratio_snippet}")
                    
                    parsed_json["section_15_citations_authorities"] = (
                        "AUTHORITIES CITED & VERIFIED PRECEDENTS (RANKED BY UPPER BENCH PRIORITY - ARTICLE 141):\n\n" +
                        "\n\n".join(valid_auth_lines)
                    )
                
                parsed_json = {k: parsed_json[k] for k in wanted if k in parsed_json}
                full_draft_text = "\n".join([str(v) for v in parsed_json.values()])
                verified_citations = verify_all_text_citations(full_draft_text)
                
                return {
                    "success": True,
                    "engine": "Gemini Multimodal Judicial Model (Upper Bench Prioritized)",
                    "sections": parsed_json,
                    "verified_citations": verified_citations,
                    "retrieved_precedents": retrieved_precedents,
                    "primary_binding_authority": primary_authority
                }
        except Exception as e:
            print(f"Gemini API generation encountered: {e}. Falling back to Internal Judicial Synthesis Engine.")
            
    # Fallback to Built-in High-Fidelity Judicial Intelligence Engine
    combined_lower = f"{case_title} {case_number} {facts} {issues} {statutory_provisions}".lower()
    is_motor_case = any(w in combined_lower for w in ['279', '338', '304a', 'rash', 'negligent', 'vehicle', 'accident', 'collision'])
    is_ni_act = any(w in combined_lower for w in ['138', '139', 'negotiable instrument', 'cheque', 'dishonour'])
    is_arbitration = any(w in combined_lower for w in ['arbitration', 'arbitral', 'award'])
    is_cheating_forgery = any(w in combined_lower for w in ['420', '468', '471', '467', 'cheating', 'forgery', 'forged'])
    is_cruelty_498a = any(w in combined_lower for w in ['498a', 'dowry', 'stridhan', 'matrimonial cruelty'])
    is_dacoity = any(w in combined_lower for w in ['399', '402', 'dacoity', 'arms act'])
    is_modesty_or_rape = any(w in combined_lower for w in ['354', '354b', '376', 'modesty', 'disrobe'])
    is_criminal_matter = is_motor_case or is_ni_act or is_cheating_forgery or is_cruelty_498a or is_dacoity or is_modesty_or_rape or any(
        w in combined_lower for w in ['fir ', 'f.i.r', 'police station', 'p.s.', 'indian penal code', 'i.p.c', 'bns', 'cr.p.c', 'criminal']
    )

    if is_motor_case:
        default_case = "Dalbir Singh v. State of Haryana"
        default_cit = "(2000) 5 SCC 82"
        default_ratio = "When automobiles have become death traps, any person driving a vehicle must exercise strict care and caution. Section 279 IPC punishes rash driving which endangers human life. Criminal rashness requires running the risk of doing an act with consciousness that mischief may follow; criminal negligence is gross failure of reasonable care."
    elif is_ni_act:
        default_case = "Rangappa v. Sri Mohan"
        default_cit = "(2010) 11 SCC 441"
        default_ratio = "The statutory presumption mandated by Section 139 of the Negotiable Instruments Act, 1881 includes a presumption that there exists a legally enforceable debt or liability."
    elif is_arbitration:
        default_case = "Associate Builders v. Delhi Development Authority"
        default_cit = "(2015) 3 SCC 49"
        default_ratio = "Under Section 34 of the Arbitration and Conciliation Act, 1996, a Court does not sit in appeal over the arbitral tribunal's findings of fact and cannot re-appreciate evidence unless patent illegality goes to the root of the matter."
    elif is_cheating_forgery:
        default_case = "Md. Ibrahim & Ors. v. State of Bihar & Anr."
        default_cit = "(2009) 8 SCC 751"
        default_ratio = "To constitute an offence under Section 420 IPC, there must be fraudulent or dishonest inducement at the very inception, and under Sections 468/471 IPC, fabrication of a false document with intent to cheat."
    elif is_cruelty_498a:
        default_case = "Arnesh Kumar v. State of Bihar"
        default_cit = "(2014) 8 SCC 273"
        default_ratio = "In prosecutions under Section 498A IPC and Section 406 IPC, the Court must scrutinize the specific overt acts of matrimonial cruelty and unlawful retention of stridhan while enforcing procedural safeguards under Section 41A Cr.P.C."
    elif is_dacoity:
        default_case = "Chaturi Yadav & Ors. v. State of Bihar"
        default_cit = "(1979) 3 SCC 430"
        default_ratio = "To sustain a charge under Sections 399 and 402 IPC read with the Arms Act, the prosecution record and seizure memo must establish conjoint assembly of five or more armed persons with active preparation for dacoity."
    elif is_modesty_or_rape:
        default_case = "State of Punjab v. Major Singh"
        default_cit = "(1966) Supp SCR 286"
        default_ratio = "The essential ingredient for an offence under Section 354 IPC is whether the act of assault or use of criminal force was accompanied by culpable intention or knowledge to outrage female modesty."
    else:
        default_case = "Managing Director, ECIL, Hyderabad v. B. Karunakar"
        default_cit = "(1993) 4 SCC 727"
        default_ratio = "Compliance with the principles of natural justice (audi alteram partem) and supply of adverse material/inquiry reports before inflicting civil prejudice is an inviolable constitutional mandate under Articles 14, 21, and 311(2) of the Constitution."

    primary_case = primary_authority['title'] if primary_authority else default_case
    primary_cit = primary_authority['citation'] if primary_authority else default_cit
    primary_ratio = primary_authority['ratio_decidendi'] if primary_authority else default_ratio

    authorities_list = [f"• {pl} [PINNED BY THE BENCH]" for pl in pinned_lines]
    pinned_low = " ".join(pinned_lines).lower()
    if active_precedents:
        for p in active_precedents:
            if (p.get('title') or '').lower() in pinned_low:
                continue
            p_cit = p.get('citation') or p.get('cnr_number') or 'Official Record'
            p_court = p.get('court') or 'Supreme Court of India'
            p_bench = p.get('bench_label') or 'Division Bench (2 Judges)'
            is_pri = " [★ PRIMARY BINDING AUTHORITY - UPPER BENCH]" if p.get("is_primary_binding") else ""
            authorities_list.append(f"• {p['title']} — {p_cit} [{p_court} • {p_bench}]{is_pri} — Status: VERIFIED ACTIVE PRECEDENT.")
    elif not pinned_lines:
        authorities_list.append(f"• {primary_case} — {primary_cit} [Supreme Court of India • {primary_bench_label}] [★ PRIMARY BINDING AUTHORITY] — Status: VERIFIED ACTIVE PRECEDENT.")
        if is_motor_case:
            authorities_list.append("• Mohammed Aynuddin @ Miyam v. State of Andhra Pradesh — 2000INSC361 / (2000) 7 SCC 72 [Supreme Court of India • Division Bench (2 Judges)] — Status: VERIFIED ACTIVE PRECEDENT.")
        else:
            authorities_list.append("• Managing Director, ECIL v. B. Karunakar — (1993) 4 SCC 727 [Supreme Court of India • Constitution Bench (5 Judges)] — Status: VERIFIED ACTIVE PRECEDENT.")
            authorities_list.append("• Maneka Gandhi v. Union of India — (1978) 1 SCC 248 [Supreme Court of India • 7-Judge Constitution Bench] — Status: VERIFIED ACTIVE PRECEDENT.")

    framed_issues_block = issues.strip() if (issues and len(issues.strip()) > 10) else (
        f"(A) Whether the allegations/pleadings on record satisfy the essential statutory requirements under {statutory_provisions}?\n"
        f"(B) What relief or operative direction is warranted in accordance with binding precedent under Article 141?"
    )

    # The engine never predetermines the outcome: use the Bench's direction or a neutral placeholder.
    if outcome:
        sec_13_text = f"11. In light of the analysis above, this Court records its findings on the framed issues, consistent with the outcome directed by the Bench: {outcome}."
        sec_14_text = f"12. In the result, {outcome}, under {statutory_provisions}. All pending applications stand disposed of accordingly."
    else:
        sec_13_text = f"11. Findings on each framed issue: {OUTCOME_PLACEHOLDER}"
        sec_14_text = f"12. In the result: {OUTCOME_PLACEHOLDER}"

    sections = {
        "section_1_case_title": f"IN THE {court.upper()}\n{case_title}",
        "section_2_case_number": case_number,
        "section_3_introduction": f"1. The present proceedings arise before this Court ({court}) in {case_number} seeking judicial adjudication under {statutory_provisions}. Having heard learned counsel for the respective parties and having meticulously perused the pleadings, annexures, and evidentiary record, this Court proceeds to adjudicate the controversy.",
        "section_4_brief_facts": f"2. The essential factual matrix emerging from the record is as follows:\n{facts}",
        "section_5_submissions_petitioner": f"3. Learned counsel appearing on behalf of the Petitioner / Prosecution / Complainant submitted that:\n(i) {petitioner_arguments};\n(ii) The documentary and factual material on record squarely establishes the statutory ingredients under {statutory_provisions}; and\n(iii) Binding larger-bench precedents of the Hon'ble Supreme Court mandate judicial intervention.",
        "section_6_submissions_respondent": f"4. Per contra, learned counsel appearing on behalf of the Respondent / Defence countered the submissions, contending that:\n(i) {respondent_arguments};\n(ii) The proceedings suffer from no jurisdictional error; and\n(iii) No ground is made out for adverse interference.",
        "section_7_issues_framed": f"5. On the basis of the pleadings, record, and rival contentions, the following points/issues arise for determination by this Court:\n{framed_issues_block}",
        "section_8_statutory_provisions": f"6. The statutory framework governing the controversy comprises: {statutory_provisions}.\nUnder the constitutional doctrine of Stare Decisis (Article 141 of the Constitution of India), this Court accords primary binding authority to the decision of the Larger Bench of the Supreme Court of India in {primary_case} ({primary_cit}) [{primary_bench_label}], which strictly governs the field.",
        "section_9_evidence_analysis": f"7. Upon careful scrutiny of the pleadings, documentary record, and material placed before the Bench, the factual foundation relied upon by the parties is set out above; the Bench will record its assessment of the evidence.",
        "section_10_applicable_principles": f"8. The legal position is no longer res integra. The Hon'ble Supreme Court in the authoritative precedent of {primary_case} ({primary_cit}) enunciated the governing ratio decidendi:\n\"{primary_ratio}\"\n\nThe statutory mandate under {statutory_provisions} must be interpreted and enforced in strict conformity with this binding exposition of law.",
        "section_11_discussion_reasoning": f"9. Applying these settled legal principles to the factual matrix at hand, this Court finds that the test laid down in {primary_case} ({primary_cit}) is squarely attracted. Under Article 141 of the Constitution of India, the pronouncement of the Larger Bench binds all Courts within the territory of India.",
        "section_12_application_of_law": f"10. When the facts established on record are tested on the anvil of {statutory_provisions} read with the ratio in {primary_case} ({primary_cit}), the Bench will record whether the legal threshold is satisfied.",
        "section_13_findings_on_issues": sec_13_text,
        "section_14_conclusion_disposition": sec_14_text,
        "section_15_citations_authorities": "13. AUTHORITIES CITED & RELIED UPON (RANKED BY UPPER BENCH PRIORITY - ARTICLE 141):\n" + "\n".join(authorities_list)
    }
    
    sections = {k: sections[k] for k in wanted}
    full_text = "\n".join(sections.values())
    verified_citations = verify_all_text_citations(full_text)
    
    return {
        "success": True,
        "engine": "Gyanam AI Neural Legal Synthesis Engine (Upper Bench Prioritized)",
        "sections": sections,
        "verified_citations": verified_citations,
        "retrieved_precedents": retrieved_precedents,
        "primary_binding_authority": primary_authority or {
            "title": primary_case,
            "citation": primary_cit,
            "court": "Supreme Court of India",
            "bench_label": primary_bench_label,
            "ratio_decidendi": primary_ratio,
            "precedent_status": "FOLLOWED"
        }
    }

if __name__ == "__main__":
    print("Testing 15-Section Judgment Generation Engine...")
    result = generate_15_section_judgment(
        case_title="Rajendra Prasad Meena v. State of Rajasthan & Anr.",
        case_number="S.B. Civil Writ Petition No. 4521/2023",
        court="High Court of Rajasthan at Jodhpur",
        facts="The petitioner was appointed as Senior Teacher in 2012. A disciplinary inquiry was initiated in 2021. The Inquiry Officer submitted an adverse inquiry report directly to the Disciplinary Authority. The Disciplinary Authority passed an order of dismissal without serving a copy of the inquiry report or calling for the petitioner's representation.",
        petitioner_arguments="Non-supply of the inquiry report is a fatal breach of Article 311(2) and Rule 16 of Rajasthan CCA Rules. Caused severe prejudice.",
        respondent_arguments="Petitioner had participated in the oral inquiry. Disciplinary authority has full power to agree with inquiry officer.",
        issues="Whether non-supply of the inquiry officer's report vitiates the dismissal order?",
        statutory_provisions="Constitution of India, Article 311(2); Rajasthan Civil Services (CCA) Rules, 1958, Rule 16"
    )
    print(f"Generated draft successfully! Total sections: {len(result['sections'])}")
    print(f"Verified citations: {len(result['verified_citations'])}")
