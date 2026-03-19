import { Router, Request, Response } from 'express';
import { db } from '@eximpe-bot/shared';
import { resolveBotByPhoneNumberId } from '../pipeline/router';
import {
  parseWhatsAppPayload,
  sendWhatsAppMessage,
  sendWhatsAppGreeting,
  verifyWebhookSignature,
} from '../adapters/whatsapp';
import { runPipeline } from '../pipeline/index';
import { logAndLearn } from '../pipeline/experienceWriter';
import { getClaudeClient } from '../services/claude';

// ── Intent classification ─────────────────────────────────────────────────────

async function classifyIntent(text: string): Promise<boolean> {
  const prompt =
    `You are a classifier for an EximPe API support bot. ` +
    `EximPe is a cross-border payment gateway. The bot answers questions about API integration — ` +
    `payments, webhooks, authentication, UPI, mandates, refunds, settlements, errors, SDKs, etc.\n\n` +
    `Is the following message a technical question or request that the bot should answer?\n` +
    `Reply with exactly "yes" or "no".\n\n` +
    `Message: ${text.slice(0, 300)}`;

  try {
    const claude = getClaudeClient();
    const response = await claude.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 5,
      messages:   [{ role: 'user', content: prompt }],
    });
    const answer = response.content.find((b) => b.type === 'text');
    const raw = answer?.type === 'text' ? answer.text.trim().toLowerCase() : '';
    return raw.startsWith('yes');
  } catch {
    return true; // On error, allow through — better to answer than to silently drop
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

const router: Router = Router();

/**
 * GET /webhook/whatsapp
 * Meta sends this to verify the webhook URL is reachable.
 * Responds with hub.challenge when hub.verify_token matches WA_VERIFY_TOKEN.
 */
router.get('/', (req: Request, res: Response) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WA_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error('[whatsapp] WA_VERIFY_TOKEN is not set — cannot verify webhook');
    res.sendStatus(500);
    return;
  }

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[whatsapp] Webhook verified successfully');
    res.status(200).send(challenge);
    return;
  }

  console.warn('[whatsapp] Webhook verification failed — token mismatch');
  res.sendStatus(403);
});

/**
 * POST /webhook/whatsapp
 * Incoming messages from Meta Cloud API.
 */
router.post('/', async (req: Request, res: Response) => {
  // Always respond 200 immediately — Meta requires a fast ACK
  res.sendStatus(200);

  try {
    // 1. Verify webhook signature (skipped if WA_APP_SECRET is not set)
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (signature) {
      const rawBody = (req as any).rawBody as Buffer | undefined;
      if (rawBody && !verifyWebhookSignature(rawBody, signature)) {
        console.error('[whatsapp] Invalid webhook signature — dropping request');
        return;
      }
    }

    const payload = req.body;

    // 2. Extract phone_number_id to identify which bot this is for
    const phoneNumberId: string | undefined =
      payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    if (!phoneNumberId) {
      console.log('[whatsapp] No phone_number_id in payload — skipping');
      return;
    }

    // 3. Resolve bot by phone number
    const resolved = await resolveBotByPhoneNumberId(phoneNumberId);
    if (!resolved) {
      console.log(`[whatsapp] No active bot found for phone_number_id=${phoneNumberId}`);
      return;
    }

    const { bot, config } = resolved;

    if (!config.wa_phone_number_id || !config.wa_access_token) {
      console.log(`[whatsapp] Missing WA credentials for bot ${bot.id}`);
      return;
    }

    console.log(`[whatsapp] Payload for botId=${bot.id}:`, JSON.stringify(payload).slice(0, 300));

    // 4. Parse the incoming message
    const msg = await parseWhatsAppPayload(bot.id, payload);
    if (!msg) {
      // Status update, delivery receipt, or non-text — silently ignore
      return;
    }

    console.log(`[whatsapp] Message from ${msg.senderRef}: "${msg.text.slice(0, 80)}"`);

    // 5. Send greeting if this is the sender's first time (no assignment)
    const { data: assignment } = await db
      .from('bot_chat_assignments')
      .select('api_version')
      .eq('bot_id', bot.id)
      .eq('chat_id', msg.chatId)
      .maybeSingle();

    if (!assignment && config.send_greeting) {
      await sendWhatsAppGreeting(
        config.wa_phone_number_id,
        config.wa_access_token,
        msg.chatId,
        config,
        bot.name,
        null,
      );
    }

    // 6. Intent check — only respond to API-related questions
    const isApiRelated = await classifyIntent(msg.text);
    if (!isApiRelated) {
      console.log(`[whatsapp] Non-API message from ${msg.senderRef}: "${msg.text.slice(0, 80)}"`);
      await sendWhatsAppMessage(config.wa_phone_number_id, config.wa_access_token, {
        chatId:    msg.chatId,
        text:      "I can only help with EximPe API integration questions — payments, webhooks, authentication, UPI, mandates, refunds, and so on. For anything else, please reach out to the EximPe team directly.",
        replyToId: msg.messageId,
      });
      return;
    }

    // 7. Run pipeline
    const result = await runPipeline(msg);

    // 8. Send reply
    await sendWhatsAppMessage(config.wa_phone_number_id, config.wa_access_token, {
      chatId:    msg.chatId,
      text:      result.answer,
      replyToId: msg.messageId,
    });

    // 9. Log + async experience writer
    await logAndLearn(msg, result, bot);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[whatsapp webhook] Error:', message);
    // Don't re-throw — we already sent 200
  }
});

export default router;
