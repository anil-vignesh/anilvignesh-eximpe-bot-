const WEBHOOK_URL = process.env.WEBHOOK_URL!;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

function adminHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ADMIN_SECRET) headers['x-admin-secret'] = ADMIN_SECRET;
  return headers;
}

export async function patchBotStatus(botId: string, status: 'active' | 'inactive') {
  const res = await fetch(`${WEBHOOK_URL}/api/bots/${botId}/status`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify({ status }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function triggerCrawl(knowledgeBaseId: string, versions: string[]) {
  const res = await fetch(`${WEBHOOK_URL}/api/admin/crawl`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ knowledgeBaseId, versions }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function triggerIngestion(documentId: string, knowledgeBaseId: string) {
  const res = await fetch(`${WEBHOOK_URL}/api/admin/ingest`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ documentId, knowledgeBaseId }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
