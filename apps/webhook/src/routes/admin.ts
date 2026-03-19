import { Router, Request, Response } from 'express';
import { enqueueCrawl } from '../queue/crawl.worker';
import { enqueueIngestion } from '../queue/ingestion.queue';

const router: Router = Router();

export function requireAdminSecret(req: Request, res: Response): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    console.error('[admin] ADMIN_SECRET env var is not set — denying request to prevent open access');
    res.status(503).json({ error: 'Admin endpoint not configured' });
    return false;
  }
  if (req.headers['x-admin-secret'] !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/**
 * POST /api/admin/crawl
 * Body: { knowledgeBaseId: string, versions: string[] }
 * Enqueues a crawl job for the given KB and versions.
 */
router.post('/crawl', async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return;
  const { knowledgeBaseId, versions } = req.body as {
    knowledgeBaseId: string;
    versions: string[];
  };

  if (!knowledgeBaseId || !Array.isArray(versions) || versions.length === 0) {
    res.status(400).json({ error: 'knowledgeBaseId and versions[] are required' });
    return;
  }

  await enqueueCrawl(knowledgeBaseId, versions);
  res.json({ queued: true, knowledgeBaseId, versions });
});

router.post('/ingest', async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return;
  const { documentId, knowledgeBaseId } = req.body as { documentId: string; knowledgeBaseId: string };
  if (!documentId || !knowledgeBaseId) {
    res.status(400).json({ error: 'documentId and knowledgeBaseId are required' });
    return;
  }
  await enqueueIngestion(documentId, knowledgeBaseId);
  res.json({ queued: true, documentId });
});

export default router;
