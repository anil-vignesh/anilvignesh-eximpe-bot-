import { db } from '@eximpe-bot/shared';
import type {
  Bot,
  RetrievedChunk,
  RetrievedExperience,
  DocumentChunk,
  ExperienceEntry,
} from '@eximpe-bot/shared';

// ── Doc retrieval — version-aware, multi-KB ───────────────────────────────────

export async function retrieveDocs(
  question:        string,
  bot:             Bot,
  apiVersion:      string,
  queryEmbedding:  number[],
  kbIds?:          string[],
): Promise<RetrievedChunk[]> {
  // Resolve KB IDs: prefer explicit list (from bot_knowledge_bases), fall back to legacy field
  const ids = kbIds && kbIds.length > 0
    ? kbIds
    : bot.knowledge_base_id ? [bot.knowledge_base_id] : [];

  if (ids.length === 0) return [];

  const threshold    = bot.doc_retrieval_threshold;
  const majorVersion = apiVersion.split('.')[0]; // e.g. "1" from "1.0.0"

  // Search all KBs in parallel, then merge and sort by similarity
  const allResults = await Promise.all(
    ids.map((kbId) => retrieveFromKb(kbId, queryEmbedding, threshold, majorVersion)),
  );

  const merged = allResults.flat();

  // Deduplicate by chunk ID (shouldn't happen across KBs, but defensive)
  const seen = new Set<string>();
  const deduped = merged.filter(({ chunk }) => {
    if (seen.has(chunk.id)) return false;
    seen.add(chunk.id);
    return true;
  });

  // Return sorted by similarity descending
  return deduped.sort((a, b) => b.similarity - a.similarity);
}

async function retrieveFromKb(
  kbId:          string,
  embedding:     number[],
  threshold:     number,
  majorVersion:  string,
): Promise<RetrievedChunk[]> {
  const topK = await getKbTopK(kbId);

  // Step 1: version-matched chunks
  const versionMatched = await vectorSearch(kbId, embedding, topK, threshold, majorVersion);

  // Step 2: fill remaining slots with unversioned chunks (regulatory docs have no api_version)
  const remaining = topK - versionMatched.length;
  const unversioned = remaining > 0
    ? await vectorSearch(kbId, embedding, remaining, threshold, null)
    : [];

  return [...versionMatched, ...unversioned];
}

async function vectorSearch(
  knowledgeBaseId: string,
  embedding:       number[],
  limit:           number,
  threshold:       number,
  apiVersion:      string | null, // null = unversioned; string = specific major version
): Promise<RetrievedChunk[]> {
  // Use Supabase RPC for pgvector cosine similarity search
  const { data, error } = await db.rpc('match_document_chunks', {
    p_knowledge_base_id: knowledgeBaseId,
    p_embedding:         JSON.stringify(embedding),
    p_match_count:       limit,
    p_threshold:         threshold,
    p_api_version:       apiVersion,
  });

  if (error) {
    console.error('[retrieve] doc vector search error:', error.message);
    return [];
  }

  return (data as any[]).map((row) => ({
    chunk: {
      id:                row.id,
      document_id:       row.document_id,
      knowledge_base_id: knowledgeBaseId,
      content:           row.content,
      metadata:          row.metadata,
      created_at:        row.created_at,
    } as DocumentChunk,
    similarity: row.similarity,
  }));
}

// ── Experience retrieval ──────────────────────────────────────────────────────

export async function retrieveExperience(
  question:        string,
  bot:             Bot,
  queryEmbedding:  number[],
): Promise<RetrievedExperience[]> {
  if (!bot.experience_store_id) return [];

  const embedding  = queryEmbedding;
  const threshold  = bot.exp_retrieval_threshold;

  // Get all accessible store IDs: own store + readable shared stores
  const storeIds = await getAccessibleStoreIds(bot);
  if (storeIds.length === 0) return [];

  const { data, error } = await db.rpc('match_experience_entries', {
    p_store_ids:   storeIds,
    p_embedding:   JSON.stringify(embedding),
    p_match_count: 5,
    p_threshold:   threshold,
  });

  if (error) {
    console.error('[retrieve] experience vector search error:', error.message);
    return [];
  }

  return (data as any[]).map((row) => ({
    entry: {
      id:                  row.id,
      experience_store_id: row.experience_store_id,
      source_log_id:       row.source_log_id,
      question_summary:    row.question_summary,
      answer_summary:      row.answer_summary,
      tags:                row.tags ?? [],
      quality_score:       row.quality_score,
      use_count:           row.use_count,
      status:              row.status,
      source_type:         row.source_type,
      created_at:          row.created_at,
      updated_at:          row.updated_at,
    } as ExperienceEntry,
    similarity: row.similarity,
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getKbTopK(knowledgeBaseId: string): Promise<number> {
  const { data } = await db
    .from('knowledge_bases')
    .select('top_k')
    .eq('id', knowledgeBaseId)
    .single();
  return data?.top_k ?? 5;
}

async function getAccessibleStoreIds(bot: Bot): Promise<string[]> {
  const ids: string[] = [];

  if (bot.experience_store_id) ids.push(bot.experience_store_id);

  // Shared stores the bot has read access to
  const { data } = await db
    .from('experience_store_access')
    .select('experience_store_id')
    .eq('bot_id', bot.id)
    .eq('access_type', 'read');

  if (data) {
    for (const row of data) {
      if (!ids.includes(row.experience_store_id)) {
        ids.push(row.experience_store_id);
      }
    }
  }

  return ids;
}
