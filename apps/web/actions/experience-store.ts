'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/supabase'
import type { ExperienceStore, ExperienceEntry } from '@/lib/types'

export async function listStores(): Promise<(ExperienceStore & { entry_count: number })[]> {
  const db = getDb()
  const { data, error } = await db
    .from('experience_stores')
    .select(`
      *,
      experience_entries(id)
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((store: any) => {
    const entries: { id: string }[] = store.experience_entries ?? []
    return {
      ...store,
      experience_entries: undefined,
      entry_count: entries.length,
    }
  })
}

export async function getStore(id: string): Promise<ExperienceStore | null> {
  const db = getDb()
  const { data, error } = await db
    .from('experience_stores')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function createStore(data: { name: string; description?: string; is_shared?: boolean }): Promise<string> {
  const db = getDb()
  const { data: row, error } = await db
    .from('experience_stores')
    .insert({
      name: data.name,
      description: data.description ?? null,
      is_shared: data.is_shared ?? false,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/experience-store')
  return row.id
}

export async function listEntries(storeId: string, status?: string): Promise<ExperienceEntry[]> {
  const db = getDb()
  let query = db
    .from('experience_entries')
    .select('*')
    .eq('experience_store_id', storeId)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function updateEntryStatus(
  id: string,
  status: 'active' | 'archived' | 'flagged',
  storeId: string
): Promise<void> {
  const db = getDb()
  const { error } = await db
    .from('experience_entries')
    .update({ status })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/experience-store/${storeId}`)
}

export async function updateEntry(
  id: string,
  data: { question_summary?: string; answer_summary?: string; tags?: string[] },
  storeId: string
): Promise<void> {
  const db = getDb()
  const { error } = await db
    .from('experience_entries')
    .update(data)
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/experience-store/${storeId}`)
}

export async function deleteEntry(id: string, storeId: string): Promise<void> {
  const db = getDb()

  // Nullify FK reference in conversation_logs before deleting
  await db
    .from('conversation_logs')
    .update({ experience_entry_id: null })
    .eq('experience_entry_id', id)

  const { error } = await db.from('experience_entries').delete().eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/experience-store/${storeId}`)
}
