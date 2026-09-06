-- Promotes RAG chunk embeddings from portable JSON text to a pgvector column.
-- Dimension 768 suits most open sentence-embedding models; change it to match
-- the model you deploy, before any embeddings are written.

DO $$
BEGIN
    IF to_regclass('public.document_chunks') IS NULL THEN
        RAISE NOTICE 'document_chunks not created yet; skipping pgvector migration.';
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_chunks' AND column_name = 'embedding'
    ) THEN
        ALTER TABLE document_chunks ADD COLUMN embedding vector(768);
    END IF;

    CREATE INDEX IF NOT EXISTS ix_chunks_embedding
        ON document_chunks USING hnsw (embedding vector_cosine_ops);
END
$$;
