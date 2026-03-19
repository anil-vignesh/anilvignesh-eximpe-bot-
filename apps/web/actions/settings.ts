'use server'

import { getDb } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export interface Settings {
  id: string
  anthropic_api_key: string | null
  voyage_api_key: string | null
  brave_search_api_key: string | null
  default_llm_model: string
  experience_auto_generation: boolean
  experience_dedup_threshold: number
  wa_phone_number_id: string | null
  wa_access_token: string | null
  wa_verify_token: string | null
}

export async function getSettings(): Promise<Settings | null> {
  const db = getDb()
  const { data, error } = await db.from('settings').select('*').limit(1).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data as Settings
}

export async function updateSettings(data: Partial<Settings>): Promise<void> {
  const db = getDb()
  const settings = await getSettings()
  if (!settings) {
    throw new Error('Settings row not found')
  }
  // Exclude `id` — primary key must not be updatable
  const { id: _id, ...updateData } = data
  const { error } = await db.from('settings').update(updateData).eq('id', settings.id)
  if (error) throw new Error(error.message)
  revalidatePath('/settings')
}
