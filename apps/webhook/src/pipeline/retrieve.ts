import { db } from '@eximpe-bot/shared';
import { embedText } from '../services/voyage';
import type {
  Bot,
  RetrievedChunk,
  RetrievedExperience,
  DocumentChunk,
  ExperienceEntry,
} from '@eximpe-bot/shared';

// ── Doc retrieval — version-aware ─────────────────────────────────────────────

export async function retrieveDocs(
  question:    string,
  bot:         Bot,
  apiVersion:  string,
): Promise<RetrievedChunk[]> {
  if (!bot.knowledge_base_id) return [];

  const embedding = await embedText(question);
  const topK       = await getKbTopK(bot.knowledge_base_id);
  const threshold  = bot.doc_retrieval_threshold;
  const majorVersion = apiVersion.split('.')[0]; // e.g. "1" from "1.0.0"

  // Step 1: version-matched chunks
  const versionMatched = await vectorSearch(
    bot.knowledge_base_id,
    embedding,
    topK,
    threshold,
    majorVersion,
  );

  // Step 2: if fewer than topK results, fill remaining slots with unversioned chunks
  const remaining = topK - versionMatched.length;
  let unversioned: RetrievedChunk[] = [];

  if (remaining > 0) {
    unversioned = await vectorSearch(
      bot.knowledge_base_id,
      embedding,
      remaining,
      threshold,
      null, // api_version IS NULL
    );
  }

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
  question:   string,
  bot:        Bot,
): Promise<RetrievedExperience[]> {
  if (!bot.experience_store_id) return [];

  const embedding  = await embedText(question);
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
