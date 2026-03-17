import { Router, Request, Response } from 'express';

const router: Router = Router();

// V2 — placeholder
router.get('/', (req: Request, res: Response) => {
  res.sendStatus(200);
});

router.post('/', (req: Request, res: Response) => {
  res.sendStatus(200);
});

export default router;
