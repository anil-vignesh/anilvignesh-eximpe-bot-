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
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  // Telegram webhook registration — attempt BEFORE updating DB to keep state consistent
  if (bot.channel_type === 'telegram') {
    if (status === 'active') {
      try {
        await registerWebhook(id);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        // Webhook registration failed — mark bot as error so DB reflects reality
        await db.from('bots').update({ status: 'error' }).eq('id', id);
        res.status(502).json({
          status: 'error',
          webhook_registered: false,
          webhook_error: message,
        });
        return;
      }
    } else {
      // Best-effort deregistration — proceed even if it fails
      try {
        await deregisterWebhook(id);
      } catch {
        // Ignore — webhook may already be gone
      }
    }
  }

  // Update DB status only after webhook operation succeeded (or was skipped)
  const { error: updateErr } = await db
    .from('bots')
    .update({ status })
    .eq('id', id);

  if (updateErr) {
    res.status(500).json({ error: updateErr.message });
    return;
  }

  if (bot.channel_type === 'telegram') {
    res.json({ status, webhook_registered: status === 'active' });
    return;
  }

  res.json({ status });
});

export default router;
