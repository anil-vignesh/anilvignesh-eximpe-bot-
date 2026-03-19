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

function assertSafeUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are allowed')
  }
  const host = parsed.hostname.toLowerCase()
  // Block private/loopback ranges to prevent SSRF
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    host === '0.0.0.0' ||
    host === '[::]' ||
    host === '[::1]' ||
    host === '169.254.169.254' // AWS metadata
  ) {
    throw new Error('URL points to a private or reserved address')
  }
}

export async function addUrlDocument(kbId: string, url: string, name: string, apiVersion?: string): Promise<void> {
  assertSafeUrl(url)
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

const MAX_TEXT_CONTENT_BYTES = 10 * 1024 * 1024 // 10 MB

export async function addTextDocument(
  kbId: string,
  name: string,
  content: string,
  apiVersion?: string
): Promise<void> {
  if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_CONTENT_BYTES) {
    throw new Error('Content exceeds maximum size of 10 MB')
  }
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

const ALLOWED_FILE_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'csv', 'txt', 'text'])

export async function addFileDocument(
  kbId: string,
  name: string,
  fileName: string,
  fileType: string,
  fileBase64: string,
  apiVersion?: string
): Promise<void> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? fileType
  if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
    throw new Error(`File type .${ext} is not supported`)
  }
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
  const { error: updateError } = await db.from('documents').update({ file_url: storagePath }).eq('id', doc.id)
  if (updateError) {
    // Storage object is uploaded but DB update failed — clean up storage
    await db.storage.from('documents').remove([storagePath])
    await db.from('documents').delete().eq('id', doc.id)
    throw new Error(`Failed to update document record: ${updateError.message}`)
  }
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

export async function reindexDocument(docId: string, kbId: string): Promise<void> {
  const db = getDb()
  await db.from('documents').update({ status: 'pending', error_message: null }).eq('id', docId)
  await triggerIngestion(docId, kbId)
  revalidatePath(`/knowledge-base/${kbId}`)
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
  if (docs.length === 0) return { queued: 0 }

  // Update all docs to pending in one query
  await db
    .from('documents')
    .update({ status: 'pending', error_message: null })
    .in('id', docs.map((d) => d.id))

  // Enqueue all ingestion jobs in parallel
  await Promise.all(
    docs.map((doc) => triggerIngestion(doc.id, kbId))
  )

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
