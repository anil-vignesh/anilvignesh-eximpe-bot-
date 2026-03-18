'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/supabase'
import { triggerCrawl } from '@/lib/webhook'
import type { KnowledgeBase, Document } from '@/lib/types'

export async function listKnowledgeBases(): Promise<(KnowledgeBase & { doc_count: number; indexed_count: number })[]> {
  const db = getDb()
  const { data, error } = await db
    .from('knowledge_bases')
    .select(`
      *,
      documents(id, status)
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((kb: any) => {
    const docs: { id: string; status: string }[] = kb.documents ?? []
    return {
      ...kb,
      documents: undefined,
      doc_count: docs.length,
      indexed_count: docs.filter((d) => d.status === 'indexed').length,
    }
  })
}

export async function getKnowledgeBase(id: string): Promise<KnowledgeBase | null> {
  const db = getDb()
  const { data, error } = await db
    .from('knowledge_bases')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function createKnowledgeBase(data: { name: string; description?: string }): Promise<string> {
  const db = getDb()
  const { data: row, error } = await db
    .from('knowledge_bases')
    .insert({ name: data.name, description: data.description ?? null })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/knowledge-base')
  return row.id
}

export async function listDocuments(kbId: string): Promise<Document[]> {
  const db = getDb()
  const { data, error } = await db
    .from('documents')
    .select('*')
    .eq('knowledge_base_id', kbId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function addUrlDocument(kbId: string, url: string, name: string, apiVersion?: string): Promise<void> {
  const db = getDb()
  const { error } = await db.from('documents').insert({
    knowledge_base_id: kbId,
    name,
    file_type: 'url',
    source_url: url,
    api_version: apiVersion ?? null,
    status: 'pending',
    chunk_count: 0,
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/knowledge-base/${kbId}`)
}

export async function deleteDocument(id: string, kbId: string): Promise<void> {
  const db = getDb()
  const { error } = await db.from('documents').delete().eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/knowledge-base/${kbId}`)
}

export async function triggerCrawlAction(kbId: string, versions: string[]): Promise<void> {
  await triggerCrawl(kbId, versions)
  revalidatePath(`/knowledge-base/${kbId}`)
}
