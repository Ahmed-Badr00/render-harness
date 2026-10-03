// react-native-localize driven by the harness language. ADAPT country, currency and time zone to the app's market
// (or set them per scenario: scenario.locale = { country, currency, timeZone }).
const H = () => (typeof window !== 'undefined' && window.__HARNESS__) || {};
const lang = () => H().lang || 'en';
const loc = () => ({ country: 'US', currency: 'USD', timeZone: 'UTC', ...(H().scenario?.locale || {}) });
const rtl = () => (H().dir || (['ar', 'he', 'fa', 'ur'].includes(lang()) ? 'rtl' : 'ltr')) === 'rtl';
export const getLocales = () => [{ languageCode: lang(), countryCode: loc().country, languageTag: `${lang()}-${loc().country}`, isRTL: rtl() }];
export const getCountry = () => loc().country;
export const getTimeZone = () => loc().timeZone;
export const getCurrencies = () => [loc().currency];
export const getCalendar = () => 'gregorian';
export const getTemperatureUnit = () => 'celsius';
export const uses24HourClock = () => false;
export const usesMetricSystem = () => true;
export const usesAutoDateAndTime = () => true;
export const usesAutoTimeZone = () => true;
export const getNumberFormatSettings = () => ({ decimalSeparator: '.', groupingSeparator: ',' });
export const findBestLanguageTag = (tags) => ({ languageTag: tags.includes(lang()) ? lang() : tags[0], isRTL: rtl() });
export const findBestAvailableLanguage = findBestLanguageTag;
export const addEventListener = () => ({ remove() {} });
export const removeEventListener = () => {};
export const openAppLanguageSettings = async () => {};
export default { getLocales, getCountry, getTimeZone, getCurrencies, getCalendar, getTemperatureUnit, uses24HourClock, usesMetricSystem, usesAutoDateAndTime, usesAutoTimeZone, getNumberFormatSettings, findBestLanguageTag, findBestAvailableLanguage, addEventListener, removeEventListener, openAppLanguageSettings };
