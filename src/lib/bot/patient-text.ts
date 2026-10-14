/**
 * Every question and option the patient sees, in English, Hindi and Assamese.
 * Times, dates, names and the prescription PDF stay as they are.
 * WhatsApp limits (checked in patient-text.test.ts): button 20, list title 24,
 * list description 72, list button 20 characters.
 * Assamese uses ৰ / ৱ — have a native speaker review before real patients see it.
 */
export type Lang = "en" | "hi" | "as";
export const LANGS: Lang[] = ["en", "hi", "as"];
export const LANG_NAME: Record<Lang, string> = {
  en: "English",
  hi: "हिन्दी",
  as: "অসমীয়া",
};

type Row = { title: string; description: string };
export type Text = {
  back: string;
  skip: string;
  menuBody: (clinic: string) => string;
  menuButton: string;
  book: Row;
  mine: Row;
  cancel: Row;
  rx: Row;
  chat: Row;
  language: Row;
  chatOn: string;
  noToday: string;
  todayHead: string;
  status: Record<"CONFIRMED" | "CANCELLED" | "COMPLETED", string>;
  askNameAge: string;
  askAge: string;
  badAge: string;
  askGender: string;
  gender: Record<"M" | "F" | "O", string>;
  askArea: string;
  welcomeBack: (name: string) => string;
  yesName: (name: string) => string;
  notTaking: (doctor: string) => string;
  period: Record<"morning" | "afternoon" | "evening", string>;
  noSlots: string;
  whichPart: string;
  typeBack: string;
  slotsBody: (period: string) => string;
  chooseTime: string;
  laterTimes: string;
  justTaken: string;
  reason: string;
  confirmed: (doctor: string, clinic: string, when: string) => string;
  noConfirmed: string;
  whichCancel: string;
  selectAppt: string;
  cancelReason: string;
  cancelled: string;
  bookAgain: string;
  menu: string;
  yourRx: string;
  chooseVisit: string;
  rxCaption: (when: string, doctor: string) => string;
};

export const TEXT: Record<Lang, Text> = {
  en: {
    back: "◀ Back",
    skip: "Skip",
    menuBody: (clinic) => `👋 Welcome to ${clinic}. What would you like to do?`,
    menuButton: "Choose an option",
    book: {
      title: "Book appointment",
      description: "Pick a time to see the doctor today",
    },
    mine: {
      title: "My appointments",
      description: "See your booking for today",
    },
    cancel: {
      title: "Cancel appointment",
      description: "Cancel your booking for today",
    },
    rx: {
      title: "My prescriptions",
      description: "Get the prescription PDF from a past visit",
    },
    chat: {
      title: "Normal chat",
      description: "Not booking? Chat as usual, the bot stays quiet",
    },
    language: {
      title: "Change language",
      description: "English · हिन्दी · অসমীয়া",
    },
    chatOn:
      "Okay, the bot will stay quiet. Chat as usual. Type /book any time to book an appointment.",
    noToday: "No appointments today.",
    todayHead: "Today:",
    status: {
      CONFIRMED: "Confirmed",
      CANCELLED: "Cancelled",
      COMPLETED: "Completed",
    },
    askNameAge:
      "Sure! Send the patient's full name and age, like: Ramesh Kumar, 45",
    askAge: "And the patient's age?",
    badAge: "Please send the age as a number, like 45.",
    askGender: "Patient's gender?",
    gender: { M: "Male", F: "Female", O: "Other" },
    askArea: "Which area or locality? (optional — type it, or tap Skip)",
    welcomeBack: (n) =>
      `Welcome back! Your last visit was booked for "${n}". Tap below to reuse that name, or type a different patient's name.`,
    yesName: (n) => `Yes, ${n}`,
    notTaking: (d) =>
      `Sorry, ${d} isn't taking bookings today. Please try again tomorrow.`,
    period: { morning: "Morning", afternoon: "Afternoon", evening: "Evening" },
    noSlots: "Sorry, no slots are left today.",
    whichPart: "Which part of today works for you?",
    typeBack: '\n\nType "back" to change the name.',
    slotsBody: (p) => `${p} slots today. Pick a time:`,
    chooseTime: "Choose a time",
    laterTimes: "Later times",
    justTaken: "Sorry, that time was just taken. Please pick another.",
    reason:
      "Got it. Any specific concern or reason for the visit? (optional — type it, or tap Skip)",
    confirmed: (d, clinic, when) =>
      `You're confirmed with ${d} at ${clinic}.\n\n📅 ${when}\n\nReply "cancel" any time to cancel this appointment.`,
    noConfirmed: "You have no confirmed appointments today.",
    whichCancel: "Which appointment do you want to cancel?",
    selectAppt: "Select appointment",
    cancelReason:
      "Got it. Any reason for cancelling? (optional — type it, or tap Skip)",
    cancelled: "Your appointment has been cancelled.",
    bookAgain: "Book again",
    menu: "Menu",
    yourRx: "Your prescriptions:",
    chooseVisit: "Choose a visit",
    rxCaption: (when, d) =>
      `Prescription from your visit on ${when} with ${d}.`,
  },
  hi: {
    back: "◀ वापस",
    skip: "छोड़ें",
    menuBody: (clinic) => `👋 ${clinic} में आपका स्वागत है। आप क्या करना चाहेंगे?`,
    menuButton: "विकल्प चुनें",
    book: {
      title: "अपॉइंटमेंट बुक करें",
      description: "आज डॉक्टर से मिलने का समय चुनें",
    },
    mine: {
      title: "मेरी अपॉइंटमेंट",
      description: "आज की अपनी बुकिंग देखें",
    },
    cancel: {
      title: "अपॉइंटमेंट रद्द करें",
      description: "आज की अपनी बुकिंग रद्द करें",
    },
    rx: {
      title: "मेरे पर्चे",
      description: "पिछली विज़िट का पर्चा (PDF) पाएं",
    },
    chat: {
      title: "सामान्य बातचीत",
      description: "बुकिंग नहीं करनी? आम तरह बात करें, बॉट चुप रहेगा",
    },
    language: {
      title: "भाषा बदलें",
      description: "English · हिन्दी · অসমীয়া",
    },
    chatOn:
      "ठीक है, बॉट अब चुप रहेगा। आम तरह बात करें। अपॉइंटमेंट बुक करने के लिए कभी भी /book लिखें।",
    noToday: "आज कोई अपॉइंटमेंट नहीं है।",
    todayHead: "आज:",
    status: { CONFIRMED: "पक्की", CANCELLED: "रद्द", COMPLETED: "पूरी हुई" },
    askNameAge: "ज़रूर! मरीज़ का पूरा नाम और उम्र भेजें, जैसे: रमेश कुमार, 45",
    askAge: "और मरीज़ की उम्र?",
    badAge: "कृपया उम्र अंकों में भेजें, जैसे 45।",
    askGender: "मरीज़ का लिंग?",
    gender: { M: "पुरुष", F: "महिला", O: "अन्य" },
    askArea: "कौन-सा इलाका या मोहल्ला? (वैकल्पिक — लिखें, या छोड़ें पर टैप करें)",
    welcomeBack: (n) =>
      `फिर से स्वागत है! पिछली बार बुकिंग "${n}" के नाम से हुई थी। वही नाम रखने के लिए नीचे टैप करें, या किसी और मरीज़ का नाम लिखें।`,
    yesName: (n) => `हाँ, ${n}`,
    notTaking: (d) =>
      `माफ़ कीजिए, ${d} आज बुकिंग नहीं ले रहे हैं। कृपया कल फिर कोशिश करें।`,
    period: { morning: "सुबह", afternoon: "दोपहर", evening: "शाम" },
    noSlots: "माफ़ कीजिए, आज कोई समय खाली नहीं है।",
    whichPart: "आज किस समय आना ठीक रहेगा?",
    typeBack: '\n\nनाम बदलने के लिए "back" लिखें।',
    slotsBody: (p) => `आज ${p} के खाली समय। समय चुनें:`,
    chooseTime: "समय चुनें",
    laterTimes: "बाद के समय",
    justTaken: "माफ़ कीजिए, यह समय अभी-अभी बुक हो गया। कृपया दूसरा समय चुनें।",
    reason:
      "ठीक है। आने की कोई खास वजह या परेशानी? (वैकल्पिक — लिखें, या छोड़ें पर टैप करें)",
    confirmed: (d, clinic, when) =>
      `${clinic} में ${d} के साथ आपकी अपॉइंटमेंट पक्की हो गई है।\n\n📅 ${when}\n\nरद्द करने के लिए कभी भी "cancel" लिखें।`,
    noConfirmed: "आज आपकी कोई पक्की अपॉइंटमेंट नहीं है।",
    whichCancel: "कौन-सी अपॉइंटमेंट रद्द करनी है?",
    selectAppt: "अपॉइंटमेंट चुनें",
    cancelReason: "ठीक है। रद्द करने की कोई वजह? (वैकल्पिक — लिखें, या छोड़ें पर टैप करें)",
    cancelled: "आपकी अपॉइंटमेंट रद्द कर दी गई है।",
    bookAgain: "फिर से बुक करें",
    menu: "मेनू",
    yourRx: "आपके पर्चे:",
    chooseVisit: "विज़िट चुनें",
    rxCaption: (when, d) => `${when} की विज़िट का पर्चा, ${d} के साथ।`,
  },
  as: {
    back: "◀ উভতি যাওক",
    skip: "এৰক",
    menuBody: (clinic) => `👋 ${clinic}লৈ আপোনাক স্বাগতম। আপুনি কি কৰিব বিচাৰে?`,
    menuButton: "বিকল্প বাছক",
    book: {
      title: "এপইণ্টমেণ্ট বুক কৰক",
      description: "আজি চিকিৎসকক লগ পাবলৈ সময় বাছক",
    },
    mine: {
      title: "মোৰ এপইণ্টমেণ্ট",
      description: "আজিৰ আপোনাৰ বুকিং চাওক",
    },
    cancel: {
      title: "এপইণ্টমেণ্ট বাতিল কৰক",
      description: "আজিৰ আপোনাৰ বুকিং বাতিল কৰক",
    },
    rx: {
      title: "মোৰ প্ৰেছক্ৰিপচন",
      description: "আগৰ ভিজিটৰ প্ৰেছক্ৰিপচন (PDF) লওক",
    },
    chat: {
      title: "সাধাৰণ কথা-বতৰা",
      description: "বুকিং নকৰে? সদায়ৰ দৰে কথা পাতক, বটে একো নকয়",
    },
    language: {
      title: "ভাষা সলনি কৰক",
      description: "English · हिन्दी · অসমীয়া",
    },
    chatOn:
      "ঠিক আছে, বটে এতিয়া একো নকয়। সদায়ৰ দৰে কথা পাতক। এপইণ্টমেণ্ট বুক কৰিবলৈ যিকোনো সময়তে /book লিখক।",
    noToday: "আজি কোনো এপইণ্টমেণ্ট নাই।",
    todayHead: "আজি:",
    status: { CONFIRMED: "নিশ্চিত", CANCELLED: "বাতিল", COMPLETED: "সম্পূৰ্ণ" },
    askNameAge: "নিশ্চয়! ৰোগীৰ সম্পূৰ্ণ নাম আৰু বয়স পঠিয়াওক, যেনে: ৰমেশ কুমাৰ, 45",
    askAge: "আৰু ৰোগীৰ বয়স?",
    badAge: "অনুগ্ৰহ কৰি বয়স সংখ্যাত পঠিয়াওক, যেনে 45।",
    askGender: "ৰোগীৰ লিংগ?",
    gender: { M: "পুৰুষ", F: "মহিলা", O: "অন্য" },
    askArea: "কোন অঞ্চল বা ঠাই? (ইচ্ছাধীন — লিখক, নাইবা এৰক টিপক)",
    welcomeBack: (n) =>
      `পুনৰ স্বাগতম! যোৱাবাৰ বুকিং "${n}"ৰ নামত হৈছিল। সেই নামেই ৰাখিবলৈ তলত টিপক, নাইবা আন ৰোগীৰ নাম লিখক।`,
    yesName: (n) => `হয়, ${n}`,
    notTaking: (d) =>
      `দুঃখিত, ${d}এ আজি বুকিং লোৱা নাই। অনুগ্ৰহ কৰি কাইলৈ পুনৰ চেষ্টা কৰক।`,
    period: { morning: "ৰাতিপুৱা", afternoon: "দুপৰীয়া", evening: "সন্ধিয়া" },
    noSlots: "দুঃখিত, আজি কোনো সময় খালী নাই।",
    whichPart: "আজি কোন সময়ত আহিলে আপোনাৰ সুবিধা হ'ব?",
    typeBack: '\n\nনাম সলনি কৰিবলৈ "back" লিখক।',
    slotsBody: (p) => `আজিৰ ${p}ৰ খালী সময়। সময় বাছক:`,
    chooseTime: "সময় বাছক",
    laterTimes: "পিছৰ সময়",
    justTaken: "দুঃখিত, এই সময়টো এইমাত্ৰ বুক হৈ গ'ল। অনুগ্ৰহ কৰি আন এটা বাছক।",
    reason:
      "ঠিক আছে। আহাৰ কোনো বিশেষ কাৰণ বা সমস্যা আছে নেকি? (ইচ্ছাধীন — লিখক, নাইবা এৰক টিপক)",
    confirmed: (d, clinic, when) =>
      `${clinic}ত ${d}ৰ সৈতে আপোনাৰ এপইণ্টমেণ্ট নিশ্চিত হ'ল।\n\n📅 ${when}\n\nবাতিল কৰিবলৈ যিকোনো সময়তে "cancel" লিখক।`,
    noConfirmed: "আজি আপোনাৰ কোনো নিশ্চিত এপইণ্টমেণ্ট নাই।",
    whichCancel: "কোনটো এপইণ্টমেণ্ট বাতিল কৰিব বিচাৰে?",
    selectAppt: "এপইণ্টমেণ্ট বাছক",
    cancelReason:
      "ঠিক আছে। বাতিল কৰাৰ কোনো কাৰণ আছে নেকি? (ইচ্ছাধীন — লিখক, নাইবা এৰক টিপক)",
    cancelled: "আপোনাৰ এপইণ্টমেণ্ট বাতিল কৰা হ'ল।",
    bookAgain: "পুনৰ বুক কৰক",
    menu: "মেনু",
    yourRx: "আপোনাৰ প্ৰেছক্ৰিপচন:",
    chooseVisit: "ভিজিট বাছক",
    rxCaption: (when, d) => `${when}ৰ ভিজিটৰ প্ৰেছক্ৰিপচন, ${d}ৰ সৈতে।`,
  },
};

/** The first message of every conversation: one tap picks the language. */
export const LANG_PICKER = (clinic: string) =>
  `🙏 ${clinic}\n\nChoose your language\nभाषा चुनें\nভাষা বাছক`;

/** Typed words in any language that mean the same as a tap. */
const WORDS: Record<string, string> = {
  "/book": "book",
  book: "book",
  बुक: "book",
  বুক: "book",
  menu: "menu",
  hi: "menu",
  मेनू: "menu",
  মেনু: "menu",
  back: "back",
  वापस: "back",
  উভতি: "back",
  cancel: "cancel",
  रद्द: "cancel",
  বাতিল: "cancel",
  language: "language",
  lang: "language",
  भाषा: "language",
  ভাষা: "language",
};
export const canon = (i: string | null) => (i ? (WORDS[i] ?? i) : i);

/** A typed answer to the language question: a number, a name, or the script used. */
export function typedLang(text: string): Lang | null {
  const t = text.trim().toLowerCase();
  if (t === "1" || t === "english" || t === "eng") return "en";
  if (t === "2" || t === "hindi" || t === "हिन्दी" || t === "हिंदी") return "hi";
  if (t === "3" || t === "assamese" || t === "অসমীয়া") return "as";
  if (/[ऀ-ॿ]/.test(t)) return "hi"; // Devanagari
  if (/[ঀ-৿]/.test(t)) return "as"; // Assamese/Bengali script
  return null;
}
