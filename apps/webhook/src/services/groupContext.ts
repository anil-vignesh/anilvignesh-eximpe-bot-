import { db } from '@eximpe-bot/shared';

/**
 * Fetch the last N conversation log entries for a given chat,
 * formatted as a readable conversation thread for the prompt.
 */
export async function getGroupContext(
  chatId: string,
  botId:  string,
  limit:  number,
): Promise<string> {
  if (limit <= 0) return '';

  const { data, error } = await db
    .from('conversation_logs')
    .select('sender_ref, question, answer, created_at')
    .eq('chat_id', chatId)
    .eq('bot_id', botId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) return '';

  // Reverse so oldest is first
  const lines = data.reverse().flatMap((row: { sender_ref: string | null; question: string; answer: string }) => [
    `[${row.sender_ref ?? 'unknown'}]: ${row.question}`,
    `[Bot]: ${row.answer}`,
  ]);

  return lines.join('\n');
}
