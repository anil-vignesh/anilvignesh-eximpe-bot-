-- Many-to-many: a bot can have multiple knowledge bases
CREATE TABLE IF NOT EXISTS bot_knowledge_bases (
  bot_id            uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_id, knowledge_base_id)
);

-- Migrate existing single-KB assignments from bots.knowledge_base_id
INSERT INTO bot_knowledge_bases (bot_id, knowledge_base_id)
SELECT id, knowledge_base_id
FROM bots
WHERE knowledge_base_id IS NOT NULL
ON CONFLICT DO NOTHING;
