import axios from 'axios';
import crypto from 'crypto';
import { db } from '@eximpe-bot/shared';
import type { IncomingMessage, OutgoingMessage, BotChannelConfig } from '@eximpe-bot/shared';

// ── Meta Cloud API payload types ──────────────────────────────────────────────

interface WAMetadata {
  display_phone_number: string;
  phone_number_id:      string;
}

interface WAContact {
  profile: { name: string };
  wa_id:   string;
}

interface WATextMessage {
  from:      string;
  id:        string;
  timestamp: string;
  type:      string;
  text?:     { body: string };
}

interface WAValue {
  messaging_product: string;
  metadata:          WAMetadata;
  contacts?:         WAContact[];
  messages?:         WATextMessage[];
  statuses?:         unknown[];
}

interface WAPayload {
  object: string;
  entry:  Array<{
    id:      string;
    changes: Array<{ value: WAValue; field: string }>;
  }>;
}

// ── Inbound adapter ───────────────────────────────────────────────────────────

/**
 * Parse an incoming Meta Cloud API webhook payload into a normalised IncomingMessage.
 * Returns null for status updates, non-text messages, or empty payloads.
 */
export async function parseWhatsAppPayload(
  botId:   string,
  payload: unknown,
): Promise<IncomingMessage | null> {
  const body = payload as WAPayload;
  if (body.object !== 'whatsapp_business_account') return null;

  const entry  = body.entry?.[0];
  const change = entry?.changes?.find((c) => c.field === 'messages');
  if (!change) return null;

  const value    = change.value;
  const messages = value.messages;
  if (!messages || messages.length === 0) return null;

  const msg = messages[0];

  // Only handle incoming text messages — skip delivery receipts, reactions, etc.
  if (msg.type !== 'text' || !msg.text?.body) return null;

  const chatId = msg.from;   // sender's WhatsApp ID (phone number)
  const text   = msg.text.body.trim();
  if (!text) return null;

  // Look up api_version from chat assignment (if one exists for this sender)
  const { data: assignment } = await db
    .from('bot_chat_assignments')
    .select('api_version')
    .eq('bot_id', botId)
    .eq('chat_id', chatId)
    .maybeSingle();

  // Track unknown senders so the dashboard can prompt to assign them
  if (!assignment) {
    await db
      .from('unrecognised_chats')
      .upsert(
        { channel_type: 'whatsapp', chat_id: chatId },
        { onConflict: 'channel_type,chat_id', ignoreDuplicates: true },
      );
  }

  const apiVersion = assignment?.api_version ?? '1.0.0';

  return {
    botId,
    channelType: 'whatsapp',
    chatId,
    messageId:  msg.id,
    senderRef:  chatId,   // WhatsApp ID (phone number) is the sender ref
    text,
    apiVersion,
    rawPayload: payload,
  };
}

// ── Outbound adapter ──────────────────────────────────────────────────────────

export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken:   string,
  out:           OutgoingMessage,
): Promise<void> {
  const url  = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const body = markdownToWhatsApp(out.text);

  try {
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                out.chatId,
        type:              'text',
        text:              { body, preview_url: false },
        context:           { message_id: out.replyToId },
      },
      {
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (err: unknown) {
    const waError = (err as any)?.response?.data?.error?.message ?? 'unknown';
    console.error(`[sendWhatsAppMessage] Error: ${waError} | to=${out.chatId}`);
    throw err;
  }
}

// ── Greeting sender ───────────────────────────────────────────────────────────

export async function sendWhatsAppGreeting(
  phoneNumberId: string,
  accessToken:   string,
  chatId:        string,
  config:        BotChannelConfig,
  botName:       string,
  apiVersion:    string | null,
): Promise<void> {
  const DEFAULT_GREETING =
    `👋 Hi! I'm the EximPe Integration Assistant.\n\n` +
    `I can help answer questions about the EximPe API — endpoints, authentication, webhooks, error codes, payment flows, and more.\n\n` +
    (apiVersion ? `📌 This chat is configured for *EximPe API v${apiVersion}*.\n\n` : '') +
    `If I can't find an answer, I'll let you know and point you to the right contact.`;

  let text = config.greeting_message_wa ?? DEFAULT_GREETING;
  text = text
    .replace('{bot_name}', botName)
    .replace('{api_version}', apiVersion ?? '');

  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to:                chatId,
        type:              'text',
        text:              { body: text },
      },
      {
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (err: unknown) {
    // Best-effort — don't fail on greeting error
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[sendWhatsAppGreeting] Failed to send to ${chatId}: ${msg}`);
  }
}

// ── Webhook signature verification ───────────────────────────────────────────

/**
 * Verify the X-Hub-Signature-256 header that Meta attaches to every POST.
 * Requires WA_APP_SECRET to be set. If it isn't, verification is skipped
 * with a warning (useful during initial setup before credentials arrive).
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const appSecret = process.env.WA_APP_SECRET;
  if (!appSecret) {
    console.warn('[whatsapp] WA_APP_SECRET not set — skipping signature verification');
    return true;
  }
  const expected = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Text formatter ────────────────────────────────────────────────────────────

/**
 * Convert Claude's Markdown output to WhatsApp-compatible formatting.
 *
 * WhatsApp supports (WhatsApp Business Messaging API format):
 *   *bold*   _italic_   ~strikethrough~   `inline code`   ```code block```
 *
 * Claude outputs standard Markdown:
 *   **bold**  *italic*  _italic_  ~~strikethrough~~  # Header
 */
export function markdownToWhatsApp(text: string): string {
  return text
    // Preserve code blocks (process before anything else to avoid mangling content)
    .replace(/```[\w]*\n([\s\S]*?)```/g, (_m, code) => '```\n' + code.trim() + '\n```')
    // Bold: **text** → *text*
    .replace(/\*\*(.+?)\*\*/gs, '*$1*')
    // Strikethrough: ~~text~~ → ~text~
    .replace(/~~(.+?)~~/gs, '~$1~')
    // Headers: ## Title → *Title* (bold, drop the #)
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    // Italic: *text* (not already bold) → _text_
    // Use a negative lookbehind/lookahead to skip already-converted *bold*
    .replace(/(?<![*_])\*(?!\*)(.+?)(?<!\*)\*(?![*_])/gs, '_$1_')
    .trim();
}
