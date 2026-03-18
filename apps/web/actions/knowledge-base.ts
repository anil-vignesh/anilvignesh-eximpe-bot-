'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/supabase'
import { triggerCrawl, triggerIngestion } from '@/lib/webhook'
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
  const { data: doc, error } = await db.from('documents').insert({
    knowledge_base_id: kbId,
    name,
    file_type: 'url',
    source_url: url,
    api_version: apiVersion ?? null,
    status: 'pending',
    chunk_count: 0,
  }).select('id').single()

  if (error) throw new Error(error.message)
  await triggerIngestion(doc.id, kbId)
  revalidatePath(`/knowledge-base/${kbId}`)
}

export async function addTextDocument(
  kbId: string,
  name: string,
  content: string,
  apiVersion?: string
): Promise<void> {
  const db = getDb()
  const { data: doc, error } = await db.from('documents').insert({
    knowledge_base_id: kbId,
    name,
    file_type: 'text',
    raw_content: content,
    api_version: apiVersion ?? null,
    status: 'pending',
    chunk_count: 0,
  }).select('id').single()

  if (error) throw new Error(error.message)
  await triggerIngestion(doc.id, kbId)
  revalidatePath(`/knowledge-base/${kbId}`)
}

export async function addFileDocument(
  kbId: string,
  name: string,
  fileName: string,
  fileType: string,
  fileBase64: string,
  apiVersion?: string
): Promise<void> {
  const db = getDb()

  // Insert document record
  const { data: doc, error: docError } = await db.from('documents').insert({
    knowledge_base_id: kbId,
    name,
    file_type: fileType,
    api_version: apiVersion ?? null,
    status: 'pending',
    chunk_count: 0,
  }).select('id').single()

  if (docError) throw new Error(docError.message)

  // Upload file to Supabase Storage
  const buffer = Buffer.from(fileBase64, 'base64')
  const ext = fileName.split('.').pop()?.toLowerCase() ?? fileType
  const storagePath = `${kbId}/${doc.id}.${ext}`

  const { error: uploadError } = await db.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: mimeForType(fileType) })

  if (uploadError) {
    await db.from('documents').delete().eq('id', doc.id)
    throw new Error(uploadError.message)
  }

  // Update with file_url and queue
  await db.from('documents').update({ file_url: storagePath }).eq('id', doc.id)
  await triggerIngestion(doc.id, kbId)
  revalidatePath(`/knowledge-base/${kbId}`)
}

function mimeForType(fileType: string): string {
  const map: Record<string, string> = {
    pdf:  'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv:  'text/csv',
    txt:  'text/plain',
  }
  return map[fileType] ?? 'application/octet-stream'
}

export async function reindexKnowledgeBase(kbId: string): Promise<{ queued: number }> {
  const db = getDb()
  const { data, error } = await db
    .from('documents')
    .select('id')
    .eq('knowledge_base_id', kbId)
    .in('status', ['indexed', 'error'])

  if (error) throw new Error(error.message)

  const docs = data ?? []
  for (const doc of docs) {
    await db.from('documents').update({ status: 'pending' }).eq('id', doc.id)
    await triggerIngestion(doc.id, kbId)
  }

  revalidatePath(`/knowledge-base/${kbId}`)
  return { queued: docs.length }
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
