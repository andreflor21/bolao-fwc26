/**
 * Maps the 3-letter FIFA team code to the ISO 3166-1 alpha-2 country code
 * used by flagcdn.com. England and Scotland are UK subdivisions exposed by
 * flagcdn under `gb-eng` and `gb-sct`.
 *
 * Covers all 48 nations participating in the FIFA World Cup 2026 seed.
 */
const FIFA_TO_ISO2: Record<string, string> = {
  ALG: 'dz', // Algeria
  ARG: 'ar',
  AUS: 'au',
  AUT: 'at',
  BEL: 'be',
  BIH: 'ba', // Bosnia and Herzegovina
  BRA: 'br',
  CAN: 'ca',
  CIV: 'ci', // Côte d'Ivoire
  COD: 'cd', // DR Congo
  COL: 'co',
  CPV: 'cv', // Cape Verde
  CRO: 'hr',
  CUR: 'cw', // Curaçao
  CZE: 'cz',
  ECU: 'ec',
  EGY: 'eg',
  ENG: 'gb-eng',
  ESP: 'es',
  FRA: 'fr',
  GER: 'de',
  GHA: 'gh',
  HAI: 'ht',
  IRN: 'ir',
  IRQ: 'iq',
  JOR: 'jo',
  JPN: 'jp',
  KOR: 'kr',
  MAR: 'ma',
  MEX: 'mx',
  NED: 'nl',
  NOR: 'no',
  NZL: 'nz',
  PAN: 'pa',
  PAR: 'py', // Paraguay
  POR: 'pt',
  QAT: 'qa',
  RSA: 'za', // South Africa
  SAU: 'sa',
  SCO: 'gb-sct',
  SEN: 'sn',
  SUI: 'ch',
  SWE: 'se',
  TUN: 'tn',
  TUR: 'tr',
  URU: 'uy',
  USA: 'us',
  UZB: 'uz',
};

/**
 * Returns the SVG flag URL for a FIFA team code, or null if unmapped.
 * SVGs render crisply at any size; the consumer controls dimensions via CSS.
 */
export function flagUrl(teamCode: string | null | undefined): string | null {
  if (!teamCode) return null;
  const iso = FIFA_TO_ISO2[teamCode.toUpperCase()];
  return iso ? `https://flagcdn.com/${iso}.svg` : null;
}
