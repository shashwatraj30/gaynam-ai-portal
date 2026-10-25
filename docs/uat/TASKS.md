# Gyanam AI UAT: Task Cards

Sixty tasks: twelve each for Judge (`J-`), Law clerk (`C-`), Faculty and Student (`F-`), Administrator (`A-`) and Auditor (`U-`). Labels quoted below are the real English labels of the current UI (`frontend/app/js/i18n/`). Routes are hash routes under `/#/` (for example `http://localhost:8091/#/research`).

## 0. How to use this file

- **What the participant sees:** only the *Scenario* text, printed on one card per task. Nothing else on this page is shown to them.
- **What the facilitator and observer use:** *Start*, *Expected path*, *Success check*, *Target* (time-on-task target for the S7 criterion) and, for honesty tasks, the *Probe* and its *Correct reading*.
- **H = honesty task.** The probe is asked after the participant says "done". Score the answer `yes` / `partial` / `no` against the *Correct reading*, then ask for confidence from 1 to 5. A `no` with confidence 4 or 5 is over-trust (UAT plan §8, S8).
- **Cap:** 4 minutes per task. Outcomes: `success`, `assisted`, `fail`, `timeout`.
- **Fictional matters:** tasks that use matters rely on `seed_uat.py` (RUNBOOK §4). They are named UAT/WP/9101 to 9105/2026 and have fictional parties. Never open or discuss any other matter in the list; the runbook removes FIR-derived drafts from the UAT copy, but if you see one, move the participant on.
- **Seeded matters used:**

| Code | Case number | Title | Status at session start | Used by |
|---|---|---|---|---|
| M1 | UAT/WP/9101/2026 | Sunita Choudhary v. State of Rajasthan | In review. One section of garbled text; one cited authority not in the corpus | J-08, J-09, J-11, C-12 |
| M2 | UAT/WP/9102/2026 | Mohan Lal v. Union of India | In review. Clean | J-10 |
| M3 | UAT/WP/9103/2026 | Kavita Devi v. Director, Secondary Education | Approved by bench. Clean | J-12 |
| M4 | UAT/WP/9104/2026 | Dinesh Bishnoi v. State of Rajasthan | Draft. Cites (2008) 4 SCC 54, which the corpus records as overruled | J-02, J-07, C-08 |
| M5 | UAT/WP/9105/2026 | Ramesh Kumawat v. State of Rajasthan | Draft. Clean | C-09, C-10, C-11 |

- **Reference facts** (from the corpus): K. J. Bhat, (2008) 4 SCC 54, is recorded as overruled by Rangappa v. Sri Mohan, (2010) 11 SCC 441. ADM Jabalpur, (1976) 2 SCC 521, is recorded as overruled by Puttaswamy, (2017) 10 SCC 1. Those are the only two OVERRULED rows among 118,096; the others carry the default status, shown as "No adverse treatment recorded".

### Rotation (6 tasks per participant)

Every participant does the **Mandatory** tasks and one **Variable** set. Alternate the sets across participants of the same role (first participant set A, second set B, and so on).

| Role | Mandatory | Variable set A | Set B | Set C |
|---|---|---|---|---|
| Judge | J-03, J-10, J-11 | J-02, J-07, J-09 | J-04, J-05, J-08 | J-01, J-06, J-12 |
| Law clerk | C-04, C-05, C-10 | C-01, C-07, C-08 | C-02, C-03, C-06 | C-09, C-11, C-12 |
| Faculty / Student | F-03, F-05, F-07 | F-01, F-02, F-04 | F-06, F-08, F-09 | F-10, F-11, F-12 |
| Administrator | A-02, A-05, A-06 | A-01, A-03, A-04 (admin 1) | A-07, A-10, A-11 (admin 2) | A-08, A-09, A-12 (extras, if time) |
| Auditor | U-02, U-05, U-08 | U-01, U-03, U-04 (auditor 1) | U-06, U-09, U-11 (auditor 2) | U-07, U-10, U-12 (extras, if time) |

Order inside a session: put the easiest task first and the mandatory H task near the middle, so tiredness does not hide a misreading.

---

## 1. Judge (fixture: Hon'ble Mr. Justice R.K. Sharma, JUDICIAL_USER)

**J-01 Sign in and orient.**
- *Scenario:* "You have been asked to try a research and drafting portal for your chambers. Sign in as yourself and tell me what you think this first screen is for."
- *Start:* `#/signin` (reached by opening the site). *Expected path:* choose the Justice Sharma profile > "Continue as ..." > Home `#/`.
- *Success check:* Home shows a greeting with the name, an "Ask a question about the law" box and "Your matters". Participant says it is a research and matters start page.
- *Target:* 90 s.
- *Probe (H):* "How long does your sign-in last, and did you need a password?" *Correct reading:* the page says the session expires after 24 hours; no password is asked (demo single sign-on with fixture profiles).

**J-02 What needs my attention.**
- *Scenario:* "Before you sit, you want to know whether anything in your pending work needs your attention today. Find out."
- *Start:* `#/`. *Expected path:* Home > card "Needs your attention" > "Review the impact" > `#/alerts/...`.
- *Success check:* the card shows the most severe alert first (the seeded copy lists two alerts: the critical one on M4, and a warning on the older sealed draft of S.B. Civil Writ Petition No. 1092/2024). Participant names the authority (Krishna Janardhan Bhat, (2008) 4 SCC 54), that it was overruled by Rangappa v. Sri Mohan, and the affected matter (M4, UAT/WP/9104/2026).
- *Target:* 2 min.
- *Probe (H):* "Is this an alert that a court has changed the law this morning?" *Correct reading:* no. The alert comes from re-checking saved drafts against the corpus status; the page says it is not live court monitoring.

**J-03 Find an authority and read what the status means (H, mandatory).**
- *Scenario:* "You are considering a bail application in an economic offence. Find authorities on bail in economic offences and open one that looks useful."
- *Start:* `#/` or `#/research`. *Expected path:* type "bail in economic offences" > Search > result list > pick a card > "Open reader" or the card title > `#/judgments/:id`.
- *Success check:* the participant opens a judgment reader showing record details and the source PDF (or the "Open original" link).
- *Target:* 2 min 30 s.
- *Probe (H):* Point at the "No adverse treatment recorded" chip. "What does this mean to you? Would you cite this case in an order without checking anything else? What would you check?" *Correct reading:* the corpus has no recorded overruling or distinguishing. It is not a confirmation that the law is still good, and almost every judgment has it by default. `yes` = says it is not verification and names a further check (read the PDF, check later decisions). `partial` = says "probably good law, but I would check". `no` = "it is verified" or "good law".

**J-04 Find what has been overruled.**
- *Scenario:* "A colleague says some decisions in this database have been overruled. Find them and tell me which court overruled one of them."
- *Start:* `#/research`. *Expected path:* open Filters > Treatment = "Overruled" > Search (an empty question may need a general term such as "constitution") > open a card.
- *Success check:* participant opens K. J. Bhat or ADM Jabalpur and states the overruling judgment shown in red ("Overruled by ... Do not rely on it.").
- *Target:* 3 min.

**J-05 Reading a judgment (H).**
- *Scenario:* "Open any judgment from your search results. Tell me where you would read the actual judgment."
- *Start:* `#/research` after a search. *Expected path:* result > reader.
- *Success check:* participant points to the source PDF panel or "Open original".
- *Target:* 2 min.
- *Probe (H):* "There is no headnote or ratio on this page. Why do you think that is?" *Correct reading:* this is a metadata record; the judgment itself is the PDF; no headnote has been curated for it. `no` = "the software failed to extract it" is acceptable as `partial`; "there is no ratio in this case" is `no`.

**J-06 Carry authorities into a draft.**
- *Scenario:* "You want to give your clerk three authorities to start from. Collect two from a search you run on the NI Act, and send them toward a draft."
- *Start:* `#/research`. *Expected path:* search "presumption under Section 139 NI Act" > "Add to bench brief" on two cards > tray "Bench brief (2 of ...)" > "Use in draft".
- *Success check:* the tray shows two authorities and "Use in draft" leads to the drafting flow.
- *Target:* 3 min.

**J-07 Act on an alert.**
- *Scenario:* "You have learned that a draft relies on a decision that has since been overruled. Go to the draft and find the problem."
- *Start:* `#/alerts`. *Expected path:* select the alert > "Open in studio" > Studio for M4 with the alert banner > section marked "Overruled authority".
- *Success check:* participant is in the M4 studio, sees "Alert: ... was overruled by ..." and goes to the flagged section.
- *Target:* 2 min 30 s.

**J-08 Find a matter and its next step.**
- *Scenario:* "Find the matter titled Sunita Choudhary and tell me what is expected to happen next on it."
- *Start:* `#/matters`. *Expected path:* search "Sunita" or filter "In review" > open the matter.
- *Success check:* participant says it is waiting for bench review ("Awaiting bench review") and that it has one draft.
- *Target:* 2 min.

**J-09 Review a draft before signing (H).**
- *Scenario:* "Your clerk has sent you the draft in the Sunita Choudhary matter. Open it for review and tell me whether you would sign it as it stands, and why."
- *Start:* `#/matters` or `#/drafts`. *Expected path:* Matter > draft > Review and sign `#/drafts/:id/review`.
- *Success check:* participant finds the "Before you sign" checks, notices that a citation is not found in the corpus and that a section looks like unedited scan text, and decides not to sign yet.
- *Target:* 4 min.
- *Probe (H):* "Who wrote the text of this draft? Do the green checks mean the draft is correct?" *Correct reading:* the "Template draft" tag and the "Who wrote the text" check say it is a fixed template, not a model, and every section must be read. The checks cover only citations found, overruling, garbled text and empty sections; they do not replace reading.

**J-10 Approve a clean draft (H, mandatory).**
- *Scenario:* "The draft in the Mohan Lal matter has been reviewed by your clerk and you are satisfied with it. Approve it."
- *Start:* `#/matters`. *Expected path:* Matter M2 > Review and sign > "Approve" > confirm dialog "Approve this draft?".
- *Success check:* status becomes "Approved by bench"; toast "Draft approved."
- *Target:* 3 min.
- *Probe (H):* "Have you now signed this judgment? Is there a digital signature on it?" *Correct reading:* no. The dialog and the Signature row say it is an approval in Gyanam only and the digital signature is not connected. `no` = "yes, it is digitally signed".

**J-11 Return a draft to the clerk (mandatory).**
- *Scenario:* "You are not happy with the draft in the Sunita Choudhary matter. Send it back to your clerk so that it can be corrected."
- *Start:* `#/drafts`. *Expected path:* open M1 review > "Return to clerk" > confirm.
- *Success check:* toast "Returned to the clerk."; status "Returned to clerk"; participant can say the clerk can edit it again.
- *Target:* 2 min.

**J-12 Seal and export (H).**
- *Scenario:* "The draft in the Kavita Devi matter is approved. Make it final and get a Word copy for your records."
- *Start:* `#/matters`. *Expected path:* Matter M3 > Review and sign > "Seal as final" > confirm > DOCX downloads.
- *Success check:* status "Final, sealed"; DOCX downloaded; a SHA-256 value is shown.
- *Target:* 3 min.
- *Probe (H):* "What does that long SHA-256 code tell you?" *Correct reading:* a fingerprint of the exported file; if the file changes by one character the code changes. It does not say who signed it and it is not a digital signature.

---

## 2. Law clerk (fixture: Adv. Siddharth Mathur, RESEARCHER)

**C-01 Sign in; find your matters (H).**
- *Scenario:* "You start work for the day. Sign in and find the matters you are responsible for."
- *Start:* `#/signin`. *Expected path:* choose Adv. Siddharth Mathur > Home > "Your matters".
- *Success check:* participant finds the list of matters on Home.
- *Target:* 90 s.
- *Probe (H):* "Are these the matters assigned to you?" *Correct reading:* no. The page says matter assignment is not available yet, so all matters are shown.

**C-02 Ask a legal question from Home.**
- *Scenario:* "A bench asks you for authorities on how far a court may interfere with an arbitral award under Section 34. Start your research."
- *Start:* `#/`. *Expected path:* Ask box > "Ask" > Research with results.
- *Success check:* Research opens with the question prefilled and ranked authorities listed.
- *Target:* 90 s.

**C-03 Filter results (H).**
- *Scenario:* "From your results, narrow to the Supreme Court and decisions between 2010 and 2020."
- *Start:* `#/research` with results. *Expected path:* Filters > Court, Year from, Year to.
- *Success check:* the list shows only matching results; count line "Showing X of Y authorities".
- *Target:* 3 min.
- *Probe (H):* "Does this filter search all judgments in the database for that period?" *Correct reading:* no. Year and section filters apply to the results fetched, as the hint under the filters says.

**C-04 Check a citation (H, mandatory).**
- *Scenario:* "A senior advocate quotes (2010) 11 SCC 441 in a note. Check it with the portal, then check (2008) 4 SCC 54 as well."
- *Start:* `#/judgments/check`. *Expected path:* type the citation > "Check citation" > result; repeat.
- *Success check:* first citation found with no overruling recorded; second shown as "Recorded as overruled", overruled by Rangappa.
- *Target:* 3 min.
- *Probe (H):* For the first citation: "The portal says it is found. Is it now safe to put the quote in a draft? What has the portal not checked?" *Correct reading:* "Found in the corpus" means the judgment exists in the corpus. It does not check that the quoted words appear in the judgment or that the case supports the proposition: those rows say "Not checked yet". The note on the page says finding it is not a confirmation that the law is still good.

**C-05 Add a document that cannot be read (H, mandatory).**
- *Scenario:* "You have a scanned petition from the registry. Add it to start a new matter." Hand over `C:\gyanam-uat\files\unreadable_scan.png` (RUNBOOK §4).
- *Facilitator note:* the built-in sample is a police FIR transcript. Before the task say, "If anything on screen looks like real people's details, please do not read names aloud." Do not copy the sample text into notes.
- *Start:* `#/matters/new`. *Expected path:* Step 1 "Add documents" > choose file > reading screen > Step 2 "Check extracted details".
- *Success check:* participant notices the banner "Sample data — not read from your document", does not carry on as though the details were real, and either edits the fields or uses "Use as sample data" knowingly.
- *Target:* 3 min.
- *Probe (H):* "Where did the court name and case number on this screen come from?" *Correct reading:* they are a built-in sample, not read from the uploaded file. `no` = "from my document".

**C-06 Start a matter from a pleading.**
- *Scenario:* "Start a new matter from this petition." Hand over `sample_docs\sample_writ_petition.txt`.
- *Start:* `#/matters/new`. *Expected path:* choose file > review "Check what we read" > "Continue to confirm issues" > tick confirmation > "Confirm and open the drafting studio".
- *Success check:* Studio opens with the parameters filled from the petition (Dinesh Kumar Bishnoi, issues about Article 311(2)).
- *Target:* 4 min.

**C-07 Prepare a draft (H).**
- *Scenario:* "Now prepare the draft judgment from what you entered."
- *Start:* Studio from C-06, or `#/drafts` > M5. *Expected path:* "Prepare draft" > progress > 15 sections.
- *Success check:* 15 sections are filled and the banner is visible.
- *Target:* 2 min.
- *Probe (H):* "Who wrote this text? Could it go to the bench as it is?" *Correct reading:* nobody wrote it for this case: it is a fixed template filled with your inputs ("Template fallback"). It must be read and rewritten before review.

**C-08 Check the citations in a draft (H).**
- *Scenario:* "In the Dinesh Bishnoi matter, check the citations in the draft and fix any problem you find."
- *Start:* `#/drafts`. *Expected path:* M4 Studio > Claim check > "Check whole draft" > overruled citation > "Replace with overruling judgment" > Research prefilled.
- *Success check:* participant finds the overruled citation (K. J. Bhat) and reaches Research for the overruling judgment.
- *Target:* 4 min.
- *Probe (H):* "Under each citation it says '3 more checks: not checked yet'. What does that tell you?" *Correct reading:* only two checks are real today (found in corpus, overruled?). Quote match, support for the claim and larger-bench conflict have not been run, so they still need a human.

**C-09 Edit and save a section.**
- *Scenario:* "Open the Ramesh Kumawat draft, change the last line of the conclusion to say the matter is remitted for fresh consideration within 8 weeks, and make sure your change is saved."
- *Start:* `#/drafts`. *Expected path:* M5 Studio > section 14 "Conclusion and disposition" > edit > wait for "Saved" or press Save.
- *Success check:* status shows "Saved"; after reload the edit is still there.
- *Target:* 3 min.

**C-10 Send for review; find what you cannot do (mandatory).**
- *Scenario:* "Send the Ramesh Kumawat draft to the bench for approval. Then see whether you can approve it yourself."
- *Start:* Studio for M5. *Expected path:* "Send for review" > confirm > "Open review" > Approve control unavailable with "Your role cannot approve or seal drafts."
- *Success check:* status "In review"; participant states they cannot approve and that the judge can. No error screen.
- *Target:* 3 min.

**C-11 Get a copy out.**
- *Scenario:* "You need a Word copy of the Ramesh Kumawat draft for a colleague."
- *Start:* Review and sign for M5. *Expected path:* "Download DOCX" (or "Open print view").
- *Success check:* file downloads; toast "DOCX downloaded."
- *Target:* 90 s.

**C-12 Find matters waiting for the bench.**
- *Scenario:* "Show me every matter that is waiting for a judge's review."
- *Start:* `#/matters`. *Expected path:* filter "In review".
- *Success check:* list shows the Sunita Choudhary and Mohan Lal matters, and no others of the five fixtures.
- *Target:* 90 s.
- *Probe (H):* "What does 'Next action' tell you here?" *Correct reading:* it is taken from each matter's latest draft; matters are grouped from saved drafts by case number (the footnote says so).

---

## 3. Faculty and Student (fixtures: Dr. Aparna Sengupta, FACULTY; Ananya Rathore, STUDENT)

**F-01 Sign in; what you can and cannot see (H).**
- *Scenario:* "Sign in with your university profile. Tell me what you can do here."
- *Start:* `#/signin`. *Expected path:* choose profile > Home.
- *Success check:* participant sees the Ask box, recent research and "Citation lineages", and no Matters or Drafts in the menu.
- *Target:* 90 s.
- *Probe (H):* "Is there anything you expected to see that is missing? Why do you think that is?" *Correct reading:* matters and drafts are for judicial users and clerks; the role decides what is shown, and the server refuses the same actions.

**F-02 Ask a question for a moot memorial.**
- *Scenario:* "You are preparing a moot memorial on the basic structure doctrine. Find authorities."
- *Start:* `#/`. *Expected path:* Ask box > "Ask" > results.
- *Success check:* results list is shown and the participant opens one.
- *Target:* 2 min.

**F-03 Reading the status chip (H, mandatory).**
- *Scenario:* "Find a Supreme Court decision on Article 21 and tell me whether you could rely on it in your memorial."
- *Start:* `#/research`. *Expected path:* search "Article 21" > Court filter "Supreme Court" > open a card.
- *Success check:* participant opens a reader and gives a view on reliance.
- *Target:* 3 min.
- *Probe (H):* "The card says 'No adverse treatment recorded'. What would you tell your teammate about that case?" *Correct reading:* same as J-03: no overruling or distinguishing is recorded in this corpus; that is not verification, and the PDF and later case law must still be read.

**F-04 Overruled decisions.**
- *Scenario:* "Find the decisions that the database says have been overruled."
- *Start:* `#/research`. *Expected path:* Treatment filter "Overruled" > list.
- *Success check:* participant names ADM Jabalpur or K. J. Bhat and the overruling case.
- *Target:* 3 min.

**F-05 Check a citation (mandatory).**
- *Scenario:* "Your friend cites (1976) 2 SCC 521. Is it still good authority?"
- *Start:* `#/judgments/check`. *Expected path:* enter citation > "Check citation" > result "Recorded as overruled".
- *Success check:* participant says it is recorded as overruled by Puttaswamy (2017) and should not be relied on.
- *Target:* 2 min.

**F-06 A citation that is not found (H).**
- *Scenario:* "Check this citation from a textbook: (2015) 99 SCC 999."
- *Start:* `#/judgments/check`. *Expected path:* enter > "Not found in the corpus".
- *Success check:* participant reads the message and checks volume/page or searches instead ("Search for it instead").
- *Target:* 2 min.
- *Probe (H):* "Does 'not found' mean that case does not exist?" *Correct reading:* no. It means no match in this corpus; the citation may be wrong, or the case may not be in the corpus.

**F-07 Follow a lineage (H, mandatory).**
- *Scenario:* "You want to understand how the law on the Section 139 presumption developed. Use the portal to see how the cases relate."
- *Start:* `#/graph`. *Expected path:* Guided lineages > "Cheque bounce and the NI Act" > open graph for K. J. Bhat.
- *Success check:* participant sees the graph (or the list view) and reads that K. J. Bhat is overruled by Rangappa.
- *Target:* 4 min.
- *Probe (H):* Then ask them to open the graph of any other, ordinary judgment. "It says 'No citation links recorded yet'. Does that mean nobody has cited this judgment?" *Correct reading:* no. It means no links are recorded in the corpus ("not recorded", not "not cited").

**F-08 Use the list view of a graph.**
- *Scenario:* "A classmate who uses a screen reader cannot use the picture. Find another way to see the same information."
- *Start:* a graph page. *Expected path:* "List" tab.
- *Success check:* participant finds the list and says it names the same linked authorities ("Overruled by", "Cited by this judgment").
- *Target:* 90 s.

**F-09 Curated and uncurated records (H).**
- *Scenario:* "Open Rangappa v. Sri Mohan, then open any other ordinary judgment. What is different between the two pages?"
- *Start:* `#/research`. *Expected path:* search "Rangappa" > reader > second reader.
- *Success check:* participant notices the headnote or ratio tabs on one and the metadata note on the other.
- *Target:* 3 min.
- *Probe (H):* "Why does one have a ratio and the other doesn't?" *Correct reading:* only curated records (a small set of landmark cases) carry a headnote or ratio; for the rest the PDF is the judgment.

**F-10 Copy a citation.**
- *Scenario:* "Copy the citation of a judgment so you can paste it into your notes."
- *Start:* a reader. *Expected path:* "Copy citation".
- *Success check:* toast "Citation copied". Participant pastes it somewhere and it reads correctly.
- *Target:* 60 s.

**F-11 Read the library.**
- *Scenario:* "Find the document that explains how personal data is protected, and find the section on consent."
- *Start:* `#/library`. *Expected path:* "DPDP Act 2023 compliance" > contents rail "On this page".
- *Success check:* document opens and the participant jumps to a section from the contents rail.
- *Target:* 2 min.
- *Probe (H):* Ask them to open "Commercial proposal". "What happened, and why?" *Correct reading:* it is restricted to administrators ("Administrators only").

**F-12 Hindi and a page you cannot open (H).**
- *Scenario:* "Switch the portal to Hindi and open Research. Then type this address into the browser: `/#/matters`."
- *Start:* `#/settings`. *Expected path:* "Interface language" > Hindi > Research > address bar `#/matters` > "You do not have access to this page".
- *Success check:* labels switch to Hindi; the forbidden page is shown (in Hindi if language is set), with a way back.
- *Target:* 3 min.
- *Probe (H):* "Read me what this message says. What would you do next?" *Correct reading:* the role does not include the area; ask an administrator; use "Go to Home".

---

## 4. Administrator (fixture: Prof. (Dr.) Harishankar Pareek, ADMINISTRATOR)

**A-01 Corpus at a glance (H).**
- *Scenario:* "You are asked how many judgments the system holds and from which courts. Find the numbers."
- *Start:* `#/` (Administrator Home). *Expected path:* Corpus card > "Judgments in the corpus" and "Judgments by court".
- *Success check:* participant reads about 1,18,096 in total and names the largest court (Gujarat).
- *Target:* 90 s.
- *Probe (H):* "Does this mean 1,18,096 full judgments with headnotes are available?" *Correct reading:* no. These are mostly metadata records with the source PDF; headnotes exist only for a few curated cases.

**A-02 Last sync (H, mandatory).**
- *Scenario:* "Find out when the corpus was last updated from the courts."
- *Start:* `#/`. *Expected path:* "Corpus sync" card, or the top-bar "Corpus synced ..." text, or Audit trail > "Corpus sync".
- *Success check:* participant reads the last sync time and the recent sync runs.
- *Target:* 2 min.
- *Probe (H):* "Does this mean the courts are checked automatically every few minutes?" *Correct reading:* no. The time shown is the real last sync; syncing is run manually ("Sync now").

**A-03 Run a sync.**
- *Scenario:* "Update the corpus now."
- *Start:* any page. *Expected path:* top bar "Sync now" > "Syncing..." > "Sync finished" or "Sync failed".
- *Success check:* participant triggers it and reads the outcome. If the venue has no internet, "Sync failed" is an acceptable and honest result; check the participant understands the message.
- *Target:* 2 min (excluding server time up to 60 s).

**A-04 People and roles.**
- *Scenario:* "How many people have access to the portal, and which roles exist?"
- *Start:* `#/chamber`. *Expected path:* "Chamber and access" tiles and table.
- *Success check:* participant reads profiles, active and suspended counts, and the role list. Tries to change their own row and sees "You cannot change your own access".
- *Target:* 2 min 30 s.

**A-05 Suspend a user (H, mandatory).**
- *Scenario:* "A student, Ananya Rathore, has left the university. Remove her access."
- *Start:* `#/chamber`. *Expected path:* row Ananya Rathore > "Suspend" > confirm dialog "Suspend Ananya Rathore?" > "Suspended until restart".
- *Success check:* status chip changes; toast "... suspended until restart".
- *Target:* 2 min.
- *Probe (H):* "Is her access removed permanently? What happens if the server restarts?" *Correct reading:* no. The change lasts until the server restarts; the page says making it permanent is a backend item.

**A-06 Verify the audit chain (H, mandatory).**
- *Scenario:* "An auditor asks you to show that the activity record has not been altered. Show it."
- *Start:* `#/audit`. *Expected path:* "Chain integrity" > "Verify the chain" > "Chain intact".
- *Success check:* participant reads "Chain intact" with the number of entries verified and the latest hash.
- *Target:* 2 min.
- *Probe (H):* "What does 'Chain intact' prove, and what does it not prove?" *Correct reading:* no entry has been changed or removed from the ledger since it was written; it does not prove that every action was recorded (older entries show "user not recorded") or that the content of a draft is right.

**A-07 Filter the activity log.**
- *Scenario:* "Show me only the searches done in the last week."
- *Start:* `#/audit`. *Expected path:* Activity > Action = SEARCH_QUERY > From date > "Apply filters".
- *Success check:* filtered list with "n entries shown".
- *Target:* 3 min.

**A-08 Export the activity (extra).**
- *Scenario:* "Give the auditor a spreadsheet of the filtered activity."
- *Start:* `#/audit` with a filter applied. *Expected path:* "Export filtered view".
- *Success check:* CSV downloads and opens.
- *Target:* 90 s.

**A-09 Audit chain on Home (extra).**
- *Scenario:* "From the home page, find out if the audit chain is healthy."
- *Start:* `#/`. *Expected path:* "Audit chain" card > "Chain verified" > "Open audit trail".
- *Success check:* participant reads the card and opens the audit trail.
- *Target:* 60 s.

**A-10 Library for administrators.**
- *Scenario:* "Find the guide your IT team uses to deploy this system. Then open the commercial proposal."
- *Start:* `#/library`. *Expected path:* "Admin deployment guide"; "Commercial proposal".
- *Success check:* both documents open (the proposal is visible to administrators).
- *Target:* 2 min.

**A-11 A page that is not yours (H).**
- *Scenario:* "Try to open the drafting area: type `/#/drafts` into the address bar."
- *Start:* any page. *Expected path:* address bar.
- *Success check:* the "You do not have access to this page" screen with a way home.
- *Target:* 90 s.
- *Probe (H):* "Is it a fault that you cannot open it?" *Correct reading:* no. Administrators do not have drafting permission; the server refuses it too.

**A-12 Where is the AI key? (extra, H).**
- *Scenario:* "Your colleague asks where to enter an API key for the AI drafting engine. Find out."
- *Start:* `#/settings`. *Expected path:* "AI drafting key".
- *Success check:* participant reads that the key is set on the server by the administrator, and that the portal does not ask for it.
- *Target:* 90 s.
- *Probe (H):* "Where is the key stored and who can see it?" *Correct reading:* on the server, configured by the administrator; users never enter or see it.

---

## 5. Auditor (fixture: CA Rajeshwar Singhal, AUDITOR)

**U-01 Sign in; where you land.**
- *Scenario:* "Sign in as the auditor and tell me what this page lets you do."
- *Start:* `#/signin`. *Expected path:* profile > Audit trail `#/audit`.
- *Success check:* lands on Audit trail without navigating; names filtering, ledger, verification and export.
- *Target:* 90 s.

**U-02 Verify the ledger (mandatory).**
- *Scenario:* "Confirm whether the audit ledger is intact."
- *Start:* `#/audit`. *Expected path:* "Verify the chain".
- *Success check:* "Chain intact" with entries verified; participant can read the result aloud correctly.
- *Target:* 90 s.

**U-03 Read the ledger entries.**
- *Scenario:* "Find the most recent ledger entry and its hash."
- *Start:* `#/audit`. *Expected path:* tab "Ledger entries" > first row > "Entry hash".
- *Success check:* participant reads the entry id and hash.
- *Target:* 2 min.

**U-04 Filter by action.**
- *Scenario:* "List every time someone exported a draft to Word."
- *Start:* `#/audit`. *Expected path:* Activity > Action = EXPORT_DOCX > "Apply filters".
- *Success check:* filtered list (may be empty before other sessions have exported; then the empty state must be understood as "no rows").
- *Target:* 2 min 30 s.

**U-05 Who did it? (H, mandatory).**
- *Scenario:* "For a few older entries, tell me which user performed them."
- *Start:* `#/audit`. *Expected path:* Activity > scroll to older rows > column "User and role".
- *Success check:* participant finds "User not recorded" on older entries and reads the note on the page.
- *Target:* 3 min.
- *Probe (H):* "What does 'User not recorded' mean? Is it a hidden user or a fault in the ledger?" *Correct reading:* older entries were written before the portal recorded who acted. It is a known limit of those rows, not tampering and not a hidden user.

**U-06 Export the ledger activity.**
- *Scenario:* "Take a copy of the activity log for your working papers."
- *Start:* `#/audit`. *Expected path:* "Export CSV".
- *Success check:* CSV downloaded; participant opens it and finds the columns.
- *Target:* 90 s.

**U-07 Corpus sync history (extra).**
- *Scenario:* "When did the corpus last change, and how many judgments did each run add?"
- *Start:* `#/audit`. *Expected path:* tab "Corpus sync".
- *Success check:* participant reads times and "Added" counts.
- *Target:* 2 min.

**U-08 Trace an approval (mandatory).**
- *Scenario:* "A judge says he approved a draft this week. Find the record of any approval or status change."
- *Start:* `#/audit`. *Expected path:* Activity > Action = DRAFT_STATUS_UPDATED (or search "BENCH_APPROVED").
- *Success check:* participant finds an entry reading "Draft #n: IN_REVIEW -> BENCH_APPROVED by ..." and names the user and time. The seed script produced three such entries before the session.
- *Target:* 3 min.

**U-09 A page that is not yours (H).**
- *Scenario:* "Try to open the research page by typing `/#/research` in the address bar."
- *Start:* any page. *Expected path:* address bar.
- *Success check:* "You do not have access to this page" with a way back.
- *Target:* 90 s.
- *Probe (H):* "Is it right that an auditor cannot search judgments? Why?" *Correct reading:* yes: the auditor role is limited to audit and ledger permissions; separation of duties.

**U-10 Find the data-protection position (extra).**
- *Scenario:* "Find the document on the Digital Personal Data Protection Act and read how long records are kept."
- *Start:* `#/library`. *Expected path:* "DPDP Act 2023 compliance".
- *Success check:* document opens and participant locates the relevant paragraph or says it is not stated.
- *Target:* 3 min.

**U-11 Home ledger card (H).**
- *Scenario:* "Without going to the Audit page, find out whether the chain is verified."
- *Start:* `#/`. *Expected path:* Home > "Audit chain" card > "Verify again".
- *Success check:* participant reads "Chain verified" with block count.
- *Target:* 90 s.
- *Probe (H):* "If this said 'Chain broken', what would it tell you? What would it not tell you?" *Correct reading:* it would show tampering at a particular entry; it would not say who changed it or why.

**U-12 Hindi labels (extra).**
- *Scenario:* "Switch the portal to Hindi and tell me which words on the Audit page you do not understand."
- *Start:* `#/settings`. *Expected path:* "Interface language" > Hindi > Audit trail.
- *Success check:* participant lists unclear words; the observer logs each in the sheet's `issue_note` with the Hindi text.
- *Target:* 3 min.
