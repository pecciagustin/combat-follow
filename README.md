# Combat Follow

Mobile-first PWA for BJJ event photographers to track fight schedules in real time.

## Setup

### 1. Install and run locally

```bash
npm install
npm run dev
```

### 2. Configure API key

Copy `.env.example` to `.env` and add your Anthropic API key:

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_ANTHROPIC_API_KEY=your_key_here
```

Get a key at https://console.anthropic.com

> **Note:** The API key is exposed client-side since this is a personal tool with no backend. Don't share the deployed URL publicly, or use Vercel's environment variable scoping to restrict access.

### 3. Add icons

Replace `public/icon-192.png` and `public/icon-512.png` with your own icons (PNG format). The PWA manifest references these for the home screen icon.

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your repo.
3. In **Environment Variables**, add:
   - Name: `VITE_ANTHROPIC_API_KEY`
   - Value: your Anthropic API key
4. Deploy.

---

## Install on mobile (iOS Safari)

1. Open the Vercel URL in Safari.
2. Tap the **Share** button (box with arrow).
3. Tap **"Añadir a pantalla de inicio"** / **"Add to Home Screen"**.
4. Tap **Add** — the app icon appears on your home screen.

The app runs fullscreen without browser chrome, like a native app.

---

## How it works

- Fighters and their Smoothcomp bracket URLs are stored in `localStorage`.
- On each refresh cycle, the app calls the Anthropic API with `web_search` tool enabled.
- Claude visits each bracket URL, finds the next scheduled match, and returns structured JSON.
- If a time or mat number changes between polls, the card highlights in amber and a log entry is added.
- Smoothcomp is fully JS-rendered — direct fetch won't work, which is why scraping goes through Claude with web search.

## Refresh intervals

- **1 min** — use during active fighting
- **2 min** — default, good balance
- **5 min** — use during long waits between matches
