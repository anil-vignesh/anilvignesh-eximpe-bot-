import axios from 'axios';
import { db } from '@eximpe-bot/shared';

/**
 * Register a Telegram webhook for a bot.
 * Called when bot status is set to 'active'.
 */
export async function registerWebhook(botId: string): Promise<void> {
  const webhookBase = process.env.WEBHOOK_BASE_URL;
  if (!webhookBase) throw new Error('WEBHOOK_BASE_URL is not set');

  const { data: config, error } = await db
    .from('bot_channel_configs')
    .select('tg_bot_token')
    .eq('bot_id', botId)
    .single();

  if (error || !config?.tg_bot_token) {
    throw new Error(`No Telegram token found for bot ${botId}`);
  }

  const webhookUrl = `${webhookBase}/webhook/telegram/${botId}`;
  const token      = config.tg_bot_token;

  const response = await axios.post(
    `https://api.telegram.org/bot${token}/setWebhook`,
    { url: webhookUrl },
  );

  if (!response.data?.ok) {
    throw new Error(`Telegram setWebhook failed: ${response.data?.description}`);
  }

  await db
    .from('bot_channel_configs')
    .update({ tg_webhook_registered: true })
    .eq('bot_id', botId);

  console.log(`[telegramWebhook] ✓ Webhook registered for bot ${botId}: ${webhookUrl}`);
}

/**
 * Deregister the Telegram webhook for a bot.
 * Called when bot status is set to 'inactive'.
 */
export async function deregisterWebhook(botId: string): Promise<void> {
  const { data: config, error } = await db
    .from('bot_channel_configs')
    .select('tg_bot_token')
    .eq('bot_id', botId)
    .single();

  if (error || !config?.tg_bot_token) return; // already gone, no-op

  const token = config.tg_bot_token;

  await axios.post(`https://api.telegram.org/bot${token}/deleteWebhook`);

  await db
    .from('bot_channel_configs')
    .update({ tg_webhook_registered: false })
    .eq('bot_id', botId);

  console.log(`[telegramWebhook] ✓ Webhook deregistered for bot ${botId}`);
}
