/**
 * Seed script — Countries, States, Cities
 * Targeted: India, all Gulf countries, UK, US, Malaysia + 10 popular migration destinations.
 *
 * Usage:  node scripts/seed-location-data.mjs
 *
 * Safe to re-run: uses insertMany with ordered:false to skip duplicates.
 *
 * Target countries (20):
 *   IN  India
 *   AE  United Arab Emirates    SA  Saudi Arabia    QA  Qatar
 *   KW  Kuwait                  BH  Bahrain         OM  Oman
 *   GB  United Kingdom          US  United States   CA  Canada
 *   AU  Australia               NZ  New Zealand     IE  Ireland
 *   DE  Germany                 FR  France          NL  Netherlands
 *   MY  Malaysia                SG  Singapore       PH  Philippines
 *   ZA  South Africa
 */

// ─── Target country ISO codes ─────────────────────────────────────────────────
const TARGET_CODES = new Set([
  "IN",                         // India
  "AE","SA","QA","KW","BH","OM",// Gulf
  "GB","US","CA","AU","NZ","IE",// English-speaking destinations
  "DE","FR","NL",               // Europe
  "MY","SG","PH",               // Asia
  "ZA",                         // Africa
]);

import mongoose from "mongoose";
import {
  Country as CSCCountry,
  State as CSCState,
  City as CSCCity,
} from "country-state-city";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://devd4dx:ssbrXQOYyQ3jA99K@developer.bakh5qk.mongodb.net/mployedin?retryWrites=true&w=majority&appName=Developer";

// ─── Currency code → { name, symbol } ────────────────────────────────────────
const CURRENCY_MAP = {
  AFN:{n:"Afghani",s:"؋"},ALL:{n:"Lek",s:"L"},DZD:{n:"Algerian Dinar",s:"دج"},
  USD:{n:"US Dollar",s:"$"},AOA:{n:"Kwanza",s:"Kz"},XCD:{n:"East Caribbean Dollar",s:"$"},
  ARS:{n:"Peso",s:"$"},AMD:{n:"Dram",s:"֏"},AWG:{n:"Aruban Florin",s:"ƒ"},
  AUD:{n:"Australian Dollar",s:"$"},AZN:{n:"Azerbaijani Manat",s:"₼"},
  BSD:{n:"Bahamian Dollar",s:"$"},BHD:{n:"Bahraini Dinar",s:".د.ب"},
  BDT:{n:"Bangladeshi Taka",s:"৳"},BBD:{n:"Barbadian Dollar",s:"$"},
  BYN:{n:"Belarusian Ruble",s:"Br"},BZD:{n:"Belize Dollar",s:"$"},
  XOF:{n:"West African CFA Franc",s:"Fr"},BMD:{n:"Bermudian Dollar",s:"$"},
  BTN:{n:"Bhutanese Ngultrum",s:"Nu"},BOB:{n:"Boliviano",s:"Bs."},
  BAM:{n:"Bosnia-Herzegovina Convertible Mark",s:"KM"},BWP:{n:"Botswana Pula",s:"P"},
  BRL:{n:"Brazilian Real",s:"R$"},BND:{n:"Brunei Dollar",s:"$"},
  BGN:{n:"Bulgarian Lev",s:"лв"},BIF:{n:"Burundian Franc",s:"Fr"},
  CVE:{n:"Cape Verdean Escudo",s:"$"},KHR:{n:"Cambodian Riel",s:"៛"},
  XAF:{n:"Central African CFA Franc",s:"Fr"},CAD:{n:"Canadian Dollar",s:"$"},
  KYD:{n:"Cayman Islands Dollar",s:"$"},CLP:{n:"Chilean Peso",s:"$"},
  CNY:{n:"Chinese Yuan",s:"¥"},COP:{n:"Colombian Peso",s:"$"},
  KMF:{n:"Comorian Franc",s:"Fr"},CDF:{n:"Congolese Franc",s:"Fr"},
  NZD:{n:"New Zealand Dollar",s:"$"},CRC:{n:"Costa Rican Colón",s:"₡"},
  HRK:{n:"Croatian Kuna",s:"kn"},CUP:{n:"Cuban Peso",s:"$"},
  CZK:{n:"Czech Koruna",s:"Kč"},DKK:{n:"Danish Krone",s:"kr"},
  DJF:{n:"Djiboutian Franc",s:"Fr"},DOP:{n:"Dominican Peso",s:"$"},
  EGP:{n:"Egyptian Pound",s:"£"},SVC:{n:"Salvadoran Colón",s:"₡"},
  ERN:{n:"Eritrean Nakfa",s:"Nfk"},ETB:{n:"Ethiopian Birr",s:"Br"},
  EUR:{n:"Euro",s:"€"},FKP:{n:"Falkland Islands Pound",s:"£"},
  FJD:{n:"Fijian Dollar",s:"$"},GMD:{n:"Gambian Dalasi",s:"D"},
  GEL:{n:"Georgian Lari",s:"₾"},GHS:{n:"Ghanaian Cedi",s:"₵"},
  GIP:{n:"Gibraltar Pound",s:"£"},GTQ:{n:"Guatemalan Quetzal",s:"Q"},
  GNF:{n:"Guinean Franc",s:"Fr"},GYD:{n:"Guyanese Dollar",s:"$"},
  HTG:{n:"Haitian Gourde",s:"G"},HNL:{n:"Honduran Lempira",s:"L"},
  HKD:{n:"Hong Kong Dollar",s:"$"},HUF:{n:"Hungarian Forint",s:"Ft"},
  ISK:{n:"Icelandic Króna",s:"kr"},INR:{n:"Indian Rupee",s:"₹"},
  IDR:{n:"Indonesian Rupiah",s:"Rp"},IRR:{n:"Iranian Rial",s:"﷼"},
  IQD:{n:"Iraqi Dinar",s:"ع.د"},ILS:{n:"Israeli New Shekel",s:"₪"},
  JMD:{n:"Jamaican Dollar",s:"$"},JPY:{n:"Japanese Yen",s:"¥"},
  JOD:{n:"Jordanian Dinar",s:"د.ا"},KZT:{n:"Kazakhstani Tenge",s:"₸"},
  KES:{n:"Kenyan Shilling",s:"Ksh"},KPW:{n:"North Korean Won",s:"₩"},
  KRW:{n:"South Korean Won",s:"₩"},KWD:{n:"Kuwaiti Dinar",s:"د.ك"},
  KGS:{n:"Kyrgyzstani Som",s:"с"},LAK:{n:"Lao Kip",s:"₭"},
  LBP:{n:"Lebanese Pound",s:"ل.ل"},LSL:{n:"Lesotho Loti",s:"L"},
  LRD:{n:"Liberian Dollar",s:"$"},LYD:{n:"Libyan Dinar",s:"ل.د"},
  CHF:{n:"Swiss Franc",s:"Fr"},MOP:{n:"Macanese Pataca",s:"P"},
  MKD:{n:"Macedonian Denar",s:"ден"},MGA:{n:"Malagasy Ariary",s:"Ar"},
  MWK:{n:"Malawian Kwacha",s:"MK"},MYR:{n:"Malaysian Ringgit",s:"RM"},
  MVR:{n:"Maldivian Rufiyaa",s:"Rf"},MRU:{n:"Mauritanian Ouguiya",s:"UM"},
  MUR:{n:"Mauritian Rupee",s:"₨"},MXN:{n:"Mexican Peso",s:"$"},
  MDL:{n:"Moldovan Leu",s:"L"},MNT:{n:"Mongolian Tögrög",s:"₮"},
  MAD:{n:"Moroccan Dirham",s:"د.م."},MZN:{n:"Mozambican Metical",s:"MT"},
  MMK:{n:"Myanmar Kyat",s:"K"},NAD:{n:"Namibian Dollar",s:"$"},
  NPR:{n:"Nepalese Rupee",s:"₨"},NIO:{n:"Nicaraguan Córdoba",s:"C$"},
  NGN:{n:"Nigerian Naira",s:"₦"},NOK:{n:"Norwegian Krone",s:"kr"},
  OMR:{n:"Omani Rial",s:"ر.ع."},PKR:{n:"Pakistani Rupee",s:"₨"},
  PAB:{n:"Panamanian Balboa",s:"B/."},PGK:{n:"Papua New Guinean Kina",s:"K"},
  PYG:{n:"Paraguayan Guaraní",s:"₲"},PEN:{n:"Peruvian Sol",s:"S/"},
  PHP:{n:"Philippine Peso",s:"₱"},PLN:{n:"Polish Złoty",s:"zł"},
  QAR:{n:"Qatari Riyal",s:"ر.ق"},RON:{n:"Romanian Leu",s:"lei"},
  RUB:{n:"Russian Ruble",s:"₽"},RWF:{n:"Rwandan Franc",s:"Fr"},
  SHP:{n:"Saint Helena Pound",s:"£"},WST:{n:"Samoan Tālā",s:"T"},
  STN:{n:"São Tomé Príncipe Dobra",s:"Db"},SAR:{n:"Saudi Riyal",s:"ر.س"},
  RSD:{n:"Serbian Dinar",s:"din"},SCR:{n:"Seychellois Rupee",s:"₨"},
  SLL:{n:"Sierra Leonean Leone",s:"Le"},SGD:{n:"Singapore Dollar",s:"$"},
  SBD:{n:"Solomon Islands Dollar",s:"$"},SOS:{n:"Somali Shilling",s:"Sh"},
  ZAR:{n:"South African Rand",s:"R"},SSP:{n:"South Sudanese Pound",s:"£"},
  LKR:{n:"Sri Lankan Rupee",s:"₨"},SDG:{n:"Sudanese Pound",s:"£"},
  SRD:{n:"Surinamese Dollar",s:"$"},SZL:{n:"Swazi Lilangeni",s:"L"},
  SEK:{n:"Swedish Krona",s:"kr"},SYP:{n:"Syrian Pound",s:"£"},
  TWD:{n:"New Taiwan Dollar",s:"$"},TJS:{n:"Tajikistani Somoni",s:"SM"},
  TZS:{n:"Tanzanian Shilling",s:"Sh"},THB:{n:"Thai Baht",s:"฿"},
  TOP:{n:"Tongan Paʻanga",s:"T$"},TTD:{n:"Trinidad and Tobago Dollar",s:"$"},
  TND:{n:"Tunisian Dinar",s:"د.ت"},TRY:{n:"Turkish Lira",s:"₺"},
  TMT:{n:"Turkmenistani Manat",s:"T"},UGX:{n:"Ugandan Shilling",s:"Sh"},
  UAH:{n:"Ukrainian Hryvnia",s:"₴"},AED:{n:"UAE Dirham",s:"د.إ"},
  GBP:{n:"British Pound Sterling",s:"£"},UYU:{n:"Uruguayan Peso",s:"$U"},
  UZS:{n:"Uzbekistani Som",s:"лв"},VUV:{n:"Vanuatu Vatu",s:"Vt"},
  VES:{n:"Venezuelan Bolívar Soberano",s:"Bs.S"},VND:{n:"Vietnamese Đồng",s:"₫"},
  YER:{n:"Yemeni Rial",s:"﷼"},ZMW:{n:"Zambian Kwacha",s:"ZK"},
  ZWL:{n:"Zimbabwean Dollar",s:"$"},XPF:{n:"CFP Franc",s:"Fr"},
  MRO:{n:"Mauritanian Ouguiya",s:"UM"},STD:{n:"São Tomé Príncipe Dobra",s:"Db"},
  VEF:{n:"Venezuelan Bolívar Fuerte",s:"Bs.F"},SLE:{n:"Sierra Leonean Leone",s:"Le"},
};

// ─── Arabic country name map (ISO-2 → Arabic) ─────────────────────────────────
const COUNTRY_AR = {
  AF:"أفغانستان",AL:"ألبانيا",DZ:"الجزائر",AS:"ساموا الأمريكية",AD:"أندورا",
  AO:"أنغولا",AI:"أنغيلا",AQ:"أنتاركتيكا",AG:"أنتيغوا وبربودا",AR:"الأرجنتين",
  AM:"أرمينيا",AW:"أروبا",AU:"أستراليا",AT:"النمسا",AZ:"أذربيجان",
  BS:"جزر البهاما",BH:"البحرين",BD:"بنغلاديش",BB:"بربادوس",BY:"روسيا البيضاء",
  BE:"بلجيكا",BZ:"بليز",BJ:"بنين",BM:"برمودا",BT:"بوتان",
  BO:"بوليفيا",BA:"البوسنة والهرسك",BW:"بوتسوانا",BR:"البرازيل",
  IO:"إقليم المحيط الهندي البريطاني",BN:"بروناي",BG:"بلغاريا",
  BF:"بوركينا فاسو",BI:"بوروندي",CV:"الرأس الأخضر",KH:"كمبوديا",
  CM:"الكاميرون",CA:"كندا",KY:"جزر كايمان",CF:"جمهورية أفريقيا الوسطى",
  TD:"تشاد",CL:"تشيلي",CN:"الصين",CX:"جزيرة كريسماس",CC:"جزر كوكوس",
  CO:"كولومبيا",KM:"جزر القمر",CG:"جمهورية الكونغو",
  CD:"جمهورية الكونغو الديمقراطية",CK:"جزر كوك",CR:"كوستاريكا",
  HR:"كرواتيا",CU:"كوبا",CY:"قبرص",CZ:"التشيك",DK:"الدنمارك",
  DJ:"جيبوتي",DM:"دومينيكا",DO:"جمهورية الدومينيكان",EC:"الإكوادور",
  EG:"مصر",SV:"السلفادور",GQ:"غينيا الاستوائية",ER:"إريتريا",
  EE:"إستونيا",SZ:"إسواتيني",ET:"إثيوبيا",FK:"جزر فوكلاند",
  FO:"جزر فارو",FJ:"فيجي",FI:"فنلندا",FR:"فرنسا",
  GF:"غويانا الفرنسية",PF:"بولينيزيا الفرنسية",TF:"أراضي فرنسا الجنوبية",
  GA:"الغابون",GM:"غامبيا",GE:"جورجيا",DE:"ألمانيا",GH:"غانا",
  GI:"جبل طارق",GR:"اليونان",GL:"غرينلاند",GD:"غرينادا",GP:"غوادلوب",
  GU:"غوام",GT:"غواتيمالا",GG:"غيرنزي",GN:"غينيا",GW:"غينيا بيساو",
  GY:"غيانا",HT:"هايتي",HN:"هندوراس",HK:"هونغ كونغ",HU:"هنغاريا",
  IS:"آيسلندا",IN:"الهند",ID:"إندونيسيا",IR:"إيران",IQ:"العراق",
  IE:"أيرلندا",IM:"جزيرة مان",IL:"إسرائيل",IT:"إيطاليا",JM:"جامايكا",
  JP:"اليابان",JE:"جيرسي",JO:"الأردن",KZ:"كازاخستان",KE:"كينيا",
  KI:"كيريباتي",KP:"كوريا الشمالية",KR:"كوريا الجنوبية",KW:"الكويت",
  KG:"قيرغيزستان",LA:"لاوس",LV:"لاتفيا",LB:"لبنان",LS:"ليسوتو",
  LR:"ليبيريا",LY:"ليبيا",LI:"ليختنشتاين",LT:"ليتوانيا",LU:"لوكسمبورغ",
  MO:"ماكاو",MG:"مدغشقر",MW:"مالاوي",MY:"ماليزيا",MV:"المالديف",
  ML:"مالي",MT:"مالطا",MH:"جزر مارشال",MQ:"مارتينيك",MR:"موريتانيا",
  MU:"موريشيوس",YT:"مايوت",MX:"المكسيك",FM:"ولايات ميكرونيزيا المتحدة",
  MD:"مولدوفا",MC:"موناكو",MN:"منغوليا",ME:"الجبل الأسود",MS:"مونتسيرات",
  MA:"المغرب",MZ:"موزمبيق",MM:"ميانمار",NA:"ناميبيا",NR:"ناورو",
  NP:"نيبال",NL:"هولندا",NC:"كاليدونيا الجديدة",NZ:"نيوزيلندا",
  NI:"نيكاراغوا",NE:"النيجر",NG:"نيجيريا",NU:"نيوي",NF:"جزيرة نورفولك",
  MK:"مقدونيا الشمالية",MP:"جزر ماريانا الشمالية",NO:"النرويج",
  OM:"سلطنة عمان",PK:"باكستان",PW:"بالاو",PS:"فلسطين",PA:"بنما",
  PG:"بابوا غينيا الجديدة",PY:"باراغواي",PE:"بيرو",PH:"الفلبين",
  PN:"جزر بيتكيرن",PL:"بولندا",PT:"البرتغال",PR:"بورتوريكو",QA:"قطر",
  RE:"ريونيون",RO:"رومانيا",RU:"روسيا",RW:"رواندا",BL:"سان بارتيلمي",
  SH:"سانت هيلينا",KN:"سانت كيتس ونيفيس",LC:"سانت لوسيا",MF:"سانت مارتن",
  PM:"سانت بيير وميكلون",VC:"سانت فينسنت والغرينادين",WS:"ساموا",
  SM:"سان مارينو",ST:"ساو تومي وبرينسيبي",SA:"المملكة العربية السعودية",
  SN:"السنغال",RS:"صربيا",SC:"سيشل",SL:"سيرا ليون",SG:"سنغافورة",
  SX:"سينت مارتن",SK:"سلوفاكيا",SI:"سلوفينيا",SB:"جزر سليمان",
  SO:"الصومال",ZA:"جنوب أفريقيا",GS:"جورجيا الجنوبية وجزر ساندويتش",
  SS:"جنوب السودان",ES:"إسبانيا",LK:"سريلانكا",SD:"السودان",
  SR:"سورينام",SJ:"سفالبارد ويان ماين",SE:"السويد",CH:"سويسرا",
  SY:"سوريا",TW:"تايوان",TJ:"طاجيكستان",TZ:"تنزانيا",TH:"تايلاند",
  TL:"تيمور الشرقية",TG:"توغو",TK:"توكيلاو",TO:"تونغا",
  TT:"ترينيداد وتوباغو",TN:"تونس",TR:"تركيا",TM:"تركمانستان",
  TC:"جزر تركس وكايكوس",TV:"توفالو",UG:"أوغندا",UA:"أوكرانيا",
  AE:"الإمارات العربية المتحدة",GB:"المملكة المتحدة",US:"الولايات المتحدة",
  UY:"أوروغواي",UZ:"أوزبكستان",VU:"فانواتو",VE:"فنزويلا",VN:"فيتنام",
  VG:"جزر العذراء البريطانية",VI:"جزر العذراء الأمريكية",WF:"واليس وفوتونا",
  EH:"الصحراء الغربية",YE:"اليمن",ZM:"زامبيا",ZW:"زيمبابوي",
  AX:"جزر أولاند",XK:"كوسوفو",CW:"كوراساو",BQ:"بونير وسينت إيستاتيوس وسابا",
};

// ─── Slugify ──────────────────────────────────────────────────────────────────
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Minimal Mongoose schemas ─────────────────────────────────────────────────
const CountrySchema = new mongoose.Schema(
  {
    name:{type:String,required:true},nameAr:{type:String,default:""},
    code:{type:String,required:true,unique:true,uppercase:true},
    phoneCode:{type:String,default:""},currency:{type:String,default:""},
    currencyCode:{type:String,default:""},currencySymbol:{type:String,default:""},
    thousandSeparator:{type:String,default:","},decimalSeparator:{type:String,default:"."},
    sortOrder:{type:Number,default:0},isActive:{type:Boolean,default:true},
  },
  {timestamps:true}
);
const StateSchema = new mongoose.Schema(
  {
    name:{type:String,required:true},nameAr:{type:String,default:""},
    countryId:{type:mongoose.Schema.Types.ObjectId,ref:"Country",required:true},
    slug:{type:String,required:true,unique:true},
    sortOrder:{type:Number,default:0},isActive:{type:Boolean,default:true},
  },
  {timestamps:true}
);
const CitySchema = new mongoose.Schema(
  {
    name:{type:String,required:true},nameAr:{type:String,default:""},
    stateId:{type:mongoose.Schema.Types.ObjectId,ref:"State",required:true},
    slug:{type:String,required:true,unique:true},
    sortOrder:{type:Number,default:0},isActive:{type:Boolean,default:true},
  },
  {timestamps:true}
);

const CountryModel = mongoose.models.Country || mongoose.model("Country", CountrySchema);
const StateModel   = mongoose.models.State   || mongoose.model("State",   StateSchema);
const CityModel    = mongoose.models.City    || mongoose.model("City",    CitySchema);

// ─── Batch insert ─────────────────────────────────────────────────────────────
async function batchInsert(Model, docs, batchSize=500) {
  let total = 0;
  for (let i=0; i<docs.length; i+=batchSize) {
    const batch = docs.slice(i, i+batchSize);
    try {
      const r = await Model.insertMany(batch, {ordered:false});
      total += r.length;
    } catch(e) {
      total += e.result?.nInserted ?? e.insertedDocs?.length ?? 0;
    }
    process.stdout.write(`\r  ${Model.modelName}: ${Math.min(i+batchSize,docs.length)}/${docs.length}`);
  }
  console.log(`  => ${total} inserted`);
}

// ─── Make a slug unique within a given Set ────────────────────────────────────
function uniqueSlug(base, suffix, usedSet) {
  let s = base;
  if (usedSet.has(s)) s = `${base}-${suffix}`;
  let n = 2;
  while (usedSet.has(s)) s = `${base}-${suffix}-${n++}`;
  usedSet.add(s);
  return s;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌍  Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);
  console.log("✅  Connected\n");

  // ── COUNTRIES ──────────────────────────────────────────────────────────────
  console.log("📦  Seeding countries…");
  const rawCountries = CSCCountry.getAllCountries().filter(c => TARGET_CODES.has(c.isoCode));
  console.log(`  Targeting ${rawCountries.length} countries`);
  const countryDocs = rawCountries.map((c, i) => {
    const curr = CURRENCY_MAP[c.currency] ?? {n:"",s:""};
    return {
      name: c.name,
      nameAr: COUNTRY_AR[c.isoCode] ?? "",
      code: c.isoCode,
      phoneCode: (c.phonecode || "").replace(/[^\d]/g,""),
      currency: curr.n,
      currencyCode: c.currency || "",
      currencySymbol: curr.s,
      thousandSeparator: ",",
      decimalSeparator: ".",
      sortOrder: i,
      isActive: true,
    };
  });
  await batchInsert(CountryModel, countryDocs);

  const dbCountries = await CountryModel.find({},{code:1,_id:1}).lean();
  const countryIdMap = {};
  for (const c of dbCountries) countryIdMap[c.code] = c._id;
  console.log(`  📍 ${Object.keys(countryIdMap).length} countries in DB\n`);

  // ── STATES ─────────────────────────────────────────────────────────────────
  console.log("📦  Seeding states…");
  const rawStates = CSCState.getAllStates().filter(s => TARGET_CODES.has(s.countryCode));

  const usedStateSlugs = new Set();
  const stateDocsArr = [];
  const stateKeyToSlug = {}; // "CC::SC" → slug

  for (let i=0; i<rawStates.length; i++) {
    const s = rawStates[i];
    const countryId = countryIdMap[s.countryCode];
    if (!countryId) continue;
    const base = slugify(s.name) || `state-${s.isoCode}-${s.countryCode}`.toLowerCase();
    const slug = uniqueSlug(base, s.countryCode.toLowerCase(), usedStateSlugs);
    stateKeyToSlug[`${s.countryCode}::${s.isoCode}`] = slug;
    stateDocsArr.push({
      name: s.name, nameAr: "",
      countryId, slug,
      sortOrder: i, isActive: true,
    });
  }
  await batchInsert(StateModel, stateDocsArr);

  const dbStates = await StateModel.find({},{slug:1,_id:1}).lean();
  const stateSlugToId = {};
  for (const s of dbStates) stateSlugToId[s.slug] = s._id;
  const stateKeyToId = {};
  for (const [key, slug] of Object.entries(stateKeyToSlug)) {
    if (stateSlugToId[slug]) stateKeyToId[key] = stateSlugToId[slug];
  }
  console.log(`  📍 ${Object.keys(stateKeyToId).length} states mapped\n`);

  // ── CITIES ─────────────────────────────────────────────────────────────────
  console.log("📦  Seeding cities… (~62k records across 20 countries)");
  const rawCities = CSCCity.getAllCities().filter(c => TARGET_CODES.has(c.countryCode));

  const usedCitySlugs = new Set();
  let cityBatch = [];
  let cityFlushed = 0;
  const BATCH_SIZE = 2000;

  for (let i=0; i<rawCities.length; i++) {
    const city = rawCities[i];
    const stateId = stateKeyToId[`${city.countryCode}::${city.stateCode}`];
    if (!stateId) continue;
    const base = slugify(city.name) || `city-${i}`;
    const slug = uniqueSlug(base, `${city.stateCode}-${city.countryCode}`.toLowerCase(), usedCitySlugs);
    cityBatch.push({
      name: city.name, nameAr: "",
      stateId, slug,
      sortOrder: i, isActive: true,
    });

    if (cityBatch.length >= BATCH_SIZE) {
      try { await CityModel.insertMany(cityBatch, {ordered:false}); } catch {}
      cityFlushed += cityBatch.length;
      cityBatch = [];
      process.stdout.write(`\r  City: ${cityFlushed}/${rawCities.length}`);
    }
  }
  if (cityBatch.length) {
    try { await CityModel.insertMany(cityBatch, {ordered:false}); } catch {}
  }
  const cityTotal = await CityModel.countDocuments();
  console.log(`\n  ✔  ${cityTotal} cities in DB`);

  console.log("\n🎉  Location data seeding complete!");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌  Seed failed:", err.message);
  process.exit(1);
});
