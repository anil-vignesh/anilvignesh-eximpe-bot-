// Returns connection options for BullMQ by parsing REDIS_URL.
// Avoids a direct ioredis dependency (BullMQ ships its own).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRedis(): any {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');

  const parsed = new URL(url);
  return {
    host:                 parsed.hostname,
    port:                 parseInt(parsed.port || '6379', 10),
    password:             parsed.password || undefined,
    username:             parsed.username && parsed.username !== 'default' ? parsed.username : undefined,
    maxRetriesPerRequest: null,
  };
}
