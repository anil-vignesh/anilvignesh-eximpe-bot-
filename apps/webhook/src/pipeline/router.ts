import { db } from '@eximpe-bot/shared';
import type { Bot, BotChannelConfig } from '@eximpe-bot/shared';

export interface ResolvedBot {
  bot:    Bot;
  config: BotChannelConfig;
}

/**
 * Look up a bot by ID and return it with its channel config.
 * Returns null if the bot doesn't exist, is inactive, or has no config.
 */
export async function resolveBot(botId: string): Promise<ResolvedBot | null> {
  const { data: bot, error } = await db
    .from('bots')
    .select('*')
    .eq('id', botId)
    .eq('status', 'active')
    .single();

  if (error || !bot) return null;

  const { data: config } = await db
    .from('bot_channel_configs')
    .select('*')
    .eq('bot_id', botId)
    .single();

  if (!config) return null;

  return { bot: bot as Bot, config: config as BotChannelConfig };
}

/**
 * Look up a WhatsApp bot by its phone number ID.
 * Meta sends all webhooks to one endpoint — we identify the bot from the payload's metadata.
 */
export async function resolveBotByPhoneNumberId(phoneNumberId: string): Promise<ResolvedBot | null> {
  const { data: config } = await db
    .from('bot_channel_configs')
    .select('bot_id')
    .eq('wa_phone_number_id', phoneNumberId)
    .maybeSingle();

  if (!config) return null;

  return resolveBot(config.bot_id);
}

/**
 * Look up which bot is assigned to a given chat.
 * Used for WhatsApp routing (V2).
 */
export async function resolveBotByChat(
  channelType: string,
  chatId:      string,
): Promise<ResolvedBot | null> {
  const { data: assignment } = await db
    .from('bot_chat_assignments')
    .select('bot_id')
    .eq('channel_type', channelType)
    .eq('chat_id', chatId)
    .maybeSingle();

  if (!assignment) return null;

  return resolveBot(assignment.bot_id);
}
