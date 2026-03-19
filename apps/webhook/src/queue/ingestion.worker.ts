import 'dotenv/config';
import { Worker, Job, UnrecoverableError } from 'bullmq';
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
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
  let html: string;
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'EximPeBot/1.0 (+https://eximpe.com)' },
      timeout: 15_000,
    });
    html = res.data;
  } catch (err: unknown) {
    const status = (err as any)?.response?.status;
    if (status === 404 || status === 410) {
      throw new UnrecoverableError(`URL returned ${status}: ${url}`);
    }
    throw err;
  }
  const $ = cheerio.load(html);

  // Strip nav/sidebar/footer/chrome
  $('nav, header, footer, .sidebar, .navbar, .toc, script, style, [aria-hidden="true"]').remove();

  // Extract main content — prefer <main> or <article>, fall back to <body>
  const root = $('main').first().length
    ? $('main').first()
    : $('article').first().length
      ? $('article').first()
      : $('body');

  const markdown = htmlToMarkdown(root, $).trim();

  // Strip Mintlify boilerplate: "Documentation Index > Fetch the complete documentation index at: ..."
  // This header appears on every docs.eximpe.com page and adds noise to every chunk
  return markdown
    .replace(/>\s*##?\s*Documentation Index[\s\S]*?(?=\n#|\n\n#|$)/i, '')
    .replace(/Fetch the complete documentation index at:.*?llms\.txt.*?\n/gi, '')
    .trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function htmlToMarkdown(el: any, $: CheerioAPI): string {
  let result = '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  el.contents().each((_i: number, node: any) => {
    if (node.type === 'text') {
      const text = (node as { data: string }).data ?? '';
      result += text;
      return;
    }

    if (node.type !== 'tag') return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tag = node as { name: string; children: any[] };
    const tagName = tag.name.toLowerCase();
    const $el = $(node);
    const inner = htmlToMarkdown($el, $);

    switch (tagName) {
      case 'h1': result += `\n\n# ${inner.trim()}\n\n`; break;
      case 'h2': result += `\n\n## ${inner.trim()}\n\n`; break;
      case 'h3': result += `\n\n### ${inner.trim()}\n\n`; break;
      case 'h4':
      case 'h5':
      case 'h6': result += `\n\n#### ${inner.trim()}\n\n`; break;
      case 'p': result += `\n\n${inner.trim()}\n\n`; break;
      case 'br': result += '\n'; break;
      case 'strong':
      case 'b': result += `**${inner.trim()}**`; break;
      case 'em':
      case 'i': result += `_${inner.trim()}_`; break;
      case 'code':
        // inline code (not inside pre)
        result += `\`${inner}\``;
        break;
      case 'pre': {
        // code block
        const codeEl = $el.find('code');
        const codeContent = codeEl.length ? codeEl.text() : $el.text();
        const lang = (codeEl.attr('class') ?? '').replace(/language-/, '').trim();
        result += `\n\n\`\`\`${lang}\n${codeContent}\n\`\`\`\n\n`;
        break;
      }
      case 'ul':
      case 'ol': {
        $el.children('li').each((_i, li) => {
          const liText = htmlToMarkdown($(li), $).trim().replace(/\n+/g, ' ');
          result += `\n- ${liText}`;
        });
        result += '\n';
        break;
      }
      case 'li': result += inner; break;
      case 'table': result += '\n\n' + extractTable($(node), $) + '\n\n'; break;
      case 'a': result += inner; break;
      case 'div':
      case 'section':
      case 'article':
      case 'main':
      case 'span':
      default:
        result += inner;
        break;
    }
  });

  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTable(el: any, $: CheerioAPI): string {
  const rows: string[][] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  el.find('tr').each((_i: number, tr: any) => {
    const cells: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $(tr).find('th, td').each((_j: number, td: any) => {
      cells.push($(td).text().trim().replace(/\|/g, '\\|'));
    });
    rows.push(cells);
  });

  if (rows.length === 0) return '';

  const colCount = Math.max(...rows.map((r) => r.length));
  const lines: string[] = [];

  rows.forEach((row, idx) => {
    // Pad row to colCount
    while (row.length < colCount) row.push('');
    lines.push('| ' + row.join(' | ') + ' |');
    if (idx === 0) {
      lines.push('| ' + Array(colCount).fill('---').join(' | ') + ' |');
    }
  });

  return lines.join('\n');
}

async function extractFromPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfModule = await import('pdf-parse') as any;
  const pdfParse = pdfModule.default ?? pdfModule;
  const data = await pdfParse(buffer);
  return data.text as string;
}

async function extractFromDocx(buffer: Buffer): Promise<string> {
  const m = await import('mammoth');
  const r = await m.default.extractRawText({ buffer });
  return r.value;
}

function extractFromXlsx(buffer: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return (wb.SheetNames as string[])
    .map((s: string) => '## ' + s + '\n' + XLSX.utils.sheet_to_csv(wb.Sheets[s]))
    .join('\n\n');
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

// ── Section-aware chunker ─────────────────────────────────────────────────────

interface SectionChunk {
  content: string;
  sectionPath: string[];
}

function chunkBySection(markdown: string, maxChars: number): SectionChunk[] {
  const results: SectionChunk[] = [];
  const headingStack: string[] = [];
  let sectionLines: string[] = [];

  function flush() {
    const text = sectionLines.join('\n').trim();
    sectionLines = [];
    if (!text) return;
    if (text.length <= maxChars) {
      results.push({ content: text, sectionPath: [...headingStack] });
    } else {
      for (const sub of splitLarge(text, maxChars)) {
        results.push({ content: sub, sectionPath: [...headingStack] });
      }
    }
  }

  for (const line of markdown.split('\n')) {
    const m = line.match(/^(#{1,4})\s+(.+)/);
    if (m) {
      flush();
      const level = m[1].length;
      headingStack.length = level;
      headingStack[level - 1] = m[2].trim();
      sectionLines.push(line);
    } else {
      sectionLines.push(line);
    }
  }
  flush();
  return results;
}

function splitLarge(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let current = '';
  let inCode = false;
  for (const para of text.split(/\n\n+/)) {
    const toggles = (para.match(/^```/gm) ?? []).length;
    if (toggles % 2 === 1) inCode = !inCode;
    if (!inCode && current.length > 0 && current.length + para.length + 2 > maxChars) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 0);
}

// ── Helper: extract nearest heading from chunk text ──────────────────────────

function extractHeading(text: string): string | undefined {
  const match = text.match(/^#{1,4}\s+(.+)/m);
  return match ? match[1].trim() : undefined;
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
      const fileType = (doc.file_type as string ?? '').toLowerCase();

      if (fileType === 'pdf') {
        rawText = await extractFromPdf(buffer);
      } else if (fileType === 'docx') {
        rawText = await extractFromDocx(buffer);
      } else if (fileType === 'xlsx' || fileType === 'xls') {
        rawText = extractFromXlsx(buffer);
      } else if (fileType === 'csv' || fileType === 'txt' || fileType === 'text') {
        rawText = buffer.toString('utf-8');
      } else {
        rawText = buffer.toString('utf-8');
        if (fileType === 'json') rawText = extractFromJson(rawText);
      }
    }

    if (!rawText.trim()) throw new Error('No text content extracted from document');

    // 3. Chunk by section
    const chunks = chunkBySection(rawText, kb.chunk_size ?? 1200);

    // 4. Build metadata per chunk
    const chunkTexts = chunks.map((c) => c.content);
    const metadataList: ChunkMetadata[] = chunks.map((chunk) => ({
      doc_name:     doc.name,
      section_path: chunk.sectionPath,
      section:      chunk.sectionPath.at(-1) ?? extractHeading(chunk.content),
      api_version:  apiVersion,
      source_url:   doc.source_url ?? undefined,
    }));

    // 5. Batch embed
    const embeddings = await embedBatch(chunkTexts);

    // 6. Insert new chunks FIRST — collect their IDs so we can delete only the old ones
    const rows = chunkTexts.map((content, i) => ({
      document_id:       documentId,
      knowledge_base_id: knowledgeBaseId,
      content,
      metadata:          metadataList[i],
      embedding:         JSON.stringify(embeddings[i]),
    }));

    const newIds: string[] = [];

    // Insert in batches of 50 to avoid payload limits
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { data, error } = await db
        .from('document_chunks')
        .insert(rows.slice(i, i + BATCH))
        .select('id');
      if (error) throw new Error(`Chunk insert failed: ${error.message}`);
      if (data) newIds.push(...data.map((r: { id: string }) => r.id));
    }

    // 7. Delete old chunks only after ALL new ones are successfully inserted.
    //    This keeps the previous good state intact if any insert above throws.
    await db
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId)
      .not('id', 'in', `(${newIds.join(',')})`);

    // 8. Update document to indexed
    await db.from('documents').update({
      status:        'indexed',
      chunk_count:   chunkTexts.length,
      api_version:   apiVersion,
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

// ── Worker bootstrap ──────────────────────────────────────────────────────────

// Custom backoff: 2 min * 2^attempt, plus random jitter up to 30 s
// so batches of retried jobs spread out instead of hammering Voyage together.
function ingestionBackoff(attemptsMade: number): number {
  const base    = 120_000 * Math.pow(2, attemptsMade - 1); // 2m, 4m, 8m, 16m
  const jitter  = Math.floor(Math.random() * 30_000);
  return base + jitter;
}

export function startIngestionWorker(): Worker {
  const worker = new Worker<IngestionJobData>(
    'ingestion',
    processIngestionJob,
    {
      connection:   getRedis(),
      concurrency:  1,
      // Voyage AI free tier: 3 RPM. Cap at 1 job/min to stay safely under.
      limiter: {
        max:      1,
        duration: 60_000,
      },
      settings: {
        backoffStrategy: ingestionBackoff,
      },
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
