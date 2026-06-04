You are completely right. Shoving that massive Head-to-Head matrix into a 50/50 split is like trying to park a bus in a bicycle shed. The left pane holding the player cards does not need all that horizontal real estate, while the matrix is fighting for its life just to display a few columns without looking cramped.

I have stripped out the default `.two` grid class for the players section and injected a custom responsive layout. The left pane is now squished down to about **30% width**, giving the matrix a glorious **70% of the screen** to breathe. It will still collapse into a stacked layout on mobile devices so you don't end up with a microscopic unreadable table.

Here is your updated, monolithic `App.vue`. Copy and paste the entire block.

```vue
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
import { setKFactor, getKFactor } from './lib/handicap';
import { seedPlayers } from './lib/seed';
import { fetchMultipleTournaments, fetchHandicapList } from './lib/cuescoreApi';
import type { MatchLog, Player, TierChangeLog, Tournament, CueScoreGame } from './lib/types';

// Eradicate C+ globally
const activeTiers = HANDICAP_TIERS.filter(t => t.name !== 'C+');

// --- STATE MANAGEMENT ---
const storageKey = 'hcelo-state-v1';
const kStorageKey = 'hcelo-k';

interface AppState {
  players: Player[];
  matches: MatchLog[];
  tierChanges: TierChangeLog[];
  tournaments: Tournament[];
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultState(): AppState {
  return {
    players: structuredClone(seedPlayers).map((p: any) => ({
      ...p, gamesPlayed: 0, tournamentsPlayed: 0, wins: 0, losses: 0,
      visibleTier: p.visibleTier === 'C+' ? 'B-' : p.visibleTier
    })),
    matches: [], tierChanges: [], tournaments: [],
  };
}

function loadState(): AppState {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return defaultState();
  try {
    const parsed = JSON.parse(saved);
    const players = parsed.players?.length ? parsed.players : defaultState().players;
    players.forEach((p: Player) => { if (p.visibleTier as any === 'C+') p.visibleTier = 'B-'; });
    
    return {
      players,
      matches: parsed.matches || [],
      tierChanges: parsed.tierChanges || [],
      tournaments: parsed.tournaments || []
    };
  } catch {
    return defaultState();
  }
}

const state = reactive<AppState>(loadState());
const kFromStorage = Number(localStorage.getItem(kStorageKey));
if (Number.isFinite(kFromStorage) && kFromStorage > 0) setKFactor(kFromStorage);
const kFactor = ref(getKFactor());

watch(kFactor, (next) => {
  if (!next || next < 1) return;
  setKFactor(Number(next));
  localStorage.setItem(kStorageKey, String(next));
  recalculateAllElo();
});

function recalculateAllElo() {
  state.players.forEach(p => {
    const t = activeTiers.find(tier => tier.name === p.visibleTier);
    p.backgroundElo = t ? t.baselineElo : 1100;
    p.wins = 0; p.losses = 0; p.gamesPlayed = 0;
  });

  const sortedMatches = [...state.matches].sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());
  
  sortedMatches.forEach(m => {
    const pA = state.players.find(p => p.id === m.playerAId);
    const pB = state.players.find(p => p.id === m.playerBId);
    if(!pA || !pB) return;

    m.playerAOldElo = pA.backgroundElo;
    m.playerBOldElo = pB.backgroundElo;
    const res = calculateElo(pA.backgroundElo, pB.backgroundElo, m.winnerId === pA.id ? 'A' : 'B');
    m.playerANewElo = res.newRatingA;
    m.playerBNewElo = res.newRatingB;

    pA.backgroundElo = res.newRatingA; pB.backgroundElo = res.newRatingB;
    pA.gamesPlayed++; pB.gamesPlayed++;
    if(m.winnerId === pA.id) pA.wins++; else pA.losses++;
    if(m.winnerId === pB.id) pB.wins++; else pB.losses++;
  });
  persist();
}

function persist() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

// --- GLOBAL UI, AUTH & EXPORT ---
const activeTab = ref<'leaderboard' | 'matches' | 'tournaments' | 'players' | 'admin'>('leaderboard');
const importStatus = ref('');
const isImportingTournaments = ref(false);
const isSyncingHandicaps = ref(false);
const tournamentUrlsImport = ref('');
const showOnlyActivePlayers = ref(true);

const isAdminAuthenticated = ref(localStorage.getItem('hcelo-admin-auth') === 'true');
const lastImported = ref<{date: string, name: string} | null>(JSON.parse(localStorage.getItem('hcelo-last-import') || 'null'));

function handleTabClick(tab: 'leaderboard' | 'matches' | 'tournaments' | 'players' | 'admin') {
  if (tab === 'admin') {
    if (!isAdminAuthenticated.value) {
      const pass = prompt('Restricted Area: Enter Admin Password');
      if (pass === '77taipei') {
        isAdminAuthenticated.value = true;
        localStorage.setItem('hcelo-admin-auth', 'true');
        activeTab.value = 'admin';
      } else {
        alert('Incorrect password. Access denied.');
      }
    } else {
      activeTab.value = 'admin';
    }
  } else {
    activeTab.value = tab;
  }
}

function exportFullDatabase() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(localStorage.getItem(storageKey) || '{}');
  const downloadNode = document.createElement('a');
  downloadNode.setAttribute("href", dataStr);
  downloadNode.setAttribute("download", `HCELO_Backup_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadNode);
  downloadNode.click();
  downloadNode.remove();
}

function importFullDatabase(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target?.result as string);
      if (json && json.players && Array.isArray(json.players)) {
        localStorage.setItem(storageKey, JSON.stringify(json));
        alert('Database restored successfully! The page will now reload.');
        location.reload();
      } else {
        alert('Invalid backup file format.');
      }
    } catch (err) {
      alert('Error parsing JSON backup file.');
    }
  };
  reader.readAsText(file);
}

// --- MULTI-SELECT DATE FILTERS ---
const filterYears = ref<string[]>([]);
const filterMonths = ref<string[]>([]);

const availableYears = computed(() => {
  const years = new Set<number>();
  state.matches.forEach(m => years.add(new Date(m.playedAt).getFullYear()));
  return Array.from(years).sort((a, b) => b - a);
});

const monthsList = [
  { val: '0', short: 'Jan' }, { val: '1', short: 'Feb' }, { val: '2', short: 'Mar' },
  { val: '3', short: 'Apr' }, { val: '4', short: 'May' }, { val: '5', short: 'Jun' },
  { val: '6', short: 'Jul' }, { val: '7', short: 'Aug' }, { val: '8', short: 'Sep' },
  { val: '9', short: 'Oct' }, { val: '10', short: 'Nov' }, { val: '11', short: 'Dec' }
];

function toggleYear(y: string) {
  if (filterYears.value.includes(y)) filterYears.value = filterYears.value.filter(v => v !== y);
  else filterYears.value.push(y);
}
function toggleMonth(m: string) {
  if (filterMonths.value.includes(m)) filterMonths.value = filterMonths.value.filter(v => v !== m);
  else filterMonths.value.push(m);
}
function clearDateFilters() {
  filterYears.value = [];
  filterMonths.value = [];
}

function isDateInRange(dateString: string) {
  if (filterYears.value.length === 0 && filterMonths.value.length === 0) return true;
  const d = new Date(dateString);
  const y = d.getFullYear().toString();
  const m = d.getMonth().toString();

  if (filterYears.value.length > 0 && !filterYears.value.includes(y)) return false;
  if (filterMonths.value.length > 0 && !filterMonths.value.includes(m)) return false;
  return true;
}

// --- LEADERBOARD LOGIC & TIERS ---
const editingPlayerId = ref<string | null>(null);
const editName = ref('');
const editTier = ref<TierName>('B-');
const boardSortKey = ref<'rank' | 'name' | 'tier' | 'elo' | 'games' | 'wl'>('rank');
const boardSortDir = ref<'asc' | 'desc'>('asc');

function toggleBoardSort(key: typeof boardSortKey.value) {
  if (boardSortKey.value === key) boardSortDir.value = boardSortDir.value === 'asc' ? 'desc' : 'asc';
  else { boardSortKey.value = key; boardSortDir.value = key === 'rank' || key === 'name' ? 'asc' : 'desc'; }
}

function startEditPlayer(player: Player) {
  editingPlayerId.value = player.id; editName.value = player.name; editTier.value = player.visibleTier;
}

function savePlayerEdit() {
  const p = state.players.find(x => x.id === editingPlayerId.value);
  if (p) {
    p.name = editName.value.trim(); p.visibleTier = editTier.value;
    p.backgroundElo = activeTiers.find(t => t.name === editTier.value)?.baselineElo || p.backgroundElo; persist();
  }
  editingPlayerId.value = null;
}

function getTierStatus(tierName: string, elo: number) {
  const sortedTiers = [...activeTiers].sort((a,b) => a.baselineElo - b.baselineElo);
  const currentIdx = sortedTiers.findIndex(t => t.name === tierName);
  if (currentIdx === -1) return null;

  const currentTier = sortedTiers[currentIdx];
  const nextTier = sortedTiers[currentIdx + 1];

  if (nextTier && elo >= nextTier.baselineElo) {
    return { icon: '▲', color: '#0d7c66', title: 'Should promote to ' + nextTier.name };
  }
  if (elo < currentTier.baselineElo) {
    return { icon: '▼', color: '#ef4444', title: 'Should demote' };
  }
  return null;
}

function getTierProgress(elo: number) {
  const sortedTiers = [...activeTiers].sort((a,b) => a.baselineElo - b.baselineElo);
  let currentIdx = sortedTiers.findIndex(t => elo < t.baselineElo) - 1;
  if (currentIdx < 0) currentIdx = 0;
  if (elo >= sortedTiers[sortedTiers.length-1].baselineElo) currentIdx = sortedTiers.length - 1;

  const currentTier = sortedTiers[currentIdx];
  const nextTier = sortedTiers[currentIdx + 1];
  if (!nextTier) return { pct: 100, text: 'Max Tier', color: '#0d7c66' };

  const floor = currentTier.baselineElo; const ceil = nextTier.baselineElo;
  const range = ceil - floor; const progress = elo - floor;
  return { pct: Math.max(0, Math.min(100, (progress / range) * 100)), toNext: Math.ceil(ceil - elo), nextName: nextTier.name };
}

const leaderboard = computed(() => {
  let list = state.players.map(p => {
    let w = 0, l = 0, g = 0;
    if (filterYears.value.length > 0 || filterMonths.value.length > 0) {
      const pMatches = state.matches.filter(m => (m.playerAId === p.id || m.playerBId === p.id) && isDateInRange(m.playedAt));
      g = pMatches.length; w = pMatches.filter(m => m.winnerId === p.id).length; l = g - w;
    } else { w = p.wins; l = p.losses; g = p.gamesPlayed; }
    return { ...p, periodWins: w, periodLosses: l, periodGames: g };
  });

  list = list.filter(p => !showOnlyActivePlayers.value || p.periodGames > 0);
  const rankedList = list.sort((a, b) => b.tournamentPoints - a.tournamentPoints || b.backgroundElo - a.backgroundElo).map((p, i) => ({ ...p, rank: i + 1 }));

  return rankedList.sort((a, b) => {
    let va: any, vb: any;
    if (boardSortKey.value === 'rank') { va = a.rank; vb = b.rank; }
    else if (boardSortKey.value === 'name') { va = a.name; vb = b.name; }
    else if (boardSortKey.value === 'tier') { va = activeTiers.find(t=>t.name===a.visibleTier)?.baselineElo || 0; vb = activeTiers.find(t=>t.name===b.visibleTier)?.baselineElo || 0; }
    else if (boardSortKey.value === 'elo') { va = a.backgroundElo; vb = b.backgroundElo; }
    else if (boardSortKey.value === 'games') { va = a.periodGames; vb = b.periodGames; }
    else if (boardSortKey.value === 'wl') { va = a.periodGames ? a.periodWins / a.periodGames : 0; vb = b.periodGames ? b.periodWins / b.periodGames : 0; }
    if (va < vb) return boardSortDir.value === 'asc' ? -1 : 1;
    if (va > vb) return boardSortDir.value === 'asc' ? 1 : -1;
    return 0;
  });
});

// --- MATCHES & TOURNAMENTS TABLE LOGIC ---
const matchPlayerFilter = ref('all'); 
const matchTournamentFilter = ref('all');
const matchVenueFilter = ref('all');
const matchSortKey = ref<'playedAt' | 'winner' | 'playerA' | 'playerB' | 'tournament' | 'venue'>('playedAt');
const matchSortDir = ref<'desc' | 'asc'>('desc');

function toggleMatchSort(key: typeof matchSortKey.value) { if (matchSortKey.value === key) matchSortDir.value = matchSortDir.value === 'asc' ? 'desc' : 'asc'; else { matchSortKey.value = key; matchSortDir.value = 'desc'; } }

const uniqueVenues = computed(() => {
  const vSet = new Set<string>();
  state.tournaments.forEach(t => { if (t.venue && t.venue !== 'Unknown Venue' && t.venue !== '—') vSet.add(t.venue); });
  return Array.from(vSet).sort();
});

const displayedMatches = computed(() => {
  let rows = state.matches.filter(m => isDateInRange(m.playedAt));
  if (matchPlayerFilter.value !== 'all') rows = rows.filter(m => m.playerAId === matchPlayerFilter.value || m.playerBId === matchPlayerFilter.value);
  if (matchTournamentFilter.value !== 'all') rows = rows.filter(m => m.tournamentId === matchTournamentFilter.value);
  if (matchVenueFilter.value !== 'all') {
    rows = rows.filter(m => {
      const t = state.tournaments.find(tour => tour.id === m.tournamentId);
      return t && t.venue === matchVenueFilter.value;
    });
  }

  return rows.sort((a, b) => {
    let va: any = ''; let vb: any = '';
    if (matchSortKey.value === 'playedAt') { va = new Date(a.playedAt).getTime(); vb = new Date(b.playedAt).getTime(); }
    else if (matchSortKey.value === 'winner') { va = playerName(a.winnerId); vb = playerName(b.winnerId); }
    else if (matchSortKey.value === 'playerA') { va = playerName(a.playerAId); vb = playerName(b.playerAId); }
    else if (matchSortKey.value === 'playerB') { va = playerName(a.playerBId); vb = playerName(b.playerBId); }
    else if (matchSortKey.value === 'venue') { va = a.tableName || ''; vb = b.tableName || ''; }
    else if (matchSortKey.value === 'tournament') { va = state.tournaments.find(t => t.id === a.tournamentId)?.name || ''; vb = state.tournaments.find(t => t.id === b.tournamentId)?.name || ''; }
    if (va < vb) return matchSortDir.value === 'asc' ? -1 : 1;
    if (va > vb) return matchSortDir.value === 'asc' ? 1 : -1;
    return 0;
  });
});

const tourSortKey = ref<'date' | 'name' | 'venue' | 'matches'>('date'); const tourSortDir = ref<'desc' | 'asc'>('desc');
function toggleTourSort(key: typeof tourSortKey.value) { if (tourSortKey.value === key) tourSortDir.value = tourSortDir.value === 'asc' ? 'desc' : 'asc'; else { tourSortKey.value = key; tourSortDir.value = 'desc'; } }
const displayedTournaments = computed(() => {
  let list = state.tournaments.filter(t => isDateInRange(t.date));
  return list.sort((a, b) => {
    let va: any = ''; let vb: any = '';
    if (tourSortKey.value === 'date') { va = new Date(a.date).getTime(); vb = new Date(b.date).getTime(); }
    else if (tourSortKey.value === 'name') { va = a.name; vb = b.name; }
    else if (tourSortKey.value === 'venue') { va = (a as any).venue || ''; vb = (b as any).venue || ''; }
    else if (tourSortKey.value === 'matches') { va = state.matches.filter(m => m.tournamentId === a.id).length; vb = state.matches.filter(m => m.tournamentId === b.id).length; }
    if (va < vb) return tourSortDir.value === 'asc' ? -1 : 1;
    if (va > vb) return tourSortDir.value === 'asc' ? 1 : -1;
    return 0;
  });
});

// --- MATRIX & PLAYER STATS LOGIC ---
const selectedCompareIds = ref<string[]>([]);
const playerSearchQuery = ref('');
function playerObj(id: string) { return state.players.find(p => p.id === id); }
const searchResults = computed(() => {
  if (!playerSearchQuery.value) return [];
  return state.players.filter(p => p.name.toLowerCase().includes(playerSearchQuery.value.toLowerCase()) && !selectedCompareIds.value.includes(p.id) && (!showOnlyActivePlayers.value || p.gamesPlayed > 0))
    .sort((a, b) => b.backgroundElo - a.backgroundElo).slice(0, 8);
});
function addPlayerToCompare(id: string) { if (!selectedCompareIds.value.includes(id)) selectedCompareIds.value.push(id); playerSearchQuery.value = ''; }
function removePlayerFromCompare(id: string) { selectedCompareIds.value = selectedCompareIds.value.filter(selId => selId !== id); }

const matrixRows = computed(() => {
  if (selectedCompareIds.value.length === 0) return [];
  const relevantOpponentIds = new Set<string>();
  state.matches.filter(m => isDateInRange(m.playedAt)).forEach(m => {
    if (selectedCompareIds.value.includes(m.playerAId)) relevantOpponentIds.add(m.playerBId);
    if (selectedCompareIds.value.includes(m.playerBId)) relevantOpponentIds.add(m.playerAId);
  });
  return state.players.filter(p => relevantOpponentIds.has(p.id) && !selectedCompareIds.value.includes(p.id) && (!showOnlyActivePlayers.value || p.gamesPlayed > 0))
    .sort((a, b) => a.name.localeCompare(b.name));
});

function getMatchupStats(headerPlayerId: string, rowOpponentId: string) {
  const headToHeadMatches = state.matches.filter(m => ((m.playerAId === headerPlayerId && m.playerBId === rowOpponentId) || (m.playerAId === rowOpponentId && m.playerBId === headerPlayerId)) && isDateInRange(m.playedAt));
  const total = headToHeadMatches.length;
  if (total === 0) return { wins: 0, losses: 0, total: 0, pct: 0 };
  const wins = headToHeadMatches.filter(m => m.winnerId === headerPlayerId).length;
  return { wins, losses: total - wins, total, pct: Math.round((wins / total) * 100) };
}

function getPlayerDetailedStats(playerId: string) {
  const mList = state.matches.filter(m => (m.playerAId === playerId || m.playerBId === playerId) && isDateInRange(m.playedAt)).sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());
  const total = mList.length; const wins = mList.filter(m => m.winnerId === playerId).length; const pct = total ? Math.round((wins / total) * 100) : 0;
  
  let eloHistory: number[] = [];
  if (mList.length > 0) {
    const firstMatch = mList[0];
    eloHistory.push(firstMatch.playerAId === playerId ? firstMatch.playerAOldElo : firstMatch.playerBOldElo);
    mList.forEach(m => eloHistory.push(m.playerAId === playerId ? m.playerANewElo : m.playerBNewElo));
  }
  let eloChange = eloHistory.length > 1 ? eloHistory[eloHistory.length - 1] - eloHistory[0] : 0;

  let sparkline = '';
  if (eloHistory.length > 1) {
    const minElo = Math.min(...eloHistory); const maxElo = Math.max(...eloHistory);
    const range = maxElo - minElo || 1; 
    sparkline = eloHistory.map((elo, idx) => `${(idx / (eloHistory.length - 1)) * 200},${40 - ((elo - minElo) / range) * 40}`).join(' ');
  }
  return { total, wins, losses: total - wins, pct, eloChange, sparkline };
}

function playerName(id: string) { return state.players.find(p => p.id === id)?.name ?? 'Unknown'; }

// --- IMPORTS & API LOGIC ---
async function syncPlayersFromHandicapList() {
  if (!confirm('Wipe the current player list and re-sync from CueScore List 64255726?')) return;
  isSyncingHandicaps.value = true; importStatus.value = 'Fetching fresh handicap list...';
  try {
    const playersData = await fetchHandicapList(64255726);
    if (!playersData || !Array.isArray(playersData)) { importStatus.value = 'Failed to retrieve handicap data. Is your proxy running?'; return; }
    state.players = [];
    playersData.forEach((item: any) => {
      const rawName = item.player?.name || item.name; const rawId = String(item.player?.playerId || item.playerId || item.id);
      let rawTier = item.tier || item.handicap || 'B-'; if (rawTier === 'C+') rawTier = 'B-';
      if (!rawName) return;
      state.players.push({ id: makeId('player'), name: rawName.trim(), visibleTier: rawTier, backgroundElo: Number(item.elo || item.rating || 1100), tournamentPoints: 0, gamesPlayed: 0, tournamentsPlayed: 0, wins: 0, losses: 0, cueScoreId: rawId });
    });
    importStatus.value = `✓ Successfully synced ${state.players.length} players!`; persist();
  } catch (error) { importStatus.value = 'Error syncing handicap listings.'; } finally { isSyncingHandicaps.value = false; }
}

async function importTournamentsByUrl() {
  isImportingTournaments.value = true; importStatus.value = 'Starting tournament import...';
  try {
    const urls = tournamentUrlsImport.value.split('\n').map((url) => url.trim()).filter((url) => url.startsWith('http'));
    if (urls.length === 0) { importStatus.value = 'No valid URLs provided'; return; }

    const toImport = urls.filter(url => {
      const parts = url.split('/');
      const id = parts[parts.length - 1] || parts[parts.length - 2];
      return !state.tournaments.some(t => t.cuescore_id === id || t.id === id);
    });

    if (toImport.length === 0) {
      importStatus.value = 'Already imported! The provided tournaments exist in the database.';
      isImportingTournaments.value = false;
      return;
    }

    importStatus.value = `Fetching ${toImport.length} new tournament(s)...`;
    const { tournaments, games } = await fetchMultipleTournaments(toImport);

    tournaments.forEach((t: any) => {
      const targetId = String(t.tournamentId || t.id || t.cuescore_id);
      const existingIdx = state.tournaments.findIndex((ext) => ext.id === targetId || ext.cuescore_id === targetId);
      const cleanTournament: Tournament = { id: targetId, cuescore_id: targetId, name: t.name, date: t.starttime || t.displayDate || t.date || new Date().toISOString(), url: t.url || '', imported: true, venue: t.table?.venue?.name || t.venue?.name || t.venue || 'Unknown Venue' };
      if (existingIdx === -1) state.tournaments.push(cleanTournament); else state.tournaments[existingIdx] = cleanTournament;
    });

    const resolveAndUpsertPlayer = (nameField: string | undefined, idField: any) => {
      if (!nameField) return null; const cleanName = nameField.trim();
      const stripName = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (stripName.includes('walkover') || stripName === 'wo' || stripName === 'bye' || cleanName.toLowerCase() === 'walk over') return null;
      const cId = idField ? String(idField) : '';
      let player = cId ? state.players.find((p) => p.cueScoreId === cId) : null;
      if (!player) player = state.players.find((p) => p.name.toLowerCase() === cleanName.toLowerCase());
      if (!player) { player = { id: makeId('player'), name: cleanName, visibleTier: 'B-', backgroundElo: 1100, tournamentPoints: 0, gamesPlayed: 0, tournamentsPlayed: 0, wins: 0, losses: 0, cueScoreId: cId || undefined }; state.players.push(player); } 
      else if (cId && !player.cueScoreId) player.cueScoreId = cId;
      return player;
    };

    const sortedGames = [...games].sort((a, b) => new Date(a.starttime || a.playedAt || 0).getTime() - new Date(b.starttime || b.playedAt || 0).getTime());
    let matchesAdded = 0;
    for (const game of sortedGames) {
      const pAName = game.playerA?.name || game.player1; const pAID = game.playerA?.playerId || game.playerAId;
      const pBName = game.playerB?.name || game.player2; const pBID = game.playerB?.playerId || game.playerBId;
      if (!pAName || !pBName || pAName.trim().toLowerCase() === pBName.trim().toLowerCase()) continue;

      const playerA = resolveAndUpsertPlayer(pAName, pAID); const playerB = resolveAndUpsertPlayer(pBName, pBID);
      if (!playerA || !playerB || playerA.id === playerB.id) continue;

      const mId = String(game.matchId || game.matchNo || ''); const currentTourId = String(game.tournamentId || '');
      if (state.matches.some((m) => String(m.matchId) === mId && String(m.tournamentId) === currentTourId)) continue;

      const scoreA = Number(game.scoreA ?? 0); const scoreB = Number(game.scoreB ?? 0); let winnerId = null;
      if (scoreA > scoreB) winnerId = playerA.id; else if (scoreB > scoreA) winnerId = playerB.id;
      else {
        const expWinner = String(game.winner || '').toLowerCase();
        if (expWinner === playerA.name.toLowerCase() || expWinner === String(playerA.cueScoreId)) winnerId = playerA.id;
        else if (expWinner === playerB.name.toLowerCase() || expWinner === String(playerB.cueScoreId)) winnerId = playerB.id;
      }
      if (!winnerId) continue; 
      const result = calculateElo(playerA.backgroundElo, playerB.backgroundElo, winnerId === playerA.id ? 'A' : 'B');

      const match: MatchLog = { id: makeId('match'), playedAt: game.starttime || game.playedAt || new Date().toISOString(), playerAId: playerA.id, playerBId: playerB.id, winnerId, playerAOldElo: playerA.backgroundElo, playerBOldElo: playerB.backgroundElo, playerANewElo: result.newRatingA, playerBNewElo: result.newRatingB, expectedA: result.expectedA, expectedB: result.expectedB, source: 'imported', tournamentId: currentTourId, matchId: mId ? Number(mId) : undefined, round: game.round, roundName: game.roundName || `Round ${game.round || ''}`, scoreA, scoreB, handicapA: game.handicapA, handicapB: game.handicapB, tableName: game.table?.venue?.name || '—', tableVenue: game.table?.venue?.name || '—' };
      playerA.backgroundElo = result.newRatingA; playerA.gamesPlayed += 1; if (winnerId === playerA.id) playerA.wins += 1; else playerA.losses += 1;
      playerB.backgroundElo = result.newRatingB; playerB.gamesPlayed += 1; if (winnerId === playerB.id) playerB.wins += 1; else playerB.losses += 1;
      state.matches.unshift(match); matchesAdded += 1;
    }
    
    if (tournaments.length > 0) {
      const latest = tournaments[tournaments.length - 1] as any;
      lastImported.value = { date: new Date(latest.starttime || latest.displayDate || latest.date).toLocaleDateString(), name: latest.name };
      localStorage.setItem('hcelo-last-import', JSON.stringify(lastImported.value));
    }
    
    importStatus.value = `✓ Successfully imported ${matchesAdded} genuine matches!`; tournamentUrlsImport.value = ''; persist();
  } catch (error) { importStatus.value = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`; } finally { isImportingTournaments.value = false; }
}

function resetDemo() { if(confirm("Are you sure you want to nuke all data?")) { localStorage.clear(); location.reload(); } }
</script>

<template>
  <main class="shell">
    <section class="hero card" style="background: linear-gradient(135deg, #0f172a, #1e293b); color: white; padding: 32px 40px; border-radius: 16px;">
      <div>
        <h1 style="font-family: 'Inter', sans-serif; font-weight: 800; font-size: 2.8rem; letter-spacing: -0.03em; margin: 0 0 8px;">Live Elo & Rankings Dashboard</h1>
        <p style="color: #94a3b8; font-size: 1.1rem; margin: 0; max-width: 600px;">Real-time billiard tracking, tournament ingestion, and detailed Head-to-Head analytics.</p>
      </div>
      <div class="metric-grid">
        <div><strong>{{ state.players.length }}</strong><span>Total Players</span></div>
        <div><strong>{{ state.matches.length }}</strong><span>Genuine Matches</span></div>
        <div><strong>{{ state.tournaments.length }}</strong><span>Tournaments</span></div>
        <div>
          <strong>K=<input type="number" v-model.number="kFactor" min="1" style="width:4.5rem; background: transparent; border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 4px;" /></strong>
          <span>Elo stability</span>
        </div>
      </div>
    </section>

    <nav class="tabs card">
      <button :class="{ active: activeTab === 'leaderboard' }" @click="handleTabClick('leaderboard')">Leaderboard</button>
      <button :class="{ active: activeTab === 'matches' }" @click="handleTabClick('matches')">Matches</button>
      <button :class="{ active: activeTab === 'tournaments' }" @click="handleTabClick('tournaments')">Tournaments</button>
      <button :class="{ active: activeTab === 'players' }" @click="handleTabClick('players')">Players & Head-to-Head</button>
      <button :class="{ active: activeTab === 'admin' }" @click="handleTabClick('admin')">Admin & Import 🔒</button>
    </nav>

    <section class="card" style="margin-bottom: 24px; background: #f8fafc; border: 1px solid #cbd5e1;">
      <div style="display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap;">
        <strong style="color: #0f172a; margin-top: 6px;">Global Date Filters:</strong>
        <div style="flex: 1;">
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; align-items: center;">
            <span style="font-weight: 600; width: 60px; font-size: 0.85rem; color: #64748b;">Years:</span>
            <button v-for="y in availableYears" :key="y" @click="toggleYear(y.toString())"
                    :style="filterYears.includes(y.toString()) ? 'background: #0d7c66; color: white;' : 'background: #e2e8f0; color: #475569;'"
                    style="border: none; padding: 4px 10px; border-radius: 999px; cursor: pointer; font-size: 0.8rem; margin: 0;">{{ y }}</button>
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
            <span style="font-weight: 600; width: 60px; font-size: 0.85rem; color: #64748b;">Months:</span>
            <button v-for="m in monthsList" :key="m.val" @click="toggleMonth(m.val)"
                    :style="filterMonths.includes(m.val) ? 'background: #0d7c66; color: white;' : 'background: #e2e8f0; color: #475569;'"
                    style="border: none; padding: 4px 10px; border-radius: 999px; cursor: pointer; font-size: 0.8rem; margin: 0;">{{ m.short }}</button>
          </div>
        </div>
        <div v-if="filterYears.length > 0 || filterMonths.length > 0" style="margin-top: 4px;"><button class="link" @click="clearDateFilters" style="color: #ef4444; font-size: 0.85rem;">Clear Filters</button></div>
        <div v-else style="margin-top: 4px; font-size: 0.85rem; color: #94a3b8; font-style: italic;">All Time Selected</div>
      </div>
    </section>

    <section v-if="['leaderboard', 'players'].includes(activeTab)" class="card" style="margin-bottom: 24px; padding: 16px 24px;">
      <h3 style="margin: 0 0 12px 0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Handicap Tier Point Spans</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 10px;">
        <div v-for="(tier, idx) in activeTiers" :key="tier.name" style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; background: #f1f5f9; padding: 4px 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <span :class="['pill', tier.name]" style="margin: 0;">{{ tier.name }}</span>
          <span style="color: #475569; font-weight: 600;">{{ tier.baselineElo }} <span v-if="idx === 0">+</span><span v-else>- {{ activeTiers[idx-1].baselineElo - 1 }}</span></span>
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'leaderboard'" class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0;">Current Rankings</h2>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 500;">
          <input type="checkbox" v-model="showOnlyActivePlayers" style="width: auto; margin: 0;" /> Hide ghosts (0 games in filtered period)
        </label>
      </div>
      <table style="border-collapse: separate; border-spacing: 0;">
        <thead>
          <tr>
            <th @click="toggleBoardSort('rank')" style="cursor: pointer;">Rank <span v-if="boardSortKey==='rank'">{{ boardSortDir==='asc'?'↑':'↓' }}</span></th>
            <th @click="toggleBoardSort('name')" style="cursor: pointer;">Player <span v-if="boardSortKey==='name'">{{ boardSortDir==='asc'?'↑':'↓' }}</span></th>
            <th @click="toggleBoardSort('tier')" style="cursor: pointer;">Tier <span v-if="boardSortKey==='tier'">{{ boardSortDir==='asc'?'↑':'↓' }}</span></th>
            <th @click="toggleBoardSort('elo')" style="cursor: pointer; min-width: 140px;">Current Elo <span v-if="boardSortKey==='elo'">{{ boardSortDir==='asc'?'↑':'↓' }}</span></th>
            <th @click="toggleBoardSort('games')" style="cursor: pointer;">Filtered Games <span v-if="boardSortKey==='games'">{{ boardSortDir==='asc'?'↑':'↓' }}</span></th>
            <th @click="toggleBoardSort('wl')" style="cursor: pointer;">Filtered W-L <span v-if="boardSortKey==='wl'">{{ boardSortDir==='asc'?'↑':'↓' }}</span></th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="player in leaderboard" :key="player.id">
            <td style="border-bottom: 1px solid #e2e8f0;">{{ player.rank }}</td>
            <td style="border-bottom: 1px solid #e2e8f0;"><div v-if="editingPlayerId === player.id" style="display: flex; gap: 8px;"><input v-model="editName" style="padding: 4px;" /></div><strong v-else>{{ player.name }}</strong></td>
            <td style="border-bottom: 1px solid #e2e8f0;">
              <div v-if="editingPlayerId === player.id"><select v-model="editTier" style="padding: 4px;"><option v-for="t in activeTiers" :key="t.name" :value="t.name">{{ t.name }}</option></select></div>
              <span v-else>
                <span :class="['pill', player.visibleTier]">{{ player.visibleTier }}</span>
                <span v-if="getTierStatus(player.visibleTier, player.backgroundElo)" 
                      :style="{ color: getTierStatus(player.visibleTier, player.backgroundElo)?.color, marginLeft: '6px', fontSize: '1.1rem', cursor: 'help' }"
                      :title="getTierStatus(player.visibleTier, player.backgroundElo)?.title">
                  {{ getTierStatus(player.visibleTier, player.backgroundElo)?.icon }}
                </span>
              </span>
            </td>
            <td style="border-bottom: 1px solid #e2e8f0;">
              <div style="font-size: 1rem; font-weight: bold; color: #0f172a;">{{ player.backgroundElo.toFixed(1) }}</div>
              <div style="width: 100%; background: #e2e8f0; height: 5px; border-radius: 3px; margin-top: 4px; overflow: hidden; display: flex;"><div :style="{ width: getTierProgress(player.backgroundElo).pct + '%', background: getTierProgress(player.backgroundElo).pct > 85 ? '#0d7c66' : '#3b82f6' }"></div></div>
              <small style="font-size: 0.65rem; color: #64748b;" v-if="getTierProgress(player.backgroundElo).nextName">{{ getTierProgress(player.backgroundElo).toNext }} pts to {{ getTierProgress(player.backgroundElo).nextName }}</small>
            </td>
            <td style="border-bottom: 1px solid #e2e8f0;">{{ player.periodGames }}</td>
            <td style="border-bottom: 1px solid #e2e8f0;">{{ player.periodWins }}W - {{ player.periodLosses }}L</td>
            <td style="border-bottom: 1px solid #e2e8f0;"><button v-if="editingPlayerId === player.id" @click="savePlayerEdit" style="margin:0; padding: 4px 10px; font-size: 0.8rem;">Save</button><button v-else class="secondary" @click="startEditPlayer(player)" style="margin:0; padding: 4px 10px; font-size: 0.8rem; background: transparent; color: #64748b; border: 1px solid #cbd5e1;">Edit</button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="activeTab === 'matches'" class="card">
      <h2>Matches Directory</h2>
      <div class="form-grid" style="margin-bottom: 20px; display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap;">
        <label style="flex: 1; min-width: 180px;">Player Filter<select v-model="matchPlayerFilter"><option value="all">All</option><option v-for="p in state.players" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <label style="flex: 1; min-width: 180px;">Tournament<select v-model="matchTournamentFilter"><option value="all">All</option><option v-for="t in state.tournaments" :key="t.id" :value="t.id">{{ t.name }}</option></select></label>
        <label style="flex: 1; min-width: 180px;">Venue<select v-model="matchVenueFilter"><option value="all">All</option><option v-for="v in uniqueVenues" :key="v" :value="v">{{ v }}</option></select></label>
        <button class="secondary" @click="matchPlayerFilter='all'; matchTournamentFilter='all'; matchVenueFilter='all';" style="margin: 0; padding: 11px 16px; height: 42px;">Clear Filters</button>
      </div>
      <table style="border-collapse: separate; border-spacing: 0;">
        <thead>
          <tr>
            <th @click="toggleMatchSort('playedAt')" style="cursor: pointer;">Date <span v-if="matchSortKey==='playedAt'">{{ matchSortDir==='asc'?'↑':'↓' }}</span></th>
            <th @click="toggleMatchSort('playerA')" style="cursor: pointer;">Player A <span v-if="matchSortKey==='playerA'">{{ matchSortDir==='asc'?'↑':'↓' }}</span></th>
            <th @click="toggleMatchSort('playerB')" style="cursor: pointer;">Player B <span v-if="matchSortKey==='playerB'">{{ matchSortDir==='asc'?'↑':'↓' }}</span></th>
            <th>Score</th>
            <th @click="toggleMatchSort('winner')" style="cursor: pointer;">Winner <span v-if="matchSortKey==='winner'">{{ matchSortDir==='asc'?'↑':'↓' }}</span></th>
            <th @click="toggleMatchSort('venue')" style="cursor: pointer;">Venue <span v-if="matchSortKey==='venue'">{{ matchSortDir==='asc'?'↑':'↓' }}</span></th>
            <th @click="toggleMatchSort('tournament')" style="cursor: pointer;">Tournament <span v-if="matchSortKey==='tournament'">{{ matchSortDir==='asc'?'↑':'↓' }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in displayedMatches.slice(0, 500)" :key="m.id">
            <td style="border-bottom: 1px solid #e2e8f0;">{{ new Date(m.playedAt).toLocaleDateString() }}</td>
            <td style="border-bottom: 1px solid #e2e8f0;">{{ playerName(m.playerAId) }}</td>
            <td style="border-bottom: 1px solid #e2e8f0;">{{ playerName(m.playerBId) }}</td>
            <td style="border-bottom: 1px solid #e2e8f0;"><strong>{{ m.scoreA ?? '-' }} - {{ m.scoreB ?? '-' }}</strong></td>
            <td style="border-bottom: 1px solid #e2e8f0; color: #0d7c66; font-weight: bold;">{{ playerName(m.winnerId) }}</td>
            <td style="border-bottom: 1px solid #e2e8f0;">{{ m.tableName || m.tableVenue || '—' }}</td>
            <td style="border-bottom: 1px solid #e2e8f0;">{{ state.tournaments.find(t => t.id === m.tournamentId)?.name || 'manual' }}</td>
          </tr>
        </tbody>
      </table>
      <p class="hint" style="text-align: center; margin-top: 10px;">Showing up to 500 recent matches matching criteria.</p>
    </section>

    <section v-if="activeTab === 'tournaments'" class="card">
      <h2>Tournaments Directory</h2>
      <table style="border-collapse: separate; border-spacing: 0;">
        <thead>
          <tr>
            <th @click="toggleTourSort('date')" style="cursor: pointer;">Date <span v-if="tourSortKey==='date'">{{ tourSortDir==='asc'?'↑':'↓' }}</span></th>
            <th @click="toggleTourSort('name')" style="cursor: pointer;">Name <span v-if="tourSortKey==='name'">{{ tourSortDir==='asc'?'↑':'↓' }}</span></th>
            <th @click="toggleTourSort('venue')" style="cursor: pointer;">Venue <span v-if="tourSortKey==='venue'">{{ tourSortDir==='asc'?'↑':'↓' }}</span></th>
            <th @click="toggleTourSort('matches')" style="cursor: pointer;">Matches <span v-if="tourSortKey==='matches'">{{ tourSortDir==='asc'?'↑':'↓' }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in displayedTournaments" :key="t.id">
            <td style="border-bottom: 1px solid #e2e8f0;">{{ new Date(t.date).toLocaleDateString() }}</td>
            <td style="border-bottom: 1px solid #e2e8f0;"><strong>{{ t.name }}</strong></td>
            <td style="border-bottom: 1px solid #e2e8f0;">{{ (t as any).venue || '—' }}</td>
            <td style="border-bottom: 1px solid #e2e8f0;">{{ state.matches.filter(m => m.tournamentId === t.id).length }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="activeTab === 'players'" class="grid players-layout">
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h2 style="margin: 0;">Select Players</h2>
            <button v-if="selectedCompareIds.length > 0" class="link" @click="selectedCompareIds = []" style="font-size: 0.85rem; color: #ef4444; padding: 0;">Clear All</button>
          </div>
          <div style="position: relative; margin-bottom: 24px;">
            <input v-model="playerSearchQuery" placeholder="Type a name to add to dashboard..." autocomplete="off" />
            <div v-if="searchResults.length > 0" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 50;">
              <div v-for="p in searchResults" :key="p.id" @click="addPlayerToCompare(p.id)" style="padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between;">
                <span>{{ p.name }}</span><span :class="['pill', p.visibleTier]">{{ p.visibleTier }}</span>
              </div>
            </div>
          </div>
          <p v-if="selectedCompareIds.length === 0" class="hint">Search and add players to view their stats and build the matrix.</p>

          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div v-for="selId in selectedCompareIds" :key="selId" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; background: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <button @click="removePlayerFromCompare(selId)" style="background: #fee2e2; color: #ef4444; border: none; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; font-size: 1rem;">&times;</button>
                  <h3 style="margin: 0; font-size: 1.3rem;">{{ playerObj(selId)?.name }}</h3>
                </div>
                <span :class="['pill', playerObj(selId)?.visibleTier]">{{ playerObj(selId)?.visibleTier }} ({{ playerObj(selId)?.backgroundElo.toFixed(0) }})</span>
              </div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px;">
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; text-align: center;"><strong style="display: block; font-size: 1.2rem; color: #0f172a;">{{ getPlayerDetailedStats(selId).wins }} - {{ getPlayerDetailedStats(selId).losses }}</strong><span style="font-size: 0.75rem; color: #64748b; text-transform: uppercase;">W/L</span></div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; text-align: center;"><strong style="display: block; font-size: 1.2rem; color: #0f172a;">{{ getPlayerDetailedStats(selId).pct }}%</strong><span style="font-size: 0.75rem; color: #64748b; text-transform: uppercase;">Win Rate</span></div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; text-align: center;"><strong style="display: block; font-size: 1.2rem; color: #0f172a;">{{ getPlayerDetailedStats(selId).total }}</strong><span style="font-size: 0.75rem; color: #64748b; text-transform: uppercase;">Matches</span></div>
              </div>
              <div v-if="getPlayerDetailedStats(selId).total > 0">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="font-size: 0.8rem; font-weight: 700; color: #475569;">Elo Progression (Filtered)</span><span style="font-size: 0.8rem; font-weight: 700;" :style="{ color: getPlayerDetailedStats(selId).eloChange >= 0 ? '#0d7c66' : '#ef4444' }">{{ getPlayerDetailedStats(selId).eloChange >= 0 ? '+' : '' }}{{ getPlayerDetailedStats(selId).eloChange.toFixed(1) }} points</span></div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 0; height: 60px; display: flex; align-items: center;">
                  <svg v-if="getPlayerDetailedStats(selId).sparkline" viewBox="0 -5 200 50" style="width: 100%; height: 40px; overflow: visible;"><polyline :points="getPlayerDetailedStats(selId).sparkline" fill="none" :stroke="getPlayerDetailedStats(selId).eloChange >= 0 ? '#0d7c66' : '#ef4444'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  <span v-else style="width: 100%; text-align: center; color: #cbd5e1; font-size: 0.8rem;">Insufficient Trend Data</span>
                </div>
              </div>
              <p v-else class="hint" style="margin:0; text-align: center;">No matches played in this period.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="display: flex; flex-direction: column; padding-bottom: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
           <h2 style="margin: 0;">Head-to-Head Matrix</h2>
           <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: #64748b;">
             <input type="checkbox" v-model="showOnlyActivePlayers" style="margin: 0; width: auto;" /> Hide Ghosts
           </label>
        </div>
        <p class="hint" style="margin-bottom: 16px;">Opponents below have played against selected players during the filtered time period.</p>

        <div v-if="selectedCompareIds.length === 0" style="padding: 40px; text-align: center; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;"><p class="hint">Search and add players on the left to build the matrix.</p></div>
        
        <div v-else style="flex: 1; overflow-y: auto; overflow-x: auto; max-height: calc(100vh - 250px); border: 1px solid #e2e8f0; border-top-left-radius: 12px; border-top-right-radius: 12px; background: white;">
          <table style="border-collapse: separate; border-spacing: 0; width: 100%;">
            <thead>
              <tr>
                <th style="min-width: 200px; position: sticky; top: 0; left: 0; background: #f8fafc; z-index: 20; padding: 16px 12px; border-bottom: 2px solid #cbd5e1; box-shadow: 2px 0 4px rgba(0,0,0,0.05);">Active Opponents</th>
                <th v-for="id in selectedCompareIds" :key="id" style="text-align: center; min-width: 150px; position: sticky; top: 0; background: #f8fafc; z-index: 10; padding: 12px 8px; border-bottom: 2px solid #cbd5e1;">
                  <div style="font-weight: 800; color: #0f172a; margin-bottom: 6px;">{{ playerName(id) }}</div>
                  <span :class="['pill', playerObj(id)?.visibleTier]" style="font-size: 0.72rem; letter-spacing: 0;">{{ playerObj(id)?.visibleTier }} ({{ playerObj(id)?.backgroundElo.toFixed(0) }})</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="opponent in matrixRows" :key="opponent.id">
                <td style="font-weight: 700; position: sticky; left: 0; background: white; border-bottom: 1px solid #f1f5f9; padding: 12px; box-shadow: 2px 0 4px rgba(0,0,0,0.02); display: flex; align-items: center; justify-content: space-between;">
                  <span>{{ opponent.name }}</span><span :class="['pill', opponent.visibleTier]" style="zoom: 0.75; margin-left: 8px;">{{ opponent.visibleTier }}</span>
                </td>
                <td v-for="headerId in selectedCompareIds" :key="headerId" style="text-align: center; padding: 14px 10px; border-bottom: 1px solid #f1f5f9; border-left: 1px solid #f8fafc;">
                  <div v-if="getMatchupStats(headerId, opponent.id).total > 0">
                    <div style="font-weight: 800; font-size: 0.95rem; margin-bottom: 6px;"><span style="color: #0d7c66;">{{ getMatchupStats(headerId, opponent.id).wins }}W</span> - <span style="color: #ef4444;">{{ getMatchupStats(headerId, opponent.id).losses }}L</span></div>
                    <div style="width: 100%; background: #fee2e2; height: 6px; border-radius: 999px; overflow: hidden; display: flex; margin-bottom: 4px;"><div :style="{ width: getMatchupStats(headerId, opponent.id).pct + '%', background: '#0d7c66' }" style="height: 100%;"></div></div>
                  </div>
                  <div v-else><span style="color: #cbd5e1; font-size: 0.8rem;">—</span></div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'admin'" class="grid two">
      <div class="card">
        <h2>Import from CueScore API</h2>
        <p class="hint">Ensure your <code>proxy.mjs</code> server is running in the background before importing.</p>
        <button class="secondary" @click="syncPlayersFromHandicapList" :disabled="isSyncingHandicaps" style="margin-bottom: 24px; width: 100%; background: #245b93;">{{ isSyncingHandicaps ? 'Syncing...' : '1. 🔄 Sync All Players From HC List 64255726' }}</button>
        <textarea v-model="tournamentUrlsImport" placeholder="Paste CueScore tournament URLs here..." rows="6"></textarea>
        <button @click="importTournamentsByUrl" :disabled="isImportingTournaments" style="width: 100%;">{{ isImportingTournaments ? 'Importing...' : '2. Import Tournaments & Matches' }}</button>
        <p v-if="importStatus" class="hint" style="font-weight: bold; color: #0d7c66; margin-top: 10px;">{{ importStatus }}</p>
        <p v-if="lastImported" class="hint" style="margin-top: 5px; font-size: 0.85rem;">Last imported: <strong>{{ lastImported.date }} - {{ lastImported.name }}</strong></p>
      </div>

      <div class="card">
        <h2>System Maintenance & Backups</h2>
        <p class="hint">Export and import the entire database to move it between browsers or devices.</p>
        
        <div style="display: flex; gap: 12px; margin-bottom: 24px;">
          <button @click="exportFullDatabase" style="flex: 1; background: #0d7c66;">💾 Export Database (JSON)</button>
          <div style="flex: 1; position: relative;">
            <input type="file" @change="importFullDatabase" accept=".json" style="position: absolute; width: 100%; height: 100%; opacity: 0; cursor: pointer;" />
            <button class="secondary" style="width: 100%; pointer-events: none; background: #f59e0b;">📂 Import Database</button>
          </div>
        </div>

        <button class="link" @click="resetDemo" style="color: #ef4444; width: 100%;">⚠️ Nuke Local Database (Reset All)</button>
      </div>
    </section>

  </main>
</template>

<style scoped>
.players-layout {
  grid-template-columns: 1fr 2.2fr;
  gap: 24px;
}
@media (max-width: 980px) {
  .players-layout {
    grid-template-columns: 1fr;
  }
}
</style>

```