"""Seed the fictional UAT matters into a RUNNING staging server (see docs/uat/RUNBOOK.md section 4).

Usage (server must already be running against the UAT copy of the database):
    python docs/uat/seed_uat.py --base http://localhost:8091

What it does (all through the public API, signed in as the fixture judge, so every row is audited):
  UAT-M1  IN_REVIEW      flawed: one garbled "Facts" section and one citation that is not in the corpus (tasks J-09, J-11)
  UAT-M2  IN_REVIEW      clean: cites (1993) 4 SCC 727 only (task J-10, approve)
  UAT-M3  BENCH_APPROVED clean (task J-12, seal)
  UAT-M4  DRAFT          cites (2008) 4 SCC 54, which the corpus records as overruled -> exactly one alert (tasks J-07, C-07)
  UAT-M5  DRAFT          clean, ready to send for review (task C-09, C-10)
Everything is fictional. Re-running the script on a database that already has these case numbers
creates duplicates, so run it once per fresh copy (RUNBOOK section 6 resets the copy).
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

SECTIONS = [
    "section_1_case_title", "section_2_case_number", "section_3_introduction", "section_4_brief_facts",
    "section_5_submissions_petitioner", "section_6_submissions_respondent", "section_7_issues_framed",
    "section_8_statutory_provisions", "section_9_evidence_analysis", "section_10_applicable_principles",
    "section_11_discussion_reasoning", "section_12_application_of_law", "section_13_findings_on_issues",
    "section_14_conclusion_disposition", "section_15_citations_authorities",
]

CLEAN_FACTS = ("The petitioner, a Senior Teacher, was dismissed from service by order dated 18.11.2022 after an ex parte "
               "inquiry. The inquiry report was not supplied to him before the disciplinary authority passed the order.")
GARBLED_FACTS = ("tbe Pet1tioner w4s serv1ng as Teach3r ~ dism|ssed ord3r da7ed 18 Nov 2022 ## w1thout n0tice PPPPPPPP "
                 "rep0rt supp1ied bef0re @uthority pa$sed ord3r ineq|ired res%ondent ap4eal reje<ted")


def build_sections(title, number, facts, cite_line, discussion):
    body = {
        "section_1_case_title": title,
        "section_2_case_number": number,
        "section_3_introduction": "This writ petition under Article 226 challenges an order of dismissal from service.",
        "section_4_brief_facts": facts,
        "section_5_submissions_petitioner": "The petitioner submits that the inquiry report was never supplied to him.",
        "section_6_submissions_respondent": "The respondents submit that a full inquiry was held and the penalty is proportionate.",
        "section_7_issues_framed": "Whether non-supply of the inquiry report vitiates the order of dismissal.",
        "section_8_statutory_provisions": "Article 311(2) of the Constitution of India; Rajasthan Civil Services (CCA) Rules, 1958.",
        "section_9_evidence_analysis": "The record shows that the report was forwarded only to the disciplinary authority.",
        "section_10_applicable_principles": cite_line,
        "section_11_discussion_reasoning": discussion,
        "section_12_application_of_law": cite_line,
        "section_13_findings_on_issues": "The issue is answered in favour of the petitioner, subject to the above.",
        "section_14_conclusion_disposition": "The order of dismissal is set aside and the matter is remitted to the disciplinary authority.",
        "section_15_citations_authorities": cite_line,
    }
    assert list(body) == SECTIONS
    return body


ECIL = "Managing Director, ECIL, Hyderabad v. B. Karunakar (1993) 4 SCC 727"
BHAT = "Krishna Janardhan Bhat v. Dattatraya G. Hegde (2008) 4 SCC 54"
MISSING = "Fictional Authority v. Imaginary State (2019) 77 SCC 1234"

MATTERS = [
    ("UAT/WP/9101/2026", "Sunita Choudhary v. State of Rajasthan", GARBLED_FACTS,
     ECIL + " and " + MISSING, "The Court relies on the above authorities.", "IN_REVIEW"),
    ("UAT/WP/9102/2026", "Mohan Lal v. Union of India", CLEAN_FACTS, ECIL,
     "Following " + ECIL + ", the report must be supplied before the penalty is imposed.", "IN_REVIEW"),
    ("UAT/WP/9103/2026", "Kavita Devi v. Director, Secondary Education", CLEAN_FACTS, ECIL,
     "Following " + ECIL + ", the report must be supplied before the penalty is imposed.", "BENCH_APPROVED"),
    ("UAT/WP/9104/2026", "Dinesh Bishnoi v. State of Rajasthan", CLEAN_FACTS, BHAT,
     "The presumption is discussed in " + BHAT + ".", "DRAFT"),
    ("UAT/WP/9105/2026", "Ramesh Kumawat v. State of Rajasthan", CLEAN_FACTS, ECIL,
     "Following " + ECIL + ", the report must be supplied before the penalty is imposed.", "DRAFT"),
]


def call(base, method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, path, e.read().decode()[:300])
        sys.exit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8091")
    base = ap.parse_args().base.rstrip("/")
    tok = call(base, "POST", "/api/auth/sso/nluj", {"target_role": "JUDICIAL_USER"})["access_token"]
    for number, title, facts, cite_line, discussion, target in MATTERS:
        sections = build_sections(title, number, facts, cite_line, discussion)
        content = {"success": True, "engine": "Template fallback", "sections": sections,
                   "verified_citations": [], "retrieved_precedents": []}
        if "(2008) 4 SCC 54" in cite_line:
            # Alerts are computed from verified_citations / retrieved_precedents, not from section text.
            content["verified_citations"] = [{"query_citation": "(2008) 4 SCC 54", "status": "OVERRULED",
                                              "case_data": {"case_id": "SCI-2008-JANARDHAN", "citation": "(2008) 4 SCC 54"}}]
        r = call(base, "POST", "/api/save_draft", {
            "case_title": title, "case_number": number, "court": "High Court of Judicature for Rajasthan at Jodhpur",
            "facts": facts, "issues": "Whether non-supply of the inquiry report vitiates the order of dismissal.",
            "petitioner_arguments": "Report not supplied.", "respondent_arguments": "Inquiry was fair.",
            "statutory_provisions": "Article 311(2)", "draft_content_json": content}, tok)
        did = r["draft_id"]
        path = {"DRAFT": [], "IN_REVIEW": ["IN_REVIEW"], "BENCH_APPROVED": ["IN_REVIEW", "BENCH_APPROVED"]}[target]
        for st in path:
            call(base, "POST", "/api/draft/update_status", {"draft_id": did, "status": st}, tok)
        print(f"draft #{did:<4} {number:<18} {target}")
    alerts = call(base, "GET", "/api/alerts", token=tok)
    print(f"alerts now listed: {alerts.get('total')} (expect at least 1)")


if __name__ == "__main__":
    main()
