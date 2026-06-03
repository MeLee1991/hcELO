import type { Player } from './types';

// No built-in player names are seeded. The app expects the real CueScore/Google
// Sheet exports (for example files named "CS-235 - ... .csv") to be uploaded by
// the admin so no fake/demo rankings can leak into production.
export const seedPlayers: Player[] = [];
