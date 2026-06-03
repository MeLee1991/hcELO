import type { TierName } from './handicap';

export interface Player {
  id: string;
  name: string;
  visibleTier: TierName;
  backgroundElo: number;
  tournamentPoints: number;
}

export interface MatchLog {
  id: string;
  playedAt: string;
  playerAId: string;
  playerBId: string;
  winnerId: string;
  playerAOldElo: number;
  playerBOldElo: number;
  playerANewElo: number;
  playerBNewElo: number;
  expectedA: number;
  expectedB: number;
}

export interface TierChangeLog {
  id: string;
  processedAt: string;
  playerId: string;
  oldTier: TierName;
  newTier: TierName;
  eloAtProcessing: number;
}
