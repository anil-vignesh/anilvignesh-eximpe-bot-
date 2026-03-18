import { Router, Request, Response } from 'express';
import { db } from '@eximpe-bot/shared';
import { resolveBot } from '../pipeline/router';
import { parseTelegramUpdate, sendTelegramMessage, sendTelegramGreeting } from '../adapters/telegram';
import { runPipeline } from '../pipeline/index';
import { logAndLearn } from '../pipeline/experienceWriter';

const router: Router = Router();

router.post('/:botId', async (req: Request, res: Response) => {
  const { botId } = req.params;

  // Always respond 200 immediately — Telegram requires fast ACK
  res.sendStatus(200);

  try {
    // 1. Resolve bot — silently ignore if inactive or not found
    const resolved = await resolveBot(botId);
    if (!resolved) return;

    const { bot, config } = resolved;
    if (!config.tg_bot_token) return;

    const update = req.body;

    // 2. Parse update
    const parsed = await parseTelegramUpdate(botId, update);
    if (!parsed) return;

    // 3. Handle greeting (bot added to group)
    if (parsed === 'greeting') {
      if (!config.send_greeting) return;

      const chatId = String(
        update.my_chat_member?.chat?.id ?? update.message?.chat?.id,
      );
      if (!chatId) return;

      // Get api_version from assignment if it exists
      const { data: assignment } = await db
        .from('bot_chat_assignments')
        .select('api_version')
        .eq('bot_id', botId)
        .eq('chat_id', chatId)
        .maybeSingle();

      await sendTelegramGreeting(
        config.tg_bot_token,
        chatId,
        config,
        bot.name,
        assignment?.api_version ?? null,
      );

      // Log unrecognised chat if no assignment exists
      if (!assignment) {
        await db.from('unrecognised_chats').insert({
          channel_type: 'telegram',
          chat_id:      chatId,
        });
      }

      // Log the greeting
      await db.from('conversation_logs').insert({
        bot_id:       botId,
        channel_type: 'telegram',
        chat_id:      chatId,
        question:     '[BOT_JOINED]',
        answer:       'Greeting sent',
        sources_used: [],
      });

      return;
    }

    const msg = parsed;

    // 4. Run reasoning pipeline
    const result = await runPipeline(msg);

    // 5. Send reply
    await sendTelegramMessage(config.tg_bot_token, {
      chatId:    msg.chatId,
      text:      result.answer,
      replyToId: msg.messageId,
    });

    // 6. Log + async experience writer
    await logAndLearn(msg, result, bot);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[telegram webhook] Error for bot ${req.params.botId}:`, message);
    // Don't re-throw — we already sent 200
  }
});

export default router;
