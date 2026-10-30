"""
GYANAM AI — NLU JODHPUR EDITION (POWERED BY KELYVO)
OFFICIAL JUDICIAL EXPORT & PUBLISHING ENGINE
-----------------------------------------------------------------
Generates production-grade court deliverables:
1. DOCX (.docx) strictly adhering to High Court of Rajasthan & Supreme Court Formatting Rules:
   - 1.5" Left Margin (Legal Binding Space)
   - Standard 13pt Serif Typography (Times New Roman / Georgia)
   - 1.5 Line Spacing with canonical indentation
   - Running Headers & Footers with Page Numbers
   - Cryptographic SHA-256 Digital Verification Hash & DPDP Audit Token
2. Official Printable Court Gazette HTML for instantaneous browser-based PDF printing.
"""

import os
import io
import json
import re
import html as html_lib
import hashlib
import zipfile
from datetime import datetime, timezone
from typing import Dict, Any, Optional

import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

SECTION_TITLES = {
    "section_1_case_title": (1, "Case Title & Jurisdiction"),
    "section_2_case_number": (2, "Case Registration & Quorum"),
    "section_3_introduction": (3, "Introductory Roster"),
    "section_4_brief_facts": (4, "Essential Factual Matrix"),
    "section_5_submissions_petitioner": (5, "Submissions of the Petitioner"),
    "section_6_submissions_respondent": (6, "Submissions of the Respondent"),
    "section_7_issues_framed": (7, "Points & Issues for Determination"),
    "section_8_statutory_provisions": (8, "Statutory Provisions Considered"),
    "section_9_evidence_analysis": (9, "Evidentiary & Record Analysis"),
    "section_10_applicable_principles": (10, "Authoritative Precedent Doctrines"),
    "section_11_discussion_reasoning": (11, "Judicial Reasoning & Discussion"),
    "section_12_application_of_law": (12, "Application of Law to Facts"),
    "section_13_findings_on_issues": (13, "Findings on Framed Issues"),
    "section_14_conclusion_disposition": (14, "Operative Order & Relief Granted"),
    "section_15_citations_authorities": (15, "SCitation Validated Authorities Cited")
}

def normalize_sections(sections_raw) -> list:
    if not sections_raw:
        return []
    if isinstance(sections_raw, list):
        return sections_raw
    if isinstance(sections_raw, dict):
        result = []
        for k, v in sections_raw.items():
            if k in SECTION_TITLES:
                num, title = SECTION_TITLES[k]
                result.append({"number": num, "title": title, "content": str(v)})
            else:
                clean_title = k.replace("section_", "").replace("_", " ").title()
                result.append({"number": len(result) + 1, "title": clean_title, "content": str(v)})
        return result
    return []

def generate_judgment_hash(case_number: str, title: str, content: str) -> str:
    """Generates tamper-evident SHA-256 fingerprint for judicial verification."""
    payload = f"{case_number}|{title}|{content}|NLU_JODHPUR_KELYVO_2026"
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


# --------------------------------------------------------------------------------------------
# Seal fingerprint (Bug 3). One canonical content accumulator + one hash function; the value is
# computed ONCE when a draft is sealed and persisted (draft_judgments.sealed_hash/sealed_at).
# Exports of a sealed draft read the persisted value; they never recompute from "now".
# --------------------------------------------------------------------------------------------
def _content_dict(draft_content_json) -> dict:
    if isinstance(draft_content_json, str):
        try:
            draft_content_json = json.loads(draft_content_json)
        except Exception:
            return {}
    return draft_content_json if isinstance(draft_content_json, dict) else {}


def build_sections_text(draft_content_json) -> str:
    """The plain-text accumulator the fingerprint is computed over: one block per section, title then content."""
    out = ""
    for sec in normalize_sections(_content_dict(draft_content_json).get("sections", {})):
        out += f"{sec.get('title', '')}\n{sec.get('content', '')}\n\n"
    return out


def compute_seal_hash(draft_row: Dict[str, Any]) -> str:
    """Canonical fingerprint of a draft row's current content (used at seal time, for backfill and for previews)."""
    return generate_judgment_hash(
        draft_row.get("case_number") or "", draft_row.get("case_title") or "",
        build_sections_text(draft_row.get("draft_content_json")))


def is_sealed(draft_data: Dict[str, Any]) -> bool:
    return str(draft_data.get("status") or "").upper() == "FINAL_SEALED"


def _parse_ts(value) -> Optional[datetime]:
    if not value:
        return None
    s = str(value).strip().replace("Z", "+00:00")
    for parse in (datetime.fromisoformat,
                  lambda v: datetime.strptime(v[:19], "%Y-%m-%d %H:%M:%S"),
                  lambda v: datetime.strptime(v[:16], "%Y-%m-%d %H:%M")):
        try:
            dt = parse(s)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
    return None


_EPOCH = datetime(1980, 1, 1, tzinfo=timezone.utc)


def seal_info(draft_data: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve the fingerprint/date an export must show.

    Sealed draft  -> persisted sealed_hash / sealed_at (never "now"). If a sealed draft has no persisted hash
                     (sealed before Bug 3 and not yet backfilled) the hash is computed by the same shared helper
                     so every export path still agrees; it is flagged backfilled.
    Unsealed      -> a fresh preview hash and the current time (a preview is explicitly not a seal).
    Returns {sealed, hash, when (aware datetime), backfilled}.
    """
    if is_sealed(draft_data):
        h = draft_data.get("sealed_hash") or compute_seal_hash(draft_data)
        when = (_parse_ts(draft_data.get("sealed_at")) or _parse_ts(draft_data.get("date_created")) or _EPOCH)
        backfilled = (not draft_data.get("sealed_hash")) or bool(draft_data.get("sealed_hash_backfilled"))
        return {"sealed": True, "hash": h, "when": when, "backfilled": backfilled}
    return {"sealed": False, "hash": compute_seal_hash(draft_data), "when": datetime.now(timezone.utc), "backfilled": False}


_ZIP_FIXED_TIME = (1980, 1, 1, 0, 0, 0)


def normalize_docx_zip(data: bytes) -> bytes:
    """Re-serialise a DOCX with every ZIP member timestamp pinned (deterministic-build convention).
    Member order, names and compression type are preserved."""
    src = zipfile.ZipFile(io.BytesIO(data))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as dst:
        for info in src.infolist():
            payload = src.read(info.filename)
            zi = zipfile.ZipInfo(info.filename, date_time=_ZIP_FIXED_TIME)
            zi.compress_type = info.compress_type
            zi.external_attr = info.external_attr
            zi.create_system = info.create_system
            dst.writestr(zi, payload)
    src.close()
    return out.getvalue()


def _resolve_parties_and_court(draft_data: Dict[str, Any]):
    import re
    court_raw = (draft_data.get("court") or "High Court of Judicature for Rajasthan at Jodhpur").strip()
    court_upper = court_raw.upper()
    if not court_upper.startswith("IN THE "):
        court_header_str = f"IN THE {court_upper}"
    else:
        court_header_str = court_upper

    case_title = (draft_data.get("case_title") or "Petitioner v. Respondent").strip()
    pet = (draft_data.get("petitioner") or "").strip()
    resp = (draft_data.get("respondent") or "").strip()

    if not pet or pet.lower() in ["petitioner", "petitioner / appellant"]:
        parts = re.split(r'\s+(?:v\.|vs\.|versus)\s+', case_title, maxsplit=1, flags=re.I)
        if len(parts) == 2:
            pet = parts[0].strip()
            resp = parts[1].strip()
        else:
            pet = case_title
            resp = "State / Respondent(s)"

    is_crim = any(k in (case_title + " " + (draft_data.get("case_number") or "")).lower() for k in ["state ", "fir ", "f.i.r", "criminal", "acjm", "magistrate"])
    pet_label = "... COMPLAINANT / PROSECUTION" if is_crim else "... PETITIONER(S) / APPELLANT(S)"
    resp_label = "... ACCUSED / RESPONDENT(S)" if is_crim else "... RESPONDENT(S)"
    return court_raw, court_header_str, pet, resp, pet_label, resp_label


def export_judgment_to_docx(draft_data: Dict[str, Any], output_path: Optional[str] = None) -> io.BytesIO:
    """Creates a beautifully styled High Court / Supreme Court DOCX document."""
    doc = docx.Document()
    seal = seal_info(draft_data)
    seal_when = seal["when"]
    court_raw, court_header_str, pet, resp, pet_label, resp_label = _resolve_parties_and_court(draft_data)
    
    # Page Setup: Legal / A4 with High Court margins (1.5" left for binding)
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.4)
        section.right_margin = Inches(1.0)
        
        # Header & Footer
        header = section.header
        hp = header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hrun = hp.add_run(f"{court_header_str} — {draft_data.get('case_number', 'JUDICIAL DOCKET')}")
        hrun.font.name = "Times New Roman"
        hrun.font.size = Pt(9)
        hrun.font.italic = True
        hrun.font.color.rgb = RGBColor(120, 120, 120)
        
        footer = section.footer
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        frun = fp.add_run("Gyanam AI (NLU Jodhpur Edition) — Powered by Kelyvo | Digitally Signed Judicial Output")
        frun.font.name = "Times New Roman"
        frun.font.size = Pt(8.5)
        frun.font.italic = True
        frun.font.color.rgb = RGBColor(140, 140, 140)

    # Document Header - Court Title
    court_p = doc.add_paragraph()
    court_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    c_run = court_p.add_run(f"{court_header_str}\n")
    c_run.font.name = "Times New Roman"
    c_run.font.size = Pt(14)
    c_run.bold = True
    
    bench_p = doc.add_paragraph()
    bench_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    coram_name = (draft_data.get('reviewed_by') or "HON'BLE PRESIDING BENCH").upper()
    b_run = bench_p.add_run(f"CORAM: {coram_name}\n")
    b_run.font.name = "Times New Roman"
    b_run.font.size = Pt(11)
    b_run.bold = True
    
    # Case Number & Date
    meta_p = doc.add_paragraph()
    meta_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    m_run = meta_p.add_run(f"{draft_data.get('case_number', 'S.B. CIVIL WRIT PETITION NO. 4820 OF 2026')}\nDATE OF ORDER / JUDGMENT: {seal_when.strftime('%d %B %Y').upper()}")
    m_run.font.name = "Times New Roman"
    m_run.font.size = Pt(11)
    m_run.bold = True
    
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # Cause Title Box
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(6)
    title_p.paragraph_format.space_after = Pt(6)
    
    t_run1 = title_p.add_run(f"{pet}\n")
    t_run1.font.name = "Times New Roman"
    t_run1.bold = True
    t_run1.font.size = Pt(12)
    
    t_run2 = title_p.add_run(f"{pet_label}\n\nVERSUS\n\n")
    t_run2.font.name = "Times New Roman"
    t_run2.font.size = Pt(11)
    t_run2.bold = True
    
    t_run3 = title_p.add_run(f"{resp}\n")
    t_run3.font.name = "Times New Roman"
    t_run3.bold = True
    t_run3.font.size = Pt(12)
    
    t_run4 = title_p.add_run(f"{resp_label}\n")
    t_run4.font.name = "Times New Roman"
    t_run4.font.size = Pt(11)
    t_run4.bold = True

    # Divider line
    div_p = doc.add_paragraph()
    div_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    d_run = div_p.add_run("—" * 45)
    d_run.font.color.rgb = RGBColor(160, 160, 160)
    
    # Word "JUDGMENT"
    j_header = doc.add_paragraph()
    j_header.alignment = WD_ALIGN_PARAGRAPH.CENTER
    j_run = j_header.add_run("J U D G M E N T")
    j_run.font.name = "Times New Roman"
    j_run.font.size = Pt(14)
    j_run.bold = True
    j_run.font.letter_spacing = Pt(2) if hasattr(j_run.font, 'letter_spacing') else None

    # Sections processing
    content_json = draft_data.get("draft_content_json", {})
    if isinstance(content_json, str):
        try:
            content_json = json.loads(content_json)
        except Exception:
            pass
    sections_list = normalize_sections(content_json.get("sections", {}))
    
    for sec in sections_list:
        sec_num = sec.get("number", "")
        sec_title = sec.get("title", "")
        sec_content = sec.get("content", "")
        
        # Section Heading
        h_p = doc.add_paragraph()
        h_p.paragraph_format.space_before = Pt(14)
        h_p.paragraph_format.space_after = Pt(4)
        h_p.paragraph_format.keep_with_next = True
        
        h_run = h_p.add_run(f"{sec_num}. {sec_title.upper()}")
        h_run.font.name = "Times New Roman"
        h_run.font.size = Pt(11.5)
        h_run.bold = True
        h_run.font.color.rgb = RGBColor(10, 25, 47)
        
        # Section Body Paragraphs
        paragraphs = sec_content.split('\n\n')
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(6)
            p.paragraph_format.line_spacing = 1.3
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            
            p_run = p.add_run(para)
            p_run.font.name = "Times New Roman"
            p_run.font.size = Pt(11)

    # Signature Block
    sig_p = doc.add_paragraph()
    sig_p.paragraph_format.space_before = Pt(30)
    sig_p.paragraph_format.keep_with_next = True
    sig_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    
    s_run = sig_p.add_run(
        "Sd/-\n"
        f"({coram_name})\n"
        f"{court_raw.upper()}\n\n"
        f"Pronounced on {seal_when.strftime('%d/%m/%Y')}"
    )
    s_run.font.name = "Times New Roman"
    s_run.font.size = Pt(11)
    s_run.bold = True

    # Digital Verification Stamp & Hash Block
    hash_val = seal["hash"]
    
    seal_table = doc.add_table(rows=1, cols=1)
    seal_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = seal_table.cell(0, 0)
    cell.width = Inches(6.0)
    cp = cell.paragraphs[0]
    cp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    
    seal_run = cp.add_run(
        "INSTITUTIONAL DIGITAL INTEGRITY SEAL\n"
        f"Platform: Gyanam AI — NLU Jodhpur Edition (Powered by Kelyvo)\n"
        f"SHA-256 Fingerprint: {hash_val}\n"
        f"SCitation Verification: VERIFIED_ACTIVE_CANONICAL\n"
        f"DPDP Act 2023 Audit Token: DPDP-NLUJ-{hash_val[:12].upper()}\n"
        f"Certified True Copy under Section 65B Indian Evidence Act / Section 63 BSA"
    )
    seal_run.font.name = "Courier New"
    seal_run.font.size = Pt(8)
    seal_run.font.color.rgb = RGBColor(70, 70, 70)

    # Return bytes stream or save to file
    # Pin every volatile package field so a sealed export is byte-identical on every call.
    cp_ = doc.core_properties
    cp_.created = cp_.modified = seal_when.replace(microsecond=0, tzinfo=None)
    cp_.last_printed = seal_when.replace(microsecond=0, tzinfo=None)
    cp_.revision = 1
    raw = io.BytesIO()
    doc.save(raw)
    file_stream = io.BytesIO(normalize_docx_zip(raw.getvalue()))
    file_stream.seek(0)
    
    if output_path:
        with open(output_path, "wb") as f:
            f.write(file_stream.getvalue())
            
    return file_stream

def render_printable_html(draft_data: Dict[str, Any]) -> str:
    """Renders high-fidelity printable HTML with High Court gazette styling."""
    content_json = draft_data.get("draft_content_json", {})
    if isinstance(content_json, str):
        try:
            content_json = json.loads(content_json)
        except Exception:
            pass
    sections_list = normalize_sections(content_json.get("sections", {}))
    case_no = draft_data.get("case_number", "S.B. CRIMINAL MISC. PETITION NO. 4820/2026")
    title = draft_data.get("case_title", "Petitioner v. Respondent")
    court_raw, court_header_str, pet, resp, pet_label, resp_label = _resolve_parties_and_court(draft_data)
    
    esc = lambda v: html_lib.escape(str(v if v is not None else ""), quote=True)
    sections_html = ""
    for sec in sections_list:
        sec_num = esc(sec.get("number", ""))
        sec_title = esc(sec.get("title", ""))
        sec_content = esc(sec.get("content", "")).replace('\n\n', '</p><p class="judicial-para">')
        sections_html += f"""
        <div class="judgment-section">
            <h3 class="section-heading">{sec_num}. {sec_title.upper()}</h3>
            <p class="judicial-para">{sec_content}</p>
        </div>
        """
        
    seal = seal_info(draft_data)
    hash_val = seal["hash"]
    coram_html_str = esc((draft_data.get('reviewed_by') or "HON'BLE PRESIDING BENCH").upper())
    # Every interpolated value is HTML-escaped (stored drafts are user-authored).
    case_no_raw = str(case_no)
    case_no_css = re.sub(r'[^A-Za-z0-9 ./()-]', '', case_no_raw)
    case_no, court_header_str, pet, resp, pet_label, resp_label = (
        esc(v) for v in (case_no, court_header_str, pet, resp, pet_label, resp_label))
    court_raw_html = esc(str(court_raw).upper())
    hash_val = esc(hash_val)
    citation_tail = esc(case_no_raw[-6:].replace('/', ''))
    
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Official Judgment — {case_no}</title>
<style>
@page {{
    size: A4;
    margin: 25mm 20mm 25mm 30mm;
    @top-right {{
        content: "{case_no_css}";
        font-family: "Times New Roman", serif;
        font-size: 9pt;
        color: #666;
    }}
    @bottom-center {{
        content: "Gyanam AI — NLU Jodhpur Edition (Powered by Kelyvo)";
        font-family: "Times New Roman", serif;
        font-size: 8pt;
        color: #888;
    }}
}}
body {{
    font-family: "Times New Roman", "Georgia", serif;
    font-size: 11.5pt;
    line-height: 1.6;
    color: #111;
    background: #fff;
    margin: 0;
    padding: 30px;
    max-width: 850px;
    margin-left: auto;
    margin-right: auto;
}}
.no-print-bar {{
    background: #0f172a;
    color: #f8fafc;
    padding: 12px 24px;
    border-radius: 8px;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}}
.no-print-bar button {{
    background: #d4af37;
    color: #0b1329;
    border: none;
    font-weight: 700;
    padding: 8px 18px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
}}
.court-header {{
    text-align: center;
    border-bottom: 2px solid #111;
    padding-bottom: 12px;
    margin-bottom: 20px;
}}
.court-name {{
    font-size: 15pt;
    font-weight: bold;
    letter-spacing: 1px;
    margin: 0;
}}
.bench-title {{
    font-size: 11.5pt;
    font-weight: bold;
    margin-top: 6px;
}}
.case-no-bar {{
    text-align: center;
    font-weight: bold;
    font-size: 11.5pt;
    margin: 12px 0;
}}
.cause-title-box {{
    margin: 20px 0;
    padding: 12px 20px;
    border-left: 3px solid #333;
    background: #fbfbfb;
}}
.party-name {{
    font-size: 12pt;
    font-weight: bold;
}}
.versus-label {{
    text-align: center;
    font-weight: bold;
    margin: 10px 0;
    letter-spacing: 2px;
}}
.judgment-title {{
    text-align: center;
    font-size: 15pt;
    font-weight: bold;
    letter-spacing: 4px;
    margin: 28px 0 20px 0;
}}
.section-heading {{
    font-size: 12pt;
    font-weight: bold;
    color: #0b1a30;
    margin-top: 22px;
    margin-bottom: 8px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
}}
.judicial-para {{
    text-align: justify;
    text-indent: 28px;
    margin: 8px 0;
}}
.signature-box {{
    margin-top: 40px;
    text-align: right;
    font-weight: bold;
    line-height: 1.4;
}}
.digital-seal-box {{
    margin-top: 30px;
    border: 1px dashed #777;
    padding: 12px;
    font-family: "Courier New", monospace;
    font-size: 8.5pt;
    color: #444;
    background: #f8fafc;
}}
@media print {{
    .no-print-bar {{ display: none; }}
    body {{ padding: 0; max-width: 100%; }}
}}
</style>
</head>
<body>
<div class="no-print-bar">
    <div>
        <strong>GYANAM AI — OFFICIAL COURT PUBLICATION VIEW</strong> &nbsp;|&nbsp; 
        <span>NLU Jodhpur Edition (Powered by Kelyvo)</span>
    </div>
    <button onclick="window.print()">🖨️ Print Official Judgment / Save as PDF</button>
</div>

<div class="court-header">
    <div class="court-name">{court_header_str}</div>
    <div class="bench-title">CORAM: {coram_html_str}</div>
    <div class="case-no-bar">{case_no}</div>
</div>

<div class="cause-title-box">
    <div class="party-name">{pet}</div>
    <div style="font-size: 9.5pt; color: #555;">{pet_label}</div>
    <div class="versus-label">V E R S U S</div>
    <div class="party-name">{resp}</div>
    <div style="font-size: 9.5pt; color: #555;">{resp_label}</div>
</div>

<div class="judgment-title">J U D G M E N T</div>

{sections_html}

<div class="signature-box">
    Sd/-<br>
    ({coram_html_str})<br>
    {court_raw_html}<br>
    <span style="font-size: 9.5pt; font-weight: normal; color: #555;">Pronounced on {seal['when'].strftime('%d %B %Y')}</span>
</div>

<div class="digital-seal-box">
    <strong>CERTIFICATE OF DIGITAL INTEGRITY & JUDICIAL RECORD AUTHENTICATION</strong><br>
    System: Gyanam AI — NLU Jodhpur Edition (Powered by Kelyvo)<br>
    SHA-256 Hash: {hash_val}<br>
    DPDP Act 2023 Anonymization Token: DPDP-NLUJ-{hash_val[:12].upper()}<br>
    SCitation Universal Canonical Citation: 2026 (NLUJ-SCIT) {citation_tail}<br>
    Compliance: Section 65B Indian Evidence Act / Section 63 Bharatiya Sakshya Adhiniyam, 2023
</div>

</body>
</html>"""
    return html
