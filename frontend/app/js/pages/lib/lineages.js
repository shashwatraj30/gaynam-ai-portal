// Guided lineages: reading paths (from the legacy "switchLineageStream" data).
// `id` is judgments.id in the corpus, or null when the case is not in the corpus (then shown, never linked).
// Only the OVERRULED flags below are recorded in the corpus; nothing else is presented as a finding (P9).
export const LINEAGES = [
  { key: 'privacy', nodes: [
    { year: 1976, title: 'ADM Jabalpur v. Shivkant Shukla', citation: '(1976) 2 SCC 521', id: 8, overruled: true },
    { year: 1978, title: 'Maneka Gandhi v. Union of India', citation: '(1978) 1 SCC 248', id: null },
    { year: 2017, title: 'Justice K.S. Puttaswamy (Retd.) v. Union of India', citation: '(2017) 10 SCC 1', id: 7 },
  ] },
  { key: 'cheque', nodes: [
    { year: 2008, title: 'Krishna Janardhan Bhat v. Dattatraya G. Hegde', citation: '(2008) 4 SCC 54', id: 4, overruled: true },
    { year: 2010, title: 'Rangappa v. Sri Mohan', citation: '(2010) 11 SCC 441', id: 3 },
    { year: 2019, title: 'Bir Singh v. Mukesh Kumar', citation: '(2019) 4 SCC 197', id: null },
  ] },
  { key: 'natural', nodes: [
    { year: 1993, title: 'Managing Director, ECIL v. B. Karunakar', citation: '(1993) 4 SCC 727', id: 1 },
    { year: 2022, title: 'Rameshwar Lal Sharma v. State of Rajasthan & Ors.', citation: '2022 (2) RLW (Raj.) 1104', id: 5 },
  ] },
  { key: 'arbitration', nodes: [
    { year: 2015, title: 'Associate Builders v. Delhi Development Authority', citation: '(2015) 3 SCC 49', id: null },
    { year: 2022, title: 'Delhi Airport Metro Express v. Delhi Metro Rail Corporation', citation: '(2022) 1 SCC 131', id: 6 },
  ] },
];

/** The two overruled pairs recorded in the corpus. */
export const OVERRULED_PAIRS = [
  { from: { id: 8, title: 'ADM Jabalpur v. Shivkant Shukla', citation: '(1976) 2 SCC 521' }, to: { id: 7, title: 'Justice K.S. Puttaswamy (Retd.) v. Union of India', citation: '(2017) 10 SCC 1' } },
  { from: { id: 4, title: 'Krishna Janardhan Bhat v. Dattatraya G. Hegde', citation: '(2008) 4 SCC 54' }, to: { id: 3, title: 'Rangappa v. Sri Mohan', citation: '(2010) 11 SCC 441' } },
];

export function lineageGraphLink(node) { return node && node.id != null ? `#/graph/${node.id}` : null; }
export function lineageReaderLink(node) { return node && node.id != null ? `#/judgments/${node.id}` : null; }
