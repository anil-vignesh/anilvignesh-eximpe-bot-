/**
 * One-off script: inserts a synthetic summary chunk for the v1 webhooks overview doc.
 * This chunk lists all 6 event type codes explicitly so the bot can answer
 * "what webhooks do you send?" without hallucinating names.
 *
 * Run: pnpm --filter webhook exec ts-node-dev --transpile-only src/scripts/add-webhook-summary-chunk.ts
 */

import 'dotenv/config';
import { db } from '@eximpe-bot/shared';
import { embedText } from '../services/voyage';

const DOCUMENT_ID      = 'f4f7e3c8-9945-4e6f-b7f9-00e41edf4ac4'; // [v1] web-integration / webhooks
const KNOWLEDGE_BASE_ID = '88b07b02-4e34-46ac-85f8-479e66fe7ace';

const SUMMARY = `
EximPe Webhook Events — Complete Reference (v1)

We send webhooks for 6 event types. The event_type field in every payload uses one of these exact values:

| event_type          | When it fires                                      |
|---------------------|----------------------------------------------------|
| PAYMENT_SUCCESSFUL  | Customer completes a payment transaction           |
| PAYMENT_FAILED      | A payment attempt fails                            |
| PAYMENT_REFUNDED    | A refund is processed                              |
| PAYMENT_SETTLED     | Funds are transferred to the merchant account      |
| SUBSCRIPTION_STATUS | A subscription's status changes or updates         |
| MERCHANT_APPROVED   | A merchant account is approved and activated       |

Every webhook payload includes a common envelope:
- event_type: one of the 6 values above
- event_time: timestamp (YYYY-MM-DD HH:MM:SS)
- version: "1.0"
- sequence_number: unique UUID per event
- data: event-specific payload object

Webhooks are delivered via POST to your configured webhook_url.
Signature verification uses HMAC-SHA256 with the X-Webhook-Signature header.
`.trim();

(async () => {
  console.log('Embedding summary chunk...');
  const embedding = await embedText(SUMMARY);

  const { error } = await db.from('document_chunks').insert({
    document_id:       DOCUMENT_ID,
    knowledge_base_id: KNOWLEDGE_BASE_ID,
    content:           SUMMARY,
    embedding:         JSON.stringify(embedding),
    metadata: {
      doc_name:    '[v1] web-integration / webhooks — event reference',
      section:     'Webhook Event Types',
      api_version: '1',
      synthetic:   true,
    },
  });

  if (error) {
    console.error('Insert failed:', error.message);
    process.exit(1);
  }

  console.log('✓ Webhook summary chunk inserted');
  process.exit(0);
})();
