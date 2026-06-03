<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  calculateElo,
  evaluateMonthlyTier,
  expectedOutcome,
  HANDICAP_TIERS,
  tierForInitialElo,
  tournamentPointsForPlacement,
  type TierName,
} from './lib/handicap';
import { seedPlayers } from './lib/seed';
import type { MatchLog, Player, TierChangeLog } from './lib/types';

const storageKey = 'hcelo-state-v1';

interface AppState {
  players: Player[];
  matches: MatchLog[];
  tierChanges: TierChangeLog[];
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultState(): AppState {
  return {
    players: structuredClone(seedPlayers),
    matches: [],
    tierChanges: [],
  };
}

function loadState(): AppState {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return defaultState();
  try {
    return JSON.parse(saved) as AppState;
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
const csvImport = ref('');
const tournamentName = ref('Monday HC Night');
const firstPlace = ref('');
const secondPlace = ref('');
const thirdPlaceOne = ref('');
const thirdPlaceTwo = ref('');

const sortedPlayers = computed(() =>
  [...state.players].sort((a, b) => b.backgroundElo - a.backgroundElo || b.tournamentPoints - a.tournamentPoints),
);

const leaderboard = computed(() =>
  [...state.players].sort((a, b) => b.tournamentPoints - a.tournamentPoints || b.backgroundElo - a.backgroundElo),
);

const selectedA = computed(() => state.players.find((player) => player.id === playerAId.value));
const selectedB = computed(() => state.players.find((player) => player.id === playerBId.value));
const matchPreview = computed(() => {
  if (!selectedA.value || !selectedB.value || selectedA.value.id === selectedB.value.id) return null;
  return {
    expectedA: expectedOutcome(selectedA.value.backgroundElo, selectedB.value.backgroundElo),
    expectedB: expectedOutcome(selectedB.value.backgroundElo, selectedA.value.backgroundElo),
  };
});

watch([playerAId, playerBId], () => {
  if (winnerId.value !== playerAId.value && winnerId.value !== playerBId.value) {
    winnerId.value = playerAId.value;
  }
});

function persist() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function recordMatch() {
  const playerA = selectedA.value;
  const playerB = selectedB.value;
  if (!playerA || !playerB || playerA.id === playerB.id) return;

  const actualWinnerId = winnerId.value === playerB.id ? playerB.id : playerA.id;
  const result = calculateElo(playerA.backgroundElo, playerB.backgroundElo, actualWinnerId === playerA.id ? 'A' : 'B');
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
    const newTier = evaluateMonthlyTier(player.visibleTier, player.backgroundElo);
    if (newTier !== player.visibleTier) {
      state.tierChanges.unshift({
        id: makeId('tier-change'),
        processedAt: new Date().toISOString(),
        playerId: player.id,
        oldTier: player.visibleTier,
        newTier,
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

  rows.forEach((row) => {
    const [rawName, rawTier, rawElo, rawPoints] = row.split(',').map((item) => item.trim());
    const parsedElo = Number(rawElo);
    const tier = HANDICAP_TIERS.some((candidate) => candidate.name === rawTier)
      ? (rawTier as TierName)
      : tierForInitialElo(Number.isFinite(parsedElo) ? parsedElo : 1100);
    if (!rawName) return;

    const existing = state.players.find((player) => player.name.toLowerCase() === rawName.toLowerCase());
    const nextPlayer: Player = {
      id: existing?.id ?? makeId('player'),
      name: rawName,
      visibleTier: tier,
      backgroundElo: Number.isFinite(parsedElo)
        ? parsedElo
        : HANDICAP_TIERS.find((candidate) => candidate.name === tier)?.baselineElo ?? 1100,
      tournamentPoints: Number(rawPoints) || existing?.tournamentPoints || 0,
    };

    if (existing) Object.assign(existing, nextPlayer);
    else state.players.push(nextPlayer);
  });
  csvImport.value = '';
  persist();
}

function playerName(id: string) {
  return state.players.find((player) => player.id === id)?.name ?? 'Unknown player';
}

function resetDemo() {
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
        <h1>Independent leaderboard points and match-by-match Elo handicaps.</h1>
        <p>
          Built for twice-weekly Monday/Tuesday events where venue attendance and field size never change
          the math. Visible tiers stay locked until the monthly hysteresis cycle runs.
        </p>
      </div>
      <div class="metric-grid">
        <div><strong>{{ state.players.length }}</strong><span>Players</span></div>
        <div><strong>{{ state.matches.length }}</strong><span>Matches logged</span></div>
        <div><strong>K=20</strong><span>Elo stability</span></div>
      </div>
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
        <button @click="recordMatch">Record match and update background Elo</button>
      </div>

      <div class="card">
        <h2>Monthly tier lock</h2>
        <p>
          Elo changes immediately, but visible tiers only update here (or via the supplied Supabase cron)
          on the 1st day of the month. Promotions need the next baseline; demotions need a 50-point drop
          below the current tier baseline.
        </p>
        <button class="secondary" @click="processMonthlyTiers">Run monthly tier processing</button>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h2>Players & handicap tiers</h2>
        <table>
          <thead><tr><th>Rank</th><th>Player</th><th>Visible tier</th><th>Background Elo</th><th>Points</th></tr></thead>
          <tbody>
            <tr v-for="(player, index) in sortedPlayers" :key="player.id">
              <td>{{ index + 1 }}</td><td>{{ player.name }}</td><td><span class="pill">{{ player.visibleTier }}</span></td><td>{{ player.backgroundElo.toFixed(2) }}</td><td>{{ player.tournamentPoints }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2>Season leaderboard</h2>
        <table>
          <thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>Elo tiebreak</th></tr></thead>
          <tbody>
            <tr v-for="(player, index) in leaderboard" :key="player.id">
              <td>{{ index + 1 }}</td><td>{{ player.name }}</td><td>{{ player.tournamentPoints }}</td><td>{{ player.backgroundElo.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="grid two">
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

      <div class="card">
        <h2>Import players</h2>
        <p class="hint">
          CueScore dashboard pages may require a signed-in session. Paste exported/current rankings as
          CSV rows: <code>Name,Tier,Elo,Points</code>. Missing Elo values default to the tier baseline.
        </p>
        <textarea v-model="csvImport" placeholder="Jane Player,A3,1512,70"></textarea>
        <button class="secondary" @click="importCsv">Import / update players</button>
        <h3>Add one player</h3>
        <div class="form-grid">
          <label>Name<input v-model="newPlayerName" /></label>
          <label>Tier<select v-model="newPlayerTier"><option v-for="tier in HANDICAP_TIERS" :key="tier.name" :value="tier.name">{{ tier.name }} · {{ tier.baselineElo }}</option></select></label>
        </div>
        <button class="secondary" @click="addPlayer">Add player</button>
        <button class="link" @click="resetDemo">Reset demo data</button>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h2>Elo audit log</h2>
        <ol class="log-list">
          <li v-for="match in state.matches.slice(0, 12)" :key="match.id">
            <strong>{{ playerName(match.winnerId) }} won</strong> — {{ playerName(match.playerAId) }}
            {{ match.playerAOldElo.toFixed(2) }} → {{ match.playerANewElo.toFixed(2) }},
            {{ playerName(match.playerBId) }} {{ match.playerBOldElo.toFixed(2) }} →
            {{ match.playerBNewElo.toFixed(2) }}
          </li>
        </ol>
      </div>

      <div class="card">
        <h2>Tier change log</h2>
        <ol class="log-list">
          <li v-for="change in state.tierChanges.slice(0, 12)" :key="change.id">
            <strong>{{ playerName(change.playerId) }}</strong> {{ change.oldTier }} → {{ change.newTier }}
            at {{ change.eloAtProcessing.toFixed(2) }} Elo
          </li>
        </ol>
      </div>
    </section>
  </main>
</template>
