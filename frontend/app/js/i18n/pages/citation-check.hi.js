import { addMessages } from '../index.js';
import './judgment.hi.js';

const hi = {
  'cc.title': 'उद्धरण जाँचें', 'cc.lede': 'SCC, AIR, SCR, INSC या तटस्थ उद्धरण चिपकाएँ। हम उसे कॉर्पस में खोजकर दर्ज प्रतिकूल उपचार बताते हैं।',
  'cc.label': 'उद्धरण', 'cc.hint': 'उदाहरण: (2010) 11 SCC 441', 'cc.submit': 'उद्धरण जाँचें', 'cc.try': 'आज़माएँ:',
  'cc.past': 'पिछली जाँचें', 'cc.pastNote': 'केवल इस सत्र में, इसी ब्राउज़र में रखी गई हैं।',
  'cc.chk.format': 'उद्धरण का प्रारूप पहचाना गया', 'cc.chk.found': 'निर्णय कॉर्पस में मिला', 'cc.chk.treatment': 'क्या प्रतिकूल उपचार दर्ज है?', 'cc.chk.quote': 'उद्धरण-से-अनुच्छेद मिलान',
  'cc.fmtOk': 'प्रारूप: {f}', 'cc.fmtUnknown': 'प्रारूप नहीं पहचाना गया; पाठ खोज से मिलान हुआ।', 'cc.notChecked': 'जाँचा नहीं गया', 'cc.later': 'निर्णय का पाठ चाहिए (अनुच्छेद अभी लोड नहीं हैं)',
  'cc.treat.overruled': 'अधिक्रमित दर्ज है', 'cc.treat.dist': 'भिन्न माना गया दर्ज है; तथ्यों की समानता जाँचें',
  'cc.overruledBy': '{by} द्वारा अधिक्रमित। इस पर भरोसा न करें।', 'cc.overruled': 'यह निर्णय अधिक्रमित दर्ज है। इस पर भरोसा न करें।',
  'cc.distinguished': 'इस निर्णय को बाद के निर्णयों में भिन्न माना गया है। जाँचें कि तथ्य तुलनीय हैं।',
  'cc.foundNote': 'कॉर्पस में मिला। कोई प्रतिकूल उपचार दर्ज नहीं है, जो इस बात की पुष्टि नहीं कि विधि अब भी मान्य है।',
  'cc.notFoundTitle': 'कॉर्पस में नहीं मिला', 'cc.notFoundMsg': '"{q}" का कोई मिलान नहीं।', 'cc.notFoundHint': 'खंड संख्या, रिपोर्ट का संक्षिप्त नाम (SCC, SCR, AIR) और पृष्ठ जाँचें। उद्धरण गलत भी हो सकता है।',
  'cc.searchInstead': 'इसके बजाय खोजें', 'cc.checks': 'जाँच', 'cc.openJudgment': 'यह निर्णय खोलें', 'cc.openOverruling': 'अधिक्रमित करने वाला निर्णय खोजें',
  'cc.tab.single': 'उद्धरण जाँचें', 'cc.tab.doc': 'दस्तावेज़ जाँचें', 'cc.benchmarks': 'मानक उद्धरण:', 'cc.tabs': 'उद्धरण जाँच के प्रकार',
  'cc.doc.lede': 'अभिवचन या संक्षेप का पाठ चिपकाएँ, या .txt, .pdf या .docx फ़ाइल चुनें। मिला हर उद्धरण कॉर्पस में खोजा जाता है।', 'cc.doc.text': 'दस्तावेज़ का पाठ', 'cc.doc.file': 'या फ़ाइल चुनें', 'cc.doc.run': 'उद्धरण जाँचें',
  'cc.doc.needInput': 'पहले कुछ पाठ चिपकाएँ या फ़ाइल चुनें।', 'cc.doc.unsupported': 'केवल .txt, .pdf और .docx फ़ाइलें जाँची जा सकती हैं।', 'cc.doc.uploaded': 'उद्धरण निकालने के लिए फ़ाइल दस्तावेज़ों में अपलोड की गई।',
  'cc.doc.textOnly': 'आप फ़ाइल अपलोड नहीं कर सकते, इसलिए केवल चिपकाया पाठ या .txt फ़ाइल जाँची जा सकती है। PDF और Word फ़ाइलों के लिए अपलोड अनुमति चाहिए।',
  'cc.doc.none': 'इस दस्तावेज़ में कोई उद्धरण नहीं मिला।', 'cc.doc.summary': '{total} उद्धरण: {found} मिले, {overruled} अधिक्रमित, {distinguished} विभेदित, {notfound} नहीं मिले।',
  'cc.doc.col.citation': 'उद्धरण', 'cc.doc.col.verdict': 'परिणाम', 'cc.doc.col.match': 'मिलान किया गया मामला', 'cc.doc.col.actions': 'कार्य',
  'cc.doc.v.found': 'मिला, कोई प्रतिकूल उपचार दर्ज नहीं', 'cc.doc.v.overruled': 'अधिक्रमित', 'cc.doc.v.distinguished': 'विभेदित', 'cc.doc.v.notfound': 'कॉर्पस में नहीं मिला', 'cc.doc.v.unknown': 'जाँचा नहीं गया',
  'cc.doc.addBrief': 'संक्षेप में जोड़ें', 'cc.doc.openPdf': 'PDF खोलें', 'cc.doc.openJudgment': 'खोलें', 'cc.doc.noMatch': 'कोई मिलान नहीं', 'cc.doc.exportCsv': 'तालिका निर्यात करें (CSV)', 'cc.doc.working': 'उद्धरण जाँचे जा रहे हैं', 'cc.doc.failed': 'दस्तावेज़ जाँचा नहीं जा सका।',
  'cc.startDraft': 'इस प्राधिकरण के साथ मसौदा शुरू करें', 'cc.addBrief': 'पीठ संक्षेप में जोड़ें', 'cc.openPdf': 'स्रोत PDF खोलें',
};
addMessages('hi', hi);
export default hi;
