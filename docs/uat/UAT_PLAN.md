# Gyanam AI: User Acceptance Test (UAT) Plan

Version 1.0. Applies to the new portal UI served at `/app` (plan: `docs/UI_REDESIGN_PLAN.md`).
Kit contents: this plan, `TASKS.md`, `QUESTIONNAIRE.md`, `OBSERVATION_SHEET.csv`, `RESULTS_TEMPLATE.md`, `RUNBOOK.md`.

---

## 1. Why we are running UAT, and what it must tell us

We cannot run sessions with a real judge or law clerk ourselves, so this kit is written so that a facilitator (any member of the team, or an NLU Jodhpur coordinator) can run it without us in the room.

UAT answers four questions that automated tests (contract tests, Playwright, axe) cannot:

| # | Objective | Why it matters here |
|---|---|---|
| O1 | Can each role finish its real job unaided? | The Judge approves, the clerk drafts, faculty and students research, the admin runs the corpus, the auditor verifies the ledger. |
| O2 | Do users read the honesty features correctly? | Plan principle P9 ("no default shown as a finding"). 118,094 of 118,096 judgments carry the default status FOLLOWED, shown as "No adverse treatment recorded". A user who reads that as "good law, verified" is a product failure, not a user failure. |
| O3 | Do users trust citations the right amount? | Only two checks are real today: "Found in corpus" and "Overruled?". The other checks are shown as "Not checked yet". Over-trust and under-trust are both findings. |
| O4 | Is the interface clear in English and Hindi? | Chrome strings exist in both languages. Hindi labels are reviewed by a native speaker in P8. |

Plan §11 places UAT at four points. This kit is reused at each, with the task subset below.

| UAT | After phase | Screens in scope | Task subset (IDs in `TASKS.md`) | Sessions |
|---|---|---|---|---|
| UAT 1 | P2 Sign in and Home | `#/signin`, `#/` (every role Home) | J-01, J-02, C-01, C-02, F-01, F-02, A-01, A-02, U-01, U-02 | 1 per role (6), 20 min |
| UAT 2 | P3 Research, Judgment reader, Citation check | `#/research`, `#/judgments/:id`, `#/judgments/check` | J-03 to J-05, C-03 to C-05, F-03 to F-07, A-03 | Judge 2, clerk 3, faculty/student 4 |
| UAT 3 | P5 Drafts, Studio, Review and sign | `#/matters*`, `#/drafts*`, `#/drafts/:id/review`, `#/alerts` | J-06 to J-12, C-06 to C-12 | Judge 3, clerk 4 |
| UAT 4 | P8 Hardening, Hindi, cutover | Everything, in English and in Hindi, at 1440 and 1024 px | Full set per role, plus the Hindi block in `QUESTIONNAIRE.md` | Full sample in §2 |

UAT 4 sign-off is a stated exit criterion of P8. UAT 1 to 3 are formative: they feed fixes before the next phase and do not need every threshold in §8 to pass.

Out of scope: load, security and penetration testing; the accessibility conformance audit (axe and the manual audit run separately in P8); and any feature plan §8 lists as "backend roadmap" (answer synthesis, quote match, Raj eSign). Participants must not be told roadmap features exist. We test that the UI is honest about their absence.

---

## 2. Participants and roles

Each participant signs in with one **fixture account** chosen on the Sign in page (`#/signin`). These are the six institutional profiles in `backend/auth.py`; none is a real person's account.

| Test role | Fixture profile on Sign in | Server role | Lands on | Who we recruit | What they may do |
|---|---|---|---|---|---|
| Judge | Hon'ble Mr. Justice R.K. Sharma | JUDICIAL_USER | Home: Ask box, matters by next action, attention card | Sitting or retired High Court or district judge, or a senior judicial officer | Search, draft, **approve and seal** (FINALIZE_JUDGMENT), verify citations, view audit |
| Law clerk | Adv. Siddharth Mathur | RESEARCHER | Home: matters, recent research | Law clerk, research associate or junior advocate who drafts for a bench | Search, draft, verify, upload pleadings, export. **Cannot approve or seal.** |
| Faculty | Dr. Aparna Sengupta | FACULTY | Home: Ask box, recent research, guided lineages | NLU Jodhpur faculty | Search, verify citations, study lineages. No matters or drafts. |
| Student | Ananya Rathore | STUDENT | Same as Faculty | NLU Jodhpur students, LLB or LLM | Search, verify citations, study lineages. No matters or drafts. |
| Administrator | Prof. (Dr.) Harishankar Pareek | ADMINISTRATOR | Home: corpus card, sync history, users summary, audit chain | Registrar's office or IT administrator | Corpus sync, users (Chamber), audit, metrics. No drafting. |
| Auditor | CA Rajeshwar Singhal | AUDITOR | Audit trail | Compliance or DPDP auditor, internal audit staff | View audit, verify ledger, export logs. Nothing else. |

Faculty and Student share one task list (`F-` tasks) because their screens are identical. Record which fixture was used in the observation sheet.

### Study roles (people in the room)

| Study role | Count | Duties |
|---|---|---|
| Facilitator | 1 | Greets, reads the script (§6), hands out task cards, keeps time. The only person who speaks to the participant. |
| Observer | 1 | Silent. Fills `OBSERVATION_SHEET.csv`, times tasks, notes quotes. Never helps. |
| Technical support | 1 (may be the observer) | Resets the environment between sessions (`RUNBOOK.md` §6). Steps in only for a server fault, never for a usability problem. |

### Sample sizes

Formative work (UAT 1 to 3) uses the usual small-n rule: five users per role find most usability problems. Summative sign-off (UAT 4) needs enough people to put a number on task completion and SUS, which we accept will be coarse.

| Role | UAT 4 target | Minimum acceptable | Notes |
|---|---|---|---|
| Judge | 5 | 3 | Hard to recruit. If only 3 are available, add 2 retired judges and mark them in the sheet. |
| Law clerk | 6 | 5 | Include at least 2 who prefer Hindi. |
| Faculty | 3 | 2 | |
| Student | 5 | 4 | At least 2 should do the Hindi block. |
| Administrator | 2 | 2 | |
| Auditor | 2 | 2 | |
| **Total** | **23** | **18** | About 17 hours of sessions plus set-up. |

With n this small, report counts ("4 of 5 completed") and never claim statistical significance.

---

## 3. Environment

The aim: realistic data, zero risk to the real database, identical start state for every participant. Commands are in `RUNBOOK.md`.

1. **Copy of the DB, never the original.** `GYANAM_DB_PATH` points to a working copy (for example `C:\gyanam-uat\work\vidhi_legal.db`) and `GYANAM_UPLOAD_DIR` to an empty folder. A pristine master copy is kept read-only. Before each session the working copy is overwritten from the master (about 345 MB, a few seconds).
2. **Fixture accounts via the Sign in page.** Participants choose a profile on `#/signin`. No passwords exist or are entered. Sign-in is the demo SSO (`/api/auth/sso/nluj`) with server-side permission checks (plan D3, B1). `GYANAM_ENFORCE_AUTH` stays at its default of `1`, so the 403 paths are real.
3. **Secrets.** `GYANAM_JWT_SECRET` comes from the project `.env`. The Gemini key is **not** set for UAT, so the engine is "Template fallback": repeatable, no network, about 0.6 s. If the sponsor wants a model-drafting block, run it separately, label it in the sheet, and expect different output every time.
4. **Seeded state to verify before the first session** (checklist in `RUNBOOK.md` §5): about 118,096 judgments; 52 drafts (48 DRAFT, 2 BENCH_APPROVED, 2 FINAL_SEALED); at least one alert for an overruled authority in a saved draft; a ledger that verifies; the two OVERRULED judgments present. Tasks that depend on a specific record say so. If a record is missing, use the substitute given in the task and note it.
5. **Documents for intake tasks.** Only `sample_docs/sample_writ_petition.txt` (a fictional writ petition, Dinesh Kumar Bishnoi v. State of Rajasthan) and text typed by the facilitator on the day. The FIR images in `sample_docs/` were not authored for this kit and must not be used in UAT unless their owner confirms they are synthetic. The "canned sample" path (task C-05) is triggered with a deliberately unreadable file that the runbook creates.
6. **Hardware.** Windows laptop, Chrome or Edge from the last two years (assumption D9), 1920x1080 at 100% zoom, plus one session block at 1024 px width. Phones are out of scope (Studio is read-only on phones, D12).
7. **Network.** Source PDFs load from AWS Open Data S3 and sci.gov.in. Test the venue's Wi-Fi first (RUNBOOK §5). If the venue blocks them, the reader shows "Open original"; record it and do not coach.

---

## 4. Consent and data handling

### 4.1 No real case data (strict rule)

- Participants **must not** type, paste, upload or say aloud any real case number, party name, litigant detail or privileged information. The facilitator says this twice: at consent and again before the drafting tasks.
- All matters in the DB copy are corpus records (public judgments) or fixture drafts.
- If a participant enters real data by mistake, technical support stops the recording, deletes the session DB at once (RUNBOOK §6), cuts that segment from the recording, and logs the incident in `RESULTS_TEMPLATE.md` §9.

### 4.2 DPDP Act 2023 position

| Item | Position |
|---|---|
| Data collected | Name or code, role, institution, years of experience, language preference, questionnaire answers, task times, observer notes, and screen and audio recording if consented. |
| Lawful basis | Free, specific, informed, unambiguous consent (written, §4.3). Participation is voluntary. Refusal has no consequence for a judge, clerk or student. |
| Purpose | Improving the Gyanam AI portal and deciding whether it is ready for cutover. Nothing else. |
| Minimisation | Analysis uses participant codes (`J01`, `C03`, ...). The key linking code to name is held by one person (the UAT lead) in a separate file. |
| Storage | Encrypted disk or a restricted folder. No recordings by email. |
| Retention | Raw recordings deleted within 30 days of the sign-off report. Anonymised sheets and results stay with the project. |
| Rights | A participant may withdraw at any time, including after the session, and ask for deletion of their recording and sheet by quoting their code. |
| Contact | The UAT lead, named on the consent form at scheduling time. |
| Minors | None. Participants are adults. |

Judges and clerks may be uncomfortable being recorded. Offer **notes only** as an equal alternative and never ask anyone to justify declining.

### 4.3 Consent form (read out and signed)

> I am taking part in a usability test of the Gyanam AI portal. I understand that the test checks the software, not me. I will use only fictional or public information and will not enter real case details. I agree that my screen and voice may be recorded (tick yes or no; the session goes ahead either way). I understand that I may stop at any time without giving a reason, and that I may ask for my data to be deleted by quoting my participant code. My answers will be reported under a code and not under my name.
>
> Name: ______ Participant code (given by facilitator): ______ Signature: ______ Date: ______

A judge may prefer verbal consent. That is acceptable if the observer notes the time and the judge's confirmation.

---

## 5. Session protocol (45 minutes)

| Min | Block | Detail |
|---|---|---|
| 0 to 5 | Welcome and consent | Script §6.1. Consent form. Recording starts only after consent. |
| 5 to 8 | Background | Four questions: role and years of experience; tools used today for case-law research; comfort with English and Hindi legal text; whether they have used an AI legal tool. Observer fills the header columns. |
| 8 to 13 | Free exploration (5 min) | Participant signs in with their fixture profile and explores Home. "Tell me what you think this screen is for." No tasks yet. Captures first impressions. |
| 13 to 36 | Task block (23 min) | Facilitator gives **six tasks** from the participant's role list, one printed card at a time. Each task is capped at 4 minutes. At the cap: "Let's move on", and the observer marks *timeout*. At least two of the six must be honesty-probe tasks (marked **H** in `TASKS.md`). |
| 36 to 41 | Questionnaire | SUS plus the custom questions (`QUESTIONNAIRE.md`). Filled by the participant alone. |
| 41 to 45 | Debrief | Script §6.3. Thank the participant. |

**Task assignment.** Each role has 12 tasks. A participant gets 6, chosen by the rotation table in `TASKS.md` §0, so that every task is attempted by at least half the participants of that role over a UAT 4 round. The H tasks are always included.

**Think-aloud.** Ask for it from the first task. After 20 seconds of silence say only "What are you thinking now?". Do not ask leading questions.

**Hindi block (optional, 8 minutes, replaces tasks 5 and 6).** Participants who read Hindi switch language in Settings (`#/settings`, "Interface language") or with the "Language" control in the top bar, repeat two tasks they have already done, then answer Part D of the questionnaire.

---

## 6. Facilitator and observer scripts

### 6.1 Opening (read aloud)

> "Thank you for coming. I'm [name]. This is [observer], who will take notes and will not speak. We are testing a research and drafting portal, not you. There are no wrong answers. If something is confusing, that is a fault in the software, and it is exactly what we need to hear.
> Everything you see uses public judgments and fictional matters. Please do not use any real case, party name or confidential information, even as an example.
> I will give you one task at a time on a card. Please think aloud: say what you are looking at, what you expect and what surprises you. I may not answer questions about how to do the task, because I want to see what you would do alone. If you are stuck for about four minutes, I will move us on. That is not a failure.
> You can stop at any time. May I start the recording?"

### 6.2 During tasks (facilitator rules)

1. Read the scenario exactly as written on the card. Do not paraphrase.
2. Never name a button, menu or page. If asked "where do I click?", answer "What would you try?"
3. Neutral prompts only: "What are you thinking?", "What did you expect to happen?", "Is that what you were looking for?"
4. After each task ask for the **one-line rating**: "From 1 (very hard) to 5 (very easy), how easy was that?"
5. For an honesty probe, ask the probe question **after** the participant says they are done, then ask for confidence from 1 to 5 in their own answer. Never say whether the answer is right.
6. If the participant asks "is this right?", say "What would make you confident?"
7. Hint policy: no hints. If the participant has made no progress for 90 seconds, give one **Level 1 nudge** ("Take a look at the menu on the left."). The attempt is recorded as *assisted*. A second nudge ends the task as *fail*.

### 6.3 Closing questions

1. "What was the most confusing moment?"
2. "Was there any screen where you did not believe what it told you? Which, and why?"
3. "What would you need to see before you would rely on this for real work?"
4. "Was anything missing that you expected to find?"

### 6.4 Observer script

The observer never speaks to the participant. For every task, fill one row of `OBSERVATION_SHEET.csv`:

| Column | How to fill |
|---|---|
| `start_time`, `end_time` | Clock time (`HH:MM:SS`) when the facilitator finishes reading the card, and when the participant says "done" or the cap is reached. |
| `time_on_task_sec` | End minus start, in seconds. |
| `outcome` | `success` (success check in `TASKS.md` met, no nudge), `assisted` (met after one nudge), `fail` (wrong end state, gave up, or second nudge needed), `timeout` (4 minutes). |
| `errors` | Count of wrong clicks that left the intended path, wrong pages entered, or actions the participant had to undo. |
| `path_taken` | Routes visited, separated by `>`, for example `#/ > #/research > #/judgments/12`. |
| `ease_1to5` | The participant's rating after the task. |
| `honesty_answer` | For H tasks, a verbatim quote of the participant's reading. |
| `honesty_correct` | `yes`, `partial` or `no`, scored against the "Correct reading" of that probe in `TASKS.md`. |
| `confidence_1to5` | Participant's confidence in their honesty answer. A `no` with confidence 4 or 5 is **over-trust**. |
| `severity` | Highest severity (§9) of an issue seen in this task. Leave empty if none. |
| `issue_note` | One sentence: what happened and where (route, element label). |
| `quote` | Verbatim participant words worth keeping. |

Also note any moment the participant sighs, laughs, reads aloud or says "oh". Write the recording timestamp in `issue_note` so the moment can be found later.

---

## 7. What we measure

| Measure | Definition | Source |
|---|---|---|
| Task completion | `success` divided by attempts. Reported unassisted, and assisted-weighted (an `assisted` counts as half). | Observation sheet |
| Time on task | Median `time_on_task_sec` of successful attempts per task, against the target in `TASKS.md`. | Observation sheet |
| Errors | Mean `errors` per attempt. | Observation sheet |
| Ease | Mean `ease_1to5`. | Observation sheet |
| Honesty comprehension | Share of H-task answers scored `yes`. Over-trust count: answers scored `no` with confidence 4 or 5. | Observation sheet |
| SUS | Standard 10-item System Usability Scale, 0 to 100 per participant; mean per role and overall. | `QUESTIONNAIRE.md` Part A |
| Citation trust | Part B; calibration judged against what the system really checks. | Part B |
| Status clarity | Part C; participants explain each status in their own words, scored against the glossary. | Part C |
| Hindi clarity | Part D, for participants who do the Hindi block. | Part D |

---

## 8. Success criteria (UAT 4 sign-off)

All of the following must hold for P8 sign-off. Each is computed per §7 and reported in `RESULTS_TEMPLATE.md`.

| # | Criterion | Threshold |
|---|---|---|
| S1 | Critical issues open | **0** (severity 4, §9). |
| S2 | Major issues open (severity 3) | **0 in the three core journeys** (research and verify; draft to sign; audit verify). At most 3 elsewhere, each with an owner and a fix date. |
| S3 | Overall SUS (mean, all participants) | **at least 80** (the "excellent" band on the standard adjective scale; 68 is merely average). |
| S4 | SUS per role (mean) | **at least 75** for every role with n of 2 or more. No role below 68. |
| S5 | Task completion, unassisted | **at least 90%** overall and **at least 80%** for each individual task that has 3 or more attempts. |
| S6 | Task completion, including assisted | **at least 95%** overall. |
| S7 | Time on task | Median of successful attempts **at or under the task's target time** for at least 85% of tasks. No task median above 1.5 times target. |
| S8 | Honesty comprehension | **At least 85%** of H-task answers scored `yes`. **Over-trust count of 0** on the three hard probes: "No adverse treatment recorded" (tasks J-03 and F-03), "Found in corpus" (task C-04), and the sample-data banner (task C-05). |
| S9 | Judge approval journey | Every judge completes J-10 (approve) and J-11 (return to clerk) without assistance. Every clerk correctly finds that Approve is unavailable to their role (C-10) with no error. |
| S10 | Hindi | Every Hindi label tested is understood by **at least 80%** of the participants who saw it, and none is judged misleading. Items below that go to the translator. |
| S11 | Data safety | No real case data entered (§4.1) and no unresolved incident in the log. |
| S12 | Stability | No HTTP 5xx visible to a participant in more than 2% of tasks, counted from the server log (`RUNBOOK` §7). |

If any of S1, S2, S8, S9 or S11 fails, P8 is **not signed**, whatever the other results. If only S3 to S7 miss narrowly (within 5 SUS points or 5 percentage points), the sponsor may sign with a written waiver and a re-test of the failing role within two weeks.

For UAT 1 to 3 (formative) the gate is softer: no severity-4 issue open, and an owner for every severity-3 issue, before the next phase starts.

---

## 9. Severity scale

| Level | Name | Definition | Examples from this app | Action |
|---|---|---|---|---|
| 4 | Critical | The user cannot complete the task, **or** the screen leads to a wrong legal or compliance decision, **or** data is lost or exposed. | A judge reads "No adverse treatment recorded" as "verified good law" and relies on an overruled case. A role without FINALIZE_JUDGMENT can approve. A draft is overwritten without warning. Real data is stored unredacted. | Stop-ship. Fix in the current phase. Re-test with a new participant. |
| 3 | Major | The task is done only after a nudge, a long delay (over 1.5 times target) or a workaround; or a status is misread but would probably be caught elsewhere. | Cannot find "Return to clerk". "Not checked yet" read as "passed". A Hindi label means something different. | Fix before sign-off. |
| 2 | Moderate | Noticeable friction or confusion; the task is still done unassisted and on time. | Unclear filter labels, extra clicks, ambiguous toast text. | Fix in the next phase or P8 polish. |
| 1 | Minor | Cosmetic or preference. | Alignment, wording preference, icon taste. | Polish list. |

Rules:
- Score by **consequence**, not by how many people hit it. One judge over-trusting a status is severity 4 even if four others read it correctly.
- An issue seen by two or more participants is raised one level in the backlog (maximum 4); the original level is kept in a note.
- When unsure between two levels, take the higher and let triage lower it.

---

## 10. How results feed the backlog

1. **Same day.** The observer completes the sheet. The facilitator writes a five-line session note within two hours: what went well, top three problems, quote of the day, any incident, environment faults.
2. **Within two working days of a round's last session.** The UAT lead merges the sheets into `RESULTS_TEMPLATE.md`, computes the measures (§7), tests the criteria (§8) and lists issues in the issue log with IDs `UAT<round>-NN` (for example `UAT4-07`).
3. **Triage meeting (45 min).** Attendees: UAT lead, frontend lead, backend lead, designer, product owner. For each issue: confirm severity, classify the cause (copy, layout, flow, missing state, backend data, training) and assign an owner. Honesty issues (anything under O2 or O3) always involve the designer and are checked against plan §8.
4. **Backlog entry.** Each accepted issue becomes a ticket with: the UAT ID, severity, route, screenshot or recording timestamp, participant code (never the name), the plan reference (principle P1 to P10, a §8 row, or a phase), and the acceptance test that will prove the fix.
5. **Routing rules.**
   - Copy and label problems, including Hindi, go to the design backlog §13.2 "copy corrections"; Hindi items also go to the native-speaker review.
   - No status wording is changed without checking plan §8 and principle P9.
   - Severity 4 and 3 go into the current phase, 2 into the next, 1 into a standing polish list.
   - A fix that touches a user flow adds or updates a Playwright journey test so the issue cannot return.
6. **Re-test.** Severity 4 and 3 fixes are re-tested with at least one **new** participant of the same role before the issue closes. The result is recorded against the same issue ID.
7. **Close-out.** `RESULTS_TEMPLATE.md` is signed by the UAT lead, the product owner and the NLU Jodhpur sponsor, and stored next to the P8 release notes. The release notes cite its issue IDs.
8. **Expectation gaps.** Requests for roadmap features (answer synthesis, quote match, live overruling detection, Raj eSign) are logged separately as "expectation gaps". They do not block sign-off, but a large number is reported to the sponsor, because it shows how the deck's promises have landed.
