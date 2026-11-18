/**
 * The cities a world clock can show: the world's large cities and capitals, each with its time zone
 * (IANA), its country, and where it is (for its daylight). Data, not interface: a city's French name
 * is written beside its English one where the two differ (« Londres »), as a country's. Searched by
 * `searchCities` (`services/worldClocks`), in either language, accents and case ignored.
 *
 * One line per city: `English|French|country|zone|latitude|longitude` (French '' when the same).
 */

const CITY_LINES = `
Abidjan||CI|Africa/Abidjan|5.36|-4.01
Abu Dhabi|Abou Dabi|AE|Asia/Dubai|24.45|54.38
Accra||GH|Africa/Accra|5.6|-0.19
Adelaide|Adélaïde|AU|Australia/Adelaide|-34.93|138.6
Addis Ababa|Addis-Abeba|ET|Africa/Addis_Ababa|9.03|38.74
Ajaccio||FR|Europe/Paris|41.93|8.74
Algiers|Alger|DZ|Africa/Algiers|36.75|3.06
Almaty||KZ|Asia/Almaty|43.24|76.89
Amman||JO|Asia/Amman|31.95|35.93
Amsterdam||NL|Europe/Amsterdam|52.37|4.9
Anchorage||US|America/Anchorage|61.22|-149.9
Ankara||TR|Europe/Istanbul|39.93|32.86
Antananarivo||MG|Indian/Antananarivo|-18.88|47.51
Apia||WS|Pacific/Apia|-13.83|-171.76
Asunción||PY|America/Asuncion|-25.26|-57.58
Athens|Athènes|GR|Europe/Athens|37.98|23.73
Atlanta||US|America/New_York|33.75|-84.39
Auckland||NZ|Pacific/Auckland|-36.85|174.76
Austin||US|America/Chicago|30.27|-97.74
Baghdad|Bagdad|IQ|Asia/Baghdad|33.31|44.37
Baku|Bakou|AZ|Asia/Baku|40.41|49.87
Bali||ID|Asia/Makassar|-8.65|115.22
Bamako||ML|Africa/Bamako|12.64|-8
Bangalore|Bangalore|IN|Asia/Kolkata|12.97|77.59
Bangkok||TH|Asia/Bangkok|13.76|100.5
Barcelona|Barcelone|ES|Europe/Madrid|41.39|2.17
Beijing|Pékin|CN|Asia/Shanghai|39.9|116.41
Beirut|Beyrouth|LB|Asia/Beirut|33.89|35.5
Belgrade||RS|Europe/Belgrade|44.79|20.45
Berlin||DE|Europe/Berlin|52.52|13.4
Bern|Berne|CH|Europe/Zurich|46.95|7.45
Bogotá||CO|America/Bogota|4.71|-74.07
Bordeaux||FR|Europe/Paris|44.84|-0.58
Boston||US|America/New_York|42.36|-71.06
Brasília||BR|America/Sao_Paulo|-15.79|-47.88
Bratislava||SK|Europe/Bratislava|48.15|17.11
Brazzaville||CG|Africa/Brazzaville|-4.26|15.24
Brisbane||AU|Australia/Brisbane|-27.47|153.03
Brussels|Bruxelles|BE|Europe/Brussels|50.85|4.35
Bucharest|Bucarest|RO|Europe/Bucharest|44.43|26.1
Budapest||HU|Europe/Budapest|47.5|19.04
Buenos Aires||AR|America/Argentina/Buenos_Aires|-34.6|-58.38
Cairo|Le Caire|EG|Africa/Cairo|30.04|31.24
Calgary||CA|America/Edmonton|51.05|-114.07
Canberra||AU|Australia/Sydney|-35.28|149.13
Cancún||MX|America/Cancun|21.16|-86.85
Cape Town|Le Cap|ZA|Africa/Johannesburg|-33.92|18.42
Caracas||VE|America/Caracas|10.48|-66.9
Casablanca||MA|Africa/Casablanca|33.57|-7.59
Cayenne||GF|America/Cayenne|4.92|-52.33
Chennai||IN|Asia/Kolkata|13.08|80.27
Chicago||US|America/Chicago|41.88|-87.63
Chișinău|Chisinau|MD|Europe/Chisinau|47.01|28.86
Colombo||LK|Asia/Colombo|6.93|79.85
Copenhagen|Copenhague|DK|Europe/Copenhagen|55.68|12.57
Dakar||SN|Africa/Dakar|14.72|-17.47
Dallas||US|America/Chicago|32.78|-96.8
Damascus|Damas|SY|Asia/Damascus|33.51|36.29
Dar es Salaam||TZ|Africa/Dar_es_Salaam|-6.79|39.21
Darwin||AU|Australia/Darwin|-12.46|130.84
Delhi||IN|Asia/Kolkata|28.61|77.21
Denver||US|America/Denver|39.74|-104.99
Detroit||US|America/Detroit|42.33|-83.05
Dhaka||BD|Asia/Dhaka|23.81|90.41
Djibouti||DJ|Africa/Djibouti|11.59|43.15
Doha||QA|Asia/Qatar|25.29|51.53
Dubai|Dubaï|AE|Asia/Dubai|25.2|55.27
Dublin||IE|Europe/Dublin|53.35|-6.26
Edinburgh|Édimbourg|GB|Europe/London|55.95|-3.19
Fort-de-France||MQ|America/Martinique|14.6|-61.07
Frankfurt|Francfort|DE|Europe/Berlin|50.11|8.68
Geneva|Genève|CH|Europe/Zurich|46.2|6.14
Guangzhou|Canton|CN|Asia/Shanghai|23.13|113.26
Guatemala City|Guatemala|GT|America/Guatemala|14.63|-90.51
Halifax||CA|America/Halifax|44.65|-63.57
Hamburg|Hambourg|DE|Europe/Berlin|53.55|9.99
Hanoi||VN|Asia/Bangkok|21.03|105.85
Havana|La Havane|CU|America/Havana|23.11|-82.37
Helsinki||FI|Europe/Helsinki|60.17|24.94
Ho Chi Minh City|Hô Chi Minh-Ville|VN|Asia/Ho_Chi_Minh|10.82|106.63
Hobart||AU|Australia/Hobart|-42.88|147.33
Hong Kong||HK|Asia/Hong_Kong|22.32|114.17
Honolulu||US|Pacific/Honolulu|21.31|-157.86
Houston||US|America/Chicago|29.76|-95.37
Hyderabad||IN|Asia/Kolkata|17.39|78.49
Istanbul||TR|Europe/Istanbul|41.01|28.98
Jakarta||ID|Asia/Jakarta|-6.21|106.85
Jeddah|Djeddah|SA|Asia/Riyadh|21.49|39.19
Jerusalem|Jérusalem|IL|Asia/Jerusalem|31.77|35.21
Johannesburg||ZA|Africa/Johannesburg|-26.2|28.05
Kabul|Kaboul|AF|Asia/Kabul|34.56|69.21
Kampala||UG|Africa/Kampala|0.35|32.58
Karachi||PK|Asia/Karachi|24.86|67.01
Kathmandu|Katmandou|NP|Asia/Kathmandu|27.72|85.32
Khartoum||SD|Africa/Khartoum|15.5|32.56
Kigali||RW|Africa/Kigali|-1.94|30.06
Kinshasa||CD|Africa/Kinshasa|-4.44|15.27
Kolkata|Calcutta|IN|Asia/Kolkata|22.57|88.36
Kuala Lumpur||MY|Asia/Kuala_Lumpur|3.14|101.69
Kuwait City|Koweït|KW|Asia/Kuwait|29.38|47.99
Kyiv|Kiev|UA|Europe/Kiev|50.45|30.52
Lagos||NG|Africa/Lagos|6.52|3.38
Lahore||PK|Asia/Karachi|31.55|74.34
La Paz||BO|America/La_Paz|-16.5|-68.15
Las Vegas||US|America/Los_Angeles|36.17|-115.14
Libreville||GA|Africa/Libreville|0.42|9.47
Lille||FR|Europe/Paris|50.63|3.06
Lima||PE|America/Lima|-12.05|-77.04
Lisbon|Lisbonne|PT|Europe/Lisbon|38.72|-9.14
Ljubljana||SI|Europe/Ljubljana|46.06|14.51
Lomé||TG|Africa/Lome|6.13|1.22
London|Londres|GB|Europe/London|51.51|-0.13
Los Angeles||US|America/Los_Angeles|34.05|-118.24
Luanda||AO|Africa/Luanda|-8.84|13.23
Luxembourg||LU|Europe/Luxembourg|49.61|6.13
Lyon||FR|Europe/Paris|45.76|4.84
Madrid||ES|Europe/Madrid|40.42|-3.7
Malé||MV|Indian/Maldives|4.18|73.51
Managua||NI|America/Managua|12.11|-86.24
Manila|Manille|PH|Asia/Manila|14.6|120.98
Maputo||MZ|Africa/Maputo|-25.97|32.57
Marrakesh|Marrakech|MA|Africa/Casablanca|31.63|-7.99
Marseille||FR|Europe/Paris|43.3|5.37
Mecca|La Mecque|SA|Asia/Riyadh|21.39|39.86
Melbourne||AU|Australia/Melbourne|-37.81|144.96
Mexico City|Mexico|MX|America/Mexico_City|19.43|-99.13
Miami||US|America/New_York|25.76|-80.19
Milan||IT|Europe/Rome|45.46|9.19
Minneapolis||US|America/Chicago|44.98|-93.27
Minsk||BY|Europe/Minsk|53.9|27.56
Mogadishu|Mogadiscio|SO|Africa/Mogadishu|2.05|45.32
Monaco||MC|Europe/Monaco|43.74|7.42
Monrovia||LR|Africa/Monrovia|6.3|-10.8
Montevideo||UY|America/Montevideo|-34.9|-56.16
Montpellier||FR|Europe/Paris|43.61|3.88
Montreal|Montréal|CA|America/Toronto|45.5|-73.57
Moscow|Moscou|RU|Europe/Moscow|55.76|37.62
Mumbai|Bombay|IN|Asia/Kolkata|19.08|72.88
Munich||DE|Europe/Berlin|48.14|11.58
Muscat|Mascate|OM|Asia/Muscat|23.59|58.41
Nairobi||KE|Africa/Nairobi|-1.29|36.82
Nantes||FR|Europe/Paris|47.22|-1.55
Naples||IT|Europe/Rome|40.85|14.27
Nassau||BS|America/Nassau|25.05|-77.35
N’Djamena||TD|Africa/Ndjamena|12.13|15.06
New Orleans|La Nouvelle-Orléans|US|America/Chicago|29.95|-90.07
New York||US|America/New_York|40.71|-74.01
Niamey||NE|Africa/Niamey|13.51|2.13
Nice||FR|Europe/Paris|43.7|7.27
Nicosia|Nicosie|CY|Asia/Nicosia|35.19|33.38
Nouméa||NC|Pacific/Noumea|-22.28|166.46
Nuuk||GL|America/Godthab|64.18|-51.72
Osaka||JP|Asia/Tokyo|34.69|135.5
Oslo||NO|Europe/Oslo|59.91|10.75
Ottawa||CA|America/Toronto|45.42|-75.7
Ouagadougou||BF|Africa/Ouagadougou|12.37|-1.52
Panama City|Panama|PA|America/Panama|8.98|-79.52
Papeete||PF|Pacific/Tahiti|-17.53|-149.57
Paris||FR|Europe/Paris|48.86|2.35
Perth||AU|Australia/Perth|-31.95|115.86
Philadelphia|Philadelphie|US|America/New_York|39.95|-75.17
Phnom Penh||KH|Asia/Phnom_Penh|11.56|104.93
Phoenix||US|America/Phoenix|33.45|-112.07
Pointe-à-Pitre||GP|America/Guadeloupe|16.24|-61.53
Port Louis|Port-Louis|MU|Indian/Mauritius|-20.16|57.5
Port Moresby||PG|Pacific/Port_Moresby|-9.44|147.18
Port-au-Prince||HT|America/Port-au-Prince|18.59|-72.31
Porto||PT|Europe/Lisbon|41.16|-8.63
Prague||CZ|Europe/Prague|50.08|14.44
Quebec City|Québec|CA|America/Toronto|46.81|-71.21
Quito||EC|America/Guayaquil|-0.18|-78.47
Rabat||MA|Africa/Casablanca|34.02|-6.84
Reykjavík|Reykjavik|IS|Atlantic/Reykjavik|64.15|-21.94
Riga||LV|Europe/Riga|56.95|24.11
Rio de Janeiro||BR|America/Sao_Paulo|-22.91|-43.17
Riyadh|Riyad|SA|Asia/Riyadh|24.71|46.68
Rome||IT|Europe/Rome|41.9|12.5
Saint-Denis (Réunion)|Saint-Denis (La Réunion)|RE|Indian/Reunion|-20.88|55.45
Saint-Pierre||PM|America/Miquelon|46.78|-56.18
Salt Lake City||US|America/Denver|40.76|-111.89
San Diego||US|America/Los_Angeles|32.72|-117.16
San Francisco||US|America/Los_Angeles|37.77|-122.42
San José||CR|America/Costa_Rica|9.93|-84.08
San Juan||PR|America/Puerto_Rico|18.47|-66.11
Santiago||CL|America/Santiago|-33.45|-70.67
Santo Domingo|Saint-Domingue|DO|America/Santo_Domingo|18.49|-69.93
São Paulo|São Paulo|BR|America/Sao_Paulo|-23.55|-46.63
Sarajevo||BA|Europe/Sarajevo|43.86|18.41
Seattle||US|America/Los_Angeles|47.61|-122.33
Seoul|Séoul|KR|Asia/Seoul|37.57|126.98
Shanghai|Shanghai|CN|Asia/Shanghai|31.23|121.47
Shenzhen||CN|Asia/Shanghai|22.54|114.06
Singapore|Singapour|SG|Asia/Singapore|1.35|103.82
Sofia||BG|Europe/Sofia|42.7|23.32
St. Petersburg|Saint-Pétersbourg|RU|Europe/Moscow|59.93|30.36
Stockholm||SE|Europe/Stockholm|59.33|18.07
Strasbourg||FR|Europe/Paris|48.57|7.75
Suva||FJ|Pacific/Fiji|-18.14|178.44
Sydney||AU|Australia/Sydney|-33.87|151.21
Taipei|Taipei|TW|Asia/Taipei|25.03|121.57
Tallinn||EE|Europe/Tallinn|59.44|24.75
Tashkent|Tachkent|UZ|Asia/Tashkent|41.3|69.24
Tbilisi|Tbilissi|GE|Asia/Tbilisi|41.72|44.79
Tehran|Téhéran|IR|Asia/Tehran|35.69|51.39
Tel Aviv||IL|Asia/Jerusalem|32.09|34.78
Tirana||AL|Europe/Tirane|41.33|19.82
Tokyo||JP|Asia/Tokyo|35.68|139.69
Toronto||CA|America/Toronto|43.65|-79.38
Toulouse||FR|Europe/Paris|43.6|1.44
Tunis||TN|Africa/Tunis|36.81|10.18
Ulaanbaatar|Oulan-Bator|MN|Asia/Ulaanbaatar|47.89|106.91
Vancouver||CA|America/Vancouver|49.28|-123.12
Vienna|Vienne|AT|Europe/Vienna|48.21|16.37
Vientiane||LA|Asia/Vientiane|17.98|102.63
Vilnius||LT|Europe/Vilnius|54.69|25.28
Warsaw|Varsovie|PL|Europe/Warsaw|52.23|21.01
Washington||US|America/New_York|38.91|-77.04
Wellington||NZ|Pacific/Auckland|-41.29|174.78
Winnipeg||CA|America/Winnipeg|49.9|-97.14
Yangon|Rangoun|MM|Asia/Yangon|16.87|96.2
Yaoundé||CM|Africa/Douala|3.87|11.52
Yerevan|Erevan|AM|Asia/Yerevan|40.18|44.51
Zagreb||HR|Europe/Zagreb|45.81|15.98
Zurich||CH|Europe/Zurich|47.38|8.54
`;

/** A country's names: English, then French. */
export const COUNTRIES: Readonly<Record<string, readonly [string, string]>> = {
  AE: ['United Arab Emirates', 'Émirats arabes unis'],
  AF: ['Afghanistan', 'Afghanistan'],
  AL: ['Albania', 'Albanie'],
  AM: ['Armenia', 'Arménie'],
  AO: ['Angola', 'Angola'],
  AR: ['Argentina', 'Argentine'],
  AT: ['Austria', 'Autriche'],
  AU: ['Australia', 'Australie'],
  AZ: ['Azerbaijan', 'Azerbaïdjan'],
  BA: ['Bosnia and Herzegovina', 'Bosnie-Herzégovine'],
  BD: ['Bangladesh', 'Bangladesh'],
  BE: ['Belgium', 'Belgique'],
  BF: ['Burkina Faso', 'Burkina Faso'],
  BG: ['Bulgaria', 'Bulgarie'],
  BO: ['Bolivia', 'Bolivie'],
  BR: ['Brazil', 'Brésil'],
  BS: ['Bahamas', 'Bahamas'],
  BY: ['Belarus', 'Biélorussie'],
  CA: ['Canada', 'Canada'],
  CD: ['DR Congo', 'RD Congo'],
  CG: ['Congo', 'Congo'],
  CH: ['Switzerland', 'Suisse'],
  CI: ['Côte d’Ivoire', 'Côte d’Ivoire'],
  CL: ['Chile', 'Chili'],
  CM: ['Cameroon', 'Cameroun'],
  CN: ['China', 'Chine'],
  CO: ['Colombia', 'Colombie'],
  CR: ['Costa Rica', 'Costa Rica'],
  CU: ['Cuba', 'Cuba'],
  CY: ['Cyprus', 'Chypre'],
  CZ: ['Czechia', 'Tchéquie'],
  DE: ['Germany', 'Allemagne'],
  DJ: ['Djibouti', 'Djibouti'],
  DK: ['Denmark', 'Danemark'],
  DO: ['Dominican Republic', 'République dominicaine'],
  DZ: ['Algeria', 'Algérie'],
  EC: ['Ecuador', 'Équateur'],
  EE: ['Estonia', 'Estonie'],
  EG: ['Egypt', 'Égypte'],
  ES: ['Spain', 'Espagne'],
  ET: ['Ethiopia', 'Éthiopie'],
  FI: ['Finland', 'Finlande'],
  FJ: ['Fiji', 'Fidji'],
  FR: ['France', 'France'],
  GA: ['Gabon', 'Gabon'],
  GB: ['United Kingdom', 'Royaume-Uni'],
  GE: ['Georgia', 'Géorgie'],
  GF: ['French Guiana', 'Guyane'],
  GH: ['Ghana', 'Ghana'],
  GL: ['Greenland', 'Groenland'],
  GP: ['Guadeloupe', 'Guadeloupe'],
  GR: ['Greece', 'Grèce'],
  GT: ['Guatemala', 'Guatemala'],
  HK: ['Hong Kong', 'Hong Kong'],
  HR: ['Croatia', 'Croatie'],
  HT: ['Haiti', 'Haïti'],
  HU: ['Hungary', 'Hongrie'],
  ID: ['Indonesia', 'Indonésie'],
  IE: ['Ireland', 'Irlande'],
  IL: ['Israel', 'Israël'],
  IN: ['India', 'Inde'],
  IQ: ['Iraq', 'Irak'],
  IR: ['Iran', 'Iran'],
  IS: ['Iceland', 'Islande'],
  IT: ['Italy', 'Italie'],
  JO: ['Jordan', 'Jordanie'],
  JP: ['Japan', 'Japon'],
  KE: ['Kenya', 'Kenya'],
  KH: ['Cambodia', 'Cambodge'],
  KR: ['South Korea', 'Corée du Sud'],
  KW: ['Kuwait', 'Koweït'],
  KZ: ['Kazakhstan', 'Kazakhstan'],
  LA: ['Laos', 'Laos'],
  LB: ['Lebanon', 'Liban'],
  LK: ['Sri Lanka', 'Sri Lanka'],
  LR: ['Liberia', 'Liberia'],
  LT: ['Lithuania', 'Lituanie'],
  LU: ['Luxembourg', 'Luxembourg'],
  LV: ['Latvia', 'Lettonie'],
  MA: ['Morocco', 'Maroc'],
  MC: ['Monaco', 'Monaco'],
  MD: ['Moldova', 'Moldavie'],
  MG: ['Madagascar', 'Madagascar'],
  ML: ['Mali', 'Mali'],
  MM: ['Myanmar', 'Birmanie'],
  MN: ['Mongolia', 'Mongolie'],
  MQ: ['Martinique', 'Martinique'],
  MU: ['Mauritius', 'Maurice'],
  MV: ['Maldives', 'Maldives'],
  MX: ['Mexico', 'Mexique'],
  MY: ['Malaysia', 'Malaisie'],
  MZ: ['Mozambique', 'Mozambique'],
  NC: ['New Caledonia', 'Nouvelle-Calédonie'],
  NE: ['Niger', 'Niger'],
  NG: ['Nigeria', 'Nigeria'],
  NI: ['Nicaragua', 'Nicaragua'],
  NL: ['Netherlands', 'Pays-Bas'],
  NO: ['Norway', 'Norvège'],
  NP: ['Nepal', 'Népal'],
  NZ: ['New Zealand', 'Nouvelle-Zélande'],
  OM: ['Oman', 'Oman'],
  PA: ['Panama', 'Panama'],
  PE: ['Peru', 'Pérou'],
  PF: ['French Polynesia', 'Polynésie française'],
  PG: ['Papua New Guinea', 'Papouasie-Nouvelle-Guinée'],
  PH: ['Philippines', 'Philippines'],
  PK: ['Pakistan', 'Pakistan'],
  PL: ['Poland', 'Pologne'],
  PM: ['Saint Pierre and Miquelon', 'Saint-Pierre-et-Miquelon'],
  PR: ['Puerto Rico', 'Porto Rico'],
  PT: ['Portugal', 'Portugal'],
  PY: ['Paraguay', 'Paraguay'],
  QA: ['Qatar', 'Qatar'],
  RE: ['Réunion', 'La Réunion'],
  RO: ['Romania', 'Roumanie'],
  RS: ['Serbia', 'Serbie'],
  RU: ['Russia', 'Russie'],
  RW: ['Rwanda', 'Rwanda'],
  SA: ['Saudi Arabia', 'Arabie saoudite'],
  SD: ['Sudan', 'Soudan'],
  SE: ['Sweden', 'Suède'],
  SG: ['Singapore', 'Singapour'],
  SI: ['Slovenia', 'Slovénie'],
  SK: ['Slovakia', 'Slovaquie'],
  SN: ['Senegal', 'Sénégal'],
  SO: ['Somalia', 'Somalie'],
  SY: ['Syria', 'Syrie'],
  TD: ['Chad', 'Tchad'],
  TG: ['Togo', 'Togo'],
  TH: ['Thailand', 'Thaïlande'],
  TN: ['Tunisia', 'Tunisie'],
  TR: ['Türkiye', 'Turquie'],
  TW: ['Taiwan', 'Taïwan'],
  TZ: ['Tanzania', 'Tanzanie'],
  UA: ['Ukraine', 'Ukraine'],
  UG: ['Uganda', 'Ouganda'],
  US: ['United States', 'États-Unis'],
  UY: ['Uruguay', 'Uruguay'],
  UZ: ['Uzbekistan', 'Ouzbékistan'],
  VE: ['Venezuela', 'Venezuela'],
  VN: ['Vietnam', 'Viêt Nam'],
  WS: ['Samoa', 'Samoa'],
  ZA: ['South Africa', 'Afrique du Sud'],
};

export interface City {
  /** Its key in the table: the zone and its English name (`Europe/London|London`), stable. */
  readonly key: string;
  readonly name: string;
  readonly nameFr: string;
  readonly country: string;
  readonly zone: string;
  readonly lat: number;
  readonly lon: number;
}

let cities: City[] | null = null;

/** Every city of the table, read once. */
export function allCities(): readonly City[] {
  if (cities) return cities;
  cities = [];
  for (const line of CITY_LINES.split('\n')) {
    const parts = line.split('|');
    if (parts.length !== 6) continue;
    const [name, fr, country, zone, lat, lon] = parts as [string, string, string, string, string, string];
    cities.push({ key: `${zone}|${name}`, name, nameFr: fr || name, country, zone, lat: Number(lat), lon: Number(lon) });
  }
  return cities;
}
