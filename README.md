# EximPe Bot

AI-powered API support assistant for EximPe developers. Answers questions about the EximPe payment API on Telegram (and planned WhatsApp), grounded in official documentation, past interactions, and web search.

---

## What it does

Developers in EximPe Telegram groups @mention the bot with API questions. The bot:

1. Rewrites the query to expand domain terminology
2. Searches the knowledge base (embedded docs) for relevant chunks
3. Searches the experience store (past Q&A) for similar resolved questions
4. If confidence is low, triggers a web search via Tavily
5. Calls Claude with all retrieved context and returns a grounded answer
6. Logs the conversation and auto-distils it into the experience store for future use

---

## Architecture

```
Telegram / WhatsApp
       │
       ▼
apps/webhook  (Express.js)
  ├── routes/          Route handlers per channel
  ├── adapters/        Parse incoming / format outgoing per channel
  ├── pipeline/        RAG pipeline: retrieve → Claude → respond
  │   ├── index.ts     Main pipeline (query rewrite, retrieval, Claude agentic loop)
  │   ├── retrieve.ts  Vector search: doc chunks + experience entries
  │   └── webSearch.ts Tavily fallback
  └── queue/           BullMQ workers (ingestion, crawl)

apps/web  (Next.js admin dashboard)
  ├── bots/            Bot management
  ├── knowledge-base/  Upload docs, trigger indexing, monitor status
  ├── experience-store/ Browse and curate Q&A entries
  ├── chat-assignments/ Map groups → bots + API versions
  ├── logs/            Conversation history
  └── settings/        Global platform config

packages/shared
  ├── db/client.ts     Supabase client
  └── types/           Shared TypeScript interfaces

External services
  ├── Supabase         PostgreSQL + pgvector (embeddings stored here)
  ├── Voyage AI        Text embeddings (voyage-3, 1024 dimensions)
  ├── Anthropic Claude LLM (default: claude-haiku-4-5-20251001)
  ├── Tavily           Web search fallback
  └── Redis (Railway)  BullMQ job queue for ingestion / crawl
```

---

## Monorepo structure

```
eximpe-bot/
├── apps/
│   ├── webhook/          Express.js webhook server + background workers
│   └── web/              Next.js admin dashboard
├── packages/
│   └── shared/           Supabase client, TypeScript types, DB migrations
├── scripts/              One-off admin utilities
├── nixpacks.toml         Railway build config
├── railway.json          Railway service config
├── pnpm-workspace.yaml   Monorepo workspace declaration
└── DEPLOYMENT.md         Detailed deployment guide (Render + Railway)
```

---

## Prerequisites

- **Node 20**
- **pnpm 9** — `npm install -g pnpm@9`
- **Supabase project** — free tier is fine for development
- **Redis** — Railway Redis or any Redis-compatible instance
- API keys for: Anthropic, Voyage AI, Tavily

---

## Local development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Environment variables

Create `apps/webhook/.env`:

```bash
# Supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_ANON_KEY=<anon_key>

# AI services
ANTHROPIC_API_KEY=sk-ant-...
VOYAGE_API_KEY=pa-...
TAVILY_API_KEY=tvly-...

# Infrastructure
REDIS_URL=redis://default:<password>@<host>:<port>
WEBHOOK_BASE_URL=https://<public-url>   # Telegram needs a public HTTPS URL
```

Create `apps/web/.env.local`:

```bash
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
WEBHOOK_URL=http://localhost:3001       # Points to local webhook server
```

### 3. Run database migrations

```bash
# Apply the schema to your Supabase project
pnpm db:migrate
```

The migrations live in `packages/shared/src/db/migrations/`. Apply them in order via the Supabase SQL editor or using the Supabase CLI.

### 4. Start the servers

```bash
# Terminal 1 — webhook server (port 3001)
cd apps/webhook && pnpm dev

# Terminal 2 — admin dashboard (port 3000)
cd apps/web && pnpm dev
```

If `REDIS_URL` is not set, the webhook server starts without BullMQ workers (ingestion and crawl jobs won't run).

### 5. Testing with Telegram locally

Use [ngrok](https://ngrok.com) to expose your local server:

```bash
ngrok http 3001
```

Then register your bot's webhook:

```bash
curl -X PATCH https://<ngrok-url>/api/bots/<botId>/status \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

ngrok URLs change on every restart — re-register after each restart.

---

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for full instructions.

**Quick summary:**
- **Production:** Railway (auto-deploys on `git push main`). Set env vars in Railway dashboard.
- **Testing:** Render free tier (spins down after 15 min idle — fine for testing only).

Build is driven by `nixpacks.toml`:
```
install → pnpm install --frozen-lockfile
build   → pnpm build (compiles shared + webhook)
start   → node apps/webhook/dist/index.js
```

The web dashboard deploys separately (Vercel or Railway static).

---

## How the pipeline works

Every Telegram message goes through this sequence:

```
Message received
  → parseTelegramUpdate()      Validate, extract chatId / text / apiVersion
  → classifyIntent()           Haiku call — skip non-API messages silently
  → rewriteQuery()             Haiku call — expand "upi autopay" → "UPI AutoPay mandate subscription debit"
  → retrieveDocs()             pgvector cosine search on document_chunks
  → retrieveExperience()       pgvector cosine search on experience_entries
  → getGroupContext()          Last N messages from this group (for context)
  → lowConfidence check        If best doc score < 0.5 AND no experience → enable web search
  → Claude agentic loop        Max 3 rounds; executes web_search tool if needed
  → sendTelegramMessage()      MarkdownV2 format; falls back to plain text on Telegram error
  → logAndLearn()              Saves conversation_log; async experience auto-distil
```

**Key tunables** (stored per knowledge base in `knowledge_bases` table, editable in dashboard):
- `chunk_size` — Characters per chunk (default: 1200)
- `top_k` — Doc chunks retrieved per query (default: 8)
- `doc_retrieval_threshold` — Minimum cosine similarity to include a chunk (default: 0.55)

**Key tunables** (stored per bot in `bots` table):
- `llm_model` — Claude model (default: `claude-haiku-4-5-20251001`)
- `max_response_tokens` — Max answer length (default: 1024)
- `web_search_fallback` — Enable/disable Tavily fallback
- `system_prompt` — Override the default system prompt (leave null to use the built-in one)

---

## Knowledge base management

### Adding documents via dashboard

Go to `/knowledge-base/[id]` in the admin dashboard:
- **URL** — Fetches the page, strips navigation chrome, converts to Markdown
- **Paste Text** — Paste Markdown or plain text directly
- **Upload File** — PDF, DOCX, XLSX, CSV, TXT (max depends on Supabase Storage config)

All three methods enqueue an ingestion job immediately after saving.

### Crawling docs.eximpe.com

Click **"Crawl docs.eximpe.com"** in the dashboard and enter the API versions to crawl (e.g. `1, 2`). This runs the crawl worker which discovers all pages for those versions and enqueues ingestion for each.

### Re-indexing

- **Re-index All** — Re-queues every indexed or errored document in the KB
- **Per-document retry** — Click the refresh icon on any row with `error` or `pending` status

### Ingestion internals

```
extractFromUrl / extractFromPdf / extractFromDocx / extractFromXlsx
  → htmlToMarkdown()        Preserves headings, code blocks, tables, lists
  → chunkBySection()        Splits at heading boundaries; each chunk carries section_path[]
  → embedBatch()            Voyage AI voyage-3; 128 texts per API call
  → document_chunks.insert  Batches of 50 rows; stores content + embedding + metadata
```

**Rate limits:** Voyage AI free tier is 3 RPM. The BullMQ worker is capped at 1 job/min. Failed jobs retry with exponential backoff (2 min → 4 min → 8 min → 16 min) plus random jitter so retries don't pile up.

---

## Adding a new bot

1. Go to `/bots` in the dashboard → **New Bot**
2. Set channel type (Telegram), trigger mode (`mention` recommended for groups), thresholds
3. Add a **Bot Channel Config** with the `tg_bot_token` (from @BotFather)
4. Create or link a **Knowledge Base** and an **Experience Store**
5. Add **Chat Assignments** to map your Telegram groups → this bot + API version
6. Click **Activate** — this calls `PATCH /api/bots/:id/status` which registers the Telegram webhook automatically

---

## API endpoints (webhook server)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/webhook/telegram/:botId` | Telegram webhook receiver |
| `POST` | `/webhook/whatsapp/:botId` | WhatsApp webhook receiver |
| `PATCH` | `/api/bots/:id/status` | Activate / deactivate bot (registers Telegram webhook) |
| `POST` | `/api/admin/crawl` | Enqueue crawl job `{ knowledgeBaseId, versions[] }` |
| `POST` | `/api/admin/ingest` | Enqueue ingestion job `{ documentId, knowledgeBaseId }` |

---

## Database tables (key ones)

| Table | Purpose |
|-------|---------|
| `bots` | Bot instances — model config, thresholds, status |
| `bot_channel_configs` | Telegram token, WhatsApp credentials, greeting messages |
| `bot_chat_assignments` | Maps group chat IDs → bot + API version |
| `knowledge_bases` | Named doc collections — chunk size, top_k, threshold |
| `documents` | Individual docs — status, error message, chunk count |
| `document_chunks` | Text chunks + 1024-dim embeddings (pgvector) |
| `experience_stores` | Named Q&A collections |
| `experience_entries` | Distilled Q&A — question/answer summaries, tags, embedding |
| `conversation_logs` | Every message — question, answer, sources, tokens, latency |
| `settings` | Global platform config (API keys stored here as fallback) |

Vector search is done via RPC functions `match_document_chunks()` and `match_experience_entries()` defined in `packages/shared/src/db/migrations/002_vector_search_functions.sql`.

---

## Common operations

**Check what the bot retrieved for a question:**
Look at the conversation log in `/logs` — it shows which chunks were used, similarity scores, and sources.

**Bot not responding:**
1. Check `/logs` for recent entries — if missing, the webhook isn't being called
2. Check Railway logs for `[telegram] parseTelegramUpdate returned null` — bot may not be @mentioned
3. Check `[telegram] Skipping non-API message` — intent classifier filtered it
4. Verify `bot_chat_assignments` has an entry for the group's chatId

**Documents stuck in `pending`:**
- Check Railway logs for `[ingestion]` errors
- `REDIS_URL` must be set for workers to start
- Use the retry button in the dashboard or **Re-index All**

**Voyage 429 errors:**
- Free tier limit is 3 RPM. Jobs retry automatically with exponential backoff.
- To resolve permanently, add a payment method at dashboard.voyageai.com — rate limits increase immediately.

**Bot responding to non-questions:**
- The intent classifier (`classifyIntent()` in `routes/telegram.ts`) uses Haiku to filter
- Check logs for `[telegram] Skipping non-API message` — confirm it's being caught
- If a message slips through, the system prompt instructs Claude to stay on-topic

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node 20, TypeScript |
| Webhook server | Express.js |
| Admin dashboard | Next.js 15, React 19, TailwindCSS 4 |
| UI components | shadcn/ui, Lucide icons |
| Database | Supabase (PostgreSQL + pgvector) |
| Job queue | BullMQ + Redis |
| LLM | Anthropic Claude (Haiku by default, configurable) |
| Embeddings | Voyage AI voyage-3 (1024 dimensions) |
| Web search | Tavily |
| Document parsing | cheerio, pdf-parse, mammoth, xlsx |
| Deployment | Railway (production), Render (free testing) |
| Package manager | pnpm 9 (monorepo with pnpm workspaces) |
