import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { db } from '@eximpe-bot/shared';
import { embedBatch } from '../services/voyage';
import { getRedis } from './redis';
import type { ChunkMetadata } from '@eximpe-bot/shared';

export interface IngestionJobData {
  documentId:      string;
  knowledgeBaseId: string;
}

// ── Text extractors ───────────────────────────────────────────────────────────

async function extractFromUrl(url: string): Promise<string> {
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': 'EximPeBot/1.0 (+https://eximpe.com)' },
    timeout: 15_000,
  });
  const $ = cheerio.load(html);

  // Strip Mintlify chrome for docs.eximpe.com
  $('nav, header, footer, .sidebar, .navbar, .toc, script, style, [aria-hidden="true"]').remove();

  // Extract main content — prefer <main> or <article>, fall back to <body>
  const main = $('main').first().text() || $('article').first().text() || $('body').text();
  return main.replace(/\s+/g, ' ').trim();
}

async function extractFromPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfModule = await import('pdf-parse') as any;
  const pdfParse = pdfModule.default ?? pdfModule;
  const data = await pdfParse(buffer);
  return data.text as string;
}

function extractFromMarkdown(content: string): string {
  return content;
}

function extractFromJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

// ── Auto-detect API version from URL path ────────────────────────────────────

function detectApiVersion(url: string): string | null {
  const match = url.match(/\/(v\d+)\//i);
  if (match) return match[1].replace('v', '');
  return null;
}

// ── Main worker handler ───────────────────────────────────────────────────────

async function processIngestionJob(job: Job<IngestionJobData>): Promise<void> {
  const { documentId, knowledgeBaseId } = job.data;

  // Mark as processing
  await db.from('documents').update({ status: 'processing' }).eq('id', documentId);

  try {
    // 1. Fetch document record + KB config
    const { data: doc, error: docErr } = await db
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();
    if (docErr || !doc) throw new Error(`Document not found: ${documentId}`);

    const { data: kb, error: kbErr } = await db
      .from('knowledge_bases')
      .select('*')
      .eq('id', knowledgeBaseId)
      .single();
    if (kbErr || !kb) throw new Error(`Knowledge base not found: ${knowledgeBaseId}`);

    // 2. Extract text
    let rawText = '';
    let apiVersion = doc.api_version as string | null;

    if (doc.file_type === 'url' || doc.source_url) {
      const url = (doc.source_url || doc.file_url) as string;
      rawText = await extractFromUrl(url);
      if (!apiVersion) {
        apiVersion = detectApiVersion(url);
      }
    } else if (doc.raw_content) {
      rawText = doc.file_type === 'json'
        ? extractFromJson(doc.raw_content)
        : extractFromMarkdown(doc.raw_content);
    } else if (doc.file_url) {
      const { data: fileData, error: fileErr } = await db.storage
        .from('documents')
        .download(doc.file_url);
      if (fileErr || !fileData) throw new Error(`Could not download file: ${doc.file_url}`);

      const buffer = Buffer.from(await fileData.arrayBuffer());

      if (doc.file_type === 'pdf') {
        rawText = await extractFromPdf(buffer);
      } else {
        rawText = buffer.toString('utf-8');
        if (doc.file_type === 'json') rawText = extractFromJson(rawText);
      }
    }

    if (!rawText.trim()) throw new Error('No text content extracted from document');

    // 3. Chunk
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize:    kb.chunk_size    ?? 512,
      chunkOverlap: kb.chunk_overlap ?? 50,
    });
    const chunks = await splitter.createDocuments([rawText]);

    // 4. Build metadata per chunk
    const chunkTexts = chunks.map((c) => c.pageContent);
    const metadataList: ChunkMetadata[] = chunks.map((c) => ({
      doc_name:    doc.name,
      section:     extractHeading(c.pageContent),
      api_version: apiVersion,
      source_url:  doc.source_url ?? undefined,
      page:        c.metadata?.loc?.lines?.from ?? undefined,
    }));

    // 5. Batch embed
    const embeddings = await embedBatch(chunkTexts);

    // 6. Delete existing chunks for this document (re-index)
    await db.from('document_chunks').delete().eq('document_id', documentId);

    // 7. Upsert chunks
    const rows = chunkTexts.map((content, i) => ({
      document_id:       documentId,
      knowledge_base_id: knowledgeBaseId,
      content,
      metadata:          metadataList[i],
      embedding:         JSON.stringify(embeddings[i]),
    }));

    // Insert in batches of 50 to avoid payload limits
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await db
        .from('document_chunks')
        .insert(rows.slice(i, i + BATCH));
      if (error) throw new Error(`Chunk insert failed: ${error.message}`);
    }

    // 8. Update document to indexed
    await db.from('documents').update({
      status:      'indexed',
      chunk_count: chunkTexts.length,
      api_version: apiVersion,
      error_message: null,
    }).eq('id', documentId);

    console.log(`[ingestion] ✓ ${doc.name} — ${chunkTexts.length} chunks`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingestion] ✗ ${documentId}:`, message);
    await db.from('documents').update({
      status:        'error',
      error_message: message,
    }).eq('id', documentId);
    throw err;
  }
}

// ── Helper: extract nearest heading from chunk text ──────────────────────────

function extractHeading(text: string): string | undefined {
  const match = text.match(/^#{1,4}\s+(.+)/m);
  return match ? match[1].trim() : undefined;
}

// ── Worker bootstrap ──────────────────────────────────────────────────────────

export function startIngestionWorker(): Worker {
  const worker = new Worker<IngestionJobData>(
    'ingestion',
    processIngestionJob,
    {
      connection:  getRedis(),
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[ingestion] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ingestion] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
