-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────
-- KNOWLEDGE BASES
-- ─────────────────────────────────────────────────

CREATE TABLE knowledge_bases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT,
  embedding_model   TEXT NOT NULL DEFAULT 'voyage-3',
  chunk_size        INT DEFAULT 512,
  chunk_overlap     INT DEFAULT 50,
  top_k             INT DEFAULT 5,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id   UUID REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  file_type           TEXT NOT NULL,  -- pdf | md | txt | html | json | url
  file_url            TEXT,
  source_url          TEXT,
  raw_content         TEXT,
  api_version         TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  chunk_count         INT DEFAULT 0,
  error_message       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE document_chunks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         UUID REFERENCES documents(id) ON DELETE CASCADE,
  knowledge_base_id   UUID REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  content             TEXT NOT NULL,
  metadata            JSONB,
  embedding           VECTOR(1024),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast vector similarity search
CREATE INDEX ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─────────────────────────────────────────────────
-- EXPERIENCE STORES
-- ─────────────────────────────────────────────────

CREATE TABLE experience_stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  is_shared   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────
-- BOTS
-- ─────────────────────────────────────────────────

CREATE TABLE bots (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,
  description               TEXT,
  status                    TEXT NOT NULL DEFAULT 'inactive',
  channel_type              TEXT NOT NULL,
  knowledge_base_id         UUID REFERENCES knowledge_bases(id),
  experience_store_id       UUID REFERENCES experience_stores(id),
  system_prompt             TEXT,
  trigger_mode              TEXT NOT NULL DEFAULT 'mention',
  trigger_keyword           TEXT,
  group_context_messages    INT DEFAULT 5,
  doc_retrieval_threshold   FLOAT DEFAULT 0.60,
  exp_retrieval_threshold   FLOAT DEFAULT 0.85,
  web_search_fallback       BOOLEAN DEFAULT TRUE,
  llm_model                 TEXT DEFAULT 'claude-haiku-4-5-20251001',
  max_response_tokens       INT DEFAULT 1024,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bot_channel_configs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id                UUID REFERENCES bots(id) ON DELETE CASCADE UNIQUE,
  channel_type          TEXT NOT NULL,

  -- WhatsApp
  wa_phone_number_id    TEXT,
  wa_access_token       TEXT,
  wa_verify_token       TEXT,

  -- Telegram
  tg_bot_token          TEXT,
  tg_bot_username       TEXT,
  tg_webhook_registered BOOLEAN DEFAULT FALSE,

  -- Greeting messages
  greeting_message_wa   TEXT,
  greeting_message_tg   TEXT,
  send_greeting         BOOLEAN DEFAULT TRUE,

  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────
-- GROUP / CHAT ASSIGNMENTS
-- ─────────────────────────────────────────────────

CREATE TABLE bot_chat_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id        UUID REFERENCES bots(id) ON DELETE CASCADE,
  channel_type  TEXT NOT NULL,
  chat_id       TEXT NOT NULL,
  chat_label    TEXT,
  api_version   TEXT NOT NULL,
  assigned_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (channel_type, chat_id)
);

-- ─────────────────────────────────────────────────
-- EXPERIENCE STORE ACCESS + ENTRIES
-- ─────────────────────────────────────────────────

CREATE TABLE experience_store_access (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id                UUID REFERENCES bots(id) ON DELETE CASCADE,
  experience_store_id   UUID REFERENCES experience_stores(id) ON DELETE CASCADE,
  access_type           TEXT NOT NULL DEFAULT 'read',
  granted_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bot_id, experience_store_id)
);

-- conversation_logs must exist before experience_entries references it
CREATE TABLE conversation_logs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id                    UUID REFERENCES bots(id),
  channel_type              TEXT NOT NULL,
  chat_id                   TEXT,
  message_id                TEXT,
  sender_ref                TEXT,
  question                  TEXT NOT NULL,
  answer                    TEXT NOT NULL,
  doc_chunks_used           JSONB,
  experience_entries_used   JSONB,
  web_search_used           BOOLEAN DEFAULT FALSE,
  web_search_queries        TEXT[],
  sources_used              TEXT[],
  tokens_input              INT,
  tokens_output             INT,
  latency_ms                INT,
  experience_generated      BOOLEAN DEFAULT FALSE,
  experience_entry_id       UUID,  -- FK added after experience_entries is created
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE experience_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_store_id   UUID REFERENCES experience_stores(id) ON DELETE CASCADE,
  source_log_id         UUID REFERENCES conversation_logs(id),
  question_summary      TEXT NOT NULL,
  answer_summary        TEXT NOT NULL,
  tags                  TEXT[],
  quality_score         FLOAT,
  use_count             INT DEFAULT 0,
  embedding             VECTOR(1024),
  status                TEXT DEFAULT 'active',
  source_type           TEXT DEFAULT 'auto',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Index for experience entry vector search
CREATE INDEX ON experience_entries
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Add FK from conversation_logs to experience_entries now that the table exists
ALTER TABLE conversation_logs
  ADD CONSTRAINT fk_experience_entry
  FOREIGN KEY (experience_entry_id) REFERENCES experience_entries(id);

-- ─────────────────────────────────────────────────
-- SETTINGS
-- ─────────────────────────────────────────────────

CREATE TABLE settings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anthropic_api_key           TEXT,
  voyage_api_key              TEXT,
  brave_search_api_key        TEXT,
  default_llm_model           TEXT DEFAULT 'claude-haiku-4-5-20251001',
  experience_auto_generation  BOOLEAN DEFAULT TRUE,
  experience_dedup_threshold  FLOAT DEFAULT 0.92,
  -- WhatsApp platform-level defaults
  wa_phone_number_id          TEXT,
  wa_access_token             TEXT,
  wa_verify_token             TEXT,
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed one settings row
INSERT INTO settings (id) VALUES (gen_random_uuid());

-- ─────────────────────────────────────────────────
-- UNRECOGNISED CHATS (discovery panel)
-- ─────────────────────────────────────────────────

CREATE TABLE unrecognised_chats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type  TEXT NOT NULL,
  chat_id       TEXT NOT NULL,
  received_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Keep only the last 20 per channel+chat (trigger)
CREATE OR REPLACE FUNCTION trim_unrecognised_chats()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM unrecognised_chats
  WHERE id IN (
    SELECT id FROM unrecognised_chats
    ORDER BY received_at DESC
    OFFSET 20
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trim_unrecognised_chats_trigger
AFTER INSERT ON unrecognised_chats
FOR EACH ROW EXECUTE FUNCTION trim_unrecognised_chats();

-- ─────────────────────────────────────────────────
-- UPDATED_AT TRIGGER (reusable)
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_bots
  BEFORE UPDATE ON bots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_bot_channel_configs
  BEFORE UPDATE ON bot_channel_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_knowledge_bases
  BEFORE UPDATE ON knowledge_bases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_documents
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_experience_stores
  BEFORE UPDATE ON experience_stores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_experience_entries
  BEFORE UPDATE ON experience_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
