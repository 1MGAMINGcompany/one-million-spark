/**
 * Geo-based language detection.
 * Maps user's country to a default language.
 */

const COUNTRY_LANGUAGE_MAP: Record<string, string> = {
  // Hindi
  IN: "hi",
  // Portuguese
  BR: "pt",
  PT: "pt",
  AO: "pt",
  MZ: "pt",
  // Spanish
  MX: "es",
  CO: "es",
  AR: "es",
  PE: "es",
  CL: "es",
  VE: "es",
  EC: "es",
  GT: "es",
  CU: "es",
  BO: "es",
  DO: "es",
  HN: "es",
  PY: "es",
  SV: "es",
  NI: "es",
  CR: "es",
  PA: "es",
  UY: "es",
  ES: "es",
  // French
  FR: "fr",
  BE: "fr",
  SN: "fr",
  CI: "fr",
  CM: "fr",
  // Italian
  IT: "it",
  // German
  DE: "de",
  AT: "de",
  CH: "de",
  // Japanese
  JP: "ja",
  // Chinese
  CN: "zh",
  TW: "zh",
  HK: "zh",
  // Arabic
  SA: "ar",
  AE: "ar",
  EG: "ar",
  MA: "ar",
  DZ: "ar",
  IQ: "ar",
  JO: "ar",
  KW: "ar",
  QA: "ar",
  BH: "ar",
  OM: "ar",
  LB: "ar",
};

/**
 * Detect user's country via timezone heuristic.
 * No API call needed — uses Intl.DateTimeFormat.
 */
function detectCountryFromTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return null;

    // Common timezone → country mappings
    const TZ_COUNTRY: Record<string, string> = {
      "Asia/Kolkata": "IN",
      "Asia/Calcutta": "IN",
      "Asia/Mumbai": "IN",
      "America/Sao_Paulo": "BR",
      "America/Fortaleza": "BR",
      "America/Recife": "BR",
      "America/Bahia": "BR",
      "America/Manaus": "BR",
      "America/Mexico_City": "MX",
      "America/Monterrey": "MX",
      "America/Bogota": "CO",
      "America/Lima": "PE",
      "America/Santiago": "CL",
      "America/Argentina/Buenos_Aires": "AR",
      "America/Caracas": "VE",
      "Europe/Paris": "FR",
      "Europe/Madrid": "ES",
      "Europe/Berlin": "DE",
      "Europe/Rome": "IT",
      "Europe/Lisbon": "PT",
      "Asia/Tokyo": "JP",
      "Asia/Shanghai": "CN",
      "Asia/Taipei": "TW",
      "Asia/Hong_Kong": "HK",
      "Asia/Riyadh": "SA",
      "Asia/Dubai": "AE",
      "Africa/Cairo": "EG",
    };

    return TZ_COUNTRY[tz] || null;
  } catch {
    return null;
  }
}

/**
 * Get the recommended language for the user based on geo detection.
 * Returns null if no specific language should be set (use browser default).
 */
export function getGeoLanguage(): string | null {
  const country = detectCountryFromTimezone();
  if (!country) return null;
  return COUNTRY_LANGUAGE_MAP[country] || null;
}
