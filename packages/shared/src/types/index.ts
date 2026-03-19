// ── Channel Types ─────────────────────────────────────────────────────────────

export type ChannelType = 'whatsapp' | 'telegram';
export type BotStatus = 'inactive' | 'active' | 'error';
export type TriggerMode = 'mention' | 'keyword';
export type DocumentStatus = 'pending' | 'processing' | 'indexed' | 'error';
export type ExperienceStatus = 'active' | 'archived' | 'flagged';
export type ExperienceSourceType = 'auto' | 'manual';

// ── Normalised inbound message ────────────────────────────────────────────────

export interface IncomingMessage {
  botId:       string;
  channelType: ChannelType;
  chatId:      string;       // WhatsApp group_id OR Telegram chat.id (as string)
  messageId:   string;       // channel-native message ID (for quoting reply)
  senderRef:   string;       // masked phone (WA) or "@username" / user_id (TG)
  text:        string;       // extracted question text (mention/keyword stripped)
  apiVersion:  string;       // from bot_chat_assignments.api_version
  rawPayload:  unknown;      // original payload for logging/debugging
}

// ── Normalised outbound message ───────────────────────────────────────────────

export interface OutgoingMessage {
  chatId:    string;
  text:      string;       // markdown formatted answer
  replyToId: string;       // message ID to quote/reply to
}

// ── Bot ───────────────────────────────────────────────────────────────────────

export interface Bot {
  id:                      string;
  name:                    string;
  description:             string | null;
  status:                  BotStatus;
  channel_type:            ChannelType;
  knowledge_base_id:       string | null;
  experience_store_id:     string | null;
  system_prompt:           string | null;
  trigger_mode:            TriggerMode;
  trigger_keyword:         string | null;
  group_context_messages:  number;
  doc_retrieval_threshold: number;
  exp_retrieval_threshold: number;
  web_search_fallback:     boolean;
  llm_model:               string;
  max_response_tokens:     number;
  created_at:              string;
  updated_at:              string;
}

export interface BotChannelConfig {
  id:                    string;
  bot_id:                string;
  channel_type:          ChannelType;
  // WhatsApp
  wa_phone_number_id:    string | null;
  wa_access_token:       string | null;
  wa_verify_token:       string | null;
  // Telegram
  tg_bot_token:          string | null;
  tg_bot_username:       string | null;
  tg_webhook_registered: boolean;
  // Greeting
  greeting_message_wa:   string | null;
  greeting_message_tg:   string | null;
  send_greeting:         boolean;
}

export interface BotChatAssignment {
  id:           string;
  bot_id:       string;
  channel_type: ChannelType;
  chat_id:      string;
  chat_label:   string | null;
  api_version:  string;
  assigned_at:  string;
}

// ── Bot Knowledge Base (join) ─────────────────────────────────────────────────

export interface BotKnowledgeBase {
  bot_id:            string;
  knowledge_base_id: string;
  created_at:        string;
}

// ── Knowledge Base ────────────────────────────────────────────────────────────

export interface KnowledgeBase {
  id:              string;
  name:            string;
  description:     string | null;
  embedding_model: string;
  chunk_size:      number;
  chunk_overlap:   number;
  top_k:           number;
  created_at:      string;
  updated_at:      string;
}

export interface Document {
  id:                string;
  knowledge_base_id: string;
  name:              string;
  file_type:         string;
  file_url:          string | null;
  source_url:        string | null;
  raw_content:       string | null;
  api_version:       string | null;
  status:            DocumentStatus;
  chunk_count:       number;
  error_message:     string | null;
  created_at:        string;
  updated_at:        string;
}

export interface DocumentChunk {
  id:                string;
  document_id:       string;
  knowledge_base_id: string;
  content:           string;
  metadata:          ChunkMetadata;
  embedding?:        number[];
  created_at:        string;
}

export interface ChunkMetadata {
  doc_name:    string;
  section?:    string;
  api_version: string | null;
  source_url?: string;
  page?:       number;
}

// ── Experience Store ──────────────────────────────────────────────────────────

export interface ExperienceStore {
  id:          string;
  name:        string;
  description: string | null;
  is_shared:   boolean;
  created_at:  string;
  updated_at:  string;
}

export interface ExperienceEntry {
  id:                   string;
  experience_store_id:  string;
  source_log_id:        string | null;
  question_summary:     string;
  answer_summary:       string;
  tags:                 string[];
  quality_score:        number | null;
  use_count:            number;
  embedding?:           number[];
  status:               ExperienceStatus;
  source_type:          ExperienceSourceType;
  created_at:           string;
  updated_at:           string;
}

// ── Conversation Log ──────────────────────────────────────────────────────────

export interface ConversationLog {
  id:                      string;
  bot_id:                  string | null;
  channel_type:            ChannelType;
  chat_id:                 string | null;
  message_id:              string | null;
  sender_ref:              string | null;
  question:                string;
  answer:                  string;
  doc_chunks_used:         unknown | null;
  experience_entries_used: unknown | null;
  web_search_used:         boolean;
  web_search_queries:      string[] | null;
  sources_used:            string[] | null;
  model:                   string | null;
  tokens_input:            number | null;
  tokens_output:           number | null;
  latency_ms:              number | null;
  experience_generated:    boolean;
  experience_entry_id:     string | null;
  created_at:              string;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface Settings {
  id:                         string;
  anthropic_api_key:          string | null;
  voyage_api_key:             string | null;
  brave_search_api_key:       string | null;
  default_llm_model:          string;
  experience_auto_generation: boolean;
  experience_dedup_threshold: number;
  wa_phone_number_id:         string | null;
  wa_access_token:            string | null;
  wa_verify_token:            string | null;
  updated_at:                 string;
}

// ── Pipeline internals ────────────────────────────────────────────────────────

export interface RetrievedChunk {
  chunk:      DocumentChunk;
  similarity: number;
}

export interface RetrievedExperience {
  entry:      ExperienceEntry;
  similarity: number;
}

export interface PipelineResult {
  answer:               string;
  docChunksUsed:        RetrievedChunk[];
  experienceUsed:       RetrievedExperience[];
  webSearchUsed:        boolean;
  webSearchQueries:     string[];
  sourcesUsed:          string[];
  model:                string;
  tokensInput:          number;
  tokensOutput:         number;
  latencyMs:            number;
}
