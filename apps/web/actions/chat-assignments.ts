'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/supabase'
import type { BotChatAssignment } from '@/lib/types'

export async function listAssignments(): Promise<(BotChatAssignment & { bot_name: string | null })[]> {
  const db = getDb()
  const { data, error } = await db
    .from('bot_chat_assignments')
    .select(`
      *,
      bots(name)
    `)
    .order('assigned_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row: any) => ({
    ...row,
    bots: undefined,
    bot_name: row.bots?.name ?? null,
  }))
}

export async function listBots(): Promise<{ id: string; name: string }[]> {
  const db = getDb()
  const { data, error } = await db
    .from('bots')
    .select('id, name')
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createAssignment(data: {
  bot_id: string
  channel_type: string
  chat_id: string
  chat_label?: string
  api_version: string
}): Promise<void> {
  const db = getDb()
  const { error } = await db.from('bot_chat_assignments').insert({
    bot_id: data.bot_id,
    channel_type: data.channel_type,
    chat_id: data.chat_id,
    chat_label: data.chat_label ?? null,
    api_version: data.api_version,
  })

  if (error) throw new Error(error.message)

  // Clean up from unrecognised_chats now that it's assigned
  await db
    .from('unrecognised_chats')
    .delete()
    .eq('chat_id', data.chat_id)
    .eq('channel_type', data.channel_type)

  revalidatePath('/chat-assignments')
}

export async function updateAssignment(
  id: string,
  data: { bot_id?: string; api_version?: string; chat_label?: string }
): Promise<void> {
  const db = getDb()
  const { error } = await db
    .from('bot_chat_assignments')
    .update(data)
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/chat-assignments')
}

export async function deleteAssignment(id: string): Promise<void> {
  const db = getDb()
  const { error } = await db.from('bot_chat_assignments').delete().eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/chat-assignments')
}

export async function listApiVersions(): Promise<string[]> {
  const db = getDb()
  const { data, error } = await db
    .from('documents')
    .select('api_version')
    .not('api_version', 'is', null)
    .order('api_version', { ascending: true })

  if (error) throw new Error(error.message)

  const unique = [...new Set((data ?? []).map((r: any) => r.api_version as string))]
  return unique
}

export async function listUnrecognisedChats(): Promise<
  { id: string; channel_type: string; chat_id: string; received_at: string }[]
> {
  const db = getDb()
  const { data, error } = await db
    .from('unrecognised_chats')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(20)

  if (error) throw new Error(error.message)
  return data ?? []
}
