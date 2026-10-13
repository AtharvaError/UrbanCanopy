/**
 * The interface's main labels in English, Hindi and Marathi.
 *
 * What is translated: navigation, the landing page, the dashboard's chrome,
 * the planner's headings and its people-focused actions. What is not: numbers,
 * locality names (they are proper names from OpenStreetMap), and the long
 * method and limits text, which stays in English so that it has one
 * authoritative wording.
 *
 * English is the fallback for any key missing in another language, so a new
 * label can ship before its translations do.
 */

export const LANGUAGES = { en: "English", hi: "हिन्दी", mr: "मराठी" } as const;
export type Lang = keyof typeof LANGUAGES;
export const DEFAULT_LANG: Lang = "en";

/** BCP 47 tags, for `<html lang>` and for formatting weekdays. */
export const LOCALES: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && value in LANGUAGES;
}

type Entry = { en: string; hi: string; mr: string };

const STRINGS = {
  // ------------------------------------------------------------ navigation --
  "nav.map": { en: "Map", hi: "नक्शा", mr: "नकाशा" },
  "nav.calculator": { en: "Calculator", hi: "कैलकुलेटर", mr: "कॅल्क्युलेटर" },
  "nav.simulator": { en: "Simulator", hi: "सिम्युलेटर", mr: "सिम्युलेटर" },
  "nav.plan": { en: "City plan", hi: "शहर योजना", mr: "शहर आराखडा" },
  "nav.data": { en: "Data & method", hi: "डेटा और पद्धति", mr: "डेटा आणि पद्धत" },
  "nav.language": { en: "Language", hi: "भाषा", mr: "भाषा" },

  // ---------------------------------------------------------- landing page --
  "hero.kicker": {
    en: "UrbanCanopy · urban heat intelligence",
    hi: "UrbanCanopy · शहरी गर्मी की जानकारी",
    mr: "UrbanCanopy · शहरी उष्णतेची माहिती",
  },
  "hero.title1": {
    en: "Where Nagpur needs cooling first,",
    hi: "नागपुर में सबसे पहले ठंडक कहाँ चाहिए,",
    mr: "नागपूरमध्ये सर्वात आधी गारवा कुठे हवा,",
  },
  "hero.title2": {
    en: "and what to do about it.",
    hi: "और उसके लिए क्या किया जाए।",
    mr: "आणि त्यासाठी काय करावे.",
  },
  "hero.sub": {
    en: "{n} localities ranked with one open formula, from satellite and population data.",
    hi: "उपग्रह और जनसंख्या के आँकड़ों से, एक खुले सूत्र द्वारा {n} इलाकों की क्रमवारी।",
    mr: "उपग्रह आणि लोकसंख्येच्या आकडेवारीवरून, एका खुल्या सूत्राने {n} परिसरांची क्रमवारी.",
  },
  "hero.cta.map": { en: "Open the map", hi: "नक्शा खोलें", mr: "नकाशा उघडा" },
  "hero.cta.sim": { en: "Try the simulator", hi: "सिम्युलेटर आज़माएँ", mr: "सिम्युलेटर वापरून पहा" },
  "hero.credit": {
    en: "Nagpur's localities, raised and coloured by heat priority. Approximate localities inside the real municipal outline.",
    hi: "नागपुर के इलाके, गर्मी की प्राथमिकता के अनुसार उभरे और रंगे हुए। असली नगर सीमा के भीतर अनुमानित इलाके।",
    mr: "नागपूरचे परिसर, उष्णता प्राधान्यानुसार उंच आणि रंगीत. खऱ्या महापालिका हद्दीतील अंदाजे परिसर.",
  },

  "live.now": { en: "{city} now", hi: "{city} अभी", mr: "{city} आत्ता" },
  "live.air": { en: "air", hi: "हवा", mr: "हवा" },
  "live.feels": { en: "feels like", hi: "महसूस होता है", mr: "जाणवते" },
  "live.checking": { en: "Checking {city} live weather…", hi: "{city} का मौसम देखा जा रहा है…", mr: "{city}चे हवामान तपासत आहे…" },
  "live.unavailable": {
    en: "Live air temperature unavailable",
    hi: "हवा का ताज़ा तापमान उपलब्ध नहीं",
    mr: "हवेचे ताजे तापमान उपलब्ध नाही",
  },
  "live.note": {
    en: "The map measures land-surface temperature, a related but different number.",
    hi: "नक्शा ज़मीन की सतह का तापमान दिखाता है, जो इससे जुड़ा पर अलग आँकड़ा है।",
    mr: "नकाशा जमिनीच्या पृष्ठभागाचे तापमान दाखवतो, जे याच्याशी संबंधित पण वेगळे आहे.",
  },

  "top.title": {
    en: "The five localities that need cooling most",
    hi: "सबसे ज़्यादा ठंडक की ज़रूरत वाले पाँच इलाके",
    mr: "सर्वाधिक गारव्याची गरज असलेले पाच परिसर",
  },
  "top.sub": {
    en: "Computed from the latest satellite season, not hand-picked.",
    hi: "ताज़ा उपग्रह आँकड़ों से निकाले गए, हाथ से चुने नहीं।",
    mr: "ताज्या उपग्रह आकडेवारीवरून काढलेले, हाताने निवडलेले नाहीत.",
  },
  "top.link": { en: "See every locality on the map", hi: "नक्शे पर हर इलाका देखें", mr: "नकाशावर प्रत्येक परिसर पहा" },
  "top.score": { en: "score", hi: "अंक", mr: "गुण" },

  "how.title": { en: "How it works", hi: "यह कैसे काम करता है", mr: "हे कसे काम करते" },
  "how.1.title": { en: "Measure", hi: "मापें", mr: "मोजा" },
  "how.1.text": {
    en: "Five public indicators for every 500 m of the city: surface heat, green cover, built-up surface, population and distance to a hospital.",
    hi: "शहर के हर 500 मीटर के लिए पाँच सार्वजनिक संकेतक: सतह की गर्मी, हरियाली, निर्मित क्षेत्र, जनसंख्या और अस्पताल की दूरी।",
    mr: "शहराच्या प्रत्येक 500 मीटरसाठी पाच सार्वजनिक निर्देशक: पृष्ठभागाची उष्णता, हिरवळ, बांधकाम क्षेत्र, लोकसंख्या आणि रुग्णालयाचे अंतर.",
  },
  "how.2.title": { en: "Score", hi: "अंक दें", mr: "गुण द्या" },
  "how.2.text": {
    en: "One transparent formula turns them into a 0 to 100 priority score. Every point can be traced to a factor.",
    hi: "एक पारदर्शी सूत्र इन्हें 0 से 100 के प्राथमिकता अंक में बदलता है। हर अंक का कारण देखा जा सकता है।",
    mr: "एक पारदर्शक सूत्र यांचे 0 ते 100 च्या प्राधान्य गुणांत रूपांतर करते. प्रत्येक गुणाचे कारण पाहता येते.",
  },
  "how.3.title": { en: "Act", hi: "कदम उठाएँ", mr: "कृती करा" },
  "how.3.text": {
    en: "Each locality gets suggested actions with the rule behind each, and a one-page brief to print.",
    hi: "हर इलाके के लिए सुझाए गए कदम, हर कदम के पीछे का नियम, और छापने योग्य एक पन्ने का सार।",
    mr: "प्रत्येक परिसरासाठी सुचवलेल्या कृती, प्रत्येकामागचा नियम, आणि छापण्यायोग्य एक पानी सारांश.",
  },

  "cards.title": { en: "What you can do here", hi: "यहाँ आप क्या कर सकते हैं", mr: "येथे तुम्ही काय करू शकता" },
  "cards.map.title": { en: "Explore the map", hi: "नक्शा देखें", mr: "नकाशा पहा" },
  "cards.map.text": {
    en: "See the ranking, open any locality, and switch layers: priority, plantability, green cover and warming.",
    hi: "क्रमवारी देखें, कोई भी इलाका खोलें, और परतें बदलें: प्राथमिकता, वृक्षारोपण योग्यता, हरियाली और बढ़ती गर्मी।",
    mr: "क्रमवारी पहा, कोणताही परिसर उघडा, आणि स्तर बदला: प्राधान्य, वृक्षलागवड योग्यता, हिरवळ आणि वाढती उष्णता.",
  },
  "cards.calc.title": { en: "Compare localities", hi: "इलाकों की तुलना करें", mr: "परिसरांची तुलना करा" },
  "cards.calc.text": {
    en: "Pick three to five, change any value or weight, and watch the score, band and rank update.",
    hi: "तीन से पाँच चुनें, कोई भी मान या भार बदलें, और अंक, श्रेणी व क्रम बदलते देखें।",
    mr: "तीन ते पाच निवडा, कोणतेही मूल्य किंवा भार बदला, आणि गुण, श्रेणी व क्रम बदलताना पहा.",
  },
  "cards.sim.title": { en: "Test a cooling plan", hi: "ठंडक की योजना परखें", mr: "गारव्याची योजना तपासा" },
  "cards.sim.text": {
    en: "Apply tree canopy, cool roofs and pocket parks to several localities and compare before and after.",
    hi: "कई इलाकों में पेड़ों की छाया, ठंडी छतें और छोटे उद्यान लगाकर पहले और बाद की तुलना करें।",
    mr: "अनेक परिसरांत झाडांची सावली, थंड छते आणि लहान उद्याने लावून आधी व नंतरची तुलना करा.",
  },
  "cards.plan.title": { en: "See the city plan", hi: "शहर की योजना देखें", mr: "शहराचा आराखडा पहा" },
  "cards.plan.text": {
    en: "What the whole city needs this hot season, action by action, with a table to download.",
    hi: "इस गर्मी में पूरे शहर को क्या चाहिए, हर कदम के अनुसार, डाउनलोड करने योग्य तालिका के साथ।",
    mr: "या उन्हाळ्यात संपूर्ण शहराला काय हवे, प्रत्येक कृतीनुसार, डाउनलोड करण्यायोग्य तक्त्यासह.",
  },
  "cards.open": { en: "Open", hi: "खोलें", mr: "उघडा" },

  "open.title": { en: "Built in the open", hi: "खुले तौर पर बनाया गया", mr: "खुलेपणाने बनवलेले" },
  "open.text": {
    en: "All data sources are free and public: Landsat satellite imagery, WorldPop population, ESA WorldCover land cover, and OpenStreetMap. The parts that are estimates are labelled where they appear. This is a research prototype, not an official Nagpur Municipal Corporation tool.",
    hi: "सभी डेटा स्रोत मुफ़्त और सार्वजनिक हैं: Landsat उपग्रह चित्र, WorldPop जनसंख्या, ESA WorldCover भू-आवरण और OpenStreetMap। जो हिस्से अनुमान हैं, उन्हें वहीं चिह्नित किया गया है। यह एक शोध प्रोटोटाइप है, नागपुर महानगरपालिका का आधिकारिक साधन नहीं।",
    mr: "सर्व डेटा स्रोत मोफत आणि सार्वजनिक आहेत: Landsat उपग्रह प्रतिमा, WorldPop लोकसंख्या, ESA WorldCover भू-आच्छादन आणि OpenStreetMap. जे भाग अंदाज आहेत ते तिथेच नमूद केले आहेत. हा एक संशोधन नमुना आहे, नागपूर महानगरपालिकेचे अधिकृत साधन नाही.",
  },
  "open.link": { en: "Read the data and method", hi: "डेटा और पद्धति पढ़ें", mr: "डेटा आणि पद्धत वाचा" },

  // -------------------------------------------------------------- dashboard --
  "dash.hint": {
    en: "Colours rank Nagpur's localities by heat priority. Click any one, on the map or in the list, to see its breakdown and suggested actions. Switch layers top-right.",
    hi: "रंग नागपुर के इलाकों को गर्मी की प्राथमिकता के अनुसार दिखाते हैं। विवरण और सुझाए गए कदम देखने के लिए नक्शे या सूची में किसी भी इलाके पर क्लिक करें। परतें ऊपर दाईं ओर बदलें।",
    mr: "रंग नागपूरच्या परिसरांना उष्णता प्राधान्यानुसार दाखवतात. तपशील आणि सुचवलेल्या कृती पाहण्यासाठी नकाशावर किंवा यादीत कोणत्याही परिसरावर क्लिक करा. स्तर वर उजवीकडे बदला.",
  },
  "dash.gotit": { en: "Got it", hi: "समझ गया", mr: "समजले" },

  "outlook.live": { en: "Live", hi: "लाइव", mr: "थेट" },
  "outlook.none": { en: "No heat alert", hi: "गर्मी की कोई चेतावनी नहीं", mr: "उष्णतेचा इशारा नाही" },
  "outlook.watch": { en: "Heat watch", hi: "गर्मी पर निगरानी", mr: "उष्णतेवर लक्ष" },
  "outlook.heat-wave": { en: "Heat wave", hi: "लू", mr: "उष्णतेची लाट" },
  "outlook.severe": { en: "Severe heat wave", hi: "भीषण लू", mr: "तीव्र उष्णतेची लाट" },
  "outlook.below": {
    en: "Highs stay below {t}°C through {day}.",
    hi: "{day} तक अधिकतम तापमान {t}°C से नीचे रहेगा।",
    mr: "{day} पर्यंत कमाल तापमान {t}°C च्या खाली राहील.",
  },
  "outlook.high": {
    en: "A high of {t}°C is forecast {day}.",
    hi: "{day}: अधिकतम {t}°C का अनुमान।",
    mr: "{day}: कमाल {t}°C चा अंदाज.",
  },
  "outlook.actfirst": { en: "Act first in", hi: "सबसे पहले यहाँ कदम उठाएँ", mr: "सर्वात आधी येथे कृती करा" },
  "outlook.how": { en: "How is this decided?", hi: "यह कैसे तय होता है?", mr: "हे कसे ठरते?" },
  "outlook.nowUnavailable": {
    en: "Temperature now is unavailable",
    hi: "अभी का तापमान उपलब्ध नहीं",
    mr: "आत्ताचे तापमान उपलब्ध नाही",
  },
  "day.today": { en: "Today", hi: "आज", mr: "आज" },
  "day.tomorrow": { en: "Tomorrow", hi: "कल", mr: "उद्या" },

  "list.title": {
    en: "{n} localities, ranked by heat priority",
    hi: "{n} इलाके, गर्मी की प्राथमिकता के क्रम में",
    mr: "{n} परिसर, उष्णता प्राधान्याच्या क्रमाने",
  },
  "list.sub": {
    en: "Click a locality, here or on the map, to open its full profile.",
    hi: "पूरा विवरण खोलने के लिए यहाँ या नक्शे पर किसी इलाके पर क्लिक करें।",
    mr: "पूर्ण तपशील उघडण्यासाठी येथे किंवा नकाशावर परिसरावर क्लिक करा.",
  },
  "list.search": { en: "Find a locality…", hi: "इलाका खोजें…", mr: "परिसर शोधा…" },

  "layer.hvi": { en: "Heat vulnerability", hi: "गर्मी संवेदनशीलता", mr: "उष्णता संवेदनशीलता" },
  "layer.hvi_grid": { en: "Heat grid", hi: "गर्मी ग्रिड", mr: "उष्णता ग्रिड" },
  "layer.plantability": { en: "Plantability", hi: "वृक्षारोपण योग्यता", mr: "वृक्षलागवड योग्यता" },
  "layer.ndvi_change": { en: "Green-cover change", hi: "हरियाली में बदलाव", mr: "हिरवळीतील बदल" },
  "layer.heat_change": { en: "Getting hotter", hi: "बढ़ती गर्मी", mr: "वाढती उष्णता" },

  "places.title": { en: "Places", hi: "स्थान", mr: "ठिकाणे" },
  "places.hospital": { en: "Hospitals", hi: "अस्पताल", mr: "रुग्णालये" },
  "places.school": { en: "Schools", hi: "स्कूल", mr: "शाळा" },
  "places.bus_stop": { en: "Bus stops", hi: "बस स्टॉप", mr: "बस थांबे" },
  "places.market": { en: "Markets", hi: "बाज़ार", mr: "बाजार" },

  // ---------------------------------------------------------------- planner --
  "band.Critical": { en: "Critical", hi: "अति गंभीर", mr: "अति गंभीर" },
  "band.High": { en: "High", hi: "उच्च", mr: "उच्च" },
  "band.Moderate": { en: "Moderate", hi: "मध्यम", mr: "मध्यम" },
  "band.Lower": { en: "Lower", hi: "कम", mr: "कमी" },
  "planner.priority": { en: "{level} priority", hi: "{level} प्राथमिकता", mr: "{level} प्राधान्य" },
  "planner.score": { en: "Intervention priority score", hi: "हस्तक्षेप प्राथमिकता अंक", mr: "हस्तक्षेप प्राधान्य गुण" },
  "planner.tab.why": { en: "Why this zone?", hi: "यह इलाका क्यों?", mr: "हा परिसर का?" },
  "planner.tab.ai": { en: "AI Explainer", hi: "AI व्याख्या", mr: "AI स्पष्टीकरण" },
  "planner.tab.whatif": { en: "What if?", hi: "अगर ऐसा हो?", mr: "असे केले तर?" },
  "planner.tab.actions": { en: "Actions", hi: "कदम", mr: "कृती" },
  "planner.compare": { en: "Compare with city average", hi: "शहर के औसत से तुलना करें", mr: "शहराच्या सरासरीशी तुलना करा" },
  "planner.brief": { en: "Download brief", hi: "सार डाउनलोड करें", mr: "सारांश डाउनलोड करा" },
  "planner.explain": { en: "Explain with AI", hi: "AI से समझें", mr: "AI कडून समजून घ्या" },
  "planner.analysing": { en: "Analysing...", hi: "विश्लेषण हो रहा है...", mr: "विश्लेषण सुरू आहे..." },
  "planner.aiNote": {
    en: "Generated text. It restates the numbers above and can be wrong; the numbers are the record.",
    hi: "यह AI द्वारा लिखा गया पाठ है। यह ऊपर के आँकड़ों को दोहराता है और गलत हो सकता है; आँकड़े ही प्रमाण हैं।",
    mr: "हा AI ने लिहिलेला मजकूर आहे. तो वरील आकडे पुन्हा सांगतो आणि चुकीचा असू शकतो; आकडेच प्रमाण आहेत.",
  },
  "actions.people": { en: "For people, this hot season", hi: "लोगों के लिए, इस गर्मी में", mr: "लोकांसाठी, या उन्हाळ्यात" },

  "action.water.title": { en: "Drinking-water points", hi: "पीने के पानी की व्यवस्था", mr: "पिण्याच्या पाण्याची सोय" },
  "action.water.text": {
    en: "Set up free drinking-water points at markets, bus stops and labour pick-up points for the hot months.",
    hi: "गर्मी के महीनों में बाज़ारों, बस स्टॉप और मज़दूर नाकों पर मुफ़्त पीने के पानी की व्यवस्था करें।",
    mr: "उन्हाळ्याच्या महिन्यांत बाजार, बस थांबे आणि मजूर नाक्यांवर मोफत पिण्याच्या पाण्याची सोय करा.",
  },
  "action.shade.title": { en: "Shade where people wait", hi: "जहाँ लोग रुकते हैं वहाँ छाया", mr: "लोक थांबतात तिथे सावली" },
  "action.shade.text": {
    en: "Add shade structures at bus stops, market lanes and school gates, where people stand in the open.",
    hi: "बस स्टॉप, बाज़ार की गलियों और स्कूल के गेट पर छाया की व्यवस्था करें, जहाँ लोग खुले में खड़े रहते हैं।",
    mr: "बस थांबे, बाजारातील गल्ल्या आणि शाळेच्या फाटकांवर सावलीची सोय करा, जिथे लोक उघड्यावर उभे राहतात.",
  },
  "action.work-hours.title": { en: "Midday work advisory", hi: "दोपहर के काम पर सलाह", mr: "दुपारच्या कामाबाबत सूचना" },
  "action.work-hours.text": {
    en: "Advise contractors and employers to move outdoor work away from noon to 4 pm, with rest breaks in shade.",
    hi: "ठेकेदारों और नियोक्ताओं को सलाह दें कि बाहरी काम दोपहर 12 से 4 बजे के बीच न कराएँ और छाया में विश्राम दें।",
    mr: "कंत्राटदार आणि मालकांना सूचना द्या की बाहेरचे काम दुपारी 12 ते 4 दरम्यान टाळावे आणि सावलीत विश्रांती द्यावी.",
  },
  "action.outreach.title": { en: "Outreach priority", hi: "स्वास्थ्य सेवा में प्राथमिकता", mr: "आरोग्य सेवेत प्राधान्य" },
  "action.outreach.text": {
    en: "Send health workers here first during heat alerts, and stock oral rehydration salts at the nearest clinic.",
    hi: "गर्मी की चेतावनी के दौरान स्वास्थ्य कर्मियों को सबसे पहले यहाँ भेजें और नज़दीकी क्लिनिक में ओआरएस का भंडार रखें।",
    mr: "उष्णतेच्या इशाऱ्यावेळी आरोग्य कर्मचाऱ्यांना सर्वात आधी येथे पाठवा आणि जवळच्या दवाखान्यात ओआरएसचा साठा ठेवा.",
  },
  "action.cool-room.title": { en: "A public cool room", hi: "सार्वजनिक शीतल कक्ष", mr: "सार्वजनिक शीतल कक्ष" },
  "action.cool-room.text": {
    en: "Keep a school, community hall or library open as a cool room on heat-alert days.",
    hi: "गर्मी की चेतावनी वाले दिनों में किसी स्कूल, सामुदायिक भवन या पुस्तकालय को शीतल कक्ष के रूप में खुला रखें।",
    mr: "उष्णतेच्या इशाऱ्याच्या दिवशी एखादी शाळा, समाजमंदिर किंवा वाचनालय शीतल कक्ष म्हणून खुले ठेवा.",
  },
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;

export function hasString(key: string): key is StringKey {
  return key in STRINGS;
}

/** The label for `key` in `lang`, with `{name}` placeholders filled from `vars`. */
export function translate(lang: Lang, key: StringKey, vars?: Record<string, string | number>): string {
  const entry: Entry = STRINGS[key];
  let text = entry[lang] || entry.en;
  if (vars) for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
  return text;
}

export const STRING_KEYS = Object.keys(STRINGS) as StringKey[];

/** The raw entry, for the test that checks every language is filled in. */
export function entryOf(key: StringKey): Entry {
  return STRINGS[key];
}
