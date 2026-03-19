'use server'

import { getDb } from '@/lib/supabase'
import { patchBotStatus } from '@/lib/webhook'
import { revalidatePath } from 'next/cache'

export interface Bot {
  id: string
  name: string
  description: string | null
  status: 'inactive' | 'active' | 'error'
  channel_type: 'telegram' | 'whatsapp'
  knowledge_base_id: string | null
  experience_store_id: string | null
  system_prompt: string | null
  trigger_mode: 'mention' | 'keyword'
  trigger_keyword: string | null
  group_context_messages: number
  doc_retrieval_threshold: number
  exp_retrieval_threshold: number
  web_search_fallback: boolean
  llm_model: string
  max_response_tokens: number
  created_at: string
  updated_at: string
}

export interface BotChannelConfig {
  id: string
  bot_id: string
  channel_type: 'telegram' | 'whatsapp'
  wa_phone_number_id: string | null
  wa_access_token: string | null
  wa_verify_token: string | null
  tg_bot_token: string | null
  tg_bot_username: string | null
  tg_webhook_registered: boolean
  greeting_message_wa: string | null
  greeting_message_tg: string | null
  send_greeting: boolean
}

export interface KnowledgeBase {
  id: string
  name: string
}

export interface ExperienceStore {
  id: string
  name: string
}

export type BotListItem = Bot & {
  config: BotChannelConfig | null
  kb_name: string | null
  exp_name: string | null
}

export async function listBots(): Promise<BotListItem[]> {
  const db = getDb()
  const [botsRes, kbNamesRes] = await Promise.all([
    db
      .from('bots')
      .select(`
        *,
        config:bot_channel_configs(*),
        experience_store:experience_stores(name)
      `)
      .order('created_at', { ascending: false }),
    db
      .from('bot_knowledge_bases')
      .select('bot_id, knowledge_bases(name)'),
  ])

  if (botsRes.error) throw new Error(botsRes.error.message)

  // Build a map of bot_id → comma-joined KB names
  const kbNameMap: Record<string, string> = {}
  for (const row of (kbNamesRes.data ?? []) as any[]) {
    const name = row.knowledge_bases?.name
    if (!name) continue
    kbNameMap[row.bot_id] = kbNameMap[row.bot_id]
      ? `${kbNameMap[row.bot_id]}, ${name}`
      : name
  }

  return (botsRes.data ?? []).map((row: any) => ({
    ...row,
    config: Array.isArray(row.config) ? (row.config[0] ?? null) : (row.config ?? null),
    kb_name: kbNameMap[row.id] ?? null,
    exp_name: row.experience_store?.name ?? null,
    experience_store: undefined,
  }))
}

export async function getBot(id: string): Promise<{
  bot: Bot
  config: BotChannelConfig | null
  kbs: KnowledgeBase[]
  assignedKbIds: string[]
  stores: ExperienceStore[]
} | null> {
  const db = getDb()

  const [botRes, kbRes, assignedKbRes, storeRes] = await Promise.all([
    db
      .from('bots')
      .select('*, config:bot_channel_configs(*)')
      .eq('id', id)
      .single(),
    db.from('knowledge_bases').select('id, name').order('name'),
    db.from('bot_knowledge_bases').select('knowledge_base_id').eq('bot_id', id),
    db.from('experience_stores').select('id, name').order('name'),
  ])

  if (botRes.error) {
    if (botRes.error.code === 'PGRST116') return null
    throw new Error(botRes.error.message)
  }

  const row = botRes.data as any
  const config = Array.isArray(row.config)
    ? (row.config[0] ?? null)
    : (row.config ?? null)

  return {
    bot: { ...row, config: undefined } as Bot,
    config,
    kbs: (kbRes.data ?? []) as KnowledgeBase[],
    assignedKbIds: (assignedKbRes.data ?? []).map((r: any) => r.knowledge_base_id),
    stores: (storeRes.data ?? []) as ExperienceStore[],
  }
}

export async function updateBotKnowledgeBases(botId: string, kbIds: string[]): Promise<void> {
  const db = getDb()

  // Delete all existing assignments then insert new ones
  const { error: deleteError } = await db
    .from('bot_knowledge_bases')
    .delete()
    .eq('bot_id', botId)

  if (deleteError) throw new Error(deleteError.message)

  if (kbIds.length > 0) {
    const { error: insertError } = await db
      .from('bot_knowledge_bases')
      .insert(kbIds.map((kbId) => ({ bot_id: botId, knowledge_base_id: kbId })))

    if (insertError) throw new Error(insertError.message)
  }

  revalidatePath(`/bots/${botId}`)
}

export async function createBot(data: {
  bot: Partial<Bot>
  config: Partial<BotChannelConfig>
  kbIds?: string[]
}): Promise<string> {
  const db = getDb()

  const { data: botRow, error: botError } = await db
    .from('bots')
    .insert(data.bot)
    .select('id')
    .single()

  if (botError) throw new Error(botError.message)

  const botId = botRow.id as string

  const { error: configError } = await db
    .from('bot_channel_configs')
    .insert({ ...data.config, bot_id: botId })

  if (configError) throw new Error(configError.message)

  if (data.kbIds && data.kbIds.length > 0) {
    const { error: kbError } = await db
      .from('bot_knowledge_bases')
      .insert(data.kbIds.map((kbId) => ({ bot_id: botId, knowledge_base_id: kbId })))
    if (kbError) throw new Error(kbError.message)
  }

  revalidatePath('/bots')
  return botId
}

export async function updateBot(
  id: string,
  data: { bot: Partial<Bot>; config: Partial<BotChannelConfig>; kbIds?: string[] }
): Promise<void> {
  const db = getDb()

  const { error: botError } = await db.from('bots').update(data.bot).eq('id', id)
  if (botError) throw new Error(botError.message)

  const { error: configError } = await db
    .from('bot_channel_configs')
    .update(data.config)
    .eq('bot_id', id)
  if (configError) throw new Error(configError.message)

  if (data.kbIds !== undefined) {
    await updateBotKnowledgeBases(id, data.kbIds)
  }

  revalidatePath('/bots')
  revalidatePath(`/bots/${id}`)
}

export async function toggleBotStatus(id: string, currentStatus: string): Promise<void> {
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
  await patchBotStatus(id, newStatus)
  revalidatePath('/bots')
}
