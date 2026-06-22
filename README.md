# Easy Calories

A mobile-first, judgement-free and deliberately approximate calorie notebook. Everything stays in the browser's `localStorage`; there is no account or backend.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Other useful commands:

```bash
npm run build
npm run preview
```

The production files are written to `dist/`.

## GitHub Pages

The workflow at `.github/workflows/deploy.yml` publishes `dist/` whenever `main` is pushed. In the GitHub repository:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main`, or run the workflow manually from the **Actions** tab.

Vite must know the repository sub-path used by project Pages sites. The workflow sets:

```text
VITE_BASE_PATH=/<repository-name>/
```

`vite.config.ts` reads that variable and otherwise uses `/` for local development. If the site is published at a custom domain or at `username.github.io`, change the workflow value to `/`. For a differently named path, set it to that path with leading and trailing slashes, for example `/easy-calories/`.

## Data and backups

Logs and favourites are stored only in `localStorage` under `easy-calories-data-v1`. Clearing site data removes them. Settings includes JSON export and import for manual backups. Imports replace the current notebook after confirmation.

## Structure

```text
src/
  App.tsx       Screens and app behaviour
  storage.ts    localStorage persistence and import validation
  types.ts      Food and log data types
  styles.css    Mobile-first visual system
```
