import { pickBestThirds } from './best-third-places';
import type { GroupStanding } from './types';
import type { GroupLetter } from '@bolao/shared';

function third(
  teamCode: string,
  groupLetter: GroupLetter,
  points: number,
  gd: number,
  gf: number,
  fifaRank: number,
): GroupStanding {
  return {
    teamCode,
    groupLetter,
    position: 3,
    played: 3,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: gf,
    goalsAgainst: gf - gd,
    goalDifference: gd,
    points,
    fifaRank,
  };
}

describe('pickBestThirds', () => {
  it('throws if fewer than 8 thirds are supplied', () => {
    expect(() => pickBestThirds([])).toThrow();
    expect(() => pickBestThirds([third('A', 'A', 3, 0, 2, 10)])).toThrow();
  });

  it('sorts by pts, then gd, then gf, then FIFA rank', () => {
    const thirds: GroupStanding[] = [
      third('T1', 'A', 4, 1, 3, 20),
      third('T2', 'B', 4, 2, 3, 5),  // better gd than T1
      third('T3', 'C', 3, 5, 5, 10),
      third('T4', 'D', 4, 1, 3, 10), // ties T1 on pts/gd/gf; lower FIFA rank
      third('T5', 'E', 4, 1, 4, 30), // ties T1 on pts/gd, better gf
      third('T6', 'F', 4, 1, 3, 50),
      third('T7', 'G', 1, 0, 2, 5),
      third('T8', 'H', 0, -3, 0, 100),
      third('T9', 'I', 0, -5, 0, 200),
      third('T10', 'J', 7, 5, 8, 60),
      third('T11', 'K', 6, 3, 6, 7),
      third('T12', 'L', 6, 2, 5, 2),
    ];
    const out = pickBestThirds(thirds);
    expect(out).toHaveLength(8);
    expect(out.map((s) => s.teamCode)).toEqual([
      'T10', // 7 pts
      'T11', // 6 pts gd+3
      'T12', // 6 pts gd+2
      'T2',  // 4 pts gd+2
      'T5',  // 4 pts gd+1 gf=4
      'T4',  // 4 pts gd+1 gf=3 FIFA=10
      'T1',  // 4 pts gd+1 gf=3 FIFA=20
      'T6',  // 4 pts gd+1 gf=3 FIFA=50
    ]);
    expect(out[0]!.bestThirdRank).toBe(1);
    expect(out[7]!.bestThirdRank).toBe(8);
  });

  it('assigns bestThirdRank 1..8 strictly in order', () => {
    const thirds: GroupStanding[] = (['A','B','C','D','E','F','G','H','I','J','K','L'] as const)
      .map((g, i) => third(`T${i}`, g, 9 - i, 0, 0, i + 1));
    const out = pickBestThirds(thirds);
    expect(out.map((s) => s.bestThirdRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
