"""Shared document-text fixtures for classifier / extraction tests (Indian-court style, synthetic)."""

FIR_FORM = """FIRST INFORMATION REPORT
(Under Section 154 Cr.P.C.)

POLICE STATION: Bhowanipore P.S., Kolkata, West Bengal
FIR No. 17/2026
Date: 04/17/2026

ACCUSED PERSONS:
(1) Samir Das S/o Late Hari Das (2) Biltu Ghosh (3) Unknown persons

ACTS & SECTIONS:
1. Section 379 IPC
2. Section 34 IPC

SUBSTANCE OF COMPLAINT:
The complainant states that on the night of 3rd April two persons broke into his shop and took away cash.
He identified the accused from the CCTV footage.

SEIZED ARTICLES:
Nil
"""

FIR_NUMBERED = """First Information Report
1. District: Jaipur North    P.S.: Shastri Nagar    Year: 2026   FIR No. 06/2026
POLICE STATION: Shastri Nagar P.S., Jaipur, Rajasthan
2. Acts & Sections: 420 IPC

ACCUSED PARTICULARS:
1. Ramesh Soni, resident of Jaipur
2. Suresh Soni

7. Details of Known / Suspected / Unknown / Accused with full particulars
Ramesh Soni
8. Property stolen
9. FIR Contents:
Complainant alleges cheating in a land deal.
"""

BAIL_PREAMBLE = "\n".join(
    ["IN THE HIGH COURT OF JUDICATURE FOR RAJASTHAN AT JODHPUR",
     "BAIL APPLICATION NO. 1234 OF 2026",
     "(Arising out of FIR No. 221/2026, P.S. Kotwali, District Jodhpur)",
     "(Under Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023)",
     ""]
    + [f"Note {i}: this application is filed through the undersigned counsel and is placed before this Hon'ble Court "
       f"for the first time; no similar application is pending." for i in range(1, 71)]
    + ["",
       "Ravi Kumar S/o Mohan Lal",
       "... APPLICANT",
       "VERSUS",
       "State of Rajasthan",
       "... RESPONDENT",
       "",
       "FACTS:",
       "1. The applicant was arrested on 2nd March 2026 in FIR No. 221/2026 registered at P.S. Kotwali under Section 420 IPC.",
       "2. The applicant has no criminal antecedents and is in judicial custody since then.",
       "",
       "GROUNDS:",
       ] + [f"{i}. That the applicant relies on ground number {i} as set out in the accompanying memorandum of grounds." for i in range(1, 91)] + [
       "",
       "QUESTIONS OF LAW:",
       "Whether the applicant is entitled to bail in view of the completion of investigation?",
       "",
       "SUBMISSIONS ON BEHALF OF THE APPLICANT:",
       "The applicant has been falsely implicated; the allegations are purely civil in nature and the investigation is complete.",
       "",
       "SUBMISSIONS ON BEHALF OF THE RESPONDENT:",
       "The State opposes the bail as the offence is serious and the applicant may tamper with evidence.",
       "",
       "PRAYER:",
       "It is therefore prayed that the applicant be enlarged on bail under Section 483 BNSS pending trial.",
       ""])
BAIL_APPLICATION = BAIL_PREAMBLE

# (c) cause title is a BETWEEN: block past line 60 (no versus line anywhere)
BETWEEN_PLEADING = "\n".join(
    ["IN THE HIGH COURT OF JUDICATURE FOR RAJASTHAN AT JODHPUR",
     "CIVIL WRIT PETITION NO. 4321 OF 2026",
     "(Arising out of FIR No. 55/2026 and the first information report lodged therein)",
     ""]
    + [f"Index entry {i}: synopsis and list of dates filed along with the petition." for i in range(1, 66)]
    + ["",
       "BETWEEN:",
       "Mahesh Gupta S/o Ram Gupta, resident of Jaipur",
       "... PETITIONER",
       "AND",
       "State of Rajasthan through its Secretary, Home Department",
       "... RESPONDENT",
       "",
       "FACTS:",
       "1. The petitioner is a shopkeeper whose premises were sealed without notice.",
       "",
       "GROUNDS:",
       ] + [f"{i}. That the applicant relies on ground number {i} as set out in the accompanying memorandum of grounds." for i in range(1, 91)] + [
       "",
       "ARGUMENTS OF THE PETITIONER:",
       "The sealing violates Article 14 of the Constitution of India and natural justice.",
       "",
       "ARGUMENTS OF THE RESPONDENT:",
       "The sealing was effected under Section 133 of the Code of Criminal Procedure in public interest.",
       "",
       "PRAYER:",
       "Quash the sealing order dated 1st January 2026.",
       ""])

# (d) pleading quoting FIR boilerplate in its argument section (not at line starts)
HYBRID = "\n".join(
    ["IN THE HIGH COURT OF JUDICATURE FOR RAJASTHAN AT JODHPUR",
     "CRIMINAL MISC. PETITION NO. 999 OF 2026",
     "",
     "Anil Sharma",
     "... PETITIONER",
     "VERSUS",
     "State of Rajasthan",
     "... RESPONDENT",
     "",
     "FACTS:",
     "1. The petitioner seeks quashing of the proceedings.",
     "",
     "ARGUMENTS OF THE PETITIONER:",
     "The first information report reads: 'POLICE STATION: Kotwali. ACCUSED PERSONS: unknown. ACTS & SECTIONS: 420.' "
     "The FIR No. 12/2026 is vague and the substance of complaint discloses no offence.",
     "",
     "PRAYER:",
     "Quash FIR No. 12/2026.",
     ""])
