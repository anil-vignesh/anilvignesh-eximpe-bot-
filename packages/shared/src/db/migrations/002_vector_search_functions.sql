-- ── match_document_chunks ─────────────────────────────────────────────────────
-- Version-aware cosine similarity search over document_chunks.
-- p_api_version:
--   - non-null string → match chunks WHERE metadata->>'api_version' = p_api_version
--   - null            → match chunks WHERE metadata->>'api_version' IS NULL (unversioned)

CREATE OR REPLACE FUNCTION match_document_chunks(
  p_knowledge_base_id UUID,
  p_embedding         TEXT,     -- JSON array string
  p_match_count       INT,
  p_threshold         FLOAT,
  p_api_version       TEXT      -- null for unversioned fallback
)
RETURNS TABLE (
  id                UUID,
  document_id       UUID,
  content           TEXT,
  metadata          JSONB,
  similarity        FLOAT,
  created_at        TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_embedding VECTOR(1024);
BEGIN
  v_embedding := p_embedding::VECTOR(1024);

  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> v_embedding) AS similarity,
    dc.created_at
  FROM document_chunks dc
  WHERE
    dc.knowledge_base_id = p_knowledge_base_id
    AND (
      CASE
        WHEN p_api_version IS NOT NULL
          THEN dc.metadata->>'api_version' = p_api_version
        ELSE
          dc.metadata->>'api_version' IS NULL
      END
    )
    AND 1 - (dc.embedding <=> v_embedding) >= p_threshold
  ORDER BY dc.embedding <=> v_embedding
  LIMIT p_match_count;
END;
$$;

-- ── match_experience_entries ──────────────────────────────────────────────────
-- Cosine similarity search over experience_entries across multiple stores.

CREATE OR REPLACE FUNCTION match_experience_entries(
  p_store_ids   UUID[],
  p_embedding   TEXT,     -- JSON array string
  p_match_count INT,
  p_threshold   FLOAT
)
RETURNS TABLE (
  id                    UUID,
  experience_store_id   UUID,
  source_log_id         UUID,
  question_summary      TEXT,
  answer_summary        TEXT,
  tags                  TEXT[],
  quality_score         FLOAT,
  use_count             INT,
  status                TEXT,
  source_type           TEXT,
  similarity            FLOAT,
  created_at            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_embedding VECTOR(1024);
BEGIN
  v_embedding := p_embedding::VECTOR(1024);

  RETURN QUERY
  SELECT
    ee.id,
    ee.experience_store_id,
    ee.source_log_id,
    ee.question_summary,
    ee.answer_summary,
    ee.tags,
    ee.quality_score,
    ee.use_count,
    ee.status,
    ee.source_type,
    1 - (ee.embedding <=> v_embedding) AS similarity,
    ee.created_at,
    ee.updated_at
  FROM experience_entries ee
  WHERE
    ee.experience_store_id = ANY(p_store_ids)
    AND ee.status = 'active'
    AND 1 - (ee.embedding <=> v_embedding) >= p_threshold
  ORDER BY ee.embedding <=> v_embedding
  LIMIT p_match_count;
END;
$$;
