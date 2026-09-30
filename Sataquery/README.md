# SatQuery AI — Frontend

Interactive satellite imagery analysis platform built with React + Vite.

## Stack

- **React 19** + **Vite 8**
- **Leaflet** — map (OpenStreetMap tiles, no API key needed)
- **Tailwind CSS v4**
- **FastAPI backend** — see `/backend`

---

## Local Development

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env
# Edit .env — add your VITE_GEMINI_API_KEY

# Start dev server (backend must also be running on :8000)
npm run dev
```

Open http://localhost:5173

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_GEMINI_API_KEY` | ✅ Yes | Gemini AI key for chat — get free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `VITE_API_BASE_URL` | ❌ No (dev) | Backend URL — leave empty in dev, set to deployed backend URL in production |
| `VITE_GROQ_API_KEY` | ❌ Optional | Groq fallback AI provider |

> **No Google Maps API key needed.** The map uses OpenStreetMap tiles which are completely free.

---

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Set **Root Directory** to `Sataquery`
4. Set **Framework Preset** to `Vite`
5. Add environment variables:
   - `VITE_GEMINI_API_KEY` = your Gemini key
   - `VITE_API_BASE_URL` = your deployed backend URL (e.g. `https://your-app.onrender.com`)
6. Deploy

## Deploy to Netlify

1. Go to [netlify.com](https://netlify.com) → New site → Import from Git
2. Set **Base directory** to `Sataquery`
3. Set **Build command** to `npm run build`
4. Set **Publish directory** to `Sataquery/dist`
5. Add the same environment variables as above
6. Deploy

---

## Backend

See [`/backend/README.md`](../backend/README.md) for FastAPI backend setup and deployment (Render, Railway, etc.).
