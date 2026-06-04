import { getTier, type TierName } from './handicap';
import type { Player } from './types';

const CSV_DATA = `Name,Tier,Elo,Points
Ales Kokalj,,,0
Danijel Urbanija,,,0
Franci Srnec,,,0
Gvido Maljevac,,,0
Jaka Gradišek,,,0
Ana Gradisnik,A+,1800,0
Ąžuolas Tadaravičius,A+,1800,0
Boris Erculj,A+,1800,0
Klemen Gradišnik,A+,1800,0
Maj Badovinac,A+,1800,0
Matjaž Erčulj,A+,1800,0
Miha Vičič Šnajdar,A+,1800,0
Mitja Gradišnik,A+,1800,0
Jokubas Silantjevas,A+,1800,0
Aleš Mandič,A1,1700,0
Blaz Kolenc,A1,1700,0
Blaž Resnik,A1,1700,0
Borys Gaćkowski,A1,1700,0
Drazen Vrhovac,A1,1700,0
Miha Zajc Zaytsev,A1,1700,0
Nikita Marojević,A1,1700,0
Rado Doroslovac,A1,1700,0
Simon Tomažič,A1,1700,0
Svit Pavlinjek,A1,1700,0
Tristan Šulek,A1,1700,0
Vuk Strugar,A1,1700,0
Miha Skerlavaj,A1,1700,0
Seif eddine Boucheligua,A1,1700,0
Lovro Bračun,A1,1700,0
Aleksander Raišič,A2,1600,0
Blaž Rus,A2,1600,0
Bojan Uljan,A2,1600,0
Dino Nadarević,A2,1600,0
Franci Čučnik,A2,1600,0
Goran Delic,A2,1600,0
Jan Slejko Ljubišič,A2,1600,0
Jan Slejko Ljubišič,A2,1600,0
Janez Pavlovič,A2,1600,0
Jasmin Čaušević,A2,1600,0
Jože Marinko,A2,1600,0
Maja Globočnik,A2,1600,0
Matej Brajkovič,A2,1600,0
Matej Dakol,A2,1600,0
Matej Kovac,A2,1600,0
Matjaž Demšar,A2,1600,0
Matjaž Košar,A2,1600,0
Matjaz Kozamernik,A2,1600,0
Natalija Golob,A2,1600,0
Nikola Lukašikas        ,A2,1600,0
Obid Boštjan,A2,1600,0
Robert Rednak,A2,1600,0
Srdja Vukajlovic,A2,1600,0
Aleš Kokalj,A3,1500,0
Alex Grigolunovich,A3,1500,0
Ali Arszlan,A3,1500,0
Arzslan Ali,A3,1500,0
Blaž Rauter,A3,1500,0
Damjan Kraševec,A3,1500,0
Davide Bussani,A3,1500,0
Davor Polak,A3,1500,0
Dejan Simič,A3,1500,0
Denis Jasnič,A3,1500,0
Francesca Garlatti,A3,1500,0
Francesca Garlatti,A3,1500,0
Gašper Butina,A3,1500,0
Gorazd Žužek,A3,1500,0
Iztok Mavsar,A3,1500,0
Jon Jelen,A3,1500,0
Klavdij Ferle,A3,1500,0
Klemen Sorak,A3,1500,0
Klemen Šorak,A3,1500,0
Kristijan Nikl,A3,1500,0
Lan Mrovlje,A3,1500,0
Lovro Kokot,A3,1500,0
Luka Drljača,A3,1500,0
Marko Avramovic,A3,1500,0
Matic Rudolf,A3,1500,0
Mitja Kragelj,A3,1500,0
Samir Mahmutovic,A3,1500,0
Tomi Bratina,A3,1500,0
Ziga Kovac,A3,1500,0
Ivan Kretov,A3,1500,0
Nik Rus,A3,1500,0
Peter Drame,A3,1500,0
Damir Petrinec,A3,1500,0
Gaja Rutar Doroslovac,B-,1100,0
Jelka Kelec,B-,1100,0
Jordan L,B-,1100,0
Tadej Raisic,B-,1100,0
Vanja Raisic,B-,1100,0
Aleksander Mavric,B1,1400,0
Andrej Uglešić,B1,1400,0
Anže Ciuha,B1,1400,0
Armen Bdoian,B1,1400,0
Boris Doberšek,B1,1400,0
Boštjan Božič,B1,1400,0
Boštjan Marolt,B1,1400,0
Dalibor Drljača,B1,1400,0
Darko Filipovic,B1,1400,0
David Gradišnik,B1,1400,0
Dominik Steržaj,B1,1400,0
Florijan Rostohar,B1,1400,0
Goran Starčev,B1,1400,0
Goran Sztarcsev,B1,1400,0
Ilya Smirnov,B1,1400,0
Ivan Josič,B1,1400,0
Jaka Gradišar,B1,1400,0
Jaka Korenčan,B1,1400,0
Jan Hvalec,B1,1400,0
Janez Lavrič,B1,1400,0
Janez Rajnar,B1,1400,0
Janko Kočar,B1,1400,0
Joško Kuhelj,B1,1400,0
Lazar Olić,B1,1400,0
Magic Wladimir,B1,1400,0
Maksim Doberšek,B1,1400,0
Manuel Ghiro,B1,1400,0
Marijan Bratić,B1,1400,0
Marjan Lesar,B1,1400,0
Mark Metelko,B1,1400,0
Marko Hočevar,B1,1400,0
Martin Lampret,B1,1400,0
Matic Kunstelj,B1,1400,0
Miha Papler,B1,1400,0
Miha Plut,B1,1400,0
Mirnes Mahmutovic,B1,1400,0
Mitja Svoljšak,B1,1400,0
Oleg Birgmajer,B1,1400,0
Olexandr Rozumovsky,B1,1400,0
Philip Jokic,B1,1400,0
Radulovic Zoran,B1,1400,0
Rok Količ,B1,1400,0
Rok Spindler,B1,1400,0
simon bartolj,B1,1400,0
Tomaž Benedičič,B1,1400,0
Tomaz Varvaris,B1,1400,0
Vid Kuklec,B1,1400,0
Vladimir Mikek,B1,1400,0
Sebastjan Dolamic,B1,1400,0
Marko Podgoršek,B1,1400,0
Andrej Hribljan,B2,1300,0
Blaž Vrankar,B2,1300,0
Dejan Dim,B2,1300,0
Dominik Fendre,B2,1300,0
Dragan Spasovski,B2,1300,0
Dragan Spasovski,B2,1300,0
Jakob Humer,B2,1300,0
Jure Dobrajc,B2,1300,0
Jure dobrajc,B2,1300,0
Marcel Žibret,B2,1300,0
Matej Michler,B2,1300,0
Matjaž Kastelic,B2,1300,0
Miha Ribaric,B2,1300,0
Stane Jelačin,B2,1300,0
Tim Ursic,B2,1300,0
Timotej Dundovic,B2,1300,0
Tomo Blaževič,B2,1300,0
Franc Srnec,B2,1300,0
Jelizaveta Dzebisašvili,B2,1300,0
Anastasia Losseva,B2,1300,0
Andrejs Grigolunovičs,B2,1300,0
Blendi Ukimeri,B2,1300,0
Adnan Bašić,B2,1300,0
David Rus,B2,1300,0
David Benedicic,B2,1300,0
Domen Drol,B3,1200,0
Mark Lakner,B3,1200,0
Szymon Porczyk,B3,1200,0
Tilen Gombač,B3,1200,0
Tina Zdešar Kolenc,B3,1200,0
Maks Benko,PRO,2000,0
Roberto Bartol,PRO,2000,0
Kęstutis Žadeikis,PRO,2000,0
`;

function parseCsv(csv: string): Player[] {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  const header = lines.shift();
  const players: Player[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const parts = line.split(',');
    const name = (parts[0] || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const tierRaw = (parts[1] || '').trim();
    const eloRaw = (parts[2] || '').trim();
    const pointsRaw = (parts[3] || '').trim();

    const tier = tierRaw || 'B-';
    const elo = Number(eloRaw) || getTier(tier as any).baselineElo || 1100;
    const points = Number(pointsRaw) || 0;

    players.push({
      id: `player-${Math.random().toString(36).slice(2, 9)}`,
      name,
      visibleTier: tier as any,
      backgroundElo: elo,
      tournamentPoints: points,
      gamesPlayed: 0,
      tournamentsPlayed: 0,
      wins: 0,
      losses: 0,
    });
  }

  return players;
}

export const seedPlayers: Player[] = parseCsv(CSV_DATA);
