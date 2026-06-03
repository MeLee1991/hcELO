# hcELO Billiards Tournament & Handicap Tracker

A Vue web app and Supabase/PostgreSQL schema for managing billiards tournament points and independent match-by-match handicap Elo ratings.

## What this repository contains

- A frontend web app in `src/App.vue` that you can run locally in a browser.
- Handicap/Elo business logic in `src/lib/handicap.ts`.
- Supabase/PostgreSQL production database setup in `supabase/migrations/001_initial_schema.sql`.
- A quick smoke test in `scripts/handicap-check.mjs`.

## Requirements before testing locally

Install these on your computer first:

1. **Visual Studio Code**: <https://code.visualstudio.com/>
2. **Node.js LTS**: <https://nodejs.org/>
   - Choose the LTS version.
   - Node includes `npm`, which is used to install and run this app.
3. **Git**: <https://git-scm.com/downloads>
   - Required if you want to clone the GitHub repository instead of downloading it as a ZIP.

To confirm Node and npm are installed, open a terminal and run:

```bash
node -v
npm -v
```


## How to put these files into your empty GitHub repo

If your GitHub repository `MeLee1991/hcELO` is empty, the files in this project still need to be pushed up to GitHub. Use one of the workflows below.

### Option A: Push from a local folder that already has these files

Open the `hcELO` folder in VS Code, then run these commands in the VS Code terminal:

```bash
git init
git add .
git commit -m "Add hcELO app"
git branch -M main
git remote add origin https://github.com/MeLee1991/hcELO.git
git push -u origin main
```

If `git remote add origin ...` says the remote already exists, run this instead and then push:

```bash
git remote set-url origin https://github.com/MeLee1991/hcELO.git
git push -u origin main
```

After the push finishes, refresh <https://github.com/MeLee1991/hcELO>. You should see files like `package.json`, `src/App.vue`, and `README.md`.

### Option B: Start by cloning the empty GitHub repo

If you have not copied the project files to your computer yet, clone the empty repo first:

```bash
git clone https://github.com/MeLee1991/hcELO.git
cd hcELO
```

Then copy all generated project files into that `hcELO` folder. After copying, run:

```bash
git add .
git commit -m "Add hcELO app"
git push -u origin main
```

### If GitHub asks you to sign in

When pushing over HTTPS, GitHub may ask for your username and password. Use:

- Username: `MeLee1991`
- Password: a GitHub personal access token, not your normal GitHub password

GitHub's token page is: <https://github.com/settings/tokens>

## How to open the GitHub repo in Visual Studio Code

### Option A: Clone with Git, recommended

1. Open **Visual Studio Code**.
2. Open the VS Code terminal:
   - Windows/Linux: `Ctrl` + `` ` ``
   - macOS: `Cmd` + `` ` ``
3. Go to the folder where you keep projects. Example:

```bash
cd Desktop
```

4. Clone your GitHub repository:

```bash
git clone https://github.com/YOUR-GITHUB-USERNAME/hcELO.git
```

Replace `YOUR-GITHUB-USERNAME` with your real GitHub username or organization name.

5. Enter the project folder:

```bash
cd hcELO
```

6. Open that folder in VS Code:

```bash
code .
```

If `code .` is not recognized, open VS Code manually, choose **File → Open Folder**, and select the `hcELO` folder.

### Option B: Download ZIP from GitHub

1. Open the `hcELO` repository on GitHub.
2. Click **Code → Download ZIP**.
3. Unzip the file.
4. Open VS Code.
5. Choose **File → Open Folder**.
6. Select the unzipped `hcELO` folder.

## How to run the app locally

After the `hcELO` folder is open in VS Code:

1. Open the VS Code terminal.
2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Vite will print a local URL, usually something like:

```text
http://localhost:5173/
```

5. Open that URL in your browser.

You should see the hcELO billiards tracker with:

- Player handicap rankings.
- Match input: Player A vs Player B, select winner.
- Instant Elo update after recording a match.
- Monthly tier processing button.
- Tournament points entry for 1st, 2nd, and two 3rd-place semifinalists.
- CSV import box for CueScore/current rankings.

## How to test the math quickly

Run:

```bash
npm run test
```

This runs `scripts/handicap-check.mjs`, which checks the core Elo and monthly hysteresis rules without needing a browser.

## How to create a production build

Run:

```bash
npm run build
```

The finished static website will be generated in the `dist/` folder.

## Common problems

### `npm install` fails

Try these steps:

```bash
npm cache clean --force
npm install
```

If it still fails, make sure:

- You have internet access.
- You are not behind a company/school firewall blocking the npm registry.
- Node.js LTS is installed correctly.

### `npm run dev` works but the browser does not open automatically

Copy the local URL printed in the terminal, usually `http://localhost:5173/`, and paste it into your browser manually.

### `code .` does not work

Open VS Code manually and use **File → Open Folder** instead.

## Features

- Admin match input for Player A vs Player B with winner selection.
- Standard Elo expected-outcome formula with a strict `K=20` stability factor.
- Immediate background Elo updates and a full audit log per match.
- Top-4-only tournament point allocation: 100 / 70 / 50 / 50 / 0.
- Monthly visible-tier locking with a 50-point demotion hysteresis buffer.
- CSV import for current CueScore rankings (`Name,Tier,Elo,Points`) when the CueScore dashboard is not publicly accessible.
- Supabase migration with tables, match RPC, tournament point trigger, monthly tier processing function, and pg_cron schedule.


## Data source notes

The original scaffold used fake demo player names only because the CueScore handicap dashboard can require an authenticated dashboard session. The current seed data in `src/lib/seed.ts` now comes from the HC rankings manually provided by MeLee1991 on 2026-06-03.

For games, the app supports three practical import paths:

1. Paste a CueScore tournament URL into the match import box so the app can try to fetch it.
2. If the browser blocks CueScore because of CORS/login/session rules, copy or export the match table and paste CSV/TSV rows in this format:

```csv
Date,Club,Tournament,Player A,Player B,Winner,Score A,Score B,URL
2026-06-02,Kaval,KAVAL HC Torek 02.06.2026,Adnan Bašić,Rok Količ,Rok Količ,0,1,https://cuescore.com/tournament/KAVAL+HC+Torek+02.06.2026/82399141
```

3. Export your Google Sheet to CSV and paste/import those rows. The shared sheet is intended as the master source for matches, tournaments, and miniHC values.

Handicap rows are editable in the UI. The `miniHC` column is also editable and acts as the minimum allowed handicap tier during monthly processing. If Elo suggests a lower tier than miniHC allows, the app logs a miniHC warning and keeps the player at the minimum tier.

## Supabase setup

Apply `supabase/migrations/001_initial_schema.sql` to a Supabase project with `pg_cron` enabled. Use the `public.record_match(player_a, player_b, winner)` RPC for server-side match entry, and `public.process_monthly_tiers()` for manual or scheduled tier processing.

## CueScore rankings

The provided CueScore dashboard URL appears to require a valid dashboard session in many contexts. Export or copy the active ranking list and paste it into the import box as CSV rows:

```csv
Jane Player,A3,1512,70
John Player,B1,1390,0
```
