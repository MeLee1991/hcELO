let K_FACTOR = 20;
export function setKFactor(k: number) {
  K_FACTOR = Math.max(1, Number(k) || 1);
}

export function getKFactor() {
  return K_FACTOR;
}
export const DEMOTION_BUFFER = 50;

export const HANDICAP_TIERS = [
  { name: 'Pro', baselineElo: 2000 },
  { name: 'A+', baselineElo: 1800 },
  { name: 'A1', baselineElo: 1700 },
  { name: 'A2', baselineElo: 1600 },
  { name: 'A3', baselineElo: 1500 },
  { name: 'B1', baselineElo: 1400 },
  { name: 'B2', baselineElo: 1300 },
  { name: 'B3', baselineElo: 1200 },
  { name: 'B-', baselineElo: 1100 },
  { name: 'C+', baselineElo: 1000 },
] as const;

export type TierName = (typeof HANDICAP_TIERS)[number]['name'];

export interface EloResult {
  expectedA: number;
  expectedB: number;
  newRatingA: number;
  newRatingB: number;
  deltaA: number;
  deltaB: number;
}

export function getTier(tierName: TierName) {
  return HANDICAP_TIERS.find((tier) => tier.name === tierName) ?? HANDICAP_TIERS[HANDICAP_TIERS.length - 1];
}

export function getTierIndex(tierName: TierName) {
  return HANDICAP_TIERS.findIndex((tier) => tier.name === tierName);
}

export function expectedOutcome(playerRating: number, opponentRating: number) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

export function calculateElo(playerRatingA: number, playerRatingB: number, winner: 'A' | 'B'): EloResult {
  const expectedA = expectedOutcome(playerRatingA, playerRatingB);
  const expectedB = expectedOutcome(playerRatingB, playerRatingA);
  const scoreA = winner === 'A' ? 1 : 0;
  const scoreB = winner === 'B' ? 1 : 0;
  const deltaA = getKFactor() * (scoreA - expectedA);
  const deltaB = getKFactor() * (scoreB - expectedB);

  return {
    expectedA,
    expectedB,
    newRatingA: Math.round((playerRatingA + deltaA) * 100) / 100,
    newRatingB: Math.round((playerRatingB + deltaB) * 100) / 100,
    deltaA: Math.round(deltaA * 100) / 100,
    deltaB: Math.round(deltaB * 100) / 100,
  };
}

export function tierForInitialElo(rating: number): TierName {
  return HANDICAP_TIERS.find((tier) => rating >= tier.baselineElo)?.name ?? 'B-';
}

export function evaluateMonthlyTier(currentTierName: TierName, rating: number): TierName {
  const currentIndex = getTierIndex(currentTierName);
  if (currentIndex < 0) return tierForInitialElo(rating);

  for (let index = 0; index < currentIndex; index += 1) {
    if (rating >= HANDICAP_TIERS[index].baselineElo) {
      return HANDICAP_TIERS[index].name;
    }
  }

  const currentTier = HANDICAP_TIERS[currentIndex];
  if (rating < currentTier.baselineElo - DEMOTION_BUFFER) {
    for (let index = currentIndex + 1; index < HANDICAP_TIERS.length; index += 1) {
      const candidate = HANDICAP_TIERS[index];
      if (rating >= candidate.baselineElo - DEMOTION_BUFFER || index === HANDICAP_TIERS.length - 1) {
        return candidate.name;
      }
    }
  }

  return currentTierName;
}

export function tournamentPointsForPlacement(placement: number) {
  if (placement === 1) return 100;
  if (placement === 2) return 70;
  if (placement === 3) return 50;
  return 0;
}
