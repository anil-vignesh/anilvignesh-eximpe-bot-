'use server'

import { getDb } from '@/lib/supabase'
import type { ConversationLog } from '@/lib/types'

const PAGE_SIZE = 50

export async function listLogs(
  page: number,
  botId?: string
): Promise<{ logs: (ConversationLog & { bot_name: string | null })[]; total: number }> {
  const db = getDb()
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = db
    .from('conversation_logs')
    .select(
      `
      *,
      bots(name)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to)

  if (botId) {
    query = query.eq('bot_id', botId)
  }

  const { data, error, count } = await query

  if (error) throw new Error(error.message)

  const logs = (data ?? []).map((row: any) => ({
    ...row,
    bots: undefined,
    bot_name: row.bots?.name ?? null,
  }))

  return { logs, total: count ?? 0 }
}

export async function getLog(id: string): Promise<
  | (ConversationLog & {
      bot_name: string | null
      doc_chunks_used: any
      experience_entries_used: any
    })
  | null
> {
  const db = getDb()
  const { data, error } = await db
    .from('conversation_logs')
    .select(
      `
      *,
      bots(name),
      doc_chunks_used:log_doc_chunks(
        id,
        source_name,
        similarity_score,
        chunk_text
      ),
      experience_entries_used:log_experience_entries(
        id,
        question_summary,
        answer_summary,
        similarity_score
      )
    `
    )
    .eq('id', id)
    .single()

  if (error) return null

  return {
    ...data,
    bots: undefined,
    bot_name: data.bots?.name ?? null,
  }
}

export async function listBotsForFilter(): Promise<{ id: string; name: string }[]> {
  const db = getDb()
  const { data, error } = await db
    .from('bots')
    .select('id, name')
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}
