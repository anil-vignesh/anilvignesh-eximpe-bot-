# Deployment Guide

## Two paths — same codebase, swap when ready

---

## Path A: Render (free tier) — for testing

### ⚠️ Free tier caveat
Render free services spin down after 15 minutes of inactivity (cold start ~30s).
Fine for testing. For production, upgrade to Render Starter ($7/month) or switch to Railway.

### Steps

1. **Push repo to GitHub**
   ```bash
   cd ~/eximpe-bot
   git remote add origin https://github.com/YOUR_ORG/eximpe-bot.git
   git push -u origin main
   ```

2. **Create Render account** → https://render.com

3. **New Web Service** → connect your GitHub repo
   - Root directory: `apps/webhook`
   - Build command: `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm build`
   - Start command: `node dist/index.js`
   - Plan: **Free**

4. **Set environment variables** in Render dashboard (Settings → Environment):
   ```
   SUPABASE_URL=https://kiavuufafagomyoydseh.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<from .env>
   SUPABASE_ANON_KEY=<from .env>
   ANTHROPIC_API_KEY=<from .env>
   VOYAGE_API_KEY=<from .env>
   TAVILY_API_KEY=<from .env>
   REDIS_URL=redis://default:RnMgzgwsPzBQWXqDqPKIBLWslsVfspcT@turntable.proxy.rlwy.net:22635
   WEBHOOK_BASE_URL=https://<your-render-app>.onrender.com
   ```
   > Set WEBHOOK_BASE_URL to the URL Render gives you (shown on the service page).

5. **Deploy** — Render auto-deploys on every git push.

6. **Register Telegram webhook** (once deployed):
   ```bash
   curl -X PATCH https://<your-render-app>.onrender.com/api/bots/<botId>/status \
     -H "Content-Type: application/json" \
     -d '{"status": "active"}'
   ```

---

## Path B: Railway — for production

### Steps

1. **Add webhook service** to your existing Railway project
   - New Service → GitHub Repo → select `eximpe-bot`
   - Root directory: `apps/webhook`
   - Build: `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm build`
   - Start: `node dist/index.js`

2. **Set environment variables** — same as Render above
   - Railway auto-detects the Redis service URL if you link the services

3. **Get Railway URL** → Settings → Domains → Generate domain

4. **Update WEBHOOK_BASE_URL** to the Railway domain

5. **Register Telegram webhook** — same curl command as above

---

## Local testing with ngrok (no deployment needed)

```bash
# Terminal 1 — run webhook server
cd ~/eximpe-bot/apps/webhook
pnpm dev

# Terminal 2 — expose it publicly
ngrok http 3001
```

Copy the `https://xxxx.ngrok.io` URL → set as `WEBHOOK_BASE_URL` in `.env`
Then register the webhook manually:
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://xxxx.ngrok.io/webhook/telegram/<botId>"
```

> ngrok free tier URL changes every restart — re-register webhook each time.
