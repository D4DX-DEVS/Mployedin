/**
 * The curated location fixes applied by fix-location-data.mjs, in order.
 *
 * Names are matched loosely (accents, hyphens and apostrophes ignored), so
 * "Al Qatif" finds "Al Qaţīf". A fix whose source is already gone is skipped,
 * which is what makes a second run a no-op.
 *
 * Sources: the official admin divisions (ISO 3166-2, GCC governorate laws —
 * Bahrain dropped its Central Governorate in 2014, Oman split Al Batinah and
 * Ash Sharqiyah in 2011) and the towns each country's recruiters ask for.
 */

/** Countries whose names are cleaned and whose duplicates are merged. */
export const TARGET_COUNTRIES = ["IN", "SA", "AE", "QA", "KW", "BH", "OM", "GB", "PS", "EG", "JO", "LB", "IQ", "SY", "YE"];

const SA = "SA";
const AE = "AE";
const QA = "QA";
const KW = "KW";
const BH = "BH";
const OM = "OM";
const GB = "GB";
const PS = "PS";
const IN = "IN";

// ─── Saudi Arabia ───────────────────────────────────────────────────────────

const SAUDI = [
  { op: "renameState", country: SA, state: "Al-Qassim", to: "Al Qassim" },

  // Al Bahah carried a copy of Makkah's villages (Jeddah and Taif among them).
  { op: "dedupeAgainst", country: SA, from: "Al Bahah", against: "Makkah", keep: ["Al Bahah", "Hajrah", "Al Mindak"], why: "copy of a Makkah town" },
  { op: "renameCity", country: SA, state: "Al Bahah", city: "Al Mindak", to: "Al Mandaq" },
  { op: "mergeCity", country: SA, state: "Asir", city: "Al Bahah", into: "Al Bahah", intoState: "Al Bahah", why: "Al Bahah town is in Al Bahah region" },
  { op: "mergeCity", country: SA, state: "Asir", city: "Al Mindak", into: "Al Mandaq", intoState: "Al Bahah", why: "Al Mandaq is in Al Bahah region" },
  { op: "mergeCity", country: SA, state: "Asir", city: "Hajrah", into: "Hajrah", intoState: "Al Bahah", why: "Hajrah is in Al Bahah region" },
  { op: "addCities", country: SA, state: "Al Bahah", names: ["Baljurashi", "Al Makhwah", "Qilwah", "Al Aqiq", "Al Qura", "Bani Hassan", "Ghamid Al Zinad"] },

  // Asir towns that were also filed under Makkah.
  { op: "dedupeAgainst", country: SA, from: "Makkah", against: "Asir", why: "an Asir town" },
  { op: "moveCity", country: SA, state: "Makkah", city: "Al Birk", to: "Asir", why: "Al Birk governorate is in Asir" },
  { op: "renameCities", country: SA, state: "Asir", names: [["Qalat Bishah", "Bisha"], ["An Nimas", "Al Namas"], ["Sabt Al Alayah", "Sabt Al Alayah (Balqarn)"]] },
  { op: "addCities", country: SA, state: "Asir", names: ["Muhayil", "Sarat Abidah", "Ahad Rafidah", "Tathlith", "Rijal Almaa", "Dhahran Al Janub", "Bariq"] },

  // Al Qassim towns that were also filed under Al Madinah.
  { op: "dedupeAgainst", country: SA, from: "Al Madinah", against: "Al Qassim", why: "an Al Qassim town" },
  { op: "moveCity", country: SA, state: "Al Qassim", city: "Tanumah", to: "Asir", why: "Tanomah is in Asir" },
  { op: "renameCities", country: SA, state: "Al Madinah", names: [["Al-Ula", "Al Ula"]] },
  { op: "addCities", country: SA, state: "Al Madinah", names: ["Khaybar", "Al Hinakiyah", "Mahd Al Dhahab", "Wadi Al Fura", "Al Ais"] },

  // Al Qassim: Northern Borders towns misfiled here, Buraidah twice.
  { op: "dedupeAgainst", country: SA, from: "Al Qassim", against: "Northern Borders", why: "a Northern Borders town" },
  { op: "renameCities", country: SA, state: "Al Qassim", names: [["Buraydah", "Buraidah"]] },
  { op: "addCities", country: SA, state: "Al Qassim", names: ["Unaizah", "Al Badai", "Riyadh Al Khabra", "Al Asyah", "Uyun Al Jiwa", "Ash Shimasiyah", "An Nabhaniyah", "Uqlat As Suqur"] },

  // Eastern Province: Ha'il region towns misfiled here.
  { op: "dedupeAgainst", country: SA, from: "Eastern Province", against: "Ha'il", why: "a Ha'il region town" },
  { op: "renameCities", country: SA, state: "Eastern Province", names: [
    ["Al Hufuf", "Al Hofuf (Al Ahsa)"], ["Al Qatif", "Qatif"], ["Al Khafji", "Khafji"], ["Al Jubayl", "Jubail"], ["Khobar", "Al Khobar"],
    ["Hafar Al-Batin", "Hafar Al Batin"], ["Tarut", "Tarout"], ["Sayhat", "Saihat"], ["Nariyah", "Al Nairiyah"],
  ] },
  { op: "addCities", country: SA, state: "Eastern Province", names: ["Ras Tanura", "Thuqbah", "Al Uyun", "Qaryat Al Ulya", "Anak"] },

  { op: "addCities", country: SA, state: "Ha'il", names: ["Al Ghazalah", "Ash Shinan", "Al Hait", "As Sulaimi"] },

  { op: "renameCities", country: SA, state: "Jizan", names: [["Samitah", "Samtah"]] },
  { op: "addCities", country: SA, state: "Jizan", names: ["Baish", "Ahad Al Masarihah", "Damad", "Al Aridah", "Al Edabi", "Al Dayer", "Al Tuwal", "Fifa", "Al Harth"] },

  { op: "mergeCity", country: SA, state: "Makkah", city: "City Ghran", into: "Ghran", why: "same place" },
  { op: "renameCities", country: SA, state: "Makkah", names: [["Ta'if", "Taif"]] },
  { op: "addCities", country: SA, state: "Makkah", names: ["Al Qunfudhah", "Al Lith", "Al Kamil", "Khulais", "Al Khurmah", "Ranyah", "Adham", "Al Ardiyat", "Maysan", "Bahrah", "King Abdullah Economic City"] },

  // Najran was filed under Riyadh too.
  { op: "dedupeAgainst", country: SA, from: "Riyadh", against: "Najran", why: "Najran is its own region" },
  { op: "addCities", country: SA, state: "Najran", names: ["Sharurah", "Habuna", "Yadamah", "Badr Al Janub", "Thar", "Khubash", "Al Kharkhir"] },

  { op: "addCities", country: SA, state: "Northern Borders", names: ["Rafha", "Al Uwayqilah"] },

  { op: "renameCities", country: SA, state: "Riyadh", names: [["Ad Dawadimi", "Dawadmi"], ["Layla", "Layla (Al Aflaj)"]] },
  { op: "addCities", country: SA, state: "Riyadh", names: [
    "Al Majmaah", "Shaqra", "Al Quwayiyah", "Wadi Ad Dawasir", "Hotat Bani Tamim", "Al Ghat", "Rumah", "Thadiq",
    "Huraymila", "Al Muzahimiyah", "Durma", "Al Hariq", "Hotat Sudair",
  ] },

  { op: "addCities", country: SA, state: "Tabuk", names: ["Tayma", "Haql", "Al Bad", "NEOM", "Sharma"] },

  { op: "mergeCity", country: SA, state: "Al Jawf", city: "Tubarjal", into: "Tabarjal", why: "same town" },
  { op: "addCities", country: SA, state: "Al Jawf", names: ["Dumat Al Jandal"] },

  { op: "stateArabic", country: SA, names: {
    Riyadh: "الرياض", Makkah: "مكة المكرمة", "Al Madinah": "المدينة المنورة", "Al Qassim": "القصيم", "Eastern Province": "المنطقة الشرقية",
    Asir: "عسير", Tabuk: "تبوك", "Ha'il": "حائل", "Northern Borders": "الحدود الشمالية", Jizan: "جازان", Najran: "نجران",
    "Al Bahah": "الباحة", "Al Jawf": "الجوف",
  } },
];

// ─── United Arab Emirates ───────────────────────────────────────────────────

const UAE = [
  { op: "renameState", country: AE, state: "Abu Dhabi Emirate", to: "Abu Dhabi" },
  { op: "renameState", country: AE, state: "Ajman Emirate", to: "Ajman" },
  { op: "renameState", country: AE, state: "Sharjah Emirate", to: "Sharjah" },
  { op: "renameState", country: AE, state: "Ras al-Khaimah", to: "Ras Al Khaimah" },
  { op: "renameState", country: AE, state: "Umm al-Quwain", to: "Umm Al Quwain" },

  { op: "renameCities", country: AE, state: "Abu Dhabi", names: [
    ["Abu Dhabi Municipality", "Abu Dhabi"], ["Abu Dhabi Island and Internal Islands City", "Abu Dhabi"],
    ["Al Ain Municipality", "Al Ain"], ["Al Ain City", "Al Ain"],
    ["Khalifah A City", "Khalifa City"], ["Ar Ruways", "Ruwais"], ["Zayed City", "Madinat Zayed"],
    ["Bani Yas City", "Baniyas"], ["Al Shamkhah City", "Al Shamkha"], ["Muzayri", "Liwa"],
  ] },
  { op: "addCities", country: AE, state: "Abu Dhabi", names: [
    "Ghayathi", "Al Mirfa", "Al Sila", "Delma Island", "Mohammed Bin Zayed City", "Al Wathba", "Al Samha", "Al Rahba",
    "Al Shahama", "Yas Island", "Saadiyat Island", "Al Reem Island", "Al Raha", "Al Shawamekh",
  ] },

  { op: "addCities", country: AE, state: "Dubai", names: [
    "Deira", "Bur Dubai", "Jebel Ali", "Hatta", "Al Quoz", "Al Barsha", "Dubai Marina", "Jumeirah", "Jumeirah Lake Towers",
    "Jumeirah Village Circle", "Business Bay", "Downtown Dubai", "Dubai Silicon Oasis", "Dubai Investments Park", "Al Qusais",
    "Al Karama", "Al Nahda", "Mirdif", "International City", "Dubai South", "Dubai Internet City", "Dubai Media City",
    "Al Warqa", "Muhaisnah", "Al Satwa", "Al Rashidiya",
  ] },

  { op: "renameCities", country: AE, state: "Sharjah", names: [["Adh Dhayd", "Al Dhaid"], ["Dhaid", "Al Dhaid"], ["Khawr Fakkan", "Khor Fakkan"]] },
  { op: "moveCity", country: AE, state: "Sharjah", city: "Murbah", to: "Fujairah", why: "Murbah is on the Fujairah coast" },
  { op: "addCities", country: AE, state: "Sharjah", names: ["Muwaileh", "Al Majaz", "Al Qasimia", "Al Khan", "Al Taawun", "Al Nahda", "Sharjah Industrial Area", "University City"] },

  { op: "renameCities", country: AE, state: "Ajman", names: [["Ajman City", "Ajman"]] },
  { op: "addCities", country: AE, state: "Ajman", names: ["Al Jurf", "Al Nuaimiya", "Al Rashidiya", "Al Hamidiyah", "Al Rawda", "Al Zorah"] },

  { op: "renameCities", country: AE, state: "Fujairah", names: [
    ["Al Fujairah Municipality", "Fujairah"], ["Al Fujairah City", "Fujairah"],
    ["Dibba Al Fujairah Municipality", "Dibba Al Fujairah"], ["Dibba Al-Fujairah", "Dibba Al Fujairah"],
    ["Reef Al Fujairah City", "Reef Al Fujairah"],
  ] },
  { op: "mergeCity", country: AE, state: "Fujairah", city: "Dibba Al-Hisn", into: "Dibba Al Hesn", intoState: "Sharjah", why: "Dibba Al Hisn belongs to Sharjah" },
  { op: "addCities", country: AE, state: "Fujairah", names: ["Masafi", "Qidfa", "Al Bidyah", "Al Siji"] },

  { op: "renameCities", country: AE, state: "Ras Al Khaimah", names: [["Ras Al Khaimah City", "Ras Al Khaimah"]] },
  { op: "addCities", country: AE, state: "Ras Al Khaimah", names: ["Al Jazirah Al Hamra", "Al Rams", "Khatt", "Digdaga", "Al Ghail", "Shaam", "Al Dhait", "Al Marjan Island"] },

  { op: "renameCities", country: AE, state: "Umm Al Quwain", names: [["Umm AL Quwain", "Umm Al Quwain"], ["Umm Al Quwain City", "Umm Al Quwain"]] },
  { op: "addCities", country: AE, state: "Umm Al Quwain", names: ["Falaj Al Mualla", "Al Salamah", "Al Rafaah"] },

  { op: "stateArabic", country: AE, names: {
    "Abu Dhabi": "أبوظبي", Dubai: "دبي", Sharjah: "الشارقة", Ajman: "عجمان", "Umm Al Quwain": "أم القيوين",
    "Ras Al Khaimah": "رأس الخيمة", Fujairah: "الفجيرة",
  } },
];

// ─── Qatar ──────────────────────────────────────────────────────────────────

const QATAR = [
  { op: "renameState", country: QA, state: "Al Rayyan Municipality", to: "Al Rayyan" },
  { op: "renameState", country: QA, state: "Umm Salal Municipality", to: "Umm Salal" },
  { op: "renameState", country: QA, state: "Al-Shahaniya", to: "Al Shahaniya" },
  { op: "renameState", country: QA, state: "Madinat ash Shamal", to: "Al Shamal" },

  { op: "renameCities", country: QA, state: "Al Rayyan", names: [["Ar Rayyan", "Al Rayyan"]] },
  { op: "renameCities", country: QA, state: "Al Khor", names: [["Al Khawr", "Al Khor"]] },
  { op: "renameCities", country: QA, state: "Al Wakrah", names: [["Musayid", "Mesaieed"], ["Al Wukayr", "Al Wukair"]] },
  { op: "renameCities", country: QA, state: "Al Shahaniya", names: [["Ash Shihaniyah", "Al Shahaniya"]] },
  { op: "renameCities", country: QA, state: "Al Shamal", names: [["Madinat ash Shamal", "Madinat Al Shamal"], ["Ar Ruways", "Al Ruwais"]] },

  { op: "addCities", country: QA, state: "Al Daayen", names: ["Lusail", "Umm Qarn", "Simaisma", "Al Kharaitiyat", "Rawdat Al Hamama"] },
  { op: "addCities", country: QA, state: "Al Khor", names: ["Ras Laffan", "Al Dhakhira"] },
  { op: "addCities", country: QA, state: "Doha", names: ["West Bay", "The Pearl", "Al Sadd", "Al Waab", "Abu Hamour", "Al Hilal", "Old Airport", "Najma", "Bin Mahmoud", "Al Mansoura", "Musheireb"] },
  { op: "addCities", country: QA, state: "Al Rayyan", names: ["Industrial Area", "Muaither", "Al Gharrafa", "Ain Khaled", "Al Aziziya", "Education City", "Al Luqta", "Mebaireek"] },
  { op: "addCities", country: QA, state: "Umm Salal", names: ["Umm Salal Ali"] },
  { op: "addCities", country: QA, state: "Al Wakrah", names: ["Al Mashaf", "Barwa City"] },

  { op: "stateArabic", country: QA, names: {
    Doha: "الدوحة", "Al Rayyan": "الريان", "Al Wakrah": "الوكرة", "Al Khor": "الخور", "Al Shamal": "الشمال",
    "Umm Salal": "أم صلال", "Al Daayen": "الضعاين", "Al Shahaniya": "الشحانية",
  } },
];

// ─── Kuwait ─────────────────────────────────────────────────────────────────

const KUWAIT = [
  // Al Zour is on the southern coast, in Al Ahmadi.
  { op: "moveCity", country: KW, state: "Capital Governorate", city: "Az Zawr", to: "Al Ahmadi Governorate", why: "Al Zour is in Al Ahmadi" },
  { op: "renameCities", country: KW, state: "Al Ahmadi Governorate", names: [["Az Zawr", "Al Zour"]] },
  { op: "renameCities", country: KW, state: "Al Ahmadi Governorate", names: [["Al Fahahil", "Fahaheel"], ["Al Manqaf", "Mangaf"], ["Al Mahbulah", "Mahboula"], ["Al Fintas", "Fintas"], ["Ar Riqqah", "Riqqa"]] },
  { op: "renameCities", country: KW, state: "Hawalli Governorate", names: [["As Salimiyah", "Salmiya"], ["Ar Rumaythiyah", "Rumaithiya"]] },
  { op: "renameCities", country: KW, state: "Mubarak Al-Kabeer Governorate", names: [["Sabah as Salim", "Sabah Al Salem"], ["Al Funaytis", "Funaitees"]] },
  { op: "renameCities", country: KW, state: "Al Farwaniyah Governorate", names: [["Janub as Surrah", "South Surra"]] },
  { op: "renameCities", country: KW, state: "Capital Governorate", names: [["Ar Rabiyah", "Rabiya"], ["Ash Shamiyah", "Shamiya"], ["Ad Dasmah", "Dasma"]] },

  { op: "addCities", country: KW, state: "Capital Governorate", names: ["Shuwaikh", "Sharq", "Kaifan", "Sulaibikhat", "Mirqab", "Qibla"] },
  { op: "addCities", country: KW, state: "Hawalli Governorate", names: ["Jabriya", "Mishref", "Al Shaab", "Al Siddiq", "Al Zahra"] },
  { op: "addCities", country: KW, state: "Al Farwaniyah Governorate", names: ["Jleeb Al Shuyoukh", "Khaitan", "Abraq Khaitan", "Al Ardiya", "Al Rai", "Al Andalus", "Abdullah Al Mubarak"] },
  { op: "addCities", country: KW, state: "Al Jahra Governorate", names: ["Sulaibiya", "Saad Al Abdullah", "Al Qasr", "Taima", "Al Naseem", "Al Abdali"] },
  { op: "addCities", country: KW, state: "Al Ahmadi Governorate", names: ["Abu Halifa", "Sabahiya", "Mina Abdullah", "Egaila", "Fahad Al Ahmad", "Sabah Al Ahmad City", "Al Khiran"] },
  { op: "addCities", country: KW, state: "Mubarak Al-Kabeer Governorate", names: ["Qurain", "Adan", "Al Qusour", "Mubarak Al Kabeer", "Messila"] },

  { op: "stateArabic", country: KW, names: {
    "Capital Governorate": "محافظة العاصمة", "Hawalli Governorate": "محافظة حولي", "Al Farwaniyah Governorate": "محافظة الفروانية",
    "Al Ahmadi Governorate": "محافظة الأحمدي", "Al Jahra Governorate": "محافظة الجهراء", "Mubarak Al-Kabeer Governorate": "محافظة مبارك الكبير",
  } },
];

// ─── Bahrain ────────────────────────────────────────────────────────────────

const BAHRAIN = [
  // Central Governorate was abolished in 2014; Hamad Town went to Northern.
  { op: "mergeState", country: BH, from: "Central Governorate", into: "Northern Governorate", why: "abolished in 2014" },
  { op: "renameCities", country: BH, state: "Northern Governorate", names: [["Madinat Hamad", "Hamad Town"]] },
  { op: "renameCities", country: BH, state: "Southern Governorate", names: [["Madinat Isa", "Isa Town"], ["Ar Rifa", "Riffa"], ["Dar Kulayb", "Dar Kulaib"]] },
  { op: "renameCities", country: BH, state: "Capital Governorate", names: [["Jidd Hafs", "Jidhafs"], ["Sitrah", "Sitra"]] },
  { op: "renameCities", country: BH, state: "Muharraq Governorate", names: [["Al Hadd", "Hidd"], ["Al Muharraq", "Muharraq"]] },

  { op: "addCities", country: BH, state: "Capital Governorate", names: ["Juffair", "Seef", "Adliya", "Hoora", "Gudaibiya", "Tubli", "Salmaniya", "Sanabis", "Diplomatic Area", "Umm Al Hassam"] },
  { op: "addCities", country: BH, state: "Northern Governorate", names: ["Budaiya", "Saar", "Janabiya", "Hamala", "Diraz", "Bani Jamra", "Jasra", "Karzakan", "Malkiya", "A'ali"] },
  { op: "addCities", country: BH, state: "Southern Governorate", names: ["Awali", "Askar", "Jaw", "Zallaq", "Sakhir", "Durrat Al Bahrain"] },
  { op: "addCities", country: BH, state: "Muharraq Governorate", names: ["Busaiteen", "Arad", "Galali", "Amwaj Islands", "Diyar Al Muharraq", "Samaheej", "Dair"] },

  { op: "stateArabic", country: BH, names: {
    "Capital Governorate": "محافظة العاصمة", "Muharraq Governorate": "محافظة المحرق",
    "Northern Governorate": "المحافظة الشمالية", "Southern Governorate": "المحافظة الجنوبية",
  } },
];

// ─── Oman ───────────────────────────────────────────────────────────────────

const OMAN = [
  // The 2011 split: the old regions' towns belong to the new South governorates.
  { op: "mergeState", country: OM, from: "Al Batinah Region", into: "Al Batinah South Governorate", why: "split in 2011" },
  { op: "mergeState", country: OM, from: "Ash Sharqiyah Region", into: "Ash Sharqiyah South Governorate", why: "split in 2011" },

  { op: "renameCities", country: OM, state: "Al Batinah South Governorate", names: [["Bayt al Awabi", "Al Awabi"]] },
  { op: "renameCities", country: OM, state: "Muscat Governorate", names: [["Bawshar", "Bausher"]] },
  { op: "renameCities", country: OM, state: "Al Wusta Governorate", names: [["Hayma", "Haima"]] },
  { op: "renameCities", country: OM, state: "Al Buraimi Governorate", names: [["Al Buraymi", "Al Buraimi"]] },
  { op: "renameCities", country: OM, state: "Musandam Governorate", names: [["Dib Dibba", "Dibba Al Bayah"], ["Madha al Jadidah", "Madha"]] },
  { op: "renameCities", country: OM, state: "Ad Dakhiliyah Governorate", names: [["Sufalat Samail", "Samail"]] },
  { op: "renameCities", country: OM, state: "Al Batinah North Governorate", names: [["As Suwayq", "Suwaiq"]] },

  { op: "addCities", country: OM, state: "Muscat Governorate", names: ["Muttrah", "Ruwi", "Al Amerat", "Qurayyat", "Al Khuwair", "Al Ghubrah", "Al Khoudh", "Madinat Sultan Qaboos", "Al Mawaleh", "Al Hail", "Ghala", "Al Azaiba", "Qurum", "Wadi Kabir"] },
  { op: "addCities", country: OM, state: "Dhofar Governorate", names: ["Thumrait", "Mirbat", "Taqah", "Sadah", "Rakhyut", "Shalim", "Dhalkut", "Al Mazyunah"] },
  { op: "addCities", country: OM, state: "Al Wusta Governorate", names: ["Duqm", "Mahout", "Al Jazir"] },
  { op: "addCities", country: OM, state: "Ash Sharqiyah North Governorate", names: ["Ibra", "Al Mudhaibi", "Bidiyah", "Al Qabil", "Wadi Bani Khalid", "Dima Wa Al Taiyyin"] },
  { op: "addCities", country: OM, state: "Ash Sharqiyah South Governorate", names: ["Jalan Bani Bu Ali", "Jalan Bani Bu Hassan", "Al Kamil Wal Wafi", "Masirah"] },
  { op: "addCities", country: OM, state: "Al Batinah South Governorate", names: ["Al Musanaah", "Nakhal", "Wadi Al Maawil"] },
  { op: "addCities", country: OM, state: "Ad Dakhiliyah Governorate", names: ["Al Hamra", "Manah"] },
  { op: "addCities", country: OM, state: "Ad Dhahirah Governorate", names: ["Dhank"] },
  { op: "addCities", country: OM, state: "Al Buraimi Governorate", names: ["Mahdah", "As Sunaynah"] },
  { op: "addCities", country: OM, state: "Musandam Governorate", names: ["Bukha"] },

  { op: "stateArabic", country: OM, names: {
    "Muscat Governorate": "محافظة مسقط", "Dhofar Governorate": "محافظة ظفار", "Musandam Governorate": "محافظة مسندم",
    "Al Buraimi Governorate": "محافظة البريمي", "Ad Dakhiliyah Governorate": "محافظة الداخلية",
    "Al Batinah North Governorate": "محافظة شمال الباطنة", "Al Batinah South Governorate": "محافظة جنوب الباطنة",
    "Ash Sharqiyah North Governorate": "محافظة شمال الشرقية", "Ash Sharqiyah South Governorate": "محافظة جنوب الشرقية",
    "Ad Dhahirah Governorate": "محافظة الظاهرة", "Al Wusta Governorate": "محافظة الوسطى",
  } },
];

// ─── Palestine (ISO 3166-2:PS governorates) ─────────────────────────────────

const PALESTINE_STATES = [
  ["Jenin", "جنين", ["Jenin", "Qabatiya", "Ya'bad", "Arraba"]],
  ["Tubas", "طوباس", ["Tubas", "Tammun", "Aqqaba"]],
  ["Tulkarm", "طولكرم", ["Tulkarm", "Anabta", "Bal'a"]],
  ["Nablus", "نابلس", ["Nablus", "Huwara", "Beita"]],
  ["Qalqilya", "قلقيلية", ["Qalqilya", "Azzun", "Habla"]],
  ["Salfit", "سلفيت", ["Salfit", "Bidya", "Kifl Haris"]],
  ["Ramallah and Al-Bireh", "رام الله والبيرة", ["Ramallah", "Al-Bireh", "Birzeit", "Beitunia", "Rawabi"]],
  ["Jericho and Al Aghwar", "أريحا والأغوار", ["Jericho", "Al-Auja"]],
  ["Jerusalem", "القدس", ["Jerusalem", "Abu Dis", "Al-Eizariya", "Al-Ram", "Anata"]],
  ["Bethlehem", "بيت لحم", ["Bethlehem", "Beit Jala", "Beit Sahour", "Al-Khader"]],
  ["Hebron", "الخليل", ["Hebron", "Dura", "Halhul", "Yatta", "Bani Na'im", "Beit Ummar"]],
  ["North Gaza", "شمال غزة", ["Jabalia", "Beit Lahia", "Beit Hanoun"]],
  ["Gaza", "غزة", ["Gaza City"]],
  ["Deir al-Balah", "دير البلح", ["Deir al-Balah", "Nuseirat", "Al-Bureij", "Al-Maghazi", "Az-Zawayda"]],
  ["Khan Yunis", "خان يونس", ["Khan Yunis", "Bani Suheila", "Abasan al-Kabira"]],
  ["Rafah", "رفح", ["Rafah"]],
];

const PALESTINE = PALESTINE_STATES.flatMap(([name, nameAr, cities]) => [
  { op: "addState", country: PS, name, nameAr },
  { op: "addCities", country: PS, state: name, names: cities },
]);

// ─── United Kingdom ─────────────────────────────────────────────────────────

// States become the four nations; the council areas (all empty) fold in.
const SCOTLAND_AREAS = [
  "Aberdeen", "Aberdeenshire", "Angus", "Argyll and Bute", "Clackmannanshire", "Dumfries and Galloway", "Dundee", "East Ayrshire",
  "East Dunbartonshire", "East Lothian", "East Renfrewshire", "Edinburgh", "Falkirk", "Fife", "Glasgow", "Highland", "Inverclyde",
  "Midlothian", "Moray", "North Ayrshire", "North Lanarkshire", "Orkney Islands", "Outer Hebrides", "Perth and Kinross",
  "Renfrewshire", "Scottish Borders", "Shetland Islands", "South Ayrshire", "South Lanarkshire", "Stirling",
  "West Dunbartonshire", "West Lothian",
];
const WALES_AREAS = [
  "Blaenau Gwent County Borough", "Bridgend County Borough", "Caerphilly County Borough", "Carmarthenshire", "Ceredigion",
  "City and County of Cardiff", "City and County of Swansea", "Conwy County Borough", "Denbighshire", "Flintshire", "Gwynedd",
  "Isle of Anglesey", "Merthyr Tydfil County Borough", "Monmouthshire", "Neath Port Talbot County Borough", "Newport",
  "Pembrokeshire", "Powys", "Rhondda Cynon Taf", "Torfaen", "Vale of Glamorgan", "Wrexham County Borough",
];
const NORTHERN_IRELAND_AREAS = [
  "Antrim", "Antrim and Newtownabbey", "Ards", "Ards and North Down", "Armagh City and District Council",
  "Armagh, Banbridge and Craigavon", "Ballymena Borough", "Ballymoney", "Banbridge", "Belfast district",
  "Carrickfergus Borough Council", "Castlereagh", "Causeway Coast and Glens", "Coleraine Borough Council",
  "Cookstown District Council", "Craigavon Borough Council", "Derry City and Strabane", "Derry City Council",
  "Down District Council", "Dungannon and South Tyrone Borough Council", "Fermanagh and Omagh", "Fermanagh District Council",
  "Larne Borough Council", "Limavady Borough Council", "Lisburn and Castlereagh", "Lisburn City Council",
  "Magherafelt District Council", "Mid and East Antrim", "Mid Ulster", "Moyle District Council",
  "Newry and Mourne District Council", "Newry, Mourne and Down", "Newtownabbey Borough Council",
  "North Down Borough Council", "Omagh District Council", "Strabane District Council",
];

const UK = [
  // Northern Ireland's towns were filed under North Yorkshire.
  // Guarded by Belfast so a real North Yorkshire state, if one is ever added, is never emptied.
  { op: "moveAllCities", country: GB, from: "North Yorkshire", to: "Northern Ireland", guardCity: "Belfast", why: "a Northern Ireland town" },
  { op: "collapseStates", country: GB, default: "England", drop: ["United Kingdom", "Ascension Island", "Saint Helena"], into: {
    England: [], Scotland: SCOTLAND_AREAS, Wales: WALES_AREAS, "Northern Ireland": NORTHERN_IRELAND_AREAS,
  } },

  // Council and county areas that were listed as towns.
  { op: "areaCities", country: GB, state: "England", entries: [
    ["Borough of Bolton", "Bolton"], ["Borough of Bury", "Bury"], ["Borough of Oldham", "Oldham"], ["Borough of Rochdale", "Rochdale"],
    ["Borough of Stockport", "Stockport"], ["Borough of Swindon", "Swindon"], ["Borough of Wigan", "Wigan"],
    ["City and Borough of Birmingham", "Birmingham"], ["City and Borough of Leeds", "Leeds"], ["City and Borough of Salford", "Salford"],
    ["City and Borough of Wakefield", "Wakefield"], ["City of Bristol", "Bristol"], ["City of Kingston upon Hull", "Kingston upon Hull"],
    ["City of Leicester", "Leicester"], ["City of Westminster", "Westminster"], ["City of York", "York"],
    ["Borough of Halton", null], ["Borough of North Tyneside", null], ["Borough of Tameside", null], ["Borough of Thurrock", null],
    ["Borough of Torbay", null], ["Buckinghamshire", null], ["Cambridgeshire", null], ["Central Bedfordshire", null],
    ["Cheshire East", null], ["Cheshire West and Chester", null], ["County Durham", null], ["Derbyshire", null],
    ["District of Rutland", null], ["East Riding of Yorkshire", null], ["Gloucestershire", null], ["Hampshire", null],
    ["Herefordshire", null], ["Hertfordshire", null], ["Lancashire", null], ["Leicestershire", null], ["Lincolnshire", null],
    ["Metropolitan Borough of Wirral", null], ["North East Lincolnshire", null], ["North Lincolnshire", null],
    ["North Yorkshire", null], ["Northamptonshire", null], ["Nottinghamshire", null], ["Oxfordshire", null],
    ["Royal Borough of Windsor and Maidenhead", null], ["Shropshire", null], ["South Gloucestershire", null],
    ["Staffordshire", null], ["Warwickshire", null], ["West Berkshire", null], ["Wiltshire", null], ["Worcestershire", null],
  ] },
  { op: "areaCities", country: GB, state: "Scotland", entries: [
    ["Aberdeen City", "Aberdeen"], ["City of Edinburgh", "Edinburgh"], ["Dundee City", "Dundee"], ["Glasgow City", "Glasgow"],
    ["Aberdeenshire", null], ["Clackmannanshire", null], ["East Ayrshire", null], ["East Dunbartonshire", null], ["East Lothian", null],
    ["East Renfrewshire", null], ["North Ayrshire", null], ["North Lanarkshire", null], ["Orkney Islands", null], ["Renfrewshire", null],
    ["Shetland Islands", null], ["South Ayrshire", null], ["South Lanarkshire", null], ["West Dunbartonshire", null], ["West Lothian", null],
  ] },
  { op: "areaCities", country: GB, state: "Wales", entries: [
    ["Caerphilly County Borough", "Caerphilly"], ["City and County of Swansea", "Swansea"], ["Merthyr Tydfil County Borough", "Merthyr Tydfil"],
    ["County of Ceredigion", null], ["County of Flintshire", null], ["Carmarthenshire", null], ["Denbighshire", null],
    ["Monmouthshire", null], ["Pembrokeshire", null], ["Torfaen County Borough", null],
  ] },
  { op: "areaCities", country: GB, state: "Northern Ireland", entries: [
    ["City of Belfast", "Belfast"], ["Londonderry County Borough", "Derry"],
    ["Antrim and Newtownabbey", null], ["Ards and North Down", null], ["Armagh City Banbridge and Craigavon", null],
    ["Causeway Coast and Glens", null], ["Derry City and Strabane", null], ["Fermanagh and Omagh", null],
    ["Lisburn and Castlereagh", null], ["Mid Ulster", null], ["Mid and East Antrim", null], ["Newry Mourne and Down", null],
  ] },

  { op: "stateArabic", country: GB, names: { England: "إنجلترا", Scotland: "اسكتلندا", Wales: "ويلز", "Northern Ireland": "أيرلندا الشمالية" } },
];

// ─── India ──────────────────────────────────────────────────────────────────

const INDIA = [
  // Kerala: one spelling per town, the current official one.
  { op: "renameCities", country: IN, state: "Kerala", names: [
    ["Alwaye", "Aluva"], ["Perumpavur", "Perumbavoor"], ["Muvattupula", "Muvattupuzha"], ["Pattanamtitta", "Pathanamthitta"],
    ["Palghat", "Palakkad"], ["Shertallai", "Cherthala"], ["Kalpatta", "Kalpetta"], ["Kannangad", "Kanhangad"],
    ["Kayankulam", "Kayamkulam"], ["Tellicherry", "Thalassery"], ["Badagara", "Vadakara"], ["Kizhake Chalakudi", "Chalakudy"],
    ["Cochin", "Kochi"], ["Manjeshvar", "Manjeshwar"], ["Pappinissheri", "Pappinisseri"], ["Chelakara", "Chelakkara"],
    ["Ferokh", "Feroke"], ["Payyannur", "Payyanur"], ["Talipparamba", "Taliparamba"], ["Ottappalam", "Ottapalam"],
    ["Mannarakkat", "Mannarkkad"], ["Changanacheri", "Changanassery"], ["Kotamangalam", "Kothamangalam"], ["Adur", "Adoor"],
  ] },
  { op: "mergeCity", country: IN, state: "Kerala", city: "Mahe", into: "Mahe", intoState: "Puducherry", why: "Mahe is part of Puducherry" },
  { op: "addCities", country: IN, state: "Kerala", names: [
    "Perinthalmanna", "Kottakkal", "Nilambur", "Tirurangadi", "Kondotty", "Valanchery", "Edappal", "Kuttippuram", "Tanur",
    "Parappanangadi", "Areekode", "Wandoor", "Thodupuzha", "Kattappana", "Koyilandy", "Thamarassery", "Mukkam",
    "Kottarakkara", "Karunagappally", "Chavakkad", "Pala", "Ettumanoor", "Pandalam", "Mananthavady", "Sulthan Bathery",
    "Iritty", "Alathur", "Vadakkencherry", "Haripad", "Ambalappuzha", "Kazhakkoottam", "Kanjirappally",
  ] },

  { op: "renameCities", country: IN, state: "Chhattisgarh", names: [["Raj Nandgaon", "Rajnandgaon"]] },
  { op: "renameCities", country: IN, state: "Uttar Pradesh", names: [["Prayagraj (Allahabad)", "Prayagraj"], ["Allahabad", "Prayagraj"]] },
  { op: "renameCities", country: IN, state: "Odisha", names: [["Bhubaneshwar", "Bhubaneswar"]] },
  { op: "renameCities", country: IN, state: "Andhra Pradesh", names: [["Govindapuram (Chilakaluripet, Guntur)", "Govindapuram (Guntur)"]] },
  { op: "renameCities", country: IN, state: "Uttar Pradesh", names: [["Kurebhar (saidkhanpur)", "Kurebhar (Saidkhanpur)"]] },
];

// ─── Other Arab countries: the cities recruiters look for by name ───────────

const OTHER_ARAB = [
  { op: "renameCities", country: "EG", state: "Dakahlia", names: [["Al Mansurah", "Mansoura"]] },
  { op: "renameCities", country: "EG", state: "Gharbia", names: [["Tanda", "Tanta"], ["Al Mahallah al Kubra", "El Mahalla El Kubra"]] },
  { op: "renameCities", country: "EG", state: "Giza", names: [["Madinat Sittah Uktubar", "6th of October City"]] },
  { op: "renameCities", country: "EG", state: "Cairo", names: [["Halwan", "Helwan"]] },
  { op: "addCities", country: "EG", state: "Cairo", names: ["Nasr City", "Heliopolis", "Maadi", "Shubra", "New Administrative Capital", "Shorouk City", "Badr City"] },
  { op: "addCities", country: "EG", state: "Giza", names: ["Sheikh Zayed City"] },
  { op: "addCities", country: "EG", state: "Alexandria", names: ["Borg El Arab"] },

  { op: "renameCities", country: "JO", state: "Karak Governorate", names: [["Karak City", "Karak"]] },
  { op: "renameCities", country: "JO", state: "Jerash Governorate", names: [["Jarash", "Jerash"]] },

  { op: "renameCities", country: "LB", state: "Mount Lebanon Governorate", names: [["Jbail", "Byblos"]] },
  { op: "mergeCity", country: "LB", state: "Mount Lebanon Governorate", city: "Caza de Baabda", into: "Baabda", why: "the Baabda district" },

  { op: "renameCities", country: "IQ", state: "Dohuk Governorate", names: [["Dihok", "Duhok"], ["Zaxo", "Zakho"]] },

  { op: "renameCities", country: "YE", state: "Ta'izz Governorate", names: [["Ta'izz", "Taiz"]] },
  // Sanaa city is its own governorate (Amanat Al Asimah), stored here as "Sana'a".
  { op: "moveCity", country: "YE", state: "Sana'a Governorate", city: "Sanaa", to: "Sana'a", why: "the capital is its own governorate" },
];

export const FIXES = [...SAUDI, ...UAE, ...QATAR, ...KUWAIT, ...BAHRAIN, ...OMAN, ...PALESTINE, ...UK, ...INDIA, ...OTHER_ARAB];
