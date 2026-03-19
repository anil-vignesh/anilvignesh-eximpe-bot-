# EximPe Bot — Product Requirements & Technical Specification

**Version:** 1.2
**Date:** 2026-03-19
**Status:** Active — WhatsApp integration next

---

## 1. Product Overview

### 1.1 Problem Statement

EximPe is an RBI-licensed cross-border payment aggregator. International merchants and PSPs (Payment Service Providers) integrating against the EximPe API frequently ask repetitive technical questions — about endpoints, parameters, webhook payloads, error codes, and versioning. The existing support process is manual, slow, and doesn't scale as the number of integrating merchants grows.

### 1.2 Solution

An AI-powered support bot that:
- Lives in the channels merchants already use (Telegram groups, WhatsApp groups)
- Answers API integration questions in real time, with responses grounded in official documentation
- Classifies incoming messages — non-API questions get a polite deflection, not silence
- Gets smarter over time by retaining resolved Q&A pairs as an experience store
- Falls back to live web search when documentation doesn't have the answer
- Is fully configurable via a web dashboard

### 1.3 Core Principles

- **Version-aware:** EximPe has multiple API versions in production. The bot always answers for the version the merchant is on.
- **Grounded, not hallucinated:** Every answer is backed by docs, past experience, or web search — never fabricated.
- **Self-improving:** High-quality Q&A pairs are automatically distilled into an experience store to improve future responses.
- **Multi-channel:** Telegram (live), WhatsApp (next).

---

## 2. Target Users

| User | Context | Need |
|------|---------|------|
| PSP developer | Integrating EximPe API | Quick, accurate answers to API questions without waiting for support |
| EximPe support team | Monitoring bot conversations | Visibility into what questions are being asked, review/curate experience entries |
| EximPe admin | Managing the platform | Configure bots, upload docs, manage knowledge bases, monitor costs |

---

## 3. System Architecture

### 3.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| Webhook Server | Express.js + TypeScript, Node 20 |
| Web Dashboard | Next.js 15, React 19, TailwindCSS 4, shadcn/ui |
| Database | Supabase PostgreSQL + pgvector |
| Message Queue | BullMQ + Redis |
| LLM | Anthropic Claude (Haiku by default, configurable) |
| Embeddings | Voyage AI (voyage-3, 1024-dim) |
| Web Search | Tavily API |
| Deployment | Railway (Nixpacks, auto-deploy from git) |
| Package Manager | pnpm 9 (monorepo) |

### 3.2 Monorepo Structure

```
eximpe-bot/
├── apps/
│   ├── webhook/          # Express server — handles messages, queues, API
│   └── web/              # Next.js dashboard
├── packages/
│   └── shared/           # DB client, TypeScript types, migrations
├── scripts/              # Admin utilities
├── nixpacks.toml         # Railway build config
└── railway.json          # Railway deployment config
```

### 3.3 Message Processing Pipeline

```
Incoming message (Telegram / WhatsApp)
        │
        ▼
[1] Parse & Normalise          Adapter converts channel payload → IncomingMessage
                               Bot-originated messages filtered out (is_bot check)
        │
        ▼
[2] Resolve Bot                Load bot record + channel config from DB
        │
        ▼
[3] Intent Classification      Haiku call — non-API messages get a deflection reply
                               On error: allow through (fail open)
        │
        ▼
[4] Query Rewrite              Haiku call — expand terminology for better vector search
        │
        ▼
[5] Retrieve (parallel)
    ├─ Doc retrieval            Embed question → vector search doc_chunks (version-matched)
    └─ Experience retrieval     Embed question → vector search experience_entries
        │
        ▼
[6] Confidence check           doc_score < 0.5 AND no experience → enable web search
        │
        ▼
[7] Claude (agentic loop)      System prompt + doc context + experience + group history
    └─ tool_use: web_search    → Tavily → append result → loop (max 3 rounds)
        │
        ▼
[8] Send reply                 Adapter sends OutgoingMessage (MarkdownV2, fallback plain)
        │
        ▼
[9] Log & Learn (async)
    ├─ Save conversation_logs  Includes model used, token counts, sources, latency
    └─ writeExperience          Distil Q&A → embed → dedup → insert experience_entry
```

---

## 4. Database Schema

### 4.1 Tables

#### `knowledge_bases`
Stores metadata for a collection of documents.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | UUID PK | gen_random_uuid() | |
| name | TEXT NOT NULL | | Display name |
| description | TEXT | | |
| embedding_model | TEXT | 'voyage-3' | Model used for embeddings |
| chunk_size | INT | 1200 | Characters per chunk |
| chunk_overlap | INT | 50 | Overlap between chunks |
| top_k | INT | 8 | Max chunks returned per query |
| doc_retrieval_threshold | FLOAT | 0.55 | Min cosine similarity for doc chunks |
| created_at, updated_at | TIMESTAMPTZ | | |

#### `documents`
Individual documents (URL, PDF, markdown, etc.) within a knowledge base.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| knowledge_base_id | UUID FK → knowledge_bases | |
| name | TEXT | Display name (e.g. "[v1] order / create") |
| file_type | TEXT | 'pdf' \| 'docx' \| 'xlsx' \| 'csv' \| 'txt' \| 'md' \| 'json' \| 'url' |
| file_url | TEXT | Supabase Storage URL |
| source_url | TEXT | Original source URL |
| raw_content | TEXT | Cached raw text |
| api_version | TEXT | e.g. '1', '2' |
| status | TEXT | 'pending' \| 'processing' \| 'indexed' \| 'error' |
| chunk_count | INT | Number of indexed chunks |
| error_message | TEXT | Last error if status='error' |

#### `document_chunks`
Chunked and embedded segments of documents. Core RAG data.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| document_id | UUID FK → documents CASCADE | |
| knowledge_base_id | UUID FK → knowledge_bases CASCADE | |
| content | TEXT | Raw chunk text |
| metadata | JSONB | { doc_name, section?, api_version, source_url?, page? } |
| embedding | VECTOR(1024) | Voyage AI embedding (IVFflat cosine index) |

#### `experience_stores`
Named collections of resolved Q&A pairs.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| name | TEXT | |
| description | TEXT | |
| is_shared | BOOLEAN | If true, other bots can be granted read access |

#### `experience_entries`
Individual distilled Q&A pairs.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| experience_store_id | UUID FK | |
| source_log_id | UUID FK → conversation_logs | Original conversation |
| question_summary | TEXT | Distilled question (Claude-generated) |
| answer_summary | TEXT | Distilled answer (Claude-generated) |
| tags | TEXT[] | Topic tags |
| quality_score | FLOAT | 0.0–1.0, Claude-assessed |
| use_count | INT | Times retrieved |
| embedding | VECTOR(1024) | Embedding of question_summary (IVFflat cosine) |
| status | TEXT | 'active' \| 'archived' \| 'flagged' |
| source_type | TEXT | 'auto' \| 'manual' |

#### `bots`
Core bot configuration record.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | UUID PK | | |
| name | TEXT | | Display name |
| status | TEXT | 'inactive' | 'inactive' \| 'active' \| 'error' |
| channel_type | TEXT | | 'telegram' \| 'whatsapp' |
| knowledge_base_id | UUID FK | | Linked KB |
| experience_store_id | UUID FK | | Linked experience store |
| system_prompt | TEXT | null | Override default prompt |
| trigger_mode | TEXT | 'mention' | 'mention' \| 'keyword' |
| trigger_keyword | TEXT | null | For keyword mode |
| group_context_messages | INT | 5 | Prior messages injected |
| doc_retrieval_threshold | FLOAT | 0.60 | Min similarity for doc chunks |
| exp_retrieval_threshold | FLOAT | 0.85 | Min similarity for experience |
| web_search_fallback | BOOLEAN | true | Enable Tavily fallback |
| llm_model | TEXT | 'claude-haiku-4-5-20251001' | |
| max_response_tokens | INT | 1024 | |

#### `bot_channel_configs`
Per-channel credentials and greeting config. One row per bot.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| bot_id | UUID FK UNIQUE | |
| channel_type | TEXT | |
| wa_phone_number_id | TEXT | WhatsApp Business API |
| wa_access_token | TEXT | |
| wa_verify_token | TEXT | |
| tg_bot_token | TEXT | Telegram Bot API token |
| tg_bot_username | TEXT | e.g. @EximPeSupportBot |
| tg_webhook_registered | BOOLEAN | |
| greeting_message_wa | TEXT | Custom WhatsApp greeting |
| greeting_message_tg | TEXT | Custom Telegram greeting |
| send_greeting | BOOLEAN | Whether to greet on join |

#### `bot_chat_assignments`
Maps a Telegram/WhatsApp group to a bot, including the API version that group uses.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| bot_id | UUID FK | |
| channel_type | TEXT | |
| chat_id | TEXT | Group/chat ID from channel |
| chat_label | TEXT | Human-readable label |
| api_version | TEXT | e.g. '1.0.0' |
| UNIQUE | (channel_type, chat_id) | One bot per chat |

#### `conversation_logs`
Every message handled by the bot.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| bot_id | UUID FK | |
| channel_type | TEXT | |
| chat_id | TEXT | |
| message_id | TEXT | Channel-native message ID |
| sender_ref | TEXT | Masked phone or @username |
| question | TEXT | Original question |
| answer | TEXT | Bot's answer |
| doc_chunks_used | JSONB | [{ id, similarity }] |
| experience_entries_used | JSONB | [{ id, similarity }] |
| web_search_used | BOOLEAN | |
| web_search_queries | TEXT[] | |
| sources_used | TEXT[] | ['docs', 'experience', 'web', 'fallback'] |
| model | TEXT | Claude model used (e.g. 'claude-haiku-4-5-20251001') |
| tokens_input | INT | |
| tokens_output | INT | |
| latency_ms | INT | |
| experience_generated | BOOLEAN | |
| experience_entry_id | UUID FK | Back-linked entry if generated |

#### `settings`
Global platform defaults (single-row config).

| Column | Description |
|--------|-------------|
| anthropic_api_key | Fallback if not in env |
| voyage_api_key | |
| brave_search_api_key | Reserved for Brave Search |
| default_llm_model | |
| experience_auto_generation | Global toggle |
| experience_dedup_threshold | Default 0.92 |
| wa_phone_number_id, wa_access_token, wa_verify_token | Default WA credentials |

#### `experience_store_access`
Grants a bot read access to a shared experience store (many-to-many).

#### `unrecognised_chats`
Logs messages from chats not yet assigned to any bot. Surfaced in the Chat Assignments screen so admins can assign them quickly. Auto-cleaned when an assignment is created.

### 4.2 Database Migrations

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Full schema: all tables, indexes, FK constraints |
| `002_vector_search_functions.sql` | `match_document_chunks()` and `match_experience_entries()` RPC functions |
| `003_add_model_to_logs.sql` | Adds `model` column to `conversation_logs` for per-model cost tracking |

### 4.3 Database Functions

**`match_document_chunks(kb_id, embedding, match_count, threshold, api_version)`**
Version-aware cosine similarity search over document_chunks. Prioritises version-matched chunks; fills remaining slots with unversioned chunks. Returns content + metadata + similarity score.

**`match_experience_entries(store_ids[], embedding, match_count, threshold)`**
Cosine similarity search over experience_entries across multiple stores. Filters status='active'. Returns entry + similarity.

---

## 5. Feature Specifications

### 5.1 Telegram Bot — ✅ Done

**Trigger modes:**
- `mention` (default): Bot only responds when @mentioned in a group. Always responds in DMs.
- `keyword`: Bot responds when message contains the configured trigger keyword.

**Intent classification:**
- Every message passes through a Haiku classifier before the pipeline.
- Non-API messages (greetings, off-topic) receive: *"I can only help with EximPe API integration questions…"*
- On classifier error: fail open (allow through).
- Bot-originated messages (is_bot=true) are filtered at parse time.

**Greeting:**
- Bot sends a greeting message when added to a group.
- Greeting template: customisable per bot, includes bot name and API version.
- Controlled by `send_greeting` flag in bot_channel_configs.

**Reply format:**
- First-person voice ("we support…", "our API…") — never third-person references to EximPe.
- Markdown formatting (code blocks, bold, etc.) using Telegram's MarkdownV2 spec.
- Graceful fallback to plain text if Telegram parsing fails.
- Always replies to the original message (quoted reply).
- No preamble or meta-commentary ("Based on our docs…" is forbidden).

**Webhook:**
- Registered via `POST /api/bots/:id/status` with `{ status: "active" }`.
- URL: `{WEBHOOK_BASE_URL}/webhook/telegram/{botId}`.
- Deregistered on `{ status: "inactive" }`.

**Group context:**
- Last N conversation_logs entries for the chat are injected into the prompt.
- `group_context_messages` is configurable per bot (default: 5).

### 5.2 WhatsApp Bot — 📋 Next

Same pipeline as Telegram. Adapter and route are stub placeholders.

Differences to implement:
- Meta Cloud API (not Telegram Bot API)
- GET webhook verification challenge (`hub.challenge` handshake)
- Parse Meta's nested payload: `entry[].changes[].value.messages[]`
- Filter status update callbacks (delivery/read receipts) — Meta POSTs these to the same endpoint
- Send reply via `POST /{phone-number-id}/messages` with `type: "text"`
- Mark message as read after processing
- Phone number masking for sender PII

No changes needed to the RAG pipeline, intent classifier, or logging.

### 5.3 Knowledge Base & Document Ingestion — ✅ Done

**Supported source types:**
| Type | Ingestion method |
|------|-----------------|
| URL | HTTP fetch + Cheerio HTML stripping → Markdown |
| PDF | pdf-parse |
| DOCX | mammoth |
| XLSX / XLS | xlsx (sheet_to_csv) |
| CSV / TXT | Raw text |
| Markdown | Raw text |
| JSON | JSON.stringify with formatting |

**Ingestion steps:**
1. Fetch/extract raw text from source.
2. Auto-detect API version from URL pattern (`/v1/`, `/v2/`, etc.).
3. Strip Mintlify boilerplate from docs.eximpe.com pages.
4. Chunk text by section headings (`chunkBySection`); oversized sections split by paragraph.
5. Batch-embed via Voyage AI (128 texts per API call, 21s gap between calls).
6. Delete existing chunks for the document (re-index support).
7. Insert chunks in batches of 50.
8. Update document status → 'indexed', record chunk_count.

**Rate limit handling:**
- In-process `_blockedUntilMs` guard: 21s minimum gap between Voyage calls.
- After a 429: 60s cooldown (full Voyage rolling window).
- BullMQ worker: 1 job/min limiter, concurrency 1.
- Failed jobs: exponential backoff (2 min → 4 min → 8 min → 16 min) + up to 30s random jitter.
- 404/410 URLs: throw `UnrecoverableError` — never retry.

**Crawl worker:**
Discovers docs.eximpe.com pages for specified API versions, creates document records, enqueues individual ingestion jobs.

### 5.4 Retrieval (RAG) — ✅ Done

**Document retrieval:**
1. Embed question via Voyage AI.
2. Run `match_document_chunks` RPC with major-version filter.
3. Fill remaining `top_k` slots with unversioned chunks.
4. Min similarity threshold: `doc_retrieval_threshold` (default 0.60).

**Experience retrieval:**
1. Embed question.
2. Collect accessible store IDs: own store + shared stores with read access.
3. Run `match_experience_entries` RPC across all store IDs.
4. Min similarity threshold: `exp_retrieval_threshold` (default 0.85).

**Web search fallback:**
- Triggers only when: doc_score < 0.5 AND no experience entries AND `web_search_fallback=true`.
- Uses Tavily API (basic search depth, max 5 results).
- Exposed to Claude as a `web_search` tool in the agentic loop (max 3 rounds).

### 5.5 Experience Store — ✅ Done

**Auto-generation (async, post-response):**
1. After every answered message, `writeExperience` runs asynchronously.
2. Claude Haiku distils the Q&A into: `question_summary`, `answer_summary`, `tags[]`, `quality_score`.
3. Embed the question_summary.
4. Dedup check: if any existing entry has similarity ≥ 0.92, skip insert.
5. Insert experience_entry with source_log_id backlink.
6. Update conversation_logs.experience_entry_id.

**Dashboard — curation:**
- **Tabs:** Filter by status — Active / Archived / Flagged. Tab change forces full component remount (React `key` prop).
- **Archive / Flag / Unarchive:** One-click status changes. Archived entries can be restored to Active.
- **Edit:** Question summary, answer summary, and tags are editable inline.
- **Delete:** Nullifies `conversation_logs.experience_entry_id` FK before deleting to avoid constraint violation.

### 5.6 Conversation Logs — ✅ Done

Every handled message is logged with:
- Full question and answer text
- Which doc chunks and experience entries were used (with similarity scores)
- Whether web search was used, and what queries
- Claude model used (stored in `model` column — migration 003)
- Token counts (input + output) — used for cost tracking
- Latency in ms
- Whether an experience entry was auto-generated

### 5.7 Cost Tracker — ✅ Done

`/costs` in the dashboard. Monthly breakdown:
- **Claude API:** Exact cost from token counts in conversation_logs, using per-model pricing.
- **Tavily:** Count of searches logged; first 1,000/month free, $0.01 each after.
- **Voyage AI:** Estimated from total document chunk count × 300 tokens × $0.06/M.
- **Month navigator:** Browse any past month.
- **External links:** One-click to Anthropic / Voyage / Tavily dashboards.

> Note: Intent classifier, query rewriter, and experience distil calls (all Haiku, ~100 tokens each) are not yet individually tracked. Actual Claude spend will be slightly higher.

### 5.8 Web Dashboard — ✅ Done

Next.js 15 admin dashboard deployed as a separate service.

| Screen | Status | Notes |
|--------|--------|-------|
| Settings | ✅ | Global API keys, model defaults, experience toggles |
| Bots | ✅ | Create/edit/activate bots, channel config |
| Knowledge Base | ✅ | Upload docs (URL/file/paste), crawl, search/filter, per-doc retry, Re-index All |
| Experience Store | ✅ | Tabs, archive/unarchive, edit, delete, quality score, use count |
| Chat Assignments | ✅ | Map groups to bots + API versions; unrecognised chats surfaced for quick assignment |
| Conversation Logs | ✅ | Full log with per-conversation detail view |
| Costs | ✅ | Monthly cost breakdown with daily table and external links |

### 5.9 Bot Management API — ✅ Done

`PATCH /api/bots/:id/status`
- Activates or deactivates a bot.
- For Telegram: triggers `setWebhook` or `deleteWebhook` automatically.
- Returns `{ status, webhook_registered }`.
- Returns 207 if status updated but webhook registration failed.

`POST /api/admin/crawl`
- Enqueues a crawl job for a given knowledge base + API versions.
- Body: `{ knowledgeBaseId: string, versions: string[] }`.

`POST /api/admin/ingest`
- Enqueues an ingestion job for a specific document.
- Body: `{ documentId: string, knowledgeBaseId: string }`.

---

## 6. Implementation Status

### Done ✅

| Component | Notes |
|-----------|-------|
| Monorepo structure (pnpm workspaces) | |
| Shared package (types, DB client, migrations) | |
| PostgreSQL schema with pgvector | |
| Vector search RPC functions | |
| Express webhook server | |
| Telegram adapter (parse, send, greet) | |
| Bot resolution & routing | |
| Intent classifier (Haiku, deflection reply) | Non-API messages get a polite response |
| Query rewriter (Haiku) | |
| RAG pipeline (docs + experience + web search) | |
| Claude agentic loop with tool use | |
| Voyage AI embeddings + rate limiter | `_blockedUntilMs` guard, 60s 429 cooldown |
| Tavily web search fallback | |
| Experience writer (auto-distil + dedup) | |
| Conversation logging (with model column) | Migration 003 adds model field |
| Group context injection | |
| Document ingestion worker | URL, PDF, DOCX, XLSX, CSV, TXT, MD, JSON |
| Crawl worker (docs.eximpe.com) | |
| BullMQ queues + retry backoff + jitter | 404/410 → UnrecoverableError |
| Bot status API (activate/deactivate + webhook reg) | |
| Admin ingest/crawl trigger APIs | |
| Railway deployment | Nixpacks, Node 20, pnpm |
| Next.js dashboard (all screens) | Settings, Bots, KB, Experience Store, Logs, Chat Assignments, Costs |
| Cost tracker | Claude + Tavily exact, Voyage estimated |
| Unarchive in experience store | |
| Per-document retry in KB dashboard | |
| Unrecognised chats surfaced in Chat Assignments | |

### Next 📋

| Component | Priority | Notes |
|-----------|----------|-------|
| WhatsApp adapter (Meta Cloud API) | High | Route stub + adapter stub exist; needs implementation |
| WhatsApp webhook verification (GET challenge) | High | Part of WhatsApp work |
| WhatsApp bot_chat_assignment flow | High | Same as Telegram once adapter is done |
| Individual Haiku call cost tracking (classify/rewrite/distil) | Low | Currently not counted in cost tracker |

---

## 7. Deployment

### 7.1 Infrastructure

| Service | Platform | Notes |
|---------|----------|-------|
| Webhook server | Railway | Auto-deploy on push to main |
| Redis | Railway | Shared with webhook service |
| Supabase | Supabase cloud | |
| Dashboard | Railway / Vercel | Separate service |

### 7.2 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| SUPABASE_URL | ✅ | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | ✅ | Service role key (bypasses RLS) |
| SUPABASE_ANON_KEY | ✅ | Anon key |
| ANTHROPIC_API_KEY | ✅ | Claude API key |
| VOYAGE_API_KEY | ✅ | Embeddings |
| TAVILY_API_KEY | ✅ | Web search |
| REDIS_URL | ✅ | BullMQ job queue |
| WEBHOOK_BASE_URL | ✅ | Public HTTPS URL for Telegram webhook |
| NODE_ENV | ✅ | 'production' |
| VOYAGE_BATCH_DELAY_MS | optional | Voyage inter-call delay in ms (default: 21000) |

### 7.3 Build & Start

```toml
# nixpacks.toml
[phases.setup]
nixPkgs = ["nodejs_20", "pnpm-9_x"]

[phases.install]
cmds = ["pnpm install --frozen-lockfile"]

[phases.build]
cmds = ["pnpm build"]  # builds shared first, then webhook

[start]
cmd = "node apps/webhook/dist/index.js"
```

### 7.4 Current Production Records

| Resource | ID |
|----------|----|
| Bot | `32152027-a306-42fd-b877-31cf7d849fa6` |
| Bot channel config | `45143eea-db3b-4ef2-b35b-21abddba7c0d` |
| Knowledge base | `88b07b02-4e34-46ac-85f8-479e66fe7ace` |
| Experience store | `4f8679cd-2df2-43b6-a471-e28786ac69ea` |
| Railway webhook URL | `https://eximpe-bot-webhook-production.up.railway.app` |

---

## 8. Known Constraints & Decisions

| Decision | Rationale |
|----------|-----------|
| Service role key for all DB access | Simplifies server-side access; no RLS complexity. |
| Voyage AI over OpenAI embeddings | voyage-3 has better retrieval quality for technical/code-heavy content. |
| Claude Haiku as default LLM | Cost efficiency for high-volume support queries. Opus/Sonnet available per-bot if needed. |
| BullMQ + Railway Redis over serverless | Ingestion jobs are long-running. Serverless timeouts would break them. |
| Nixpacks over Railpack | Railpack's npm fallback broke pnpm workspace installs. |
| Async experience writing | Writing experience entries adds ~2s latency. Running async keeps response times fast. |
| Dedup threshold at 0.92 | High threshold prevents near-duplicate entries from polluting the experience store. |
| No multi-tenancy in V1 | Single EximPe workspace. Can be layered on later if needed. |
| Intent classifier fails open | Better to answer a non-API question than to silently drop an API question due to a transient error. |
| 60s Voyage 429 cooldown | Voyage's rate limit is a rolling 60s window. A 21s gap is not enough to recover after hitting the limit. |
| UnrecoverableError for 404/410 | Dead URLs should not consume retry budget. Mark failed immediately and surface in dashboard. |
