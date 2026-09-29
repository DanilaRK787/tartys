// Training challenges. Each one is a normal match with a goal checked from engine stats.
export const CHALLENGES = [
  { id: 'tutorial', title: 'chTutorial', text: 'chTutorialText', icon: '①', setup: { kind: 'tutorial' } },
  { id: 'blitz', title: 'chBlitz', text: 'chBlitzText', icon: '⚡', setup: { kind: 'bot', level: 'easy' },
    check: (r) => r.winner === 0 && r.reason === 'line' && r.t < 25000, score: (r) => Math.max(0, 25000 - r.t) },
  { id: 'no-slip', title: 'chNoSlip', text: 'chNoSlipText', icon: '❄', setup: { kind: 'bot', level: 'normal' },
    check: (r) => r.winner === 0 && r.stats.exhausts === 0, fail: (live) => live.exhausts > 0 },
  { id: 'perfect', title: 'chPerfect', text: 'chPerfectText', icon: '◎', setup: { kind: 'bot', level: 'normal' },
    check: (r) => r.stats.perfect >= 3, live: (s) => s.perfect >= 3, progress: (s) => `${Math.min(3, s.perfect)}/3` },
  { id: 'atlas', title: 'chAtlas', text: 'chAtlasText', icon: '✳', setup: { kind: 'bot', level: 'normal', atlas: true },
    check: (r) => r.stats.correct >= 2 && r.stats.charged >= 1, live: (s) => s.correct >= 2 && s.charged >= 1, progress: (s) => `${Math.min(2, s.correct)}/2 · ⚡${s.charged}` },
  { id: 'team', title: 'chTeam', text: 'chTeamText', icon: '⇄', setup: { kind: 'team', level: 'normal' },
    check: (r) => r.stats.synced >= 2, live: (s) => s.synced >= 2, progress: (s) => `${Math.min(2, s.synced)}/2` },
  { id: 'wall', title: 'chWall', text: 'chWallText', icon: '▮', setup: { kind: 'bot', level: 'hard' },
    check: (r) => r.winner !== 1 },
  { id: 'series', title: 'chSeries', text: 'chSeriesText', icon: '♛', setup: { kind: 'series', level: 'hard' },
    checkSeries: (wins) => wins[0] >= 2 }
];
export const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));
