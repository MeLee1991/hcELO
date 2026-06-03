import { getTier, type TierName } from './handicap';
import type { Player } from './types';

const namesByTier: Array<[TierName, string[]]> = [
  ['Pro', ['Mark Vencelj', 'Blaž Rus']],
  ['A+', ['Denis Grabež', 'Matej Brajkovič']],
  ['A1', ['Svit Pavlinjek', 'Boštjan Pemič']],
  ['A2', ['Ivan Josič', 'Miha Zajc']],
  ['A3', ['Nina Torbica', 'Luka Kovač']],
  ['B1', ['Ana Novak', 'Tilen Horvat']],
  ['B2', ['Jure Vidmar', 'Maja Kos']],
  ['B3', ['Sara Kralj', 'Nejc Mlakar']],
  ['B-', ['Gregor Pirc', 'Petra Leban']],
];

export const seedPlayers: Player[] = namesByTier.flatMap(([tierName, names], tierIndex) =>
  names.map((name, playerIndex) => ({
    id: `${tierName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${playerIndex + 1}`,
    name,
    visibleTier: tierName,
    backgroundElo: getTier(tierName).baselineElo - playerIndex * 12 - tierIndex * 3,
    tournamentPoints: 0,
  })),
);
