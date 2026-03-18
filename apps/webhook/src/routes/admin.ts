import { Router, Request, Response } from 'express';
import { enqueueCrawl } from '../queue/crawl.worker';
import { enqueueIngestion } from '../queue/ingestion.queue';

const router: Router = Router();

/**
 * POST /api/admin/crawl
 * Body: { knowledgeBaseId: string, versions: string[] }
 * Enqueues a crawl job for the given KB and versions.
 */
router.post('/crawl', async (req: Request, res: Response) => {
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
  const { documentId, knowledgeBaseId } = req.body as { documentId: string; knowledgeBaseId: string };
  if (!documentId || !knowledgeBaseId) {
    res.status(400).json({ error: 'documentId and knowledgeBaseId are required' });
    return;
  }
  await enqueueIngestion(documentId, knowledgeBaseId);
  res.json({ queued: true, documentId });
});

export default router;
