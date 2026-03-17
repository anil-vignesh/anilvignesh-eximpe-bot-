import { Router, Request, Response } from 'express';
import { db } from '@eximpe-bot/shared';
import { registerWebhook, deregisterWebhook } from '../services/telegramWebhook';

const router: Router = Router();

/**
 * PATCH /api/bots/:id/status
 * Body: { status: 'active' | 'inactive' }
 *
 * Activating a Telegram bot triggers setWebhook.
 * Deactivating triggers deleteWebhook.
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  const { id }     = req.params;
  const { status } = req.body as { status: string };

  if (!['active', 'inactive'].includes(status)) {
    res.status(400).json({ error: 'status must be active or inactive' });
    return;
  }

  // Load bot
  const { data: bot, error: botErr } = await db
    .from('bots')
    .select('id, channel_type')
    .eq('id', id)
    .single();

  if (botErr || !bot) {
    res.status(404).json({ error: 'Bot not found', debug: botErr?.message ?? 'no row' });
    return;
  }

  // Update status
  const { error: updateErr } = await db
    .from('bots')
    .update({ status })
    .eq('id', id);

  if (updateErr) {
    res.status(500).json({ error: updateErr.message });
    return;
  }

  // Telegram webhook registration
  if (bot.channel_type === 'telegram') {
    try {
      if (status === 'active') {
        await registerWebhook(id);
        res.json({ status, webhook_registered: true });
      } else {
        await deregisterWebhook(id);
        res.json({ status, webhook_registered: false });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Status was updated but webhook registration failed — return partial success
      res.status(207).json({
        status,
        webhook_registered: false,
        webhook_error: message,
      });
    }
    return;
  }

  res.json({ status });
});

export default router;
