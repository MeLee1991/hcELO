import assert from 'node:assert/strict';

const kFactor = 20;
const tiers = [
  { name: 'Pro', baselineElo: 2000 },
  { name: 'A+', baselineElo: 1800 },
  { name: 'A1', baselineElo: 1700 },
  { name: 'A2', baselineElo: 1600 },
  { name: 'A3', baselineElo: 1500 },
  { name: 'B1', baselineElo: 1400 },
  { name: 'B2', baselineElo: 1300 },
  { name: 'B3', baselineElo: 1200 },
  { name: 'B-', baselineElo: 1100 },
];

function expectedOutcome(playerRating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

function calculateElo(playerRatingA, playerRatingB, winner, customKFactor = kFactor) {
  const expectedA = expectedOutcome(playerRatingA, playerRatingB);
  const expectedB = expectedOutcome(playerRatingB, playerRatingA);
  const scoreA = winner === 'A' ? 1 : 0;
  const scoreB = winner === 'B' ? 1 : 0;
  return {
    newRatingA: Math.round((playerRatingA + customKFactor * (scoreA - expectedA)) * 100) / 100,
    newRatingB: Math.round((playerRatingB + customKFactor * (scoreB - expectedB)) * 100) / 100,
  };
}

function betterTier(tierA, tierB) {
  return tiers.findIndex((tier) => tier.name === tierA) <= tiers.findIndex((tier) => tier.name === tierB) ? tierA : tierB;
}

function enforceMinimumTier(suggestedTier, minimumTier) {
  return minimumTier ? betterTier(suggestedTier, minimumTier) : suggestedTier;
}

function evaluateMonthlyTier(currentTierName, rating) {
  const currentIndex = tiers.findIndex((tier) => tier.name === currentTierName);
  for (let index = 0; index < currentIndex; index += 1) {
    if (rating >= tiers[index].baselineElo) return tiers[index].name;
  }
  if (rating < tiers[currentIndex].baselineElo - 50) {
    for (let index = currentIndex + 1; index < tiers.length; index += 1) {
      if (rating >= tiers[index].baselineElo - 50 || index === tiers.length - 1) return tiers[index].name;
    }
  }
  return currentTierName;
}

assert.equal(expectedOutcome(1500, 1500), 0.5);
assert.equal(calculateElo(1500, 1500, 'A').newRatingA, 1510);
assert.equal(calculateElo(1500, 1500, 'A').newRatingB, 1490);
assert.equal(calculateElo(1500, 1500, 'A', 10).newRatingA, 1505);
assert.equal(evaluateMonthlyTier('A3', 1599.99), 'A3');
assert.equal(evaluateMonthlyTier('A3', 1600), 'A2');
assert.equal(evaluateMonthlyTier('A2', 1550), 'A2');
assert.equal(evaluateMonthlyTier('A2', 1549.99), 'A3');
assert.equal(enforceMinimumTier('B2', 'A3'), 'A3');
assert.equal(enforceMinimumTier('A2', 'A3'), 'A2');
console.log('Handicap math smoke checks passed.');
