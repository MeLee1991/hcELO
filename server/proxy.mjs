import express from 'express';
import cors from 'cors';

//jest
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
//end jest

const app = express();
const PORT = process.env.PORT || 5175;

app.use(cors());
app.use(express.json());

function extractTournamentId(url) {
  const m = url.match(/\/(\d+)\/?$/);
  return m ? m[1] : null;
}

function extractTournamentName(url) {
  const m = url.match(/\/tournament\/([^/]+)\/\d+/);
  if (!m) return null;
  return decodeURIComponent(m[1]).replace(/\+/g, ' ');
}

function inferWinner(match) {
  const scoreA = typeof match.scoreA === 'number' ? match.scoreA : null;
  const scoreB = typeof match.scoreB === 'number' ? match.scoreB : null;
  const playerAName = match.playerA?.name || 'Player A';
  const playerBName = match.playerB?.name || 'Player B';

  if (scoreA !== null && scoreB !== null && scoreA !== scoreB) {
    return scoreA > scoreB ? playerAName : playerBName;
  }

  if (playerAName.toLowerCase().includes('walk over')) return playerBName;
  if (playerBName.toLowerCase().includes('walk over')) return playerAName;

  return null;
}

app.post('/api/fetchTournament', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url in body' });

    const tournamentId = extractTournamentId(url);
    if (!tournamentId) return res.status(400).json({ error: 'Unable to extract tournament ID from URL' });

    const apiUrl = `https://api.cuescore.com/tournament/?lang=en&id=${tournamentId}`;
    const resultsUrl = `https://api.cuescore.com/tournament/?lang=en&results&id=${tournamentId}`;

    const [tournamentResp, resultsResp] = await Promise.all([
      fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; hcELO/1.0)',
          Accept: 'application/json',
        },
      }),
      fetch(resultsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; hcELO/1.0)',
          Accept: 'application/json',
        },
      }).catch(() => null),
    ]);

    if (!tournamentResp.ok) {
      throw new Error(`CueScore API failed: ${tournamentResp.status}`);
    }

    const tournamentJson = await tournamentResp.json();
    const resultsJson = resultsResp && resultsResp.ok ? await resultsResp.json() : null;

    const venueName = Array.isArray(tournamentJson.venues) && tournamentJson.venues.length > 0
      ? tournamentJson.venues[0].name
      : null;

    const placementResults = [];
    if (resultsJson && typeof resultsJson === 'object') {
      for (const [placeKey, players] of Object.entries(resultsJson)) {
        const place = Number(placeKey);
        if (Number.isNaN(place) || !Array.isArray(players)) continue;
        for (const player of players) {
          placementResults.push({
            place,
            playerName: player.name,
            cuescorePlayerId: player.playerId,
            rankingPoints: player.rankingPoints ? Number(player.rankingPoints) : undefined,
          });
        }
      }
    }

    const games = Array.isArray(tournamentJson.matches)
      ? tournamentJson.matches.map((match) => {
          const player1 = match.playerA?.name || 'Player A';
          const player2 = match.playerB?.name || 'Player B';
          const winner = inferWinner(match);

          let tableName = undefined;
          let tableVenue = undefined;
          if (match.table) {
            const table = Array.isArray(match.table) ? match.table[0] : match.table;
            if (table) {
              tableName = table.name || undefined;
              tableVenue = table.venue?.name || venueName || undefined;
            }
          }

          return {
            player1,
            player2,
            playerAId: match.playerA?.playerId,
            playerBId: match.playerB?.playerId,
            winner,
            scoreA: typeof match.scoreA === 'number' ? match.scoreA : null,
            scoreB: typeof match.scoreB === 'number' ? match.scoreB : null,
            matchId: match.matchId,
            matchNo: match.matchno,
            round: match.round,
            roundName: match.roundName,
            handicapA: typeof match.handicapA === 'string' ? match.handicapA : null,
            handicapB: typeof match.handicapB === 'string' ? match.handicapB : null,
            tableName,
            tableVenue,
            playedAt: match.starttime || tournamentJson.displayDate || new Date().toISOString(),
          };
        })
      : [];

    const tournament = {
      id: `tournament-${tournamentId}`,
      name: tournamentJson.name || extractTournamentName(url) || url,
      date: tournamentJson.displayDate || tournamentJson.starttime || new Date().toISOString(),
      url,
      cuescore_id: tournamentId,
      imported: true,
      venue: venueName || undefined,
      placementResults: placementResults.length > 0 ? placementResults : undefined,
    };

    return res.json({ tournament, games });
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('/health', (req, res) => res.send('ok'));

//app.listen(PORT, () => {
//  console.log(`CueScore proxy listening on http://localhost:${PORT}`);
//});
// comentiru zarad tega spodi


//spet jest
// ADD THESE LINES at the end of your proxy.mjs:
// 1. Serve static files from the build output
app.use(express.static(path.join(__dirname, '../dist')));

// 2. Catch-all route to serve the SPA (for React/Vue router)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(process.env.PORT || 3000);
//jest end
