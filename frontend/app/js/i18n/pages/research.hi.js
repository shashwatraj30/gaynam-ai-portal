// Hindi strings for Research and the shared jr.* keys.
import { addMessages } from '../index.js';

const hi = {
  'jr.retry': 'पुनः प्रयास करें', 'jr.untitled': 'शीर्षकहीन निर्णय', 'jr.curated': 'संपादित', 'jr.copied': 'उद्धरण कॉपी हो गया', 'jr.copyFailed': 'कॉपी नहीं हो सका। पाठ चुनकर स्वयं कॉपी करें।',
  'jr.st.none': 'कोई प्रतिकूल उपचार दर्ज नहीं', 'jr.st.overruled': 'अधिक्रमित (ओवररूल्ड)', 'jr.st.distinguished': 'भिन्न माना गया', 'jr.st.partly': 'आंशिक रूप से अधिक्रमित',
  'jr.st.doubted': 'संदिग्ध', 'jr.st.notfound': 'कॉर्पस में नहीं मिला', 'jr.st.unknown': 'स्थिति दर्ज नहीं',
  'jr.court': 'न्यायालय', 'jr.district': 'जिला', 'jr.bench': 'पीठ', 'jr.coram': 'कोरम', 'jr.date': 'निर्णय तिथि', 'jr.cnr': 'सीएनआर', 'jr.citation': 'उद्धरण',
  'jr.equivalent': 'समकक्ष उद्धरण', 'jr.docket': 'डॉकेट संख्या', 'jr.subject': 'विषय', 'jr.statutes': 'विचारित विधियाँ', 'jr.disposition': 'निपटारा',
  'jr.ratio': 'निर्णय का आधार (रेशियो)', 'jr.citedLabel': 'उद्धृत', 'jr.citedN': '{n} बार उद्धृत (संपादित अभिलेख)',
  'jr.overruledBy': '{by} द्वारा अधिक्रमित। इस पर भरोसा न करें।', 'jr.overruledNoBy': 'अधिक्रमित। इस पर भरोसा न करें।',
  'jr.metadataNote': 'यह मेटाडेटा अभिलेख है। निर्णय स्वयं स्रोत PDF में है; कोई हेडनोट या रेशियो संपादित नहीं है, इसलिए नहीं दिखाया गया।',
  'rs.title': 'शोध', 'rs.lede': 'कॉर्पस में प्राधिकार खोजें। परिणाम पीठ की शक्ति के क्रम में हैं; अधिक्रमित निर्णय अंत में रखे गए हैं।',
  'rs.placeholder': 'उदाहरण: एनआई अधिनियम धारा 139 के अंतर्गत उपधारणा', 'rs.askLabel': 'आपका प्रश्न', 'rs.search': 'खोजें', 'rs.filters': 'फ़िल्टर',
  'rs.resultsLabel': 'क्रमबद्ध प्राधिकार', 'rs.allCourts': 'सभी न्यायालय',
  'rs.status.ALL': 'कोई भी स्थिति', 'rs.status.OVERRULED': 'अधिक्रमित', 'rs.status.DISTINGUISHED': 'भिन्न माना गया', 'rs.status.FOLLOWED': 'कोई प्रतिकूल उपचार दर्ज नहीं',
  'rs.f.court': 'न्यायालय', 'rs.f.status': 'उपचार', 'rs.f.judge': 'न्यायाधीश', 'rs.f.yearFrom': 'वर्ष से', 'rs.f.yearTo': 'वर्ष तक', 'rs.f.sections': 'भा.दं.सं. धाराएँ',
  'rs.f.sectionsHint': 'अल्पविराम से अलग करें, जैसे 302, 34। वर्ष और धारा फ़िल्टर प्राप्त परिणामों पर लागू होते हैं।',
  'rs.new': 'नया प्रश्न', 'rs.past': 'पिछले प्रश्न', 'rs.pastNote': 'केवल इस सत्र में, इसी ब्राउज़र में रखे गए हैं।', 'rs.pastEmpty': 'अभी कोई प्रश्न नहीं।',
  'rs.grp.today': 'आज', 'rs.grp.yesterday': 'कल', 'rs.grp.earlier': 'इससे पहले', 'rs.nFound': '{n} मिले', 'rs.clearHist': 'सूची साफ़ करें',
  'rs.brief': 'पीठ संक्षेप ({n}/{max})', 'rs.briefEmpty': 'मसौदे में ले जाने के लिए परिणामों से प्राधिकार जोड़ें।', 'rs.clearBrief': 'साफ़ करें', 'rs.useInDraft': 'मसौदे में उपयोग करें',
  'rs.removeBrief': '{title} को पीठ संक्षेप से हटाएँ', 'rs.briefFull': 'पीठ संक्षेप में अधिकतम {max} प्राधिकार रह सकते हैं। पहले एक हटाएँ।',
  'rs.briefAdded': 'पीठ संक्षेप में जोड़ा गया', 'rs.briefRemoved': 'पीठ संक्षेप से हटाया गया', 'rs.addBrief': 'पीठ संक्षेप में जोड़ें', 'rs.inBrief': 'पीठ संक्षेप में है', 'rs.openReader': 'पाठक में खोलें',
  'rs.idleTitle': 'प्रश्न पूछें', 'rs.idleMsg': 'कॉर्पस के निर्णयों के मेटाडेटा और स्रोत PDF में खोजें। इनमें से कोई आज़माएँ।',
  'rs.noneTitle': 'कोई प्राधिकार नहीं मिला', 'rs.noneMsg': 'व्यापक शब्द आज़माएँ या कोई फ़िल्टर हटाएँ।', 'rs.noneFiltered': 'आपके वर्ष या धारा फ़िल्टर ने सभी परिणाम हटा दिए। उन्हें ढीला करें।',
  'rs.count': '{total} में से {shown} प्राधिकार, पीठ की शक्ति के क्रम में; अधिक्रमित अंत में।', 'rs.filtered': '({n} फ़िल्टर सक्रिय)',
  'rs.sourceTitle': 'स्रोत', 'rs.sourceEmpty': 'मेटाडेटा और स्रोत PDF यहाँ देखने के लिए कोई प्राधिकार चुनें।', 'rs.sourceSub': 'चयनित प्राधिकार का स्रोत',
  'rs.checks': 'जाँच', 'rs.chk.found': 'निर्णय कॉर्पस में मौजूद है', 'rs.chk.overruled': 'क्या अधिक्रमित है?', 'rs.chk.quote': 'उद्धरण-से-अनुच्छेद मिलान', 'rs.chk.later': 'अभी जाँचा नहीं गया',
  'rs.detailFailed': 'स्रोत PDF लोड नहीं हो सका।',
};
addMessages('hi', hi);
export default hi;
