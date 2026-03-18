import { db } from '@eximpe-bot/shared';
import { embedText } from '../services/voyage';
import { getClaudeClient } from '../services/claude';
import type { Bot, ConversationLog, RetrievedChunk, RetrievedExperience } from '@eximpe-bot/shared';

// ── Distil a Q&A into a compact experience entry via Claude ──────────────────

interface Distilled {
  question_summary: string;
  answer_summary:   string;
  tags:             string[];
  quality_score:    number;
}

async function distil(question: string, answer: string): Promise<Distilled | null> {
  const claude = getClaudeClient();

  const prompt = `Summarise this Q&A into a reusable knowledge entry. Reply with ONLY valid JSON, no markdown.

Q: ${question.slice(0, 800)}
A: ${answer.slice(0, 1200)}

JSON format:
{
  "question_summary": "one sentence",
  "answer_summary": "2-3 sentences max",
  "tags": ["tag1","tag2"],
  "quality_score": 0.0-1.0
}`;

  try {
    const response = await claude.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages:   [{ role: 'user', content: prompt }],
    });

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return null;

    const raw = text.text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(raw) as Distilled;
  } catch (err) {
    console.error('[experienceWriter] distil error:', err);
    return null;
  }
}

// ── Dedup check — skip if a similar entry already exists ─────────────────────

async function isDuplicate(
  storeId:   string,
  embedding: number[],
  threshold: number,
): Promise<boolean> {
  const { data } = await db.rpc('match_experience_entries', {
    p_store_ids:   [storeId],
    p_embedding:   JSON.stringify(embedding),
    p_match_count: 1,
    p_threshold:   threshold,
  });

  return Array.isArray(data) && data.length > 0;
}

// ── Main writer ───────────────────────────────────────────────────────────────

export async function writeExperience(
  log:  ConversationLog,
  bot:  Bot,
): Promise<void> {
  // Skip if no experience store or auto-generation is globally off
  if (!bot.experience_store_id) return;

  const { data: settings } = await db
    .from('settings')
    .select('experience_auto_generation, experience_dedup_threshold')
    .single();

  if (!settings?.experience_auto_generation) return;

  const dedupThreshold = settings.experience_dedup_threshold ?? 0.92;

  try {
    // 1. Distil Q&A — uses Haiku, short prompt, ~150 output tokens
    const distilled = await distil(log.question, log.answer);
    if (!distilled) return;

    // 2. Embed the question summary for dedup + future retrieval
    const embedding = await embedText(distilled.question_summary);

    // 3. Dedup check
    const duplicate = await isDuplicate(
      bot.experience_store_id,
      embedding,
      dedupThreshold,
    );
    if (duplicate) {
      console.log('[experienceWriter] Skipping duplicate experience entry');
      return;
    }

    // 4. Insert experience entry
    const { data: entry, error } = await db
      .from('experience_entries')
      .insert({
        experience_store_id: bot.experience_store_id,
        source_log_id:       log.id,
        question_summary:    distilled.question_summary,
        answer_summary:      distilled.answer_summary,
        tags:                distilled.tags,
        quality_score:       distilled.quality_score,
        embedding:           JSON.stringify(embedding),
        status:              'active',
        source_type:         'auto',
      })
      .select('id')
      .single();

    if (error || !entry) {
      console.error('[experienceWriter] Insert error:', error?.message);
      return;
    }

    // 5. Back-link the log to the experience entry
    await db
      .from('conversation_logs')
      .update({ experience_generated: true, experience_entry_id: entry.id })
      .eq('id', log.id);

    console.log(`[experienceWriter] ✓ Experience entry created: ${entry.id}`);
  } catch (err) {
    // Never throw — experience writing is best-effort
    console.error('[experienceWriter] Unexpected error:', err);
  }
}

// ── Logger — saves conversation log and fires async experience writer ─────────

export async function logAndLearn(
  msg:    import('@eximpe-bot/shared').IncomingMessage,
  result: import('@eximpe-bot/shared').PipelineResult,
  bot:    Bot,
): Promise<void> {
  // 1. Save conversation log
  const { data: log, error } = await db
    .from('conversation_logs')
    .insert({
      bot_id:                  msg.botId,
      channel_type:            msg.channelType,
      chat_id:                 msg.chatId,
      message_id:              msg.messageId,
      sender_ref:              msg.senderRef,
      question:                msg.text,
      answer:                  result.answer,
      doc_chunks_used:         result.docChunksUsed.map((c: RetrievedChunk) => ({
        id: c.chunk.id, similarity: c.similarity,
      })),
      experience_entries_used: result.experienceUsed.map((e: RetrievedExperience) => ({
        id: e.entry.id, similarity: e.similarity,
      })),
      web_search_used:         result.webSearchUsed,
      web_search_queries:      result.webSearchQueries,
      sources_used:            result.sourcesUsed,
      tokens_input:            result.tokensInput,
      tokens_output:           result.tokensOutput,
      latency_ms:              result.latencyMs,
    })
    .select()
    .single();

  if (error || !log) {
    console.error('[logger] Failed to save conversation log:', error?.message);
    return;
  }

  // 2. Fire experience writer async — don't await, never blocks the reply
  writeExperience(log as ConversationLog, bot).catch((err) => {
    console.error('[experienceWriter] async error:', err);
  });
}
