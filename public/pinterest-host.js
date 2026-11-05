// Pinterest serves one site from many regional hosts (in.pinterest.com, pinterest.co.uk…).
// An explicit list, because this also decides where the sign-in window may navigate.
const SUFFIXES = ['com', 'co.uk', 'com.au', 'com.mx', 'co.kr', 'ca', 'de', 'fr', 'es', 'it', 'pt', 'at', 'ch', 'cl', 'dk', 'ie', 'jp', 'kr', 'nz', 'ph', 'se', 'ru'];
export const PINTEREST_DOMAINS = SUFFIXES.map(suffix => `pinterest.${suffix}`);
const HOST = new RegExp(`^(?:[a-z]{2,3}\\.)?pinterest\\.(?:${SUFFIXES.join('|').replaceAll('.', '\\.')})$`);
export const isPinterestHost = host => HOST.test(String(host).toLowerCase().replace(/^www\./, ''));
export const PINTEREST_PIN = /^\/pin\/(?:[^/]*--)?(\d+)(?:\/|$)/;
