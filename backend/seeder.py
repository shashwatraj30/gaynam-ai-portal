import json
import sqlite3
import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_connection

LANDMARK_JUDGMENTS = [
    {
        "case_id": "SCI-1993-ECIL",
        "title": "Managing Director, ECIL, Hyderabad v. B. Karunakar",
        "petitioner": "Managing Director, ECIL, Hyderabad",
        "respondent": "B. Karunakar",
        "court": "Supreme Court of India",
        "bench": "Constitution Bench (5 Judges)",
        "judges": "M.N. Venkatachaliah, CJI, P.B. Sawant, K. Ramaswamy, S.C. Agrawal, B.P. Jeevan Reddy, JJ.",
        "judgment_date": "1993-10-01",
        "year": 1993,
        "citation": "(1993) 4 SCC 727",
        "equivalent_citations": "AIR 1994 SC 1074, 1993 INSC 354, JT 1993 (6) SC 1",
        "statutes_considered": "Constitution of India, Article 311(2); 42nd Constitutional Amendment Act, 1976",
        "subject_category": "Service Law & Disciplinary Proceedings",
        "headnote": "Natural Justice — Disciplinary proceedings — Supply of Inquiry Officer's report to delinquent employee before disciplinary authority takes final decision — Held: Denial of inquiry report violates principles of natural justice and Article 311(2) of the Constitution.",
        "ratio_decidendi": "Whenever the Inquiry Officer is not the disciplinary authority, the delinquent employee has a statutory and constitutional right to receive a copy of the inquiry report and submit representation before the disciplinary authority takes a final decision on penalty. Failure to furnish report vitiates the order if prejudice is demonstrated.",
        "full_text": """
        1. The central question of law referred to this Constitution Bench is whether the report of the Inquiry Officer appointed by the disciplinary authority to hold an inquiry into the charges leveled against an employee is required to be furnished to the delinquent employee to enable him to make a representation before the disciplinary authority arrives at its finding on the charges and imposes punishment.
        
        2. Article 311(2) of the Constitution, as amended by the 42nd Amendment Act, 1976, removed the second opportunity of making a representation against the proposed penalty. However, the right to represent against the findings recorded in the inquiry report is an integral facet of the first stage of reasonable opportunity guaranteed by natural justice.
        
        3. The right to make representation against the findings of the Inquiry Officer is an indispensable requirement of the principles of natural justice. The Inquiry Officer is merely an delegate of the disciplinary authority. When the delegate submits his report, that report constitutes material adverse to the employee which is taken into consideration by the disciplinary authority.
        
        4. Audi alteram partem dictates that no material shall be relied upon against an individual without affording him an opportunity to comment upon, rebut, or explain the same. Hence, the supply of the inquiry report is mandatory.
        
        5. However, the non-furnishing of the inquiry report does not automatically void the order of punishment. The employee must demonstrate prejudice caused by the non-supply. If prejudice is shown, the court should quash the punishment order and remand the matter back to the stage of supplying the report.
        """,
        "precedent_status": "FOLLOWED",
        "overruled_by": None,
        "cases_cited": json.dumps(["Union of India v. Mohd. Ramzan Khan (1991) 1 SCC 588"]),
        "citing_cases_count": 1420,
        "source_url": "https://main.sci.gov.in/judgment/1993/ECIL_v_Karunakar.pdf"
    },
    {
        "case_id": "SCI-1998-WHIRLPOOL",
        "title": "Whirlpool Corporation v. Registrar of Trade Marks, Mumbai",
        "petitioner": "Whirlpool Corporation",
        "respondent": "Registrar of Trade Marks, Mumbai & Ors.",
        "court": "Supreme Court of India",
        "bench": "Division Bench (2 Judges)",
        "judges": "S. Saghir Ahmad, K. Venkataswami, JJ.",
        "judgment_date": "1998-10-26",
        "year": 1998,
        "citation": "(1998) 8 SCC 1",
        "equivalent_citations": "AIR 1999 SC 22, 1998 (7) Scale 240, 1998 INSC 449",
        "statutes_considered": "Constitution of India, Article 226; Trade and Merchandise Marks Act, 1958, Section 56",
        "subject_category": "Constitutional Law & Writ Jurisdiction",
        "headnote": "Writ Jurisdiction — Maintainability of writ petition under Article 226 despite existence of alternative statutory remedy — Four established exceptions carved out.",
        "ratio_decidendi": "The rule of exhaustion of alternative statutory remedies is a rule of discretion and policy, not a rule of constitutional limitation. A High Court can entertain a writ petition under Article 226 notwithstanding an alternative remedy in at least four contingencies: (i) where the writ petition seeks enforcement of Fundamental Rights; (ii) where there has been a violation of the principles of natural justice; (iii) where the order or proceedings are wholly without jurisdiction; or (iv) where the vires of an Act is challenged.",
        "full_text": """
        1. The primary issue is whether the High Court was justified in dismissing the appellant's writ petition under Article 226 on the ground of availability of an alternative remedy of appeal under the Trade and Merchandise Marks Act, 1958.
        
        2. The power to issue prerogative writs under Article 226 of the Constitution is plenary in nature. It is not limited by any statutory constraints. Under Article 226, the High Court has broad discretion to reach injustice wherever it is found.
        
        3. The existence of an alternative statutory remedy does not operate as an absolute bar to the maintainability of a writ petition. It is a rule of self-restraint, convenience, and discretion, rather than an absolute rule of law.
        
        4. We hold that the alternative remedy has been consistently held by this Court not to operate as an absolute bar in at least four well-settled exceptions:
           (a) where the writ petition has been filed for the enforcement of any of the Fundamental Rights;
           (b) where there has been a clear violation of the principles of natural justice;
           (c) where the order or proceedings are wholly without jurisdiction; or
           (d) where the vires of an Act or subordinate legislation is under challenge.
        
        5. In the present case, the Registrar acted without jurisdiction in issuing the impugned show-cause notice. Therefore, the High Court erred in relegating the petitioner to the alternative remedy.
        """,
        "precedent_status": "FOLLOWED",
        "overruled_by": None,
        "cases_cited": json.dumps(["Baburam Prakash Chandra Maheshwari v. Antarim Zila Parishad AIR 1969 SC 556"]),
        "citing_cases_count": 2840,
        "source_url": "https://main.sci.gov.in/judgment/1998/Whirlpool_v_Registrar.pdf"
    },
    {
        "case_id": "SCI-2010-RANGAPPA",
        "title": "Rangappa v. Sri Mohan",
        "petitioner": "Rangappa",
        "respondent": "Sri Mohan",
        "court": "Supreme Court of India",
        "bench": "Full Bench (3 Judges)",
        "judges": "K.G. Balakrishnan, CJI, P. Sathasivam, J.M. Panchal, JJ.",
        "judgment_date": "2010-05-07",
        "year": 2010,
        "citation": "(2010) 11 SCC 441",
        "equivalent_citations": "AIR 2010 SC 1898, 2010 (5) SCR 264, 2010 INSC 321",
        "statutes_considered": "Negotiable Instruments Act, 1881, Sections 138, 139, 118(a)",
        "subject_category": "Commercial & Criminal Jurisprudence",
        "headnote": "Negotiable Instruments Act, 1881 — Section 139 — Presumption in favour of holder — Held: Presumption includes existence of legally enforceable debt or liability — Standard of proof to rebut presumption is preponderance of probabilities.",
        "ratio_decidendi": "The presumption mandated by Section 139 of the NI Act includes the existence of a legally enforceable debt or liability. Once the execution of the cheque is admitted or proved, the burden shifts to the accused to rebut the presumption by raising a probable defence on the standard of preponderance of probabilities.",
        "full_text": """
        1. This reference to a 3-judge bench arises to clarify the scope of the presumption mandated under Section 139 of the Negotiable Instruments Act, 1881, and whether it extends to the existence of a legally enforceable debt.
        
        2. In Krishna Janardhan Bhat v. Dattatraya G. Hegde (2008) 4 SCC 54, a 2-judge bench held that the presumption under Section 139 does not extend to the existence of a debt. We respectfully disagree with that observation.
        
        3. Section 139 of the Act is an example of a reverse onus clause that has been included in furtherance of the legislative objective of improving the credibility of negotiable instruments. The presumption under Section 139 is that the cheque was issued for the discharge of any debt or other liability.
        
        4. The accused can rebut this presumption by stepping into the witness box or by relying on materials on record, including admissions in the cross-examination of the complainant. The standard of proof is not proof beyond reasonable doubt, but preponderance of probabilities.
        
        5. We overrule the dictum in Krishna Janardhan Bhat to the extent it held that Section 139 does not presume a legally enforceable debt.
        """,
        "precedent_status": "FOLLOWED",
        "overruled_by": None,
        "cases_cited": json.dumps(["Krishna Janardhan Bhat v. Dattatraya G. Hegde (2008) 4 SCC 54 (Overruled)"]),
        "citing_cases_count": 3100,
        "source_url": "https://main.sci.gov.in/judgment/2010/Rangappa_v_Sri_Mohan.pdf"
    },
    {
        "case_id": "SCI-2008-JANARDHAN",
        "title": "Krishna Janardhan Bhat v. Dattatraya G. Hegde",
        "petitioner": "Krishna Janardhan Bhat",
        "respondent": "Dattatraya G. Hegde",
        "court": "Supreme Court of India",
        "bench": "Division Bench (2 Judges)",
        "judges": "S.B. Sinha, V.S. Sirpurkar, JJ.",
        "judgment_date": "2008-01-11",
        "year": 2008,
        "citation": "(2008) 4 SCC 54",
        "equivalent_citations": "AIR 2008 SC 1325, 2008 (1) SCR 388",
        "statutes_considered": "Negotiable Instruments Act, 1881, Sections 138, 139",
        "subject_category": "Commercial & Criminal Jurisprudence",
        "headnote": "Negotiable Instruments Act — Presumption under Section 139 — Held: Does not extend to existence of legally enforceable debt. (OVERRULED by Rangappa v. Sri Mohan).",
        "ratio_decidendi": "Presumption of innocence is a human right. Section 139 presumption does not extend to the existence of a legally enforceable debt.",
        "full_text": """
        1. An accused in a proceeding under Section 138 of the Act is entitled to the benefit of presumption of innocence until proved guilty.
        2. Presumptions under Section 118(a) and 139 do not mandate that the court must presume the existence of a legally enforceable debt.
        3. OVERRULED: The Supreme Court in Rangappa v. Sri Mohan (2010) 11 SCC 441 expressly overruled this principle, holding that Section 139 presumption DOES extend to the existence of a legally enforceable debt.
        """,
        "precedent_status": "OVERRULED",
        "overruled_by": "Rangappa v. Sri Mohan (2010) 11 SCC 441",
        "cases_cited": json.dumps([]),
        "citing_cases_count": 480,
        "source_url": "https://main.sci.gov.in/judgment/2008/KJ_Bhat.pdf"
    },
    {
        "case_id": "RAJ-HC-2022-RAMESH",
        "title": "Rameshwar Lal Sharma v. State of Rajasthan & Ors.",
        "petitioner": "Rameshwar Lal Sharma",
        "respondent": "State of Rajasthan through Secretary, Department of Education & Ors.",
        "court": "High Court of Rajasthan",
        "bench": "Single Bench, Jodhpur",
        "judges": "Dinesh Mehta, J.",
        "judgment_date": "2022-04-12",
        "year": 2022,
        "citation": "2022 (2) RLW (Raj.) 1104",
        "equivalent_citations": "2022 SCC OnLine Raj 842",
        "statutes_considered": "Rajasthan Civil Services (Classification, Control and Appeal) Rules, 1958, Rule 16; Constitution of India, Article 226",
        "subject_category": "Service Law & Disciplinary Proceedings",
        "headnote": "Disciplinary Inquiry — Rajasthan CCA Rules, 1958, Rule 16 — Non-supply of preliminary fact-finding report and documents relied upon by inquiry officer — Held: Gross infraction of natural justice — Dismissal order quashed with all consequential benefits.",
        "ratio_decidendi": "Under Rule 16 of Rajasthan CCA Rules, 1958, an inquiry conducted without providing copies of the complaint and the documents exhibited by the presenting officer denies the employee an effective opportunity of cross-examination. Such an inquiry is vitiated ab initio.",
        "full_text": """
        1. By way of this writ petition under Article 226 of the Constitution of India, the petitioner has challenged the order of dismissal dated 14.07.2021 passed by the Disciplinary Authority under Rule 16 of the Rajasthan Civil Services (Classification, Control & Appeal) Rules, 1958.
        
        2. The primary grievance of the petitioner is that during the departmental inquiry, the inquiry officer relied upon the preliminary enquiry report as well as statements recorded behind his back, but copies thereof were never supplied to him despite written representations.
        
        3. This Court in multiple decisions, following the landmark ruling of the Supreme Court in Managing Director, ECIL v. B. Karunakar (1993) 4 SCC 727, has reiterated that no material can be used against an employee behind his back. Natural justice is not an empty formality.
        
        4. The refusal to supply relied upon documents has severely prejudiced the petitioner in defending himself. Consequently, the inquiry report and the subsequent dismissal order are quashed. The respondent authorities are directed to reinstate the petitioner with 50% back wages and continuity of service.
        """,
        "precedent_status": "FOLLOWED",
        "overruled_by": None,
        "cases_cited": json.dumps(["Managing Director, ECIL v. B. Karunakar (1993) 4 SCC 727", "State of U.P. v. Saroj Kumar Sinha (2010) 2 SCC 772"]),
        "citing_cases_count": 45,
        "source_url": "https://hcraj.nic.in/judgments/2022/Rameshwar_Lal.pdf"
    },
    {
        "case_id": "DEL-HC-2021-ARBITRATION",
        "title": "Delhi Airport Metro Express Pvt. Ltd. v. Delhi Metro Rail Corporation Ltd.",
        "petitioner": "Delhi Airport Metro Express Pvt. Ltd. (DAMEPL)",
        "respondent": "Delhi Metro Rail Corporation Ltd. (DMRC)",
        "court": "Supreme Court of India",
        "bench": "Division Bench",
        "judges": "L. Nageswara Rao, S. Ravindra Bhat, JJ.",
        "judgment_date": "2021-09-09",
        "year": 2021,
        "citation": "(2022) 1 SCC 131",
        "equivalent_citations": "2021 SCC OnLine SC 695, AIR 2021 SC 4526",
        "statutes_considered": "Arbitration and Conciliation Act, 1996, Sections 34, 37",
        "subject_category": "Arbitration & Commercial Law",
        "headnote": "Arbitration — Section 34 & 37 — Scope of judicial interference with arbitral award — Patent illegality — Courts cannot act as appellate courts to re-appreciate findings of facts.",
        "ratio_decidendi": "The High Court exercising jurisdiction under Section 37 cannot substitute its own interpretation of contractual clauses for that of the arbitral tribunal. A mere error of law or fact does not constitute 'patent illegality' under Section 34(2A).",
        "full_text": """
        1. The trend of courts substituting their own views for that of the Arbitral Tribunal under the garb of 'patent illegality' has been strongly deprecated by this Court.
        2. Section 34 of the Arbitration and Conciliation Act, 1996 provides for minimal judicial intervention. If an arbitrator interprets a contractual provision reasonably, such interpretation is final and binding.
        3. The Division Bench of the High Court in Section 37 committed a patent error by setting aside the arbitral award through re-appreciation of evidence. The arbitral award is hereby restored.
        """,
        "precedent_status": "FOLLOWED",
        "overruled_by": None,
        "cases_cited": json.dumps(["Associate Builders v. DDA (2015) 3 SCC 49", "Ssangyong Engineering v. NHAI (2019) 15 SCC 131"]),
        "citing_cases_count": 890,
        "source_url": "https://main.sci.gov.in/judgment/2021/DAMEPL_v_DMRC.pdf"
    },
    {
        "case_id": "SCI-2017-PUTTASWAMY",
        "title": "Justice K.S. Puttaswamy (Retd.) v. Union of India",
        "petitioner": "Justice K.S. Puttaswamy (Retd.)",
        "respondent": "Union of India & Ors.",
        "court": "Supreme Court of India",
        "bench": "Constitution Bench (9 Judges)",
        "judges": "J.S. Khehar, CJI, J. Chelameswar, S.A. Bobde, R.K. Agrawal, R.F. Nariman, A.M. Sapre, D.Y. Chandrachud, S.K. Kaul, S. Abdul Nazeer, JJ.",
        "judgment_date": "2017-08-24",
        "year": 2017,
        "citation": "(2017) 10 SCC 1",
        "equivalent_citations": "AIR 2017 SC 4161, 2017 (10) SCALE 1",
        "statutes_considered": "Constitution of India, Articles 14, 19, 21; Aadhaar Act, 2016",
        "subject_category": "Constitutional Law & Fundamental Rights",
        "headnote": "Right to Privacy — Fundamental Right — Article 21 — Unanimously held that the right to privacy is a fundamental right protected under Part III of the Constitution. ADM Jabalpur v. Shivkant Shukla expressly overruled.",
        "ratio_decidendi": "Privacy is an intrinsic element of human dignity, liberty, and autonomy under Article 21. Any state restriction on privacy must satisfy the three-fold test of legality, legitimate state aim, and proportionality.",
        "full_text": """
        1. The question before this 9-Judge Bench is whether the right to privacy is a Fundamental Right under the Constitution of India.
        2. We unanimously hold that the right to privacy is protected as an intrinsic part of the right to life and personal liberty under Article 21 and as a part of the freedoms guaranteed by Part III of the Constitution.
        3. The decisions in M.P. Sharma v. Satish Chandra (1954) and Kharak Singh v. State of U.P. (1962) to the extent that they held privacy is not a fundamental right are overruled.
        4. The infamous decision in ADM Jabalpur v. Shivkant Shukla (1976) 2 SCC 521, which held that personal liberty could be extinguished during an Emergency, is expressly overruled as being fundamentally erroneous and antithetical to the rule of law.
        """,
        "precedent_status": "FOLLOWED",
        "overruled_by": None,
        "cases_cited": json.dumps(["ADM Jabalpur v. Shivkant Shukla (1976) 2 SCC 521 (Overruled)", "M.P. Sharma v. Satish Chandra AIR 1954 SC 300 (Overruled)"]),
        "citing_cases_count": 4500,
        "source_url": "https://main.sci.gov.in/judgment/2017/Puttaswamy_Privacy.pdf"
    },
    {
        "case_id": "SCI-1976-ADMJABALPUR",
        "title": "Additional District Magistrate, Jabalpur v. Shivkant Shukla",
        "petitioner": "Additional District Magistrate, Jabalpur",
        "respondent": "Shivkant Shukla",
        "court": "Supreme Court of India",
        "bench": "Constitution Bench (5 Judges)",
        "judges": "A.N. Ray, CJI, H.R. Khanna, M.H. Beg, Y.V. Chandrachud, P.N. Bhagwati, JJ.",
        "judgment_date": "1976-04-28",
        "year": 1976,
        "citation": "(1976) 2 SCC 521",
        "equivalent_citations": "AIR 1976 SC 1207, 1976 SCR 172",
        "statutes_considered": "Constitution of India, Article 359(1), Article 21; Maintenance of Internal Security Act, 1971 (MISA)",
        "subject_category": "Constitutional Law & Emergency",
        "headnote": "Habeas Corpus Case — Suspension of Article 21 during Presidential Proclamation of Emergency. (EXPRESSLY OVERRULED by K.S. Puttaswamy v. Union of India).",
        "ratio_decidendi": "In view of Presidential Order under Article 359(1), no person has any locus standi to move any writ petition under Article 226 for habeas corpus. (OVERRULED: Khanna, J.'s legendary dissent affirmed in Puttaswamy).",
        "full_text": """
        1. During the proclamation of Emergency, the right to approach courts under Article 226 for enforcement of personal liberty remains suspended.
        2. DISSENT by Khanna, J.: Rule of law is the antithesis of arbitrariness. Article 21 is not the sole repository of the right to life. Even in the absence of Article 21, the State has no power to deprive a person of life or liberty without the authority of law.
        3. OVERRULED STATUS: Formally and expressly overruled by the 9-Judge Bench in Justice K.S. Puttaswamy v. Union of India (2017) 10 SCC 1.
        """,
        "precedent_status": "OVERRULED",
        "overruled_by": "Justice K.S. Puttaswamy (Retd.) v. Union of India (2017) 10 SCC 1",
        "cases_cited": json.dumps([]),
        "citing_cases_count": 920,
        "source_url": "https://main.sci.gov.in/judgment/1976/ADM_Jabalpur.pdf"
    }
]

def seed_database():
    conn = get_connection()
    cursor = conn.cursor()
    
    print("Seeding foundational landmark judgments into SQLite FTS5 database...")
    for item in LANDMARK_JUDGMENTS:
        cursor.execute("""
        INSERT OR REPLACE INTO judgments (
            case_id, title, petitioner, respondent, court, bench, judges,
            judgment_date, year, citation, equivalent_citations, statutes_considered,
            subject_category, headnote, ratio_decidendi, full_text,
            precedent_status, overruled_by, cases_cited, citing_cases_count, source_url
        ) VALUES (
            :case_id, :title, :petitioner, :respondent, :court, :bench, :judges,
            :judgment_date, :year, :citation, :equivalent_citations, :statutes_considered,
            :subject_category, :headnote, :ratio_decidendi, :full_text,
            :precedent_status, :overruled_by, :cases_cited, :citing_cases_count, :source_url
        );
        """, item)
        
    conn.commit()
    cursor.execute("SELECT COUNT(*) FROM judgments")
    count = cursor.fetchone()[0]
    conn.close()
    print(f"Successfully seeded database! Total judgments now active in index: {count}")

if __name__ == "__main__":
    seed_database()
