// English strings for Research, plus the shared jr.* keys used by Research, Judgment and Citation check.
import { addMessages } from '../index.js';

const en = {
  'jr.retry': 'Retry', 'jr.untitled': 'Untitled judgment', 'jr.curated': 'Curated', 'jr.copied': 'Citation copied', 'jr.copyFailed': 'Could not copy. Select the text and copy it manually.',
  'jr.st.none': 'No adverse treatment recorded', 'jr.st.overruled': 'Overruled', 'jr.st.distinguished': 'Distinguished', 'jr.st.partly': 'Partly overruled',
  'jr.st.doubted': 'Doubted', 'jr.st.notfound': 'Not found in corpus', 'jr.st.unknown': 'Status not recorded',
  'jr.court': 'Court', 'jr.district': 'District', 'jr.bench': 'Bench', 'jr.coram': 'Coram', 'jr.date': 'Decided', 'jr.cnr': 'CNR', 'jr.citation': 'Citation',
  'jr.equivalent': 'Equivalent citations', 'jr.docket': 'Docket number', 'jr.subject': 'Subject', 'jr.statutes': 'Statutes considered', 'jr.disposition': 'Disposition',
  'jr.ratio': 'Ratio decidendi', 'jr.citedLabel': 'Cited by', 'jr.citedN': 'cited {n} times (curated record)',
  'jr.overruledBy': 'Overruled by {by}. Do not rely on it.', 'jr.overruledNoBy': 'Overruled. Do not rely on it.',
  'jr.metadataNote': 'This is a metadata record. The judgment itself is the source PDF; no headnote or ratio is shown because none has been curated.',
  'rs.title': 'Research', 'rs.lede': 'Find authorities in the corpus. Results are ranked by bench strength, with overruled decisions moved to the end.',
  'rs.placeholder': 'For example: presumption under Section 139 NI Act', 'rs.askLabel': 'Your question', 'rs.search': 'Search', 'rs.filters': 'Filters',
  'rs.resultsLabel': 'Ranked authorities', 'rs.allCourts': 'All courts',
  'rs.status.ALL': 'Any treatment', 'rs.status.OVERRULED': 'Overruled', 'rs.status.DISTINGUISHED': 'Distinguished', 'rs.status.FOLLOWED': 'No adverse treatment recorded',
  'rs.f.court': 'Court', 'rs.f.status': 'Treatment', 'rs.f.judge': 'Judge', 'rs.f.yearFrom': 'Year from', 'rs.f.yearTo': 'Year to', 'rs.f.sections': 'IPC sections',
  'rs.f.sectionsHint': 'Separate with commas, for example 302, 34. Year and section filters apply to the results fetched.',
  'rs.new': 'New question', 'rs.past': 'Past questions', 'rs.pastNote': 'Kept in this browser for this session only.', 'rs.pastEmpty': 'No questions yet.',
  'rs.grp.today': 'Today', 'rs.grp.yesterday': 'Yesterday', 'rs.grp.earlier': 'Earlier', 'rs.nFound': '{n} found', 'rs.clearHist': 'Clear list',
  'rs.brief': 'Bench brief ({n} of {max})', 'rs.briefEmpty': 'Add authorities from the results to carry them into a draft.', 'rs.clearBrief': 'Clear', 'rs.useInDraft': 'Use in draft',
  'rs.removeBrief': 'Remove {title} from bench brief', 'rs.briefFull': 'The bench brief holds up to {max} authorities. Remove one first.',
  'rs.briefAdded': 'Added to bench brief', 'rs.briefRemoved': 'Removed from bench brief', 'rs.addBrief': 'Add to bench brief', 'rs.inBrief': 'In bench brief', 'rs.openReader': 'Open reader',
  'rs.idleTitle': 'Ask a question', 'rs.idleMsg': 'Search the metadata and source PDFs of the judgments in the corpus. Try one of these.',
  'rs.noneTitle': 'No authorities found', 'rs.noneMsg': 'Try broader terms or remove a filter.', 'rs.noneFiltered': 'Your year or section filters removed every result. Loosen them.',
  'rs.count': 'Showing {shown} of {total} authorities, ranked by bench strength; overruled decisions last.', 'rs.filtered': '({n} filters active)',
  'rs.sourceTitle': 'Source', 'rs.sourceEmpty': 'Select an authority to see its metadata and the source PDF here.', 'rs.sourceSub': 'Source for the selected authority',
  'rs.checks': 'Checks', 'rs.chk.found': 'Judgment exists in the corpus', 'rs.chk.overruled': 'Overruled?', 'rs.chk.quote': 'Quote-to-paragraph match', 'rs.chk.later': 'Not checked yet',
  'rs.detailFailed': 'The source PDF could not be loaded.',
};
addMessages('en', en);
export default en;
