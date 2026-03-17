# EximPe Bot — Product Requirements & Technical Specification

**Version:** 1.0
**Date:** 2026-03-18
**Status:** In Progress

---

## 1. Product Overview

### 1.1 Problem Statement

EximPe is an RBI-licensed cross-border payment aggregator. International merchants and PSPs (Payment Service Providers) integrating against the EximPe API frequently ask repetitive technical questions — about endpoints, parameters, webhook payloads, error codes, and versioning. The existing support process is manual, slow, and doesn't scale as the number of integrating merchants grows.

### 1.2 Solution

An AI-powered support bot that:
- Lives in the channels merchants already use (Telegram groups, WhatsApp groups)
- Answers API integration questions in real time, with responses grounded in official documentation
- Gets smarter over time by retaining resolved Q&A pairs as an experience store
- Falls back to live web search when documentation doesn't have the answer
- Is fully configurable via a web dashboard (in progress)

### 1.3 Core Principles

- **Version-aware:** EximPe has multiple API versions in production. The bot always answers for the version the merchant is on.
- **Grounded, not hallucinated:** Every answer is backed by docs, past experience, or web search — never fabricated.
- **Self-improving:** High-quality Q&A pairs are automatically distilled into an experience store to improve future responses.
- **Multi-channel:** Built for Telegram first, WhatsApp second.

---

## 2. Target Users

| User | Context | Need |
|------|---------|------|
| PSP developer | Integrating EximPe API | Quick, accurate answers to API questions without waiting for support |
| EximPe support team | Monitoring bot conversations | Visibility into what questions are being asked, review/curate experience entries |
| EximPe admin | Managing the platform | Configure bots, upload docs, manage knowledge bases |

---

## 3. System Architecture

### 3.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| Webhook Server | Express.js + TypeScript, Node 20 |
| Web Dashboard | Next.js (planned) |
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
│   └── web/              # Next.js dashboard (planned)
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
        │
        ▼
[2] Resolve Bot                Load bot record + channel config from DB
        │
        ▼
[3] Retrieve (parallel)
    ├─ Doc retrieval            Embed question → vector search doc_chunks (version-matched)
    └─ Experience retrieval     Embed question → vector search experience_entries
        │
        ▼
[4] Confidence check           doc_score < 0.5 AND no experience → enable web search
        │
        ▼
[5] Claude (agentic loop)      System prompt + doc context + experience + group history
    └─ tool_use: web_search    → Tavily → append result → loop (max 3 rounds)
        │
        ▼
[6] Send reply                 Adapter sends OutgoingMessage (MarkdownV2, fallback plain)
        │
        ▼
[7] Log & Learn (async)
    ├─ Save conversation_logs
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
| chunk_size | INT | 512 | Characters per chunk |
| chunk_overlap | INT | 50 | Overlap between chunks |
| top_k | INT | 5 | Max chunks returned per query |
| created_at, updated_at | TIMESTAMPTZ | | |

#### `documents`
Individual documents (URL, PDF, markdown, etc.) within a knowledge base.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| knowledge_base_id | UUID FK → knowledge_bases | |
| name | TEXT | Display name (e.g. "[v1] order / create") |
| file_type | TEXT | 'pdf' \| 'md' \| 'txt' \| 'html' \| 'json' \| 'url' |
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

| Column | Description |
|--------|-------------|
| bot_id | |
| experience_store_id | |
| access_type | 'read' (default) |
| UNIQUE(bot_id, experience_store_id) | |

#### `unrecognised_chats`
Logs messages from chats not assigned to any bot. Auto-trimmed to last 20 records.

### 4.2 Database Functions

**`match_document_chunks(kb_id, embedding, match_count, threshold, api_version)`**
Version-aware cosine similarity search over document_chunks. Prioritises version-matched chunks; fills remaining slots with unversioned chunks. Returns content + metadata + similarity score.

**`match_experience_entries(store_ids[], embedding, match_count, threshold)`**
Cosine similarity search over experience_entries across multiple stores. Filters status='active'. Returns entry + similarity.

---

## 5. Feature Specifications

### 5.1 Telegram Bot — DONE

**Trigger modes:**
- `mention` (default): Bot only responds when @mentioned in a group. Always responds in DMs.
- `keyword`: Bot responds when message contains the configured trigger keyword.

**Greeting:**
- Bot sends a greeting message when added to a group.
- Greeting template: customisable per bot, includes bot name and API version.
- Controlled by `send_greeting` flag in bot_channel_configs.

**Reply format:**
- Markdown formatting (code blocks, bold, etc.) using Telegram's MarkdownV2 spec.
- Graceful fallback to plain text if parsing fails.
- Always replies to the original message (quoted reply).

**Webhook:**
- Registered via `POST /api/bots/:id/status` with `{ status: "active" }`.
- URL: `{WEBHOOK_BASE_URL}/webhook/telegram/{botId}`.
- Deregistered on `{ status: "inactive" }`.

**Group context:**
- Last N conversation_logs entries for the chat are injected into the prompt.
- `group_context_messages` is configurable per bot (default: 5).

### 5.2 WhatsApp Bot — PLANNED (V2)

Same pipeline as Telegram. Differences:
- Meta Cloud API (not Telegram Bot API).
- Verification handshake via GET /webhook/whatsapp/:botId.
- Phone number masking for sender PII.
- No @mention — keyword mode or all-messages mode.

### 5.3 Knowledge Base & Document Ingestion — DONE (backend)

**Supported source types:**
| Type | Ingestion method |
|------|-----------------|
| URL | HTTP fetch + Cheerio HTML stripping |
| PDF | pdf-parse v2 |
| Markdown | Raw text |
| JSON | JSON.stringify |
| Plain text | Raw |

**Ingestion steps:**
1. Fetch/extract raw text from source.
2. Auto-detect API version from URL pattern (`/v1/`, `/v2/`, etc.).
3. Chunk text using RecursiveCharacterTextSplitter (default: 512 chars, 50 overlap).
4. Extract section heading per chunk for metadata.
5. Batch-embed via Voyage AI (up to 128 texts per call).
6. Delete existing chunks for the document (re-index support).
7. Insert chunks in batches of 50.
8. Update document status → 'indexed', record chunk_count.

**Crawl worker:**
Hardcoded list of 55 docs.eximpe.com pages (13 integration guide + 42 API reference). Discovers pages, creates document records, enqueues individual ingestion jobs. Supports multiple API versions in one crawl run.

**Chunking config** (per knowledge base):
- `chunk_size`: default 512 chars
- `chunk_overlap`: default 50 chars
- `embedding_model`: default 'voyage-3'
- `top_k`: default 5 chunks per retrieval

### 5.4 Retrieval (RAG) — DONE

**Document retrieval:**
1. Embed question via Voyage AI.
2. Run `match_document_chunks` RPC with major-version filter (e.g. version='1' from api_version='1.0.0').
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
- Exposed to Claude as a `web_search` tool in the agentic loop.

### 5.5 Experience Store — DONE (backend)

**Auto-generation (async, post-response):**
1. After every answered message, `writeExperience` runs asynchronously.
2. Claude Haiku distils the Q&A into: `question_summary`, `answer_summary`, `tags[]`, `quality_score`.
3. Embed the question_summary.
4. Dedup check: if any existing entry has similarity ≥ 0.92, skip insert.
5. Insert experience_entry with source_log_id backlink.
6. Update conversation_logs.experience_entry_id.

**Manual entries:** Planned via dashboard UI.

**Shared stores:** Multiple bots can read from a shared experience store. Access controlled via `experience_store_access` table.

### 5.6 Conversation Logs — DONE (backend)

Every handled message is logged with:
- Full question and answer text
- Which doc chunks and experience entries were used (with similarity scores)
- Whether web search was used, and what queries
- Token counts (input + output)
- Latency in ms
- Whether an experience entry was auto-generated

### 5.7 Bot Management API — DONE (backend)

`PATCH /api/bots/:id/status`
- Activates or deactivates a bot.
- For Telegram: triggers `setWebhook` or `deleteWebhook` automatically.
- Returns `{ status, webhook_registered }`.
- Returns 207 if status updated but webhook registration failed.

`POST /api/admin/crawl`
- Enqueues a crawl job for a given knowledge base + API versions.
- Body: `{ knowledgeBaseId: string, versions: string[] }`.

---

## 6. Web Dashboard — PLANNED

### 6.1 Overview

A Next.js admin dashboard deployed as a separate Railway service (or Vercel). The dashboard is the primary way to configure and monitor the bot platform without touching the database directly.

### 6.2 Screens

#### Screen 1: Settings
Global platform configuration.
- Anthropic API key
- Voyage AI API key
- Default LLM model selector
- Experience auto-generation toggle
- Experience dedup threshold slider
- WhatsApp platform defaults (phone number ID, access token, verify token)

#### Screen 2: Bots
List and manage bot instances.

**Bot list view:**
- Name, channel, status badge (active/inactive/error), last activity

**Create/Edit Bot:**
- Name, description
- Channel type (Telegram / WhatsApp)
- Bot token (Telegram) or WA phone number ID
- Knowledge base selector
- Experience store selector
- Trigger mode (mention / keyword) + keyword field
- System prompt override
- LLM model selector
- Max response tokens
- Doc retrieval threshold
- Experience retrieval threshold
- Group context message count
- Web search fallback toggle
- Greeting message + toggle
- Activate / Deactivate toggle (calls PATCH /api/bots/:id/status)

#### Screen 3: Knowledge Base
Manage document collections.

**KB list view:**
- Name, document count, indexed count, last updated

**KB detail view:**
- KB settings (chunk size, overlap, top_k, embedding model)
- Document table: name, type, version, status, chunk count, last indexed
- Upload document (PDF, MD, TXT, JSON)
- Add URL
- Trigger re-index for document
- Trigger full crawl (for docs.eximpe.com)
- Delete document

#### Screen 4: Experience Store
Browse, curate, and manage Q&A experience entries.

**Store list view:**
- Name, entry count, shared toggle

**Store detail view:**
- Experience entry table: question summary, answer summary, tags, quality score, use count, status, source
- Filter by: status, source type, tag, quality score range
- Archive / flag / restore entry
- Edit entry (manual correction)
- Add manual entry

#### Screen 5: Chat Assignments
Map Telegram/WhatsApp groups to bots and API versions.

**Assignment table:**
- Channel type, chat ID, chat label, assigned bot, API version, assigned at

**Add assignment:**
- Channel type selector
- Chat ID input
- Chat label
- Bot selector
- API version input

#### Screen 6: Conversation Logs
View every message the bot has handled.

**Log table:**
- Timestamp, channel, chat, sender, question (truncated), answer (truncated), sources used, tokens, latency, experience generated

**Log detail view:**
- Full question + answer
- Doc chunks used (with similarity scores, source doc link)
- Experience entries used (with similarity scores)
- Web search queries + results summary
- Token counts + latency
- Promote to experience (manual override)

### 6.3 Auth

Simple single-user auth (admin only) via NextAuth.js with credentials provider. No multi-tenant for now.

---

## 7. Implementation Status

### Done ✅

| Component | Status |
|-----------|--------|
| Monorepo structure (pnpm workspaces) | ✅ |
| Shared package (types, DB client, migrations) | ✅ |
| PostgreSQL schema with pgvector | ✅ |
| Vector search RPC functions | ✅ |
| Express webhook server | ✅ |
| Telegram adapter (parse, send, greet) | ✅ |
| Bot resolution & routing | ✅ |
| RAG pipeline (docs + experience + web search) | ✅ |
| Claude agentic loop with tool use | ✅ |
| Voyage AI embeddings | ✅ |
| Tavily web search fallback | ✅ |
| Experience writer (auto-distil + dedup) | ✅ |
| Conversation logging | ✅ |
| Group context injection | ✅ |
| Document ingestion worker (URL, PDF, MD, TXT, JSON) | ✅ |
| Crawl worker (docs.eximpe.com, all 55 pages) | ✅ |
| BullMQ job queues with retry/backoff | ✅ |
| Bot status API (activate/deactivate + webhook reg) | ✅ |
| Admin crawl trigger API | ✅ |
| Railway deployment (Nixpacks, Node 20, pnpm) | ✅ |
| Bot record in Supabase (Telegram, active) | ✅ |
| Knowledge base + experience store linked to bot | ✅ |
| Telegram webhook registered | ✅ |

### In Progress 🔄

| Component | Status |
|-----------|--------|
| docs.eximpe.com crawl + ingestion | 🔄 Triggered, running on Railway |

### Planned 📋

| Component | Priority | Notes |
|-----------|----------|-------|
| Next.js dashboard scaffold | High | `apps/web`, NextAuth, layout |
| Settings screen | High | Global API keys, model defaults |
| Bots screen | High | Create/edit/activate bots |
| Knowledge Base screen | High | Upload docs, trigger crawl, view status |
| Experience Store screen | Medium | Browse, curate, edit entries |
| Chat Assignments screen | Medium | Map groups to bots + API versions |
| Conversation Logs screen | Medium | View all conversations |
| WhatsApp V2 adapter | Medium | Meta Cloud API |
| WhatsApp bot_chat_assignment flow | Medium | Routing by group |
| Shared experience stores UI | Low | Cross-bot experience sharing |
| Bot chat assignment for Telegram test group | Immediate | Needed for end-to-end test |

---

## 8. Deployment

### 8.1 Infrastructure

| Service | Platform | Notes |
|---------|----------|-------|
| Webhook server | Railway | Auto-deploy on push to main |
| Redis | Railway | Shared with webhook service |
| Supabase | Supabase cloud | `kiavuufafagomyoydseh.supabase.co` |
| Dashboard (planned) | Railway or Vercel | Separate service |

### 8.2 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| SUPABASE_URL | ✅ | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | ✅ | Service role key (bypasses RLS) |
| SUPABASE_ANON_KEY | ✅ | Anon key (for client-side use) |
| ANTHROPIC_API_KEY | ✅ | Claude API key |
| VOYAGE_API_KEY | ✅ | Embeddings |
| TAVILY_API_KEY | ✅ | Web search |
| REDIS_URL | ✅ | BullMQ job queue |
| WEBHOOK_BASE_URL | ✅ | Public HTTPS URL for Telegram webhook |
| NODE_ENV | ✅ | 'production' |

### 8.3 Build & Start

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

### 8.4 Current Production Records

| Resource | ID |
|----------|----|
| Bot | `32152027-a306-42fd-b877-31cf7d849fa6` |
| Bot channel config | `45143eea-db3b-4ef2-b35b-21abddba7c0d` |
| Knowledge base | `88b07b02-4e34-46ac-85f8-479e66fe7ace` |
| Experience store | `4f8679cd-2df2-43b6-a471-e28786ac69ea` |
| Railway URL | `https://eximpe-bot-webhook-production.up.railway.app` |

---

## 9. Immediate Next Steps

1. **Verify crawl completed** — Check that all 55 docs.eximpe.com pages are ingested into the knowledge base. Confirm `documents` table shows status='indexed' for all rows.

2. **Create a bot_chat_assignment** — The bot currently has no group assigned. Without an assignment, `api_version` defaults and the bot won't respond in groups. Assign the test Telegram group to the bot with `api_version: '1'`.

3. **End-to-end test** — Send an API question in the test Telegram group, verify a grounded answer comes back.

4. **Dashboard V1** — Scaffold Next.js `apps/web`, implement Settings + Bots screens as priority one so bot configuration no longer requires direct DB access.

5. **WhatsApp V2** — Implement the WhatsApp adapter and test against Meta Cloud API sandbox.

---

## 10. Known Constraints & Decisions

| Decision | Rationale |
|----------|-----------|
| Service role key for all DB access | Simplifies server-side access; no RLS complexity. Dashboard will use same key server-side. |
| Voyage AI over OpenAI embeddings | voyage-3 has better retrieval quality for technical/code-heavy content |
| Claude Haiku as default LLM | Cost efficiency for high-volume support queries. Opus/Sonnet available per-bot if needed. |
| BullMQ + Railway Redis over serverless | Ingestion jobs are long-running (fetch + embed + insert). Serverless timeouts would break them. |
| Nixpacks over Railpack | Railpack's npm fallback broke pnpm workspace installs. Nixpacks gives full control. |
| Async experience writing | Writing experience entries adds ~2s latency. Running async keeps response times fast. |
| Dedup threshold at 0.92 | High threshold prevents near-duplicate entries from polluting the experience store. |
| No multi-tenancy in V1 | Single EximPe workspace. Multi-tenancy can be layered on later if needed. |
