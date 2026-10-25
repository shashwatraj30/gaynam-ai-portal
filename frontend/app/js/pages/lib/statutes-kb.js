// Built-in statute reference list for the Drafting studio (pure data + lookup, no DOM).
// Ported from the old UI's STATUTORY_KNOWLEDGE_BASE (short meaning, nature of offence, penalty, BNS cross-reference).
// This is a fixed reference list, not a legal opinion. Anything not listed returns {known:false}; nothing is invented.

/** Acts the section parser can recognise. `re` matches the act as written in a draft. */
export const ACTS = [
  { id: 'ipc', short: 'IPC', label: 'Indian Penal Code, 1860', re: 'I\\.?\\s?P\\.?\\s?C\\.?|Indian\\s+Penal\\s+Code(?:,?\\s*1860)?' },
  { id: 'bns', short: 'BNS', label: 'Bharatiya Nyaya Sanhita, 2023', re: 'B\\.?\\s?N\\.?\\s?S\\.?|Bharatiya\\s+Nyaya\\s+Sanhita(?:,?\\s*2023)?' },
  { id: 'crpc', short: 'CrPC', label: 'Code of Criminal Procedure, 1973', re: 'Cr\\.?\\s?P\\.?\\s?C\\.?|Code\\s+of\\s+Criminal\\s+Procedure(?:,?\\s*1973)?|Criminal\\s+Procedure\\s+Code' },
  { id: 'bnss', short: 'BNSS', label: 'Bharatiya Nagarik Suraksha Sanhita, 2023', re: 'B\\.?\\s?N\\.?\\s?S\\.?\\s?S\\.?|Bharatiya\\s+Nagarik\\s+Suraksha\\s+Sanhita' },
  { id: 'cpc', short: 'CPC', label: 'Code of Civil Procedure, 1908', re: 'C\\.?\\s?P\\.?\\s?C\\.?|Code\\s+of\\s+Civil\\s+Procedure(?:,?\\s*1908)?' },
  { id: 'ni', short: 'NI Act', label: 'Negotiable Instruments Act, 1881', re: 'N\\.?\\s?I\\.?\\s+Act|Negotiable\\s+Instruments?\\s+Act(?:,?\\s*1881)?' },
  { id: 'arms', short: 'Arms Act', label: 'Arms Act, 1959', re: 'Arms\\s+Act(?:,?\\s*1959)?' },
  { id: 'ndps', short: 'NDPS Act', label: 'Narcotic Drugs and Psychotropic Substances Act, 1985', re: 'N\\.?D\\.?P\\.?S\\.?(?:\\s+Act)?|Narcotic\\s+Drugs\\s+and\\s+Psychotropic\\s+Substances\\s+Act' },
  { id: 'pocso', short: 'POCSO', label: 'Protection of Children from Sexual Offences Act, 2012', re: 'POCSO(?:\\s+Act)?|Protection\\s+of\\s+Children\\s+from\\s+Sexual\\s+Offences\\s+Act' },
  { id: 'mv', short: 'MV Act', label: 'Motor Vehicles Act, 1988', re: 'M\\.?\\s?V\\.?\\s+Act|Motor\\s+Vehicles?\\s+Act(?:,?\\s*1988)?' },
  { id: 'evidence', short: 'Evidence Act', label: 'Indian Evidence Act, 1872', re: '(?:Indian\\s+)?Evidence\\s+Act(?:,?\\s*1872)?' },
];

/** Entries keyed by act id then section number (upper case). */
const KB = {
  ipc: {
    "34": { title: "Acts Done by Several Persons in Furtherance of Common Intention", nature: "Rule of Joint Constructive Liability (Tied to Substantive Offences)", penalty: "Joint penal liability as if criminal act was performed by each person alone.", bns: "Sec. 3(5) Bharatiya Nyaya Sanhita, 2023" },
    "279": { title: "Rash Driving or Riding on a Public Way", nature: "Cognizable • Bailable • Any Magistrate", penalty: "Imprisonment for a term extending up to 6 months, or fine up to ₹1,000, or both.", bns: "Sec. 281 Bharatiya Nyaya Sanhita, 2023" },
    "302": { title: "Punishment for Murder", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Death or Imprisonment for Life, and mandatory fine.", bns: "Sec. 103(1) Bharatiya Nyaya Sanhita, 2023" },
    "307": { title: "Attempt to Murder", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Imprisonment extending up to 10 years and fine; if hurt caused, up to life imprisonment.", bns: "Sec. 109 Bharatiya Nyaya Sanhita, 2023" },
    "323": { title: "Punishment for Voluntarily Causing Hurt", nature: "Non-Cognizable • Bailable • Compoundable", penalty: "Imprisonment up to 1 year, or fine up to ₹1,000, or both.", bns: "Sec. 115(2) Bharatiya Nyaya Sanhita, 2023" },
    "338": { title: "Causing Grievous Hurt by Act Endangering Life or Personal Safety", nature: "Cognizable • Bailable • Compoundable with Court Permission", penalty: "Imprisonment for a term extending up to 2 years, or fine up to ₹1,000, or both.", bns: "Sec. 125(b) Bharatiya Nyaya Sanhita, 2023" },
    "341": { title: "Punishment for Wrongful Restraint", nature: "Cognizable • Bailable • Compoundable", penalty: "Simple imprisonment up to 1 month, or fine up to ₹500, or both.", bns: "Sec. 126(1) Bharatiya Nyaya Sanhita, 2023" },
    "354": { title: "Assault or Criminal Force to Woman with Intent to Outrage her Modesty", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Imprisonment for not less than 1 year, extending up to 5 years, and mandatory fine.", bns: "Sec. 74 Bharatiya Nyaya Sanhita, 2023" },
    "376": { title: "Punishment for Rape", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Rigorous imprisonment for not less than 10 years extending to life imprisonment, and fine.", bns: "Sec. 64 Bharatiya Nyaya Sanhita, 2023" },
    "384": { title: "Punishment for Extortion", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Imprisonment for a term extending up to 3 years, or fine, or both.", bns: "Sec. 308(2) Bharatiya Nyaya Sanhita, 2023" },
    "399": { title: "Making Preparation to Commit Dacoity", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Rigorous imprisonment extending up to 10 years, and mandatory fine.", bns: "Sec. 310(4) Bharatiya Nyaya Sanhita, 2023" },
    "402": { title: "Assembling for Purpose of Committing Dacoity", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Rigorous imprisonment extending up to 7 years, and mandatory fine.", bns: "Sec. 310(5) Bharatiya Nyaya Sanhita, 2023" },
    "406": { title: "Punishment for Criminal Breach of Trust (Stridhan / Property)", nature: "Cognizable • Non-Bailable • Compoundable with Court Permission", penalty: "Imprisonment for a term extending up to 3 years, or fine, or both.", bns: "Sec. 316(2) Bharatiya Nyaya Sanhita, 2023" },
    "417": { title: "Punishment for Cheating (False Promise to Marry / Deception)", nature: "Non-Cognizable • Bailable • Compoundable with Court Permission", penalty: "Imprisonment for a term extending up to 1 year, or fine, or both.", bns: "Sec. 318(2) Bharatiya Nyaya Sanhita, 2023" },
    "420": { title: "Cheating and Dishonestly Inducing Delivery of Property", nature: "Cognizable • Non-Bailable • Compoundable with Court Permission", penalty: "Imprisonment for a term extending up to 7 years, and mandatory fine.", bns: "Sec. 318(4) Bharatiya Nyaya Sanhita, 2023" },
    "427": { title: "Mischief Causing Damage to the Amount of Fifty Rupees or Upwards", nature: "Non-Cognizable • Bailable • Compoundable", penalty: "Imprisonment for a term extending up to 2 years, or fine, or both.", bns: "Sec. 324(4) Bharatiya Nyaya Sanhita, 2023" },
    "465": { title: "Punishment for Forgery (General Provision)", nature: "Non-Cognizable • Bailable • Non-Compoundable", penalty: "Imprisonment for a term extending up to 2 years, or fine, or both.", bns: "Sec. 336(2) Bharatiya Nyaya Sanhita, 2023" },
    "467": { title: "Forgery of Valuable Security, Will, etc.", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Imprisonment for life, or imprisonment extending up to 10 years, and mandatory fine.", bns: "Sec. 338 Bharatiya Nyaya Sanhita, 2023" },
    "468": { title: "Forgery for Purpose of Cheating", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Imprisonment for a term extending up to 7 years, and mandatory fine.", bns: "Sec. 336(3) Bharatiya Nyaya Sanhita, 2023" },
    "471": { title: "Using as Genuine a Forged Document or Electronic Record", nature: "Cognizable • Bailable • Non-Compoundable", penalty: "Punished in the same manner as if the accused had forged such document (up to 7 years under Sec. 468).", bns: "Sec. 340(2) Bharatiya Nyaya Sanhita, 2023" },
    "506": { title: "Punishment for Criminal Intimidation", nature: "Non-Cognizable • Bailable • Compoundable", penalty: "Imprisonment up to 2 years, or fine, or both (Part I); Up to 7 years if threat to cause death (Part II).", bns: "Sec. 351(2) Bharatiya Nyaya Sanhita, 2023" },
    "354B": { title: "Assault or Use of Criminal Force to Woman with Intent to Disrobe", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Rigorous imprisonment for not less than 3 years, extending up to 7 years, and mandatory fine.", bns: "Sec. 76 Bharatiya Nyaya Sanhita, 2023" },
    "498A": { title: "Husband or Relative of Husband Subjecting Woman to Cruelty", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Imprisonment for a term extending up to 3 years, and mandatory fine.", bns: "Sec. 85 Bharatiya Nyaya Sanhita, 2023" },
    "120B": { title: "Punishment of Criminal Conspiracy", nature: "Cognizable / Non-Bailable (linked to substantive offence)", penalty: "Same manner as if accused had abetted such offence.", bns: "Sec. 61(2) Bharatiya Nyaya Sanhita, 2023" },
    "304A": { title: "Causing Death by Negligence (Rash Driving / Motor Vehicle Accident)", nature: "Cognizable • Bailable • Any Magistrate", penalty: "Imprisonment for a term extending up to 2 years, or fine, or both.", bns: "Sec. 106(1) Bharatiya Nyaya Sanhita, 2023" },
  },
  arms: {
    "25": { title: "Manufacture, Possession & Use of Unlicensed Arms and Ammunition", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Rigorous imprisonment for not less than 7 years extending to 14 years or life, and fine.", bns: "Arms Act Statutory Scheme" },
    "27": { title: "Manufacture, Possession & Use of Unlicensed Arms and Ammunition", nature: "Cognizable • Non-Bailable • Non-Compoundable", penalty: "Rigorous imprisonment for not less than 7 years extending to 14 years or life, and fine.", bns: "Arms Act Statutory Scheme" },
  },
};

// ---------- section parsing ----------
const ACT_ALT = ACTS.map((a) => `(?:${a.re})`).join('|');
// a section number: digits plus an optional 1-2 letter suffix (498A, 376DA) but not an ordinal (5th), plus sub-clauses (1)(a)
const NUM_CORE = '\\d{1,4}(?:(?!(?:st|nd|rd|th)(?![A-Za-z]))[A-Za-z]{1,2}(?![A-Za-z]))?';
const NUM = `${NUM_CORE}(?:\\s*\\(\\w{1,3}\\))*`;
// list separators. A comma glued to a digit is a thousands separator (1,000), not a list comma.
const SEP = '\\s*(?:,(?!\\d)\\s*(?:(?:and|&|or)\\b\\s*)?|(?:and|&|or)\\b\\s*|r\\/w|r\\.w\\.?|read\\s+with|\\/|to\\b|-|–)\\s*';
const LIST = `${NUM}(?:${SEP}${NUM})*(?!\\d|[,.]\\d)(?!\\s*(?:%|(?:rounds?|cartridges?|persons?|accused|years?|months?|days?|lakhs?|crores?|rupees|others|items|nos?)\\b))`;
const SECWORD = '(?:\\b(?:sections?|secs?|ss?)\\b\\.?\\s*|\\bu\\/ss?\\b\\.?\\s*|§\\s*)';
const TRAIL = `(?:\\s*,?\\s*(?:(?:of|under)\\s+(?:the\\s+)?|read\\s+with\\s+)?\\(?(?:\\b|(?<=\\d))(?<sact>${ACT_ALT})(?![A-Za-z]))?`;
// "Sections 302 IPC and 420": a number after a closed act that names no act of its own (kept act-less, never guessed)
const XTAIL = `(?:\\s*(?:,(?!\\d)|and\\b|&)\\s*(?<xlist>${LIST})(?!\\s*,?\\s*\\(?(?:\\b|(?<=\\d))(?:${ACT_ALT})(?![A-Za-z]))(?!\\s*(?:of\\s+(?:the\\s+)?)?(?:[A-Za-z&.]+\\s+){0,6}Act\\b))?`;
// An act that is named but not in ACTS ("Companies Act, 1956"). Matched case-sensitively in its own pass so a
// proper name is required; such sections are reported as that unsupported act and never as IPC.
const otherName = (g) => `(?:The\\s+)?(?<${g}>[A-Z][A-Za-z&.]*(?:\\s+(?:[A-Z][A-Za-z&.]*|of|and|for|the)){0,8}?\\s+(?:Act|Code|Sanhita|Adhiniyam)(?:,?\\s*(?:18|19|20)\\d\\d)?)(?![A-Za-z])`;
const SECWORD_CS = '(?:\\b(?:[Ss]ections?|[Ss]ecs?|[Ss]s?)\\b\\.?\\s*|\\bu\\/ss?\\b\\.?\\s*|§\\s*)';
const OF_THE = '(?:(?:of|under)\\s+(?:the\\s+)?)?';
const OTHER_RE = new RegExp(
  `${otherName('pname')}\\.?\\s*,?\\s*${SECWORD_CS}(?<plist>${LIST})`
  + `|${SECWORD_CS}(?<qlist>${LIST})\\s*,?\\s*${OF_THE}${otherName('qname')}`
  + `|(?<![\\w.,/₹$#-])(?<rlist>${LIST})\\s*,?\\s*${OF_THE}${otherName('rname')}`, 'g');
// three shapes: "IPC 341, 420" / "IPC section 420"  |  "Sections 341, 420 and 34 [of the] IPC"  |  "420 IPC", "25/27 Arms Act"
const GROUP_RE = new RegExp(
  `\\b(?<aact>${ACT_ALT})(?![A-Za-z])\\.?\\s*,?\\s*(?:${SECWORD})?(?<alist>${LIST})`
  + `|${SECWORD}(?<slist>${LIST})${TRAIL}${XTAIL}`
  + `|(?<![\\w.,/₹$#-])(?<blist>${LIST})\\s*,?\\s*\\(?(?:\\b|(?<=\\d))(?<bact>${ACT_ALT})(?![A-Za-z])`, 'gi');
const ITEM_RE = new RegExp(`(${NUM_CORE})(?:\\s*\\(\\w{1,3}\\))*(${SEP})?`, 'gi');
// words that mean the following bare number is not a statute section ("Order 39 Rule 1 CPC", "Rs. 420", "FIR No. 45")
const NOT_SECTION_BEFORE = /(?:^|[^A-Za-z])(?:rules?|orders?|articles?|paras?|paragraphs?|clauses?|schedules?|chapters?|parts?|pages?|pg|items?|nos?|case|cases|fir|appeals?|petitions?|wp|crl|rs|inr|usd|dated?|vide|annexure|exhibit|ex)\.?[\s,]*$/i;
const isYear = (n) => /^(?:1[89]|20)\d\d$/.test(n);

/** Act id for a piece of text such as "IPC", "NI Act", "Negotiable Instruments Act, 1881"; null if unknown. */
export function actFromText(s) {
  const x = String(s || '').trim();
  if (!x) return null;
  for (const a of ACTS) if (new RegExp(`^(?:${a.re})$`, 'i').test(x)) return a.id;
  return null;
}
export function actInfo(id) { return ACTS.find((a) => a.id === id) || null; }

/**
 * Text -> [{num, act, inRange}] in order of first appearance, deduplicated.
 * act is an act id or null when the text names no act. Ranges ("302 to 304") are not expanded:
 * only the two written numbers are returned and flagged inRange.
 */
export function parseSections(text) {
  const src = String(text || '');
  const found = [];
  const itemsOf = (list, act, actText, at) => {
    const items = [];
    ITEM_RE.lastIndex = 0;
    let im; let prevRange = false; let prevSlash = false;
    while ((im = ITEM_RE.exec(list)) !== null) {
      const num = im[1].toUpperCase();
      const sep = (im[2] || '').trim().toLowerCase();
      if (isYear(num)) {
        if (prevSlash && items.length) items.pop(); // "341/2020" is a case number, not a section
        items.push({ year: true });
        prevRange = false; prevSlash = false;
        continue;
      }
      const rangeAfter = sep === 'to' || sep === '-' || sep === '–';
      const it = { num, act, inRange: prevRange || rangeAfter, at };
      if (actText) it.actText = actText;
      items.push(it);
      prevRange = rangeAfter; prevSlash = sep === '/';
    }
    return items;
  };
  // pass 1: acts that are named but not supported
  const spans = [];
  let m;
  OTHER_RE.lastIndex = 0;
  while ((m = OTHER_RE.exec(src)) !== null) {
    if (m[0] === '') { OTHER_RE.lastIndex++; continue; }
    const g = m.groups;
    const name = (g.pname || g.qname || g.rname || '').replace(/\s+/g, ' ').trim();
    if (!name || actFromText(name)) continue; // supported acts are handled in pass 2
    const bare = !!g.rlist;
    if (bare) {
      const before = src.slice(0, m.index);
      if (NOT_SECTION_BEFORE.test(before) || /[₹$#]\s*$/.test(before)) continue;
    }
    const items = itemsOf(g.plist || g.qlist || g.rlist, null, name, m.index);
    if (items.some((x) => x.year) && (bare || items[0].year)) continue;
    spans.push([m.index, m.index + m[0].length]);
    for (const it of items) if (!it.year) found.push(it);
  }
  // pass 2: supported acts, and sections naming no act
  GROUP_RE.lastIndex = 0;
  while ((m = GROUP_RE.exec(src)) !== null) {
    if (m[0] === '') { GROUP_RE.lastIndex++; continue; }
    if (spans.some(([a, b]) => m.index >= a && m.index < b)) continue; // already read with its unsupported act
    const g = m.groups;
    const list = g.alist || g.slist || g.blist;
    const bare = !!g.blist;
    const act = actFromText(g.aact || g.sact || g.bact);
    if (bare) {
      const before = src.slice(0, m.index);
      if (NOT_SECTION_BEFORE.test(before) || /[₹$#]\s*$/.test(before)) continue;
    }
    const items = itemsOf(list, act, '', m.index);
    // "Arms Act, 1959 ..." is the act cited with its year, not a section list; a bare "341/2020 IPC" is a case number.
    if (items.some((x) => x.year) && (bare || (g.aact && items[0].year))) continue;
    for (const it of items) if (!it.year) found.push(it);
    if (g.xlist) for (const it of itemsOf(g.xlist, null, '', m.index + 1)) if (!it.year) found.push(it);
  }
  found.sort((a, b) => a.at - b.at);
  const have = new Set();
  const out = [];
  for (const f of found) {
    const k = `${f.act || f.actText || ''}:${f.num}`;
    if (have.has(k)) continue;
    have.add(k);
    const { at: _at, ...rest } = f;
    out.push(rest);
  }
  // an entry with no act is dropped when the same number also appears with an act
  const withAct = new Set(out.filter((f) => f.act || f.actText).map((f) => f.num));
  return out.filter((f) => f.act || f.actText || !withAct.has(f.num));
}

/**
 * Look a section up in the built-in list. actHint: act id, act text or null.
 *  - null/empty: no act was stated; IPC is ASSUMED (flagged actNotStated + assumedAct) so the user can verify.
 *  - text naming an act not in ACTS: reported as that unsupported act, never looked up, never read as IPC.
 * -> {known:true, num, act, actLabel, title, nature, penalty, bns, assumedAct, actNotStated}
 *  | {known:false, num, act, actLabel, actNotStated?, unsupportedAct?}
 */
export function describeSection(num, actHint) {
  const n = String(num || '').trim().toUpperCase();
  const hint = actHint ? String(actHint).trim() : '';
  let act = hint ? (ACTS.some((a) => a.id === hint) ? hint : actFromText(hint)) : null;
  if (hint && !act) return { known: false, num: n, act: null, actLabel: hint, unsupportedAct: true };
  const assumedAct = !act;
  if (!act) act = 'ipc';
  const info = actInfo(act);
  const base = { num: n, act: assumedAct ? null : act, actLabel: assumedAct ? '' : (info ? info.label : '') };
  const row = KB[act] && Object.prototype.hasOwnProperty.call(KB[act], n) ? KB[act][n] : null;
  if (!row) return { known: false, ...base, ...(assumedAct ? { actNotStated: true } : {}) };
  const bns = row.bns && !/statutory scheme/i.test(row.bns) ? row.bns : '';
  return { known: true, num: n, act, actLabel: info.label, title: row.title, nature: row.nature, penalty: row.penalty, bns, assumedAct, actNotStated: assumedAct };
}

/** Parsed sections -> described rows, order kept. An unsupported act travels in p.actText. */
export function describeAll(parsed) {
  return (parsed || []).map((p) => ({ ...describeSection(p.num, p.act || p.actText), inRange: !!p.inRange }));
}
