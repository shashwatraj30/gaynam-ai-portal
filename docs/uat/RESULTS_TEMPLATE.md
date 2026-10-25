# Gyanam AI UAT: Results Report

Copy this file to `docs/uat/results/UAT<round>_<yyyy-mm-dd>.md` and fill every field. Use participant codes only (never names). Where a field has a fixed set of answers they are given in brackets; delete the brackets when you fill it in.

Data come from `OBSERVATION_SHEET.csv` (one row per participant per task, merged across sessions) and `QUESTIONNAIRE.md`. Section 3 gives the spreadsheet formulas, so numbers are reproducible.

---

## 1. Header

| Field | Value |
|---|---|
| UAT round | [UAT 1 after P2 / UAT 2 after P3 / UAT 3 after P5 / UAT 4 after P8] |
| Dates of sessions | from ____ to ____ |
| Build tested | git commit hash ____ and `GYANAM_UI` value ____ |
| DB copy | file name ____ and SHA-256 ____ (from RUNBOOK §3) |
| AI engine | [Template fallback only / model block also run: ____] |
| Venue and network | ____ |
| Browsers and screens | ____ |
| UAT lead | ____ |
| Facilitators and observers | ____ |

## 2. Participants

| Code | Role | Fixture profile | Years in role | Language | Recorded? | Tasks done | Notes |
|---|---|---|---|---|---|---|---|
| J01 | Judge | | | | | | |
| J02 | Judge | | | | | | |
| J03 | Judge | | | | | | |
| C01 | Law clerk | | | | | | |
| F01 | Faculty | | | | | | |
| S01 | Student | | | | | | |
| A01 | Administrator | | | | | | |
| U01 | Auditor | | | | | | |

Add one row per participant. Achieved against target (UAT plan §2): Judge ___/5, Law clerk ___/6, Faculty ___/3, Student ___/5, Administrator ___/2, Auditor ___/2, total ___/23 (minimum 18).

## 3. How the numbers are computed

Load the sheet into a spreadsheet (columns A to AB as in the CSV header). With the data in rows 2 to N:

| Measure | Formula (task ID in cell `$I`, outcome in `$N`, time in `$M`) |
|---|---|
| Attempts for task T | `=COUNTIF(I:I,"J-03")` |
| Unassisted completion for task T | `=COUNTIFS(I:I,"J-03",N:N,"success")/COUNTIF(I:I,"J-03")` |
| Completion including assisted | `=(COUNTIFS(I:I,"J-03",N:N,"success")+COUNTIFS(I:I,"J-03",N:N,"assisted"))/COUNTIF(I:I,"J-03")` |
| Median time of successes for task T | `=MEDIAN(IF((I2:I500="J-03")*(N2:N500="success"),M2:M500))` (array formula: Ctrl+Shift+Enter) |
| Honesty comprehension | `=COUNTIFS(T:T,"yes")/(COUNTIFS(T:T,"yes")+COUNTIFS(T:T,"partial")+COUNTIFS(T:T,"no"))` |
| Over-trust count | `=COUNTIFS(V:V,"yes")` where column V (`over_trust`) is `yes` when `honesty_correct` = `no` and `confidence_1to5` is 4 or 5. |

SUS per participant, with the ten answers in cells B2:K2 (item 1 in B2 ... item 10 in K2):

`=2.5*((B2-1)+(5-C2)+(D2-1)+(5-E2)+(F2-1)+(5-G2)+(H2-1)+(5-I2)+(J2-1)+(5-K2))`

## 4. Headline results against success criteria (UAT plan §8)

| # | Criterion | Threshold | Result | Pass? |
|---|---|---|---|---|
| S1 | Critical issues open | 0 | | [Y/N] |
| S2 | Major issues open | 0 in core journeys; at most 3 elsewhere | | [Y/N] |
| S3 | Overall SUS mean | at least 80 | | [Y/N] |
| S4 | SUS per role | at least 75 each (none below 68) | J __ C __ F __ S __ A __ U __ | [Y/N] |
| S5 | Unassisted completion | at least 90% overall; at least 80% per task | overall __%; lowest task __ at __% | [Y/N] |
| S6 | Completion incl. assisted | at least 95% | | [Y/N] |
| S7 | Time on task | median at or under target for at least 85% of tasks; none above 1.5x | __ of __ tasks within target; worst: __ | [Y/N] |
| S8 | Honesty comprehension | at least 85% `yes`; over-trust 0 on hard probes | __%; over-trust: No adverse treatment __, Found in corpus __, Sample banner __ | [Y/N] |
| S9 | Approval journey | every judge completes J-10 and J-11 unassisted; every clerk finds Approve unavailable (C-10) | judges __/__; clerks __/__ | [Y/N] |
| S10 | Hindi | each label understood by at least 80%; none misleading | labels failing: __ | [Y/N] |
| S11 | Data safety | no real data entered; no open incident | | [Y/N] |
| S12 | Stability | HTTP 5xx visible in at most 2% of tasks | __% | [Y/N] |

**Decision:** [Sign / Sign with waiver / Do not sign]. Reasons in two sentences: ____

## 5. Task-level results

One row per task that was attempted at least once. Targets are in `TASKS.md`.

| Task | Attempts | Success | Assisted | Fail | Timeout | Unassisted % | Median time (s) | Target (s) | Mean errors | Mean ease | Highest severity |
|---|---|---|---|---|---|---|---|---|---|---|---|
| J-01 | | | | | | | | 90 | | | |
| J-02 | | | | | | | | 120 | | | |
| J-03 | | | | | | | | 150 | | | |
| J-04 | | | | | | | | 180 | | | |
| J-05 | | | | | | | | 120 | | | |
| J-06 | | | | | | | | 180 | | | |
| J-07 | | | | | | | | 150 | | | |
| J-08 | | | | | | | | 120 | | | |
| J-09 | | | | | | | | 240 | | | |
| J-10 | | | | | | | | 180 | | | |
| J-11 | | | | | | | | 120 | | | |
| J-12 | | | | | | | | 180 | | | |
| C-01 | | | | | | | | 90 | | | |
| C-02 | | | | | | | | 90 | | | |
| C-03 | | | | | | | | 180 | | | |
| C-04 | | | | | | | | 180 | | | |
| C-05 | | | | | | | | 180 | | | |
| C-06 | | | | | | | | 240 | | | |
| C-07 | | | | | | | | 120 | | | |
| C-08 | | | | | | | | 240 | | | |
| C-09 | | | | | | | | 180 | | | |
| C-10 | | | | | | | | 180 | | | |
| C-11 | | | | | | | | 90 | | | |
| C-12 | | | | | | | | 90 | | | |
| F-01 | | | | | | | | 90 | | | |
| F-02 | | | | | | | | 120 | | | |
| F-03 | | | | | | | | 180 | | | |
| F-04 | | | | | | | | 180 | | | |
| F-05 | | | | | | | | 120 | | | |
| F-06 | | | | | | | | 120 | | | |
| F-07 | | | | | | | | 240 | | | |
| F-08 | | | | | | | | 90 | | | |
| F-09 | | | | | | | | 180 | | | |
| F-10 | | | | | | | | 60 | | | |
| F-11 | | | | | | | | 120 | | | |
| F-12 | | | | | | | | 180 | | | |
| A-01 to A-12 | (one row each, targets from `TASKS.md`) | | | | | | | | | | |
| U-01 to U-12 | (one row each, targets from `TASKS.md`) | | | | | | | | | | |

## 6. Honesty probes

| Probe | Task | Asked | `yes` | `partial` | `no` | Over-trust (wrong, confidence 4 or 5) | Representative wrong reading (verbatim) |
|---|---|---|---|---|---|---|---|
| No adverse treatment recorded | J-03, F-03 | | | | | | |
| Found in corpus | C-04 | | | | | | |
| Sample data banner | C-05 | | | | | | |
| Template draft / who wrote it | J-09, C-07 | | | | | | |
| Not checked yet (3 more checks) | C-08 | | | | | | |
| Approve is not a digital signature | J-10 | | | | | | |
| SHA-256 meaning | J-12 | | | | | | |
| Alert is not live monitoring | J-02 | | | | | | |
| Matters not assigned to me | C-01 | | | | | | |
| Filters apply to fetched results only | C-03 | | | | | | |
| Overruled lists / treatment filter | J-04, F-04 | | | | | | |
| No citation links recorded | F-07 | | | | | | |
| Curated versus metadata record | J-05, F-09 | | | | | | |
| Sync is manual | A-02 | | | | | | |
| Suspension until restart | A-05 | | | | | | |
| Chain intact: what it proves | A-06 | | | | | | |
| User not recorded | U-05 | | | | | | |

Questionnaire Part B calibration (well-calibrated answers on B1, B2, B5): ___%. Part C mean score per label: list the lowest three here: ____

## 7. SUS

| Code | Role | SUS (0 to 100) |
|---|---|---|
| J01 | Judge | |

Per role: Judge __ (n=__), Law clerk __ (n=__), Faculty __ (n=__), Student __ (n=__), Administrator __ (n=__), Auditor __ (n=__). Overall: __ (n=__). Lowest individual: __ (code __).

## 8. Hindi (Part D)

| Label | Understood % | Called misleading by | Action |
|---|---|---|---|
| D1 कोई प्रतिकूल उपचार दर्ज नहीं | | | |
| D2 अधिक्रमित (ओवररूल्ड) | | | |
| D3 पलटा गया | | | |

Add all 16 rows from Part D. Note whether participants treat D2 and D3 as the same word.

## 9. Incidents and data safety

| # | Date | Session | What happened | Real data involved? | Action taken | Closed by |
|---|---|---|---|---|---|---|
| 1 | | | | | | |

If none: write "No incidents."

## 10. Issue log

ID format `UAT<round>-NN`. Severity from UAT plan §9. Cause: copy, layout, flow, missing state, backend data, training, environment. Plan ref: principle P1 to P10, a §8 row, or the phase.

| ID | Severity | Route and element | Task | Participants (codes) | What happened | Cause | Plan ref | Owner | Target phase or date | Ticket | Re-test (participant code, result) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT4-01 | | | | | | | | | | | |

Issues seen by 2 or more participants: raise one level here, and record the original level in "What happened".

## 11. Expectation gaps (not blockers)

| Requested feature | Participants | Plan §8 row | Note for the sponsor |
|---|---|---|---|
| | | | |

## 12. What worked well

Three to five bullets, each with a participant quote and code.

## 13. Recommendations

1. ____
2. ____
3. ____

## 14. Sign-off

| Name | Role | Decision | Signature | Date |
|---|---|---|---|---|
| | UAT lead | [Sign / Sign with waiver / Do not sign] | | |
| | Product owner | | | |
| | NLU Jodhpur sponsor | | | |

Waiver (only if the decision is "Sign with waiver"): criteria waived ____; written re-test date ____; accepted by ____.
