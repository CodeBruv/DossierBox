/**
 * Places and languages, as suggestion vocabularies.
 *
 * Generated once from ICU ('Intl.DisplayNames') rather than read from it at render time,
 * deliberately: a runtime built with trimmed ICU returns the raw code, which would
 * silently turn the country selector into a list of two-letter codes on some deployments.
 * Committed data renders identically everywhere. Regenerate with
 * scripts/generate-places.cjs.
 *
 * The **name** is stored, not the code. Those columns already hold names typed by hand,
 * so this puts a searchable control over the existing shape instead of forcing a
 * migration to codes plus a backfill. Codes travel alongside so a later move to
 * locale-aware display has a stable key to migrate to.
 *
 * Neither list asserts anything about sovereignty. It is ICU's region list, including
 * territories and dependencies, because people live, study and work in them and a career
 * document has to be able to say so. Custom entry stays open for anyone the lists fail.
 */

export type VocabularyEntry = { readonly code: string; readonly name: string };

function parse(packed: string): readonly VocabularyEntry[] {
  return packed.split("|").map((entry) => {
    const separator = entry.indexOf(":");
    return { code: entry.slice(0, separator), name: entry.slice(separator + 1) };
  });
}

/** ISO 3166-1 alpha-2 — 251 countries and territories. */
export const countries: readonly VocabularyEntry[] = parse(
    "AD:Andorra|AE:United Arab Emirates|AF:Afghanistan|AG:Antigua & Barbuda|AI:Anguilla" +
    "|AL:Albania|AM:Armenia|AO:Angola|AQ:Antarctica|AR:Argentina|AS:American Samoa|AT:Austria" +
    "|AU:Australia|AW:Aruba|AX:Åland Islands|AZ:Azerbaijan|BA:Bosnia & Herzegovina|BB:Barbados" +
    "|BD:Bangladesh|BE:Belgium|BF:Burkina Faso|BG:Bulgaria|BH:Bahrain|BI:Burundi|BJ:Benin" +
    "|BL:St. Barthélemy|BM:Bermuda|BN:Brunei|BO:Bolivia|BQ:Caribbean Netherlands|BR:Brazil" +
    "|BS:Bahamas|BT:Bhutan|BV:Bouvet Island|BW:Botswana|BY:Belarus|BZ:Belize|CA:Canada" +
    "|CC:Cocos (Keeling) Islands|CD:Congo - Kinshasa|CF:Central African Republic" +
    "|CG:Congo - Brazzaville|CH:Switzerland|CI:Côte d’Ivoire|CK:Cook Islands|CL:Chile|CM:Cameroon" +
    "|CN:China|CO:Colombia|CQ:Sark|CR:Costa Rica|CU:Cuba|CV:Cape Verde|CW:Curaçao" +
    "|CX:Christmas Island|CY:Cyprus|CZ:Czechia|DE:Germany|DJ:Djibouti|DK:Denmark|DM:Dominica" +
    "|DO:Dominican Republic|DZ:Algeria|EC:Ecuador|EE:Estonia|EG:Egypt|EH:Western Sahara" +
    "|ER:Eritrea|ES:Spain|ET:Ethiopia|FI:Finland|FJ:Fiji|FK:Falkland Islands|FM:Micronesia" +
    "|FO:Faroe Islands|FR:France|GA:Gabon|GB:United Kingdom|GD:Grenada|GE:Georgia" +
    "|GF:French Guiana|GG:Guernsey|GH:Ghana|GI:Gibraltar|GL:Greenland|GM:Gambia|GN:Guinea" +
    "|GP:Guadeloupe|GQ:Equatorial Guinea|GR:Greece|GS:South Georgia & South Sandwich Islands" +
    "|GT:Guatemala|GU:Guam|GW:Guinea-Bissau|GY:Guyana|HK:Hong Kong SAR China" +
    "|HM:Heard & McDonald Islands|HN:Honduras|HR:Croatia|HT:Haiti|HU:Hungary|ID:Indonesia" +
    "|IE:Ireland|IL:Israel|IM:Isle of Man|IN:India|IO:British Indian Ocean Territory|IQ:Iraq" +
    "|IR:Iran|IS:Iceland|IT:Italy|JE:Jersey|JM:Jamaica|JO:Jordan|JP:Japan|KE:Kenya|KG:Kyrgyzstan" +
    "|KH:Cambodia|KI:Kiribati|KM:Comoros|KN:St. Kitts & Nevis|KP:North Korea|KR:South Korea" +
    "|KW:Kuwait|KY:Cayman Islands|KZ:Kazakhstan|LA:Laos|LB:Lebanon|LC:St. Lucia|LI:Liechtenstein" +
    "|LK:Sri Lanka|LR:Liberia|LS:Lesotho|LT:Lithuania|LU:Luxembourg|LV:Latvia|LY:Libya|MA:Morocco" +
    "|MC:Monaco|MD:Moldova|ME:Montenegro|MF:St. Martin|MG:Madagascar|MH:Marshall Islands" +
    "|MK:North Macedonia|ML:Mali|MM:Myanmar (Burma)|MN:Mongolia|MO:Macao SAR China" +
    "|MP:Northern Mariana Islands|MQ:Martinique|MR:Mauritania|MS:Montserrat|MT:Malta|MU:Mauritius" +
    "|MV:Maldives|MW:Malawi|MX:Mexico|MY:Malaysia|MZ:Mozambique|NA:Namibia|NC:New Caledonia" +
    "|NE:Niger|NF:Norfolk Island|NG:Nigeria|NI:Nicaragua|NL:Netherlands|NO:Norway|NP:Nepal" +
    "|NR:Nauru|NU:Niue|NZ:New Zealand|OM:Oman|PA:Panama|PE:Peru|PF:French Polynesia" +
    "|PG:Papua New Guinea|PH:Philippines|PK:Pakistan|PL:Poland|PM:St. Pierre & Miquelon" +
    "|PN:Pitcairn Islands|PR:Puerto Rico|PS:Palestinian Territories|PT:Portugal|PW:Palau" +
    "|PY:Paraguay|QA:Qatar|RE:Réunion|RO:Romania|RS:Serbia|RU:Russia|RW:Rwanda|SA:Saudi Arabia" +
    "|SB:Solomon Islands|SC:Seychelles|SD:Sudan|SE:Sweden|SG:Singapore|SH:St. Helena|SI:Slovenia" +
    "|SJ:Svalbard & Jan Mayen|SK:Slovakia|SL:Sierra Leone|SM:San Marino|SN:Senegal|SO:Somalia" +
    "|SR:Suriname|SS:South Sudan|ST:São Tomé & Príncipe|SV:El Salvador|SX:Sint Maarten|SY:Syria" +
    "|SZ:Eswatini|TC:Turks & Caicos Islands|TD:Chad|TF:French Southern Territories|TG:Togo" +
    "|TH:Thailand|TJ:Tajikistan|TK:Tokelau|TL:Timor-Leste|TM:Turkmenistan|TN:Tunisia|TO:Tonga" +
    "|TR:Türkiye|TT:Trinidad & Tobago|TV:Tuvalu|TW:Taiwan|TZ:Tanzania|UA:Ukraine|UG:Uganda" +
    "|UM:U.S. Outlying Islands|US:United States|UY:Uruguay|UZ:Uzbekistan|VA:Vatican City" +
    "|VC:St. Vincent & Grenadines|VE:Venezuela|VG:British Virgin Islands|VI:U.S. Virgin Islands" +
    "|VN:Vietnam|VU:Vanuatu|WF:Wallis & Futuna|WS:Samoa|XK:Kosovo|YE:Yemen|YT:Mayotte" +
    "|ZA:South Africa|ZM:Zambia|ZW:Zimbabwe",
);

/** ISO 639-1 — 159 living languages. */
export const languages: readonly VocabularyEntry[] = parse(
    "aa:Afar|ab:Abkhazian|af:Afrikaans|ak:Akan|am:Amharic|an:Aragonese|ar:Arabic|as:Assamese" +
    "|av:Avaric|ay:Aymara|az:Azerbaijani|ba:Bashkir|be:Belarusian|bg:Bulgarian|bh:Bhojpuri" +
    "|bi:Bislama|bm:Bambara|bn:Bangla|bo:Tibetan|br:Breton|bs:Bosnian|ca:Catalan|ce:Chechen" +
    "|co:Corsican|cs:Czech|cv:Chuvash|cy:Welsh|da:Danish|de:German|dv:Divehi|dz:Dzongkha|ee:Ewe" +
    "|el:Greek|en:English|eo:Esperanto|es:Spanish|et:Estonian|eu:Basque|fa:Persian|ff:Fula" +
    "|fi:Finnish|fj:Fijian|fo:Faroese|fr:French|fy:Western Frisian|ga:Irish|gd:Scottish Gaelic" +
    "|gl:Galician|gn:Guarani|gu:Gujarati|gv:Manx|ha:Hausa|he:Hebrew|hi:Hindi|hr:Croatian" +
    "|ht:Haitian Creole|hu:Hungarian|hy:Armenian|ia:Interlingua|id:Indonesian|ig:Igbo" +
    "|ii:Sichuan Yi|ik:Inupiaq|is:Icelandic|it:Italian|iu:Inuktitut|ja:Japanese|jv:Javanese" +
    "|ka:Georgian|kg:Kongo|ki:Kikuyu|kk:Kazakh|kl:Kalaallisut|km:Khmer|kn:Kannada|ko:Korean" +
    "|ks:Kashmiri|ku:Kurdish|kv:Komi|kw:Cornish|ky:Kyrgyz|la:Latin|lb:Luxembourgish|li:Limburgish" +
    "|ln:Lingala|lo:Lao|lt:Lithuanian|lu:Luba-Katanga|lv:Latvian|mg:Malagasy|mi:Māori" +
    "|mk:Macedonian|ml:Malayalam|mn:Mongolian|mr:Marathi|ms:Malay|mt:Maltese|my:Burmese" +
    "|nb:Norwegian Bokmål|nd:North Ndebele|ne:Nepali|nl:Dutch|nn:Norwegian Nynorsk|no:Norwegian" +
    "|ny:Nyanja|oc:Occitan|om:Oromo|or:Odia|os:Ossetic|pa:Punjabi|pl:Polish|ps:Pashto" +
    "|pt:Portuguese|qu:Quechua|rm:Romansh|rn:Rundi|ro:Romanian|ru:Russian|rw:Kinyarwanda" +
    "|sa:Sanskrit|sd:Sindhi|se:Northern Sami|sg:Sango|si:Sinhala|sk:Slovak|sl:Slovenian|sm:Samoan" +
    "|sn:Shona|so:Somali|sq:Albanian|sr:Serbian|st:Southern Sotho|su:Sundanese|sv:Swedish" +
    "|sw:Swahili|ta:Tamil|te:Telugu|tg:Tajik|th:Thai|ti:Tigrinya|tk:Turkmen|tn:Tswana|to:Tongan" +
    "|tr:Turkish|ts:Tsonga|tt:Tatar|ug:Uyghur|uk:Ukrainian|ur:Urdu|uz:Uzbek|ve:Venda" +
    "|vi:Vietnamese|wa:Walloon|wo:Wolof|xh:Xhosa|yi:Yiddish|yo:Yoruba|zh:Chinese|zu:Zulu",
);

export const countryNames: readonly string[] = countries.map((entry) => entry.name);
export const languageNames: readonly string[] = languages.map((entry) => entry.name);
