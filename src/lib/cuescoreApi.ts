import type { CueScoreGame, Tournament } from './types';

const PROXY_URL = 'http://localhost:5175/api/fetchTournament';

export function extractTournamentId(url: string): string | null {
  const match = url.match(/\/(\d+)\/?$/);
  return match ? match[1] : null;
}

export function extractTournamentName(url: string): string | null {
  const match = url.match(/\/tournament\/([^/]+)\/\d+/);
  if (!match) return null;
  return decodeURIComponent(match[1]).replace(/\+/g, ' ');
}

export async function fetchTournamentData(url: string): Promise<{ tournament: Tournament; games: CueScoreGame[] } | null> {
  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      console.error('Proxy fetch failed', response.status, await response.text());
      return null;
    }

    const json = await response.json();
    const tournament: Tournament = json.tournament;
    const games: CueScoreGame[] = Array.isArray(json.games) ? json.games : [];
    return { tournament, games };
  } catch (error) {
    console.error('Error fetching tournament data via proxy:', error);
    return null;
  }
}

export async function fetchMultipleTournaments(urls: string[]): Promise<{ tournaments: Tournament[]; games: CueScoreGame[] }> {
  const allTournaments: Tournament[] = [];
  const allGames: CueScoreGame[] = [];

  for (const url of urls) {
    const tournamentData = await fetchTournamentData(url);
    if (!tournamentData) continue;

    allTournaments.push(tournamentData.tournament);

    // Map using the actual tournamentId returned from the JSON payload
    const tId = String((tournamentData.tournament as any).tournamentId || tournamentData.tournament.id);

    const gamesWithMeta = tournamentData.games.map((game) => ({
      ...game,
      tournamentId: tId,
    }));

    allGames.push(...gamesWithMeta);

    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  return { tournaments: allTournaments, games: allGames };
}

export async function fetchHandicapList(handicapId: number): Promise<any[] | null> {
  try {
    const response = await fetch('http://localhost:5175/api/fetchHandicap', { // Adjust if your proxy endpoint name differs
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: handicapId }),
    });

    if (!response.ok) return null;
    const json = await response.json();
    
    // Depending on CueScore's API structure, extract the players array
    return json.players || json.rankings || json; 
  } catch (error) {
    console.error('Error fetching handicap list:', error);
    return null;
  }
}