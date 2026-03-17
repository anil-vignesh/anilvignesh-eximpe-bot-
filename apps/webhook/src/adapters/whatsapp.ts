// WhatsApp adapter — V2
// Inbound and outbound adapters for Meta Cloud API will be implemented here.
import type { IncomingMessage, OutgoingMessage } from '@eximpe-bot/shared';

export async function parseWhatsAppPayload(
  _payload: unknown,
): Promise<IncomingMessage | null> {
  throw new Error('WhatsApp adapter not implemented in V1');
}

export async function sendWhatsAppMessage(_out: OutgoingMessage): Promise<void> {
  throw new Error('WhatsApp adapter not implemented in V1');
}
