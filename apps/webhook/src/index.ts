import 'dotenv/config';
import express, { type Express } from 'express';
import telegramRouter from './routes/telegram';
import whatsappRouter from './routes/whatsapp';
import botsRouter from './routes/bots';
import adminRouter from './routes/admin';
import { startIngestionWorker } from './queue/ingestion.worker';
import { startCrawlWorker } from './queue/crawl.worker';

const app: Express = express();
const PORT = process.env.PORT ?? 3001;

// Capture the raw body buffer before JSON parsing (needed for WhatsApp signature verification)
app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Webhook routes ────────────────────────────────────────────────────────────

app.use('/webhook/telegram', telegramRouter);
app.use('/webhook/whatsapp', whatsappRouter);
app.use('/api/bots', botsRouter);
app.use('/api/admin', adminRouter);

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] Webhook server running on port ${PORT}`);
});

// Start Bull workers if Redis is configured
if (process.env.REDIS_URL) {
  startIngestionWorker();
  startCrawlWorker();
  console.log('[server] Bull workers started');
} else {
  console.warn('[server] REDIS_URL not set — Bull workers not started');
}

export default app;
