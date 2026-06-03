import { calculateElo, getTier, HANDICAP_TIERS, type TierName } from './handicap';
import type { MatchLog, Player } from './types';

export interface ParsedMatchRow {
  playedAt: string;
  club: string;
  tournamentName: string;
  playerAName: string;
  playerBName: string;
  winnerName: string;
  scoreA?: string;
  scoreB?: string;
  sourceUrl?: string;
}

export function normalizeTier(value: string): TierName | undefined {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'PRO') return 'Pro';
  return HANDICAP_TIERS.find((tier) => tier.name.toUpperCase() === normalized)?.name;
}

export function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function splitDelimitedLine(line: string) {
  const delimiter = line.includes('\t') ? '\t' : ',';
  const result: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseMatchRows(text: string, fallbackUrl = ''): ParsedMatchRow[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const first = splitDelimitedLine(lines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = ['date', 'playedat', 'played_at', 'playera', 'player_a', 'winner'].some((header) =>
    first.includes(header),
  );
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const header = hasHeader ? first : [];

  function value(cells: string[], names: string[], fallbackIndex: number) {
    const found = names.map((name) => header.indexOf(name)).find((index) => index >= 0);
    return cells[found ?? fallbackIndex] ?? '';
  }

  return dataLines
    .map((line) => splitDelimitedLine(line))
    .map((cells) => ({
      playedAt: value(cells, ['date', 'playedat', 'played_at'], 0),
      club: value(cells, ['club', 'venue'], 1),
      tournamentName: value(cells, ['tournament', 'tournamentname', 'event'], 2),
      playerAName: value(cells, ['playera', 'player_a', 'player a'], 3),
      playerBName: value(cells, ['playerb', 'player_b', 'player b'], 4),
      winnerName: value(cells, ['winner', 'winnername', 'winner name'], 5),
      scoreA: value(cells, ['scorea', 'score_a', 'score a'], 6),
      scoreB: value(cells, ['scoreb', 'score_b', 'score b'], 7),
      sourceUrl: value(cells, ['url', 'sourceurl', 'source_url'], 8) || fallbackUrl,
    }))
    .filter((row) => row.playerAName && row.playerBName && row.winnerName);
}

export function playerExportCsv(players: Player[]) {
  const rows = [['Name', 'Handicap', 'Minimum HC', 'Elo', 'Tournament Points', 'Notes']];
  players.forEach((player) => {
    rows.push([
      player.name,
      player.visibleTier,
      player.minimumTier ?? '',
      player.backgroundElo.toFixed(2),
      String(player.tournamentPoints),
      player.notes ?? '',
    ]);
  });
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function matchExportCsv(matches: MatchLog[], playerName: (id: string) => string) {
  const rows = [['Date', 'Club', 'Tournament', 'Player A', 'Player B', 'Winner', 'Score A', 'Score B', 'URL']];
  matches.forEach((match) => {
    rows.push([
      match.playedAt,
      match.club ?? '',
      match.tournamentName ?? '',
      playerName(match.playerAId),
      playerName(match.playerBId),
      playerName(match.winnerId),
      match.scoreA ?? '',
      match.scoreB ?? '',
      match.sourceUrl ?? '',
    ]);
  });
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function applyParsedMatch(players: Player[], row: ParsedMatchRow, idFactory: (prefix: string) => string): MatchLog | null {
  const playerA = findPlayerByName(players, row.playerAName);
  const playerB = findPlayerByName(players, row.playerBName);
  const winner = findPlayerByName(players, row.winnerName);
  if (!playerA || !playerB || !winner || (winner.id !== playerA.id && winner.id !== playerB.id)) return null;

  const result = calculateElo(playerA.backgroundElo, playerB.backgroundElo, winner.id === playerA.id ? 'A' : 'B');
  const match: MatchLog = {
    id: idFactory('match'),
    playedAt: row.playedAt ? new Date(row.playedAt).toISOString() : new Date().toISOString(),
    club: row.club,
    tournamentName: row.tournamentName,
    playerAId: playerA.id,
    playerBId: playerB.id,
    winnerId: winner.id,
    playerAOldElo: playerA.backgroundElo,
    playerBOldElo: playerB.backgroundElo,
    playerANewElo: result.newRatingA,
    playerBNewElo: result.newRatingB,
    expectedA: result.expectedA,
    expectedB: result.expectedB,
    sourceUrl: row.sourceUrl,
    scoreA: row.scoreA,
    scoreB: row.scoreB,
  };
  playerA.backgroundElo = result.newRatingA;
  playerB.backgroundElo = result.newRatingB;
  return match;
}

export function findPlayerByName(players: Player[], name: string) {
  const normalized = normalizeName(name);
  return players.find((player) => normalizeName(player.name) === normalized);
}

export function normalizeName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function tierBaseline(tierName: TierName) {
  return getTier(tierName).baselineElo;
}
