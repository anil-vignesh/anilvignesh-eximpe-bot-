export interface KnowledgeBase {
  id: string
  name: string
  description: string | null
  embedding_model: string
  chunk_size: number
  chunk_overlap: number
  top_k: number
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  knowledge_base_id: string
  name: string
  file_type: string
  file_url: string | null
  source_url: string | null
  api_version: string | null
  status: 'pending' | 'processing' | 'indexed' | 'error'
  chunk_count: number
  error_message: string | null
  created_at: string
}

export interface ExperienceStore {
  id: string
  name: string
  description: string | null
  is_shared: boolean
  created_at: string
}

export interface ExperienceEntry {
  id: string
  experience_store_id: string
  question_summary: string
  answer_summary: string
  tags: string[]
  quality_score: number | null
  use_count: number
  status: 'active' | 'archived' | 'flagged'
  source_type: 'auto' | 'manual'
  created_at: string
}

export interface BotChatAssignment {
  id: string
  bot_id: string
  channel_type: 'telegram' | 'whatsapp'
  chat_id: string
  chat_label: string | null
  api_version: string
  assigned_at: string
}

export interface ConversationLog {
  id: string
  bot_id: string | null
  channel_type: string
  chat_id: string | null
  sender_ref: string | null
  question: string
  answer: string
  web_search_used: boolean
  sources_used: string[] | null
  tokens_input: number | null
  tokens_output: number | null
  latency_ms: number | null
  experience_generated: boolean
  created_at: string
}

export interface Bot {
  id: string
  name: string
}
