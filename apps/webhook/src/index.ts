import 'dotenv/config';
import express from 'express';
import telegramRouter from './routes/telegram';
import whatsappRouter from './routes/whatsapp';
import botsRouter from './routes/bots';
import { startIngestionWorker } from './queue/ingestion.worker';
import { startCrawlWorker } from './queue/crawl.worker';

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Webhook routes ────────────────────────────────────────────────────────────

app.use('/webhook/telegram', telegramRouter);
app.use('/webhook/whatsapp', whatsappRouter);
app.use('/api/bots', botsRouter);

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
