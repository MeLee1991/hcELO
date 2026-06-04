import type { TierName } from './handicap';

export interface Player {
  id: string;
  name: string;
  visibleTier: TierName;
  backgroundElo: number;
  tournamentPoints: number;
  gamesPlayed: number;
  tournamentsPlayed: number;
  wins: number;
  losses: number;
  cueScoreId?: string; // ID from cuescore.com
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
  tournamentId?: string;
  matchId?: number;
  matchNo?: number;
  round?: number;
  roundName?: string;
  scoreA?: number | null;
  scoreB?: number | null;
  handicapA?: string | null;
  handicapB?: string | null;
  tableName?: string;
  tableVenue?: string;
  source: 'manual' | 'imported';
}

export interface TierChangeLog {
  id: string;
  processedAt: string;
  playerId: string;
  oldTier: TierName;
  newTier: TierName;
  eloAtProcessing: number;
}

export interface TournamentPlacement {
  place: number;
  playerName: string;
  cuescorePlayerId?: number;
  rankingPoints?: number;
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  url: string;
  cuescore_id: string;
  imported: boolean;
  venue?: string;
  placementResults?: TournamentPlacement[];
}

export interface CueScoreGame {
  matchId?: number;
  matchNo?: number;
  round?: number;
  roundName?: string;
  player1?: string; // Keep for backward compatibility with other components
  player2?: string;
  playerAId?: number;
  playerBId?: number;
  playerA?: {
    playerId: number;
    name: string;
  };
  playerB?: {
    playerId: number;
    name: string;
  };
  winner?: string | null;
  scoreA?: number | null;
  scoreB?: number | null;
  handicapA?: string | null;
  handicapB?: string | null;
  tableName?: string;
  tableVenue?: string;
  table?: {
    venue?: {
      name: string;
    };
  };
  starttime?: string;
  playedAt?: string;
  tournamentId?: string;
  venue?: string; // <--- Add this back to satisfy cuescoreApi.ts
}