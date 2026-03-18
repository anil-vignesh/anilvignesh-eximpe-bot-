import { db } from '@eximpe-bot/shared';
import { retrieveDocs, retrieveExperience } from './retrieve';
import { webSearch } from './webSearch';
import { getClaudeClient } from '../services/claude';
import { getGroupContext } from '../services/groupContext';
import type {
  IncomingMessage,
  Bot,
  BotChannelConfig,
  PipelineResult,
  RetrievedChunk,
  RetrievedExperience,
} from '@eximpe-bot/shared';
import type Anthropic from '@anthropic-ai/sdk';

// ── Default system prompt ─────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are the official API support assistant for EximPe — speak in first person as EximPe ("we", "our API", "our platform"). Never refer to EximPe in the third person.

EximPe is a cross-border payment aggregator licensed by the RBI. We enable international merchants to accept payments from Indian customers via Cards, Net Banking, and UPI.

The developer you are assisting is integrating against a specific version of our API. The version is provided at the start of every user message under "EximPe API Version". Always frame answers for that version. If documentation for a different version is in context, note the discrepancy.

Answer questions based on:
1. The provided documentation context (always version-matched first)
2. The provided experience context (past resolved questions)
3. Web search results (only when the above don't contain a clear answer)

Rules:
- Always use first person: "we support", "our endpoint", "you can use our API to..." — never "EximPe supports" or "EximPe provides".
- Keep answers concise, technical, and accurate.
- Format endpoints, parameters, and code samples using markdown code blocks.
- Always include the relevant endpoint path or header name when answering API questions.
- Reference the X-API-Version header format when version is relevant (e.g. "set X-API-Version: 1.0.0").
- If citing from experience context, you may say "Based on a similar question previously..."
- If you use web search, briefly note what you found.
- If you cannot find an answer from any source, say exactly:
  "I couldn't find a clear answer for this — please reach out to us directly."
- Never ask the developer to share documentation — we own the docs.
- Never fabricate API behaviour, endpoints, or parameters.`;

// ── Web search tool definition ────────────────────────────────────────────────

const WEB_SEARCH_TOOL: Anthropic.Tool = {
  name:        'web_search',
  description: 'Search the internet for technical information not found in the documentation. Use for unfamiliar error codes, HTTP status meanings, third-party SDK issues, or troubleshooting topics not covered in the docs.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type:        'string',
        description: 'Specific search query including error codes, API names, or exact terms.',
      },
    },
    required: ['query'],
  },
};

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildUserPrompt(
  text:           string,
  apiVersion:     string,
  docChunks:      RetrievedChunk[],
  expEntries:     RetrievedExperience[],
  groupContext:   string,
  webResults?:    { query: string; content: string }[],
): string {
  const parts: string[] = [];

  parts.push(`## Context\n- EximPe API Version: ${apiVersion}`);

  if (docChunks.length > 0) {
    parts.push('## Documentation Context');
    for (const { chunk } of docChunks) {
      const meta = chunk.metadata;
      const source = [meta.doc_name, meta.section].filter(Boolean).join(' | Section: ');
      parts.push(`---\n[Source: ${source}]\n${chunk.content}\n---`);
    }
  }

  if (expEntries.length > 0) {
    parts.push('## Experience Context');
    for (const { entry } of expEntries) {
      const tags = entry.tags?.length ? ` | Tags: ${entry.tags.join(', ')}` : '';
      parts.push(`---\n[Past interaction${tags}]\nQ: ${entry.question_summary}\nA: ${entry.answer_summary}\n---`);
    }
  }

  if (webResults && webResults.length > 0) {
    parts.push('## Web Search Results');
    for (const result of webResults) {
      parts.push(`---\n[Search: "${result.query}"]\n${result.content}\n---`);
    }
  }

  if (groupContext) {
    parts.push(`## Recent Group Conversation\n${groupContext}`);
  }

  parts.push(`## Question\n${text}`);

  return parts.join('\n\n');
}

// ── Query rewriter ────────────────────────────────────────────────────────────

async function rewriteQuery(userQuery: string, claude: ReturnType<typeof getClaudeClient>): Promise<string> {
  const prompt = `You are a search query rewriter for an EximPe API documentation system.
EximPe is a cross-border payment aggregator. Their API covers: payments, subscriptions/mandates, webhooks, authentication, UPI, cards, net banking, settlements, refunds, and integration guides.

Rewrite the user's question into a search query optimised for retrieving relevant API documentation.
Expand abbreviations and map common terminology to EximPe-specific terms.

Examples:
- "upi autopay" → "UPI AutoPay subscription mandate recurring payment create-intent debit"
- "how to charge customer later" → "EximPe subscription mandate debit payment schedule API"
- "webhook setup" → "EximPe webhook configuration event notification endpoint secret"
- "refund status" → "EximPe refund status check API endpoint"

Reply with ONLY the rewritten query — no explanation, no markdown, no punctuation.

User query: ${userQuery.slice(0, 400)}`;

  try {
    const response = await claude.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages:   [{ role: 'user', content: prompt }],
    });
    const text = response.content.find((b) => b.type === 'text');
    const rewritten = text?.type === 'text' ? text.text.trim() : '';
    if (rewritten) console.log(`[pipeline] Query rewrite: "${userQuery}" → "${rewritten}"`);
    return rewritten || userQuery;
  } catch {
    return userQuery; // Fall back to original on error
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runPipeline(
  msg: IncomingMessage,
): Promise<PipelineResult> {
  const startTime = Date.now();

  // Load bot + channel config
  const { data: bot, error: botErr } = await db
    .from('bots')
    .select('*')
    .eq('id', msg.botId)
    .single();

  if (botErr || !bot) throw new Error(`Bot not found: ${msg.botId}`);

  const claude = getClaudeClient();

  // ── Stage 0: Query rewriting ──────────────────────────────────────────────
  // Expands user terminology into EximPe-specific terms for better vector search

  const searchQuery = await rewriteQuery(msg.text, claude);

  // ── Stage 1: Retrieval ────────────────────────────────────────────────────

  const [docChunks, expEntries] = await Promise.all([
    retrieveDocs(searchQuery, bot as Bot, msg.apiVersion),
    retrieveExperience(searchQuery, bot as Bot),
  ]);

  const groupContext = await getGroupContext(
    msg.chatId,
    msg.botId,
    bot.group_context_messages ?? 5,
  );

  // ── Stage 2: Sufficiency check ────────────────────────────────────────────

  const bestDocScore = docChunks[0]?.similarity ?? 0;
  console.log(
    `[pipeline] Retrieved ${docChunks.length} doc chunks (best: ${bestDocScore.toFixed(3)}), ` +
    `${expEntries.length} experience entries`
  );
  if (docChunks.length > 0) {
    docChunks.forEach((c, i) => {
      const src = [c.chunk.metadata?.doc_name, c.chunk.metadata?.section].filter(Boolean).join(' | ');
      console.log(`  chunk[${i}] ${c.similarity.toFixed(3)} — ${src}`);
    });
  }

  const lowConfidence = bestDocScore < 0.5 && expEntries.length === 0;
  const useWebSearch  = lowConfidence && bot.web_search_fallback;

  // ── Stage 3: Claude call ──────────────────────────────────────────────────

  const systemPrompt = bot.system_prompt || DEFAULT_SYSTEM_PROMPT;
  const model        = bot.llm_model || 'claude-haiku-4-5-20251001';
  const maxTokens    = bot.max_response_tokens || 1024;

  const webSearchQueries: string[] = [];
  const webSearchResults: { query: string; content: string }[] = [];

  let userPrompt = buildUserPrompt(
    msg.text, msg.apiVersion, docChunks, expEntries, groupContext,
  );

  let finalAnswer = '';
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;

  // Agentic loop — max 3 tool call rounds
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  for (let round = 0; round < 3; round++) {
    const response = await claude.messages.create({
      model,
      max_tokens:  maxTokens,
      system:      systemPrompt,
      messages,
      tools:       useWebSearch ? [WEB_SEARCH_TOOL] : [],
      tool_choice: useWebSearch ? { type: 'auto' } : undefined,
    });

    totalInputTokens  += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    if (response.stop_reason === 'end_turn') {
      // Extract text answer
      const textBlock = response.content.find((b) => b.type === 'text');
      finalAnswer = textBlock?.type === 'text' ? textBlock.text : '';
      break;
    }

    if (response.stop_reason === 'tool_use') {
      // Execute tool calls
      const toolUses = response.content.filter((b) => b.type === 'tool_use');
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        if (toolUse.type !== 'tool_use') continue;
        if (toolUse.name !== 'web_search') continue;

        const query = (toolUse.input as { query: string }).query;
        webSearchQueries.push(query);

        const result = await webSearch(query);
        const content = result?.content ?? 'No results found.';

        if (result) webSearchResults.push({ query, content: result.content });

        toolResults.push({
          type:        'tool_result',
          tool_use_id: toolUse.id,
          content,
        });
      }

      // Append assistant message + tool results and loop
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user',      content: toolResults });
      continue;
    }

    // Unexpected stop reason — break with whatever text we have
    const textBlock = response.content.find((b) => b.type === 'text');
    finalAnswer = textBlock?.type === 'text' ? textBlock.text : '';
    break;
  }

  if (!finalAnswer) {
    finalAnswer = "I couldn't find a clear answer for this — please reach out to the EximPe team directly.";
  }

  // ── Stage 4: Build result ─────────────────────────────────────────────────

  const sourcesUsed: string[] = [];
  if (docChunks.length > 0)  sourcesUsed.push('docs');
  if (expEntries.length > 0) sourcesUsed.push('experience');
  if (webSearchResults.length > 0) sourcesUsed.push('web');
  if (sourcesUsed.length === 0) sourcesUsed.push('fallback');

  return {
    answer:           finalAnswer,
    docChunksUsed:    docChunks,
    experienceUsed:   expEntries,
    webSearchUsed:    webSearchResults.length > 0,
    webSearchQueries,
    sourcesUsed,
    tokensInput:      totalInputTokens,
    tokensOutput:     totalOutputTokens,
    latencyMs:        Date.now() - startTime,
  };
}
