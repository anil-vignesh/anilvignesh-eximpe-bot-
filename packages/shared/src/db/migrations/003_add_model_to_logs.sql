-- Add model column to conversation_logs so cost calculation knows which
-- Claude model was used per conversation (model is configurable per bot).
ALTER TABLE conversation_logs
  ADD COLUMN IF NOT EXISTS model TEXT;
