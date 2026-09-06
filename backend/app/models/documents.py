"""RAG models: Document, DocumentChunk, Embedding and Source.

Embeddings are stored as JSON text on SQLite and promoted to a real pgvector
column by database/migrations/003_pgvector.sql on PostgreSQL. The retrieval
path works identically either way — only the similarity search changes from
Python to an indexed SQL operator.

No LLM is required: the default embedder is a deterministic TF-IDF projection
fitted on the corpus itself, so retrieval works offline and reproducibly.
"""

from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import SourceMixin, TimestampMixin


class Source(Base, TimestampMixin):
    """Provenance record for a retrievable document.

    Kept distinct from `data_sources` (which describes tabular datasets): this
    describes documents the Copilot may quote, so an answer can always name
    the document and authority it came from.
    """

    __tablename__ = "rag_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    authority: Mapped[str | None] = mapped_column(String(200))
    source_url: Mapped[str | None] = mapped_column(String(500))
    source_type: Mapped[str] = mapped_column(String(80), nullable=False)
    verification_status: Mapped[str] = mapped_column(String(40), default="demonstration", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    documents: Mapped[list["Document"]] = relationship(back_populates="source")


class Document(Base, TimestampMixin, SourceMixin):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("rag_sources.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    source: Mapped[Source | None] = relationship(back_populates="documents")
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class DocumentChunk(Base, TimestampMixin):
    __tablename__ = "document_chunks"
    __table_args__ = (UniqueConstraint("document_id", "chunk_index", name="uq_chunk_position"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_estimate: Mapped[int | None] = mapped_column(Integer)

    document: Mapped[Document] = relationship(back_populates="chunks")
    embedding: Mapped["Embedding"] = relationship(
        back_populates="chunk", uselist=False, cascade="all, delete-orphan"
    )


class Embedding(Base, TimestampMixin):
    """Vector for one chunk.

    `vector_json` is the portable representation. On PostgreSQL the migration
    adds a `vector(N)` column alongside it for indexed similarity search.
    """

    __tablename__ = "embeddings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    chunk_id: Mapped[int] = mapped_column(
        ForeignKey("document_chunks.id", ondelete="CASCADE"), unique=True, index=True
    )
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    dimensions: Mapped[int] = mapped_column(Integer, nullable=False)
    norm: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    vector_json: Mapped[str] = mapped_column(Text, nullable=False)

    chunk: Mapped[DocumentChunk] = relationship(back_populates="embedding")
