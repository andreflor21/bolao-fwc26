import fs from 'node:fs';
const sql = fs.readFileSync('apps/api/prisma/audit/annex-c-third-place-affected.sql','utf8');
const re = /^\('([A-L]{8})','([A-L])','(R32-\d+)','([A-L])'\)[,;]?$/;
const combos = new Map();
let rows = 0;
for (const line of sql.split('\n')) {
  const m = line.trim().match(re);
  if (!m) continue;
  rows++;
  const [,key,winner,fixture,third] = m;
  if (!combos.has(key)) combos.set(key, {});
  combos.get(key)[winner] = { fixture, third };
}
console.error('rows parsed:', rows, 'combos:', combos.size);
// validation
const winners = ['A','B','D','E','G','I','K','L'];
const fixtureByWinner = {A:'R32-79',B:'R32-85',D:'R32-81',E:'R32-74',G:'R32-82',I:'R32-77',K:'R32-87',L:'R32-80'};
let bad = 0;
for (const [key,obj] of combos) {
  // each combo must have 8 winners, fixture mapping consistent, thirds = sorted set == key
  const ws = Object.keys(obj).sort().join('');
  if (ws !== winners.join('')) { console.error('BAD winners', key, ws); bad++; }
  for (const wgrp of winners) {
    if (obj[wgrp].fixture !== fixtureByWinner[wgrp]) { console.error('BAD fixture', key, wgrp, obj[wgrp].fixture); bad++; }
  }
  const thirds = winners.map(wg=>obj[wg].third).sort().join('');
  if (thirds !== key) { console.error('BAD thirds', key, thirds); bad++; }
}
console.error('validation errors:', bad);
if (bad>0 || combos.size!==495 || rows!==3960) process.exit(1);

// emit TS keyed by combo_key -> { winnerGroup: thirdGroup }
const keys = [...combos.keys()].sort();
let out = `import type { GroupLetter } from '@bolao/shared';\n\n`;
out += `/**\n * FIFA World Cup 2026 — Annex C best-third-place allocation table.\n *\n`;
out += ` * AUTO-GENERATED — do not edit by hand. Source: the 495 official combinations\n`;
out += ` * (C(12,8)) from the FWC 2026 regulations, one row per group-winner fixture.\n`;
out += ` * Regenerate with apps/api/prisma/audit/gen-annex-c.mjs if the source changes.\n`;
out += ` *\n`;
out += ` * Keyed by the combination key = the 8 qualifying third-place group letters\n`;
out += ` * sorted alphabetically and joined. Each value maps the WINNER group of a\n`;
out += ` * best-third R32 fixture to the third-place group that the regulation places\n`;
out += ` * against it. Winner group -> fixture is fixed:\n`;
out += ` *   A->R32-79  B->R32-85  D->R32-81  E->R32-74\n`;
out += ` *   G->R32-82  I->R32-77  K->R32-87  L->R32-80\n`;
out += ` */\n`;
out += `export const ANNEX_C_THIRD_PLACE: Record<string, Partial<Record<GroupLetter, GroupLetter>>> = {\n`;
for (const key of keys) {
  const obj = combos.get(key);
  const inner = winners.map(wg=>`${wg}: '${obj[wg].third}'`).join(', ');
  out += `  ${key}: { ${inner} },\n`;
}
out += `};\n\n`;
out += `/** Winner group letter -> the R32 best-third fixture it hosts (FWC 2026). */\n`;
out += `export const ANNEX_C_FIXTURE_BY_WINNER: Partial<Record<GroupLetter, string>> = {\n`;
out += `  A: 'R32-79', B: 'R32-85', D: 'R32-81', E: 'R32-74',\n`;
out += `  G: 'R32-82', I: 'R32-77', K: 'R32-87', L: 'R32-80',\n`;
out += `};\n`;
fs.writeFileSync('apps/api/src/domain/bracket/annex-c-third-place.ts', out);
console.error('wrote annex-c-third-place.ts (', keys.length, 'combos )');
