<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  calculateElo,
  enforceMinimumTier,
  evaluateMonthlyTier,
  expectedOutcome,
  HANDICAP_TIERS,
  K_FACTOR,
  tierForInitialElo,
  tournamentPointsForPlacement,
  type TierName,
} from './lib/handicap';
import {
  applyParsedMatch,
  findPlayerByName,
  matchExportCsv,
  normalizeTier,
  parseMatchRows,
  playerExportCsv,
  splitDelimitedLine,
  tierBaseline,
} from './lib/importExport';
import { seedPlayers } from './lib/seed';
import type { MatchLog, Player, TierChangeLog } from './lib/types';

const storageKey = 'hcelo-state-v3';
const defaultGoogleSheetUrl = 'https://docs.google.com/spreadsheets/d/162XyMOkN6GT8NkU-skuEVSnJDN_HYOLx4E1FpV-RatI/edit?usp=sharing';
const defaultCueScoreHandicapUrl = 'https://cuescore.com/dashboard/biljardnazvezaslovenije/handicaps?handicapId=64255726';

interface AppState {
  players: Player[];
  matches: MatchLog[];
  tierChanges: TierChangeLog[];
  settings: {
    kFactor: number;
  };
}

type PeriodFilter = 'currentMonth' | 'lastTwoMonths' | 'season' | 'all' | 'custom';

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultState(): AppState {
  return {
    players: structuredClone(seedPlayers),
    matches: [],
    tierChanges: [],
    settings: { kFactor: K_FACTOR },
  };
}

function migrateState(value: Partial<AppState>): AppState {
  return {
    players: (value.players?.length ? value.players : seedPlayers).map((player) => ({
      ...player,
      sourceHandicap: player.sourceHandicap ?? player.visibleTier,
      minimumTier: player.minimumTier ?? player.visibleTier,
      tournamentPoints: player.tournamentPoints ?? 0,
    })),
    matches: value.matches ?? [],
    tierChanges: value.tierChanges ?? [],
    settings: { kFactor: value.settings?.kFactor ?? K_FACTOR },
  };
}

function loadState(): AppState {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return defaultState();
  try {
    return migrateState(JSON.parse(saved) as Partial<AppState>);
  } catch {
    return defaultState();
  }
}

const state = reactive<AppState>(loadState());
const playerAId = ref(state.players[0]?.id ?? '');
const playerBId = ref(state.players[1]?.id ?? '');
const winnerId = ref(playerAId.value);
const newPlayerName = ref('');
const newPlayerTier = ref<TierName>('B-');
const newPlayerMinimumTier = ref<TierName>('B-');
const csvImport = ref('');
const matchImportText = ref('');
const matchImportUrl = ref('');
const importStatus = ref('');
const tournamentName = ref('Monday HC Night');
const firstPlace = ref('');
const secondPlace = ref('');
const thirdPlaceOne = ref('');
const thirdPlaceTwo = ref('');
const statsPlayerId = ref('all');
const statsPeriod = ref<PeriodFilter>('season');
const statsClub = ref('all');
const customStart = ref(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
const customEnd = ref(new Date().toISOString().slice(0, 10));
const improvementLimit = ref(20);
const selectedFileNames = ref('No CSV files selected yet.');

const sortedPlayers = computed(() =>
  [...state.players].sort((a, b) => b.backgroundElo - a.backgroundElo || b.tournamentPoints - a.tournamentPoints),
);

const leaderboard = computed(() =>
  [...state.players].sort((a, b) => b.tournamentPoints - a.tournamentPoints || b.backgroundElo - a.backgroundElo),
);

const clubs = computed(() => {
  const values = new Set(state.matches.map((match) => match.club).filter(Boolean) as string[]);
  return [...values].sort((a, b) => a.localeCompare(b));
});

const selectedA = computed(() => state.players.find((player) => player.id === playerAId.value));
const selectedB = computed(() => state.players.find((player) => player.id === playerBId.value));
const matchPreview = computed(() => {
  if (!selectedA.value || !selectedB.value || selectedA.value.id === selectedB.value.id) return null;
  return {
    expectedA: expectedOutcome(selectedA.value.backgroundElo, selectedB.value.backgroundElo),
    expectedB: expectedOutcome(selectedB.value.backgroundElo, selectedA.value.backgroundElo),
  };
});

const dateRange = computed(() => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (statsPeriod.value === 'all') return { start: null, end: null };
  if (statsPeriod.value === 'currentMonth') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  if (statsPeriod.value === 'lastTwoMonths') return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end };
  if (statsPeriod.value === 'custom') {
    return {
      start: customStart.value ? new Date(`${customStart.value}T00:00:00`) : null,
      end: customEnd.value ? new Date(`${customEnd.value}T23:59:59`) : null,
    };
  }
  return { start: new Date(now.getFullYear(), 0, 1), end };
});

const filteredMatches = computed(() =>
  state.matches.filter((match) => {
    const playedAt = new Date(match.playedAt);
    if (dateRange.value.start && playedAt < dateRange.value.start) return false;
    if (dateRange.value.end && playedAt > dateRange.value.end) return false;
    if (statsClub.value !== 'all' && match.club !== statsClub.value) return false;
    if (
      statsPlayerId.value !== 'all' &&
      match.playerAId !== statsPlayerId.value &&
      match.playerBId !== statsPlayerId.value
    ) {
      return false;
    }
    return true;
  }),
);

const statsSummary = computed(() => {
  const wins = filteredMatches.value.filter((match) => statsPlayerId.value === 'all' || match.winnerId === statsPlayerId.value)
    .length;
  const games = filteredMatches.value.length;
  const losses = statsPlayerId.value === 'all' ? 0 : games - wins;
  const opponents = new Map<string, { games: number; wins: number; losses: number }>();

  if (statsPlayerId.value !== 'all') {
    filteredMatches.value.forEach((match) => {
      const opponentId = match.playerAId === statsPlayerId.value ? match.playerBId : match.playerAId;
      const current = opponents.get(opponentId) ?? { games: 0, wins: 0, losses: 0 };
      current.games += 1;
      if (match.winnerId === statsPlayerId.value) current.wins += 1;
      else current.losses += 1;
      opponents.set(opponentId, current);
    });
  }

  return {
    games,
    wins,
    losses,
    winRate: games ? Math.round((wins / games) * 1000) / 10 : 0,
    opponents: [...opponents.entries()].map(([id, value]) => ({ id, name: playerName(id), ...value })),
  };
});

const improvements = computed(() =>
  [...state.players]
    .map((player) => ({
      player,
      delta: Math.round((player.backgroundElo - tierBaseline(player.sourceHandicap ?? player.visibleTier)) * 100) / 100,
      suggestedTier: evaluateMonthlyTier(player.visibleTier, player.backgroundElo),
    }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, improvementLimit.value || state.players.length),
);

const tierSuggestions = computed(() =>
  state.players
    .map((player) => {
      const suggested = evaluateMonthlyTier(player.visibleTier, player.backgroundElo);
      const finalTier = enforceMinimumTier(suggested, player.minimumTier);
      return { player, suggested, finalTier, minimumApplied: suggested !== finalTier };
    })
    .filter((row) => row.suggested !== row.player.visibleTier || row.minimumApplied),
);

watch([playerAId, playerBId], () => {
  if (winnerId.value !== playerAId.value && winnerId.value !== playerBId.value) {
    winnerId.value = playerAId.value;
  }
});

function persist() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function recordMatch(extra: Partial<MatchLog> = {}) {
  const playerA = selectedA.value;
  const playerB = selectedB.value;
  if (!playerA || !playerB || playerA.id === playerB.id) return;

  const actualWinnerId = winnerId.value === playerB.id ? playerB.id : playerA.id;
  const result = calculateElo(
    playerA.backgroundElo,
    playerB.backgroundElo,
    actualWinnerId === playerA.id ? 'A' : 'B',
    state.settings.kFactor,
  );
  const match: MatchLog = {
    id: makeId('match'),
    playedAt: new Date().toISOString(),
    playerAId: playerA.id,
    playerBId: playerB.id,
    winnerId: actualWinnerId,
    playerAOldElo: playerA.backgroundElo,
    playerBOldElo: playerB.backgroundElo,
    playerANewElo: result.newRatingA,
    playerBNewElo: result.newRatingB,
    expectedA: result.expectedA,
    expectedB: result.expectedB,
    ...extra,
  };

  playerA.backgroundElo = result.newRatingA;
  playerB.backgroundElo = result.newRatingB;
  state.matches.unshift(match);
  persist();
}

function addPlayer() {
  const name = newPlayerName.value.trim();
  if (!name) return;
  state.players.push({
    id: makeId('player'),
    name,
    visibleTier: newPlayerTier.value,
    sourceHandicap: newPlayerTier.value,
    minimumTier: newPlayerMinimumTier.value,
    backgroundElo: HANDICAP_TIERS.find((tier) => tier.name === newPlayerTier.value)?.baselineElo ?? 1100,
    tournamentPoints: 0,
  });
  newPlayerName.value = '';
  persist();
}

function applyTournamentPoints() {
  const placements = [firstPlace.value, secondPlace.value, thirdPlaceOne.value, thirdPlaceTwo.value];
  placements.forEach((id, index) => {
    const player = state.players.find((candidate) => candidate.id === id);
    if (player) player.tournamentPoints += tournamentPointsForPlacement(index < 2 ? index + 1 : 3);
  });
  firstPlace.value = '';
  secondPlace.value = '';
  thirdPlaceOne.value = '';
  thirdPlaceTwo.value = '';
  persist();
}

function processMonthlyTiers() {
  state.players.forEach((player) => {
    const suggestedTier = evaluateMonthlyTier(player.visibleTier, player.backgroundElo);
    const newTier = enforceMinimumTier(suggestedTier, player.minimumTier);
    if (newTier !== player.visibleTier || suggestedTier !== newTier) {
      state.tierChanges.unshift({
        id: makeId('tier-change'),
        processedAt: new Date().toISOString(),
        playerId: player.id,
        oldTier: player.visibleTier,
        newTier,
        suggestedTier,
        minimumTierApplied: suggestedTier !== newTier ? player.minimumTier : undefined,
        eloAtProcessing: player.backgroundElo,
      });
      player.visibleTier = newTier;
    }
  });
  persist();
}

function importCsv() {
  const rows = csvImport.value
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean);
  if (!rows.length) return;

  const first = splitDelimitedLine(rows[0]).map((cell) => cell.toLowerCase());
  const hasHeader = first.includes('name') || first.includes('handicap');
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const header = hasHeader ? first : [];

  function value(cells: string[], names: string[], fallbackIndex: number) {
    const found = names.map((name) => header.indexOf(name)).find((index) => index >= 0);
    return cells[found ?? fallbackIndex] ?? '';
  }

  dataRows.forEach((row) => {
    const cells = splitDelimitedLine(row);
    const rawName = value(cells, ['name', 'player'], 0);
    const tier = normalizeTier(value(cells, ['handicap', 'tier', 'hc'], 1));
    const minimumTier = normalizeTier(value(cells, ['minimum hc', 'minihc', 'mini hc', 'minimumtier'], 2));
    const parsedElo = Number(value(cells, ['elo', 'backgroundelo'], 3));
    const points = Number(value(cells, ['points', 'tournamentpoints'], 4));
    const notes = value(cells, ['notes'], 5);
    if (!rawName) return;

    const effectiveTier = tier ?? tierForInitialElo(Number.isFinite(parsedElo) ? parsedElo : 1100);
    const existing = state.players.find((player) => player.name.toLowerCase() === rawName.toLowerCase());
    const nextPlayer: Player = {
      id: existing?.id ?? makeId('player'),
      name: rawName,
      visibleTier: effectiveTier,
      sourceHandicap: effectiveTier,
      minimumTier: minimumTier ?? existing?.minimumTier ?? effectiveTier,
      backgroundElo: Number.isFinite(parsedElo) ? parsedElo : HANDICAP_TIERS.find((candidate) => candidate.name === effectiveTier)?.baselineElo ?? 1100,
      tournamentPoints: Number.isFinite(points) && points > 0 ? points : existing?.tournamentPoints ?? 0,
      notes: notes || existing?.notes,
    };

    if (existing) Object.assign(existing, nextPlayer);
    else state.players.push(nextPlayer);
  });
  csvImport.value = '';
  persist();
}

function importMatches() {
  const parsed = parseMatchRows(matchImportText.value, matchImportUrl.value.trim());
  let imported = 0;
  parsed.forEach((row) => {
    ensurePlayer(row.playerAName);
    ensurePlayer(row.playerBName);
    ensurePlayer(row.winnerName);
    const match = applyParsedMatch(state.players, row, makeId, state.settings.kFactor);
    if (match) {
      state.matches.unshift(match);
      imported += 1;
    }
  });
  importStatus.value = `${imported}/${parsed.length} matches imported. Missing players were auto-created as B- so you can set their real HC/miniHC.`;
  matchImportText.value = '';
  persist();
}

async function fetchMatchUrl() {
  const url = matchImportUrl.value.trim();
  if (!url) return;
  importStatus.value = 'Trying to fetch URL. If CueScore blocks browser access, paste/export the rows below instead.';
  try {
    const response = await fetch(url);
    const html = await response.text();
    matchImportText.value = html;
    importStatus.value = 'Fetched raw page text. If no rows import, copy the match table from CueScore and paste CSV/TSV rows.';
  } catch (error) {
    importStatus.value = `Could not fetch that URL from the browser (${error instanceof Error ? error.message : 'blocked'}). Paste CSV/TSV rows instead.`;
  }
}

function ensurePlayer(name: string) {
  const cleanName = name.trim();
  if (!cleanName) return null;
  const existing = findPlayerByName(state.players, cleanName);
  if (existing) return existing;
  const player: Player = {
    id: makeId('player'),
    name: cleanName,
    visibleTier: 'B-',
    sourceHandicap: 'B-',
    minimumTier: 'B-',
    backgroundElo: 1100,
    tournamentPoints: 0,
    notes: 'Auto-created from imported games; set correct HC/miniHC manually.',
  };
  state.players.push(player);
  return player;
}

async function importCsvFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  if (!files.length) return;
  selectedFileNames.value = files.map((file) => file.name).join(', ');

  const readFiles = await Promise.all(
    files.map(async (file) => ({ name: file.name, text: await file.text() })),
  );
  let playerFiles = 0;
  let matchFiles = 0;

  readFiles
    .filter((file) => /hc|handicap|rank|mini/i.test(file.name))
    .forEach((file) => {
      csvImport.value = file.text;
      importCsv();
      playerFiles += 1;
    });

  readFiles
    .filter((file) => !/hc|handicap|rank|mini/i.test(file.name))
    .forEach((file) => {
      matchImportUrl.value = file.name;
      matchImportText.value = file.text;
      importMatches();
      matchFiles += 1;
    });

  importStatus.value = `Loaded ${playerFiles} player/HC file(s) and ${matchFiles} game/tournament file(s).`;
  input.value = '';
  persist();
}

function playerName(id: string) {
  return state.players.find((player) => player.id === id)?.name ?? 'Unknown player';
}

function download(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportPlayers() {
  download('hcelo-current-handicaps.csv', playerExportCsv(state.players));
}

function exportMatches() {
  download('hcelo-matches.csv', matchExportCsv(state.matches, playerName));
}

function resetToCurrentRankings() {
  Object.assign(state, defaultState());
  playerAId.value = state.players[0]?.id ?? '';
  playerBId.value = state.players[1]?.id ?? '';
  winnerId.value = playerAId.value;
  persist();
}
</script>

<template>
  <main class="shell">
    <section class="hero card">
      <div>
        <p class="eyebrow">Billiards Tournament & Handicap Tracker</p>
        <h1>Editable HC spreadsheet, tournament imports, and player statistics.</h1>
        <p>
          No player names or matches are invented in the app anymore. Upload your real <strong>CS-235 - ...</strong>
          CSV files, then edit names, HC, miniHC, Elo, points, and K directly from the first screen.
        </p>
      </div>
      <div class="metric-grid">
        <div><strong>{{ state.players.length }}</strong><span>Players</span></div>
        <div><strong>{{ state.matches.length }}</strong><span>Matches logged</span></div>
        <div><strong>{{ clubs.length || 'All' }}</strong><span>Clubs</span></div>
      </div>
    </section>



    <section class="card spreadsheet-card">
      <div class="sheet-toolbar">
        <div>
          <p class="eyebrow dark">CS-235 control sheet</p>
          <h2>Current handicaps / rankings</h2>
          <p class="hint">Upload the real CSV files from the project root. HC/ranking/mini files are loaded first; game/tournament files are imported after that.</p>
        </div>
        <label class="file-drop">
          Upload CS-235 CSV files
          <input type="file" multiple accept=".csv,.tsv,.txt" @change="importCsvFiles" />
          <span>{{ selectedFileNames }}</span>
        </label>
        <label>T1 period
          <select v-model="statsPeriod">
            <option value="currentMonth">This month</option>
            <option value="lastTwoMonths">Last two months</option>
            <option value="season">Season / year</option>
            <option value="all">All</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>K factor
          <input v-model.number="state.settings.kFactor" type="number" min="1" step="1" @change="persist" />
        </label>
      </div>
      <div class="actions"><button class="secondary" @click="exportPlayers">Export HC CSV</button><button class="secondary" @click="exportMatches">Export games CSV</button><button class="link" @click="resetToCurrentRankings">Clear local data</button></div>
      <p v-if="!state.players.length" class="empty-state">No players loaded yet. Choose your <strong>CS-235 - current handicap</strong> / <strong>CS-235 - miniHC</strong> CSV files above.</p>
      <table v-else class="sheet-table">
        <thead><tr><th>A rank</th><th>B editable name</th><th>C HC</th><th>D miniHC</th><th>E Elo</th><th>F points</th><th>O current rank</th><th>T selected-period games</th><th>W-L</th></tr></thead>
        <tbody>
          <tr v-for="(player, index) in sortedPlayers" :key="player.id">
            <td>{{ index + 1 }}</td>
            <td><input v-model="player.name" @change="persist" /></td>
            <td><select v-model="player.visibleTier" @change="persist"><option v-for="tier in HANDICAP_TIERS" :key="tier.name" :value="tier.name">{{ tier.name }}</option></select></td>
            <td><select v-model="player.minimumTier" @change="persist"><option v-for="tier in HANDICAP_TIERS" :key="tier.name" :value="tier.name">{{ tier.name }}</option></select></td>
            <td><input v-model.number="player.backgroundElo" type="number" step="0.01" @change="persist" /></td>
            <td><input v-model.number="player.tournamentPoints" type="number" @change="persist" /></td>
            <td><span class="pill">{{ player.visibleTier }}</span></td>
            <td>{{ filteredMatches.filter((match) => match.playerAId === player.id || match.playerBId === player.id).length }}</td>
            <td>{{ filteredMatches.filter((match) => match.winnerId === player.id).length }}-{{ filteredMatches.filter((match) => (match.playerAId === player.id || match.playerBId === player.id) && match.winnerId !== player.id).length }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="grid two">
      <div class="card">
        <h2>Admin match input</h2>
        <div class="form-grid">
          <label>Player A<select v-model="playerAId"><option v-for="player in state.players" :key="player.id" :value="player.id">{{ player.name }} · {{ player.visibleTier }} · {{ player.backgroundElo }}</option></select></label>
          <label>Player B<select v-model="playerBId"><option v-for="player in state.players" :key="player.id" :value="player.id">{{ player.name }} · {{ player.visibleTier }} · {{ player.backgroundElo }}</option></select></label>
          <label>Winner<select v-model="winnerId"><option :value="playerAId">{{ selectedA?.name ?? 'Player A' }}</option><option :value="playerBId">{{ selectedB?.name ?? 'Player B' }}</option></select></label>
        </div>
        <p v-if="matchPreview" class="hint">
          Expected: {{ selectedA?.name }} {{ (matchPreview.expectedA * 100).toFixed(1) }}% ·
          {{ selectedB?.name }} {{ (matchPreview.expectedB * 100).toFixed(1) }}%
        </p>
        <button @click="recordMatch()">Record match and update background Elo</button>
      </div>

      <div class="card">
        <h2>Import games from URL or CSV/TSV</h2>
        <p class="hint">
          Paste a CueScore tournament URL, for example <code>https://cuescore.com/tournament/KAVAL+HC+Torek+02.06.2026/82399141</code>.
          Browser security may block direct scraping, so the reliable path is to paste/export rows as:
          <code>Date,Club,Tournament,Player A,Player B,Winner,Score A,Score B,URL</code>.
        </p>
        <label>Source URL<input v-model="matchImportUrl" placeholder="CueScore tournament URL" /></label>
        <button class="secondary" @click="fetchMatchUrl">Try fetch URL</button>
        <textarea v-model="matchImportText" placeholder="2026-06-02,Kaval,KAVAL HC Torek,Player A,Player B,Player A,5,3,https://..."></textarea>
        <button @click="importMatches">Import matches and calculate Elo</button>
        <p class="hint">{{ importStatus }}</p>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h2>Editable players, HC, and miniHC</h2>
        <div class="actions"><button class="secondary" @click="exportPlayers">Export current HC CSV</button><button class="link" @click="resetToCurrentRankings">Clear local data</button></div>
        <table>
          <thead><tr><th>Rank</th><th>Player</th><th>HC</th><th>miniHC</th><th>Elo</th><th>Points</th></tr></thead>
          <tbody>
            <tr v-for="(player, index) in sortedPlayers" :key="player.id">
              <td>{{ index + 1 }}</td>
              <td><input v-model="player.name" @change="persist" /></td>
              <td><select v-model="player.visibleTier" @change="persist"><option v-for="tier in HANDICAP_TIERS" :key="tier.name" :value="tier.name">{{ tier.name }}</option></select></td>
              <td><select v-model="player.minimumTier" @change="persist"><option v-for="tier in HANDICAP_TIERS" :key="tier.name" :value="tier.name">{{ tier.name }}</option></select></td>
              <td><input v-model.number="player.backgroundElo" type="number" step="0.01" @change="persist" /></td>
              <td><input v-model.number="player.tournamentPoints" type="number" @change="persist" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2>Player and match import/export</h2>
        <p class="hint">
          Handicap import accepts CSV/TSV: <code>Name,Handicap,Minimum HC,Elo,Points,Notes</code>.
          The Google Sheet you shared can be exported to CSV and pasted here: <code>{{ defaultGoogleSheetUrl }}</code>.
        </p>
        <textarea v-model="csvImport" placeholder="Adnan Bašić,B2,B2,1300,0"></textarea>
        <button class="secondary" @click="importCsv">Import / update players</button>
        <button class="secondary" @click="exportMatches">Export games CSV</button>
        <h3>Add one player</h3>
        <div class="form-grid">
          <label>Name<input v-model="newPlayerName" /></label>
          <label>HC<select v-model="newPlayerTier"><option v-for="tier in HANDICAP_TIERS" :key="tier.name" :value="tier.name">{{ tier.name }} · {{ tier.baselineElo }}</option></select></label>
          <label>miniHC<select v-model="newPlayerMinimumTier"><option v-for="tier in HANDICAP_TIERS" :key="tier.name" :value="tier.name">{{ tier.name }} · {{ tier.baselineElo }}</option></select></label>
        </div>
        <button @click="addPlayer">Add player</button>
        <p class="hint">CueScore HC dashboard reference: <code>{{ defaultCueScoreHandicapUrl }}</code></p>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h2>Stats filters</h2>
        <div class="form-grid">
          <label>Player<select v-model="statsPlayerId"><option value="all">All players</option><option v-for="player in sortedPlayers" :key="player.id" :value="player.id">{{ player.name }}</option></select></label>
          <label>Period<select v-model="statsPeriod"><option value="currentMonth">Current month</option><option value="lastTwoMonths">Last two months</option><option value="season">This season / year</option><option value="all">All time</option><option value="custom">Custom dates</option></select></label>
          <label>Start<input v-model="customStart" type="date" /></label>
          <label>End<input v-model="customEnd" type="date" /></label>
          <label>Club<select v-model="statsClub"><option value="all">All clubs</option><option v-for="club in clubs" :key="club" :value="club">{{ club }}</option></select></label>
        </div>
        <div class="stat-row">
          <div><strong>{{ statsSummary.games }}</strong><span>Games</span></div>
          <div><strong>{{ statsSummary.wins }}</strong><span>Wins</span></div>
          <div><strong>{{ statsSummary.losses }}</strong><span>Losses</span></div>
          <div><strong>{{ statsSummary.winRate }}%</strong><span>Win rate</span></div>
        </div>
        <h3>Opponent breakdown</h3>
        <table v-if="statsSummary.opponents.length">
          <thead><tr><th>Opponent</th><th>Games</th><th>Wins</th><th>Losses</th></tr></thead>
          <tbody><tr v-for="opponent in statsSummary.opponents" :key="opponent.id"><td>{{ opponent.name }}</td><td>{{ opponent.games }}</td><td>{{ opponent.wins }}</td><td>{{ opponent.losses }}</td></tr></tbody>
        </table>
        <p v-else class="hint">Choose one player to see opponent-by-opponent stats.</p>
      </div>

      <div class="card">
        <h2>Improvement and HC suggestions</h2>
        <label>Show top N<input v-model.number="improvementLimit" type="number" min="1" /></label>
        <table>
          <thead><tr><th>Player</th><th>HC</th><th>Elo vs start HC</th><th>Suggested</th></tr></thead>
          <tbody>
            <tr v-for="row in improvements" :key="row.player.id">
              <td>{{ row.player.name }}</td><td>{{ row.player.visibleTier }}</td><td>{{ row.delta > 0 ? '+' : '' }}{{ row.delta }}</td><td>{{ row.suggestedTier }}</td>
            </tr>
          </tbody>
        </table>
        <h3>Monthly changes / miniHC warnings</h3>
        <ol class="log-list"><li v-for="row in tierSuggestions" :key="row.player.id"><strong>{{ row.player.name }}</strong>: suggested {{ row.suggested }}, final {{ row.finalTier }}<span v-if="row.minimumApplied"> because miniHC is {{ row.player.minimumTier }}</span></li></ol>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h2>Monthly tier lock</h2>
        <p>
          Elo changes immediately, but visible tiers only update here (or via Supabase cron) on the 1st day
          of the month. miniHC prevents a player from being pushed below the configured minimum handicap.
        </p>
        <button class="secondary" @click="processMonthlyTiers">Run monthly tier processing</button>
      </div>

      <div class="card">
        <h2>Tournament top-4 points</h2>
        <label>Tournament name<input v-model="tournamentName" /></label>
        <div class="form-grid">
          <label>1st (+100)<select v-model="firstPlace"><option value="">Select</option><option v-for="player in state.players" :key="player.id" :value="player.id">{{ player.name }}</option></select></label>
          <label>2nd (+70)<select v-model="secondPlace"><option value="">Select</option><option v-for="player in state.players" :key="player.id" :value="player.id">{{ player.name }}</option></select></label>
          <label>3rd semifinalist (+50)<select v-model="thirdPlaceOne"><option value="">Select</option><option v-for="player in state.players" :key="player.id" :value="player.id">{{ player.name }}</option></select></label>
          <label>3rd semifinalist (+50)<select v-model="thirdPlaceTwo"><option value="">Select</option><option v-for="player in state.players" :key="player.id" :value="player.id">{{ player.name }}</option></select></label>
        </div>
        <button @click="applyTournamentPoints">Apply {{ tournamentName }} points</button>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h2>Filtered games</h2>
        <table>
          <thead><tr><th>Date</th><th>Club</th><th>Match</th><th>Winner</th><th>Elo change</th></tr></thead>
          <tbody>
            <tr v-for="match in filteredMatches.slice(0, 80)" :key="match.id">
              <td>{{ new Date(match.playedAt).toLocaleDateString() }}</td><td>{{ match.club || '—' }}</td><td>{{ playerName(match.playerAId) }} vs {{ playerName(match.playerBId) }}</td><td>{{ playerName(match.winnerId) }}</td><td>{{ (match.playerANewElo - match.playerAOldElo).toFixed(2) }} / {{ (match.playerBNewElo - match.playerBOldElo).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2>HC change log</h2>
        <ol class="log-list">
          <li v-for="change in state.tierChanges.slice(0, 20)" :key="change.id">
            <strong>{{ playerName(change.playerId) }}</strong> {{ change.oldTier }} → {{ change.newTier }}
            at {{ change.eloAtProcessing.toFixed(2) }} Elo<span v-if="change.minimumTierApplied"> (miniHC {{ change.minimumTierApplied }} applied)</span>
          </li>
        </ol>
      </div>
    </section>
  </main>
</template>
