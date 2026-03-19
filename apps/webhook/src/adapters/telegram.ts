import axios from 'axios';
import { db } from '@eximpe-bot/shared';
import type { IncomingMessage, OutgoingMessage, BotChannelConfig } from '@eximpe-bot/shared';

// ── Telegram API types (minimal) ──────────────────────────────────────────────

interface TelegramUpdate {
  update_id:        number;
  message?:         TelegramMessage;
  my_chat_member?:  TelegramChatMemberUpdated;
}

interface TelegramMessage {
  message_id: number;
  from?:      TelegramUser;
  chat:       TelegramChat;
  text?:      string;
  entities?:  TelegramMessageEntity[];
}

interface TelegramUser {
  id:         number;
  username?:  string;
  is_bot?:    boolean;
}

interface TelegramChat {
  id:    number;
  type:  'private' | 'group' | 'supergroup' | 'channel';
}

interface TelegramMessageEntity {
  type:   string;
  offset: number;
  length: number;
}

interface TelegramChatMemberUpdated {
  chat:             TelegramChat;
  new_chat_member:  { user: TelegramUser; status: string };
}

// ── Inbound adapter ───────────────────────────────────────────────────────────

export async function parseTelegramUpdate(
  botId:   string,
  update:  TelegramUpdate,
): Promise<IncomingMessage | 'greeting' | null> {
  // Handle bot being added to a group
  if (update.my_chat_member) {
    const member = update.my_chat_member;
    if (member.new_chat_member.status === 'member' && member.new_chat_member.user.is_bot) {
      return 'greeting';
    }
    return null;
  }

  const msg = update.message;
  if (!msg || !msg.text) return null;

  // Ignore messages from bots (prevents responding to our own confirmations, other bots, etc.)
  if (msg.from?.is_bot) return null;

  const chat   = msg.chat;
  const chatId = String(chat.id);
  const isDm   = chat.type === 'private';

  // Load channel config to get bot username for mention detection
  const { data: config, error: configError } = await db
    .from('bot_channel_configs')
    .select('tg_bot_username')
    .eq('bot_id', botId)
    .single();

  if (configError) {
    console.warn(`[parseTelegramUpdate] Failed to load bot_channel_configs for bot ${botId}: ${configError.message}`);
  }
  const botUsername = config?.tg_bot_username ?? '';

  // In groups: require @mention
  if (!isDm) {
    const mentioned = isMentioned(msg, botUsername);
    if (!mentioned) return null;
  }

  // Strip @mention from text
  const text = stripMention(msg.text, botUsername).trim();
  if (!text) return null;

  // Resolve sender ref: prefer @username, fall back to user_id string
  const senderRef = msg.from?.username
    ? `@${msg.from.username}`
    : String(msg.from?.id ?? 'unknown');

  // Look up api_version from chat assignment
  const { data: assignment } = await db
    .from('bot_chat_assignments')
    .select('api_version')
    .eq('bot_id', botId)
    .eq('chat_id', chatId)
    .maybeSingle();

  // For DMs without an assignment, use a default version
  const apiVersion = assignment?.api_version ?? '1.0.0';

  return {
    botId,
    channelType: 'telegram',
    chatId,
    messageId:   String(msg.message_id),
    senderRef,
    text,
    apiVersion,
    rawPayload:  update,
  };
}

// ── Outbound adapter ──────────────────────────────────────────────────────────

export async function sendTelegramMessage(
  token:   string,
  out:     OutgoingMessage,
): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  // Escape reserved MarkdownV2 characters
  const escapedText = escapeMarkdownV2(out.text);

  try {
    await axios.post(url, {
      chat_id:      out.chatId,
      text:         escapedText,
      parse_mode:   'MarkdownV2',
      reply_parameters: {
        message_id: parseInt(out.replyToId, 10),
      },
    });
  } catch (err: any) {
    const tgError = err?.response?.data?.description ?? 'unknown';
    console.error(`[sendTelegramMessage] Telegram error: ${tgError} | chat_id=${out.chatId} | replyToId=${out.replyToId}`);

    // Retry with plain text — drop reply_parameters in case that's the issue
    try {
      await axios.post(url, {
        chat_id: out.chatId,
        text:    out.text,
      });
    } catch (retryErr: any) {
      const retryTgError = retryErr?.response?.data?.description ?? 'unknown';
      console.error(`[sendTelegramMessage] Retry also failed: ${retryTgError} | chat_id=${out.chatId}`);
      throw retryErr;
    }
  }
}

// ── Greeting sender ───────────────────────────────────────────────────────────

export async function sendTelegramGreeting(
  token:      string,
  chatId:     string,
  config:     BotChannelConfig,
  botName:    string,
  apiVersion: string | null,
): Promise<void> {
  const DEFAULT_GREETING =
    `👋 Hi\\! I'm the EximPe Integration Assistant\\.\n\n` +
    `I can help answer questions about the EximPe API — endpoints, authentication, webhooks, error codes, payment flows, and more\\.\n\n` +
    `Just @mention me with your question and I'll do my best to help\\.\n\n` +
    (apiVersion ? `📌 This group is configured for *EximPe API v${escapeMarkdownV2(apiVersion)}*\\.\n\n` : '') +
    `If I can't find an answer, I'll let you know and point you to the right contact\\.`;

  let text = config.greeting_message_tg ?? DEFAULT_GREETING;

  // Substitute template variables (stored unescaped)
  text = text
    .replace('{bot_name}', botName)
    .replace('{api_version}', apiVersion ?? '');

  // Apply MarkdownV2 escaping if using custom (unescaped) greeting
  if (config.greeting_message_tg) {
    text = escapeMarkdownV2(text);
  }

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id:    chatId,
      text,
      parse_mode: 'MarkdownV2',
    });
  } catch (err: unknown) {
    // Best-effort — don't fail if greeting doesn't send
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[sendTelegramGreeting] Failed to send greeting to ${chatId}: ${msg}`)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isMentioned(msg: TelegramMessage, botUsername: string): boolean {
  if (!botUsername) return false;
  const mention = `@${botUsername}`.toLowerCase();
  return (msg.text ?? '').toLowerCase().includes(mention);
}

function stripMention(text: string, botUsername: string): string {
  if (!botUsername) return text;
  const escapedUsername = botUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mentionRegex = new RegExp(`@${escapedUsername}`, 'gi');
  return text.replace(mentionRegex, '').trim();
}

/**
 * Escape reserved MarkdownV2 characters.
 * Telegram MarkdownV2 reserved: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
