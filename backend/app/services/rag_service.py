"""Retrieval-augmented generation over the platform's own knowledge base.

The corpus is built from what NIRMAN AI can actually vouch for: the government
scheme reference table, the data-source registry, the engine methodology and
the platform's standing policies. Nothing is scraped and nothing is invented.

Embeddings come from a deterministic TF-IDF + SVD projection fitted on the
corpus, so retrieval works with no LLM, no API key and no network — and gives
the same answer every run. Swapping in a hosted embedding model later means
replacing `embed_corpus`; the retrieval contract does not change.
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.constants import DataStatus
from app.models import Document, DocumentChunk, Embedding, GovernmentScheme, Source
from app.models.registry import DataSource

log = logging.getLogger(__name__)

EMBED_MODEL = "tfidf-svd-128 (deterministic, offline)"
EMBED_DIMS = 128
CHUNK_CHARS = 700
CHUNK_OVERLAP = 90


# ---------------------------------------------------------------------------
# Corpus construction
# ---------------------------------------------------------------------------

METHODOLOGY_DOCS: list[tuple[str, str, str]] = [
    (
        "Site suitability methodology",
        "methodology",
        "NIRMAN AI scores candidate sites with a deterministic weighted multi-criteria analysis "
        "over nine factors: population coverage, accessibility, flood safety, land suitability, "
        "infrastructure gap, terrain, water availability, electricity availability and distance "
        "from existing facilities. Each factor is normalised to a 0-100 scale before weighting, "
        "and the weights must total 100 percent. Recommendation tiers are: 83 to 100 Recommended, "
        "75 to 82 Consider, 70 to 74 Further Assessment Required, and below 70 Not Recommended. "
        "Continuous factors are normalised relative to the assessed candidate set because site "
        "selection is comparative, while categorical factors such as flood risk and terrain keep "
        "absolute ordinal scores. Land availability is scored against the acreage the specific "
        "facility type requires rather than a fixed threshold. No language model participates in "
        "site scoring.",
    ),
    (
        "Explainability methodology",
        "methodology",
        "For the deterministic engine, NIRMAN AI reports exact weighted contributions rather than "
        "an approximation. Each factor's contribution is its deviation from a neutral 50 out of "
        "100 baseline multiplied by its weight, so the baseline plus all contributions equals the "
        "final score. When the machine-learned provider is selected, SHAP values explain the "
        "model's prediction and are additive in the same way: the base value plus all SHAP "
        "contributions equals the prediction. SHAP explains what the model did; it does not "
        "validate whether the score is correct.",
    ),
    (
        "Risk methodology",
        "methodology",
        "Risk classification is rule-based and is not a validated flood forecast. Four components "
        "are combined: flood vulnerability at 40 percent, terrain risk at 25 percent, "
        "accessibility risk at 20 percent and construction delay risk at 15 percent. Terrain risk "
        "is the inverse of terrain suitability. The composite maps to bands: 85 and above Very "
        "High, 65 and above High, 40 and above Medium, otherwise Low. IoT sensor readings feed "
        "this engine as a live overlay but never decide anything on their own.",
    ),
    (
        "Cost estimation methodology",
        "methodology",
        "Cost outputs are planning-level only and are never an approved government cost. When a "
        "project carries a portfolio budget, that figure is treated as the all-in total and is "
        "decomposed into civil works, labour, machinery, materials and contingency, rather than "
        "being inflated further. Without a known budget, an indicative base rate for the project "
        "type is scaled and contingency is added on top. The risk classification drives the "
        "contingency band: Low 8 percent, Medium 12 percent, High 18 percent, Very High 24 "
        "percent. Estimates exclude land acquisition, rehabilitation, statutory fees and price "
        "escalation, and must be reconciled through a detailed engineering DPR before tender.",
    ),
    (
        "Data policy",
        "policy",
        "The Chennai datasets shipped with NIRMAN AI are demonstration and synthetic values. They "
        "must not be presented as verified official government measurements. Every API response "
        "declares a data status of demo, source, derived or ai_generated, and every important "
        "table records its source name, source URL, source type, source date, verification status "
        "and demo flag. Site coordinates are approximate locality centroids added for map display "
        "and are not survey-grade. The supplied GIS facility layer pack has coordinates in the "
        "Coimbatore region and is tagged as a separate study area so it never mixes with Chennai "
        "analytics.",
    ),
    (
        "Copilot policy",
        "policy",
        "The NIRMAN Copilot explains structured results that the decision engines produced. It "
        "must never independently invent site scores, costs, government schemes, coordinates, "
        "population figures, rainfall values or regulations. If the supplied context does not "
        "contain what is needed, the correct answer is exactly: Insufficient verified data "
        "available. The scheme engine may only select schemes present in the reference table. "
        "The provider is replaceable via the AI_PROVIDER environment variable and the frontend "
        "never learns which one answered.",
    ),
    (
        "Decision-support positioning",
        "policy",
        "NIRMAN AI is a decision-support prototype. It does not replace engineers, planners, "
        "government authorities or statutory approval processes. Suitability scores, timelines, "
        "resource estimates, budgets and risk classifications are model-derived approximations "
        "that must be validated through ground survey, detailed engineering study and statutory "
        "clearance before any financial or contractual commitment.",
    ),
]


def _chunk(text: str) -> list[str]:
    """Split on sentence boundaries, packing up to CHUNK_CHARS with overlap."""
    words = text.split()
    if not words:
        return []
    chunks: list[str] = []
    current: list[str] = []
    length = 0
    for word in words:
        current.append(word)
        length += len(word) + 1
        if length >= CHUNK_CHARS:
            chunks.append(" ".join(current))
            overlap_words = current[-max(1, CHUNK_OVERLAP // 6) :]
            current, length = list(overlap_words), sum(len(w) + 1 for w in overlap_words)
    if current:
        chunks.append(" ".join(current))
    return chunks


def build_corpus(db: Session) -> dict[str, int]:
    """(Re)build documents and chunks from the platform's own tables."""
    db.query(Embedding).delete()
    db.query(DocumentChunk).delete()
    db.query(Document).delete()
    db.query(Source).delete()
    db.flush()

    methodology_source = Source(
        name="NIRMAN AI engine methodology",
        authority="NIRMAN AI project",
        source_type="internal_methodology",
        verification_status="verified",
        notes="Describes how the platform's own engines work. Authoritative for the platform.",
    )
    scheme_source = Source(
        name="Central Government scheme reference table",
        authority="Administering ministries (indicative portals)",
        source_type="public_programme_reference",
        verification_status="pending_verification",
        notes="Scheme names and mandates. Portal URLs must be confirmed with the ministry.",
    )
    registry_source = Source(
        name="NIRMAN AI data-source registry",
        authority="NIRMAN AI project",
        source_type="data_registry",
        verification_status="demonstration",
        notes="Provenance of each dataset the platform loads.",
    )
    db.add_all([methodology_source, scheme_source, registry_source])
    db.flush()

    documents: list[Document] = []

    for title, doc_type, content in METHODOLOGY_DOCS:
        documents.append(
            Document(
                source_id=methodology_source.id,
                title=title,
                doc_type=doc_type,
                content=content,
                source_name=methodology_source.name,
                source_type="internal_methodology",
                verification_status="verified",
                is_demo_data=False,
            )
        )

    for scheme in db.scalars(select(GovernmentScheme)).all():
        eligible = ", ".join(t.strip() for t in (scheme.eligible_project_types or "").split(";") if t.strip())
        documents.append(
            Document(
                source_id=scheme_source.id,
                title=f"Scheme: {scheme.scheme_name}",
                doc_type="government_scheme",
                content=(
                    f"{scheme.scheme_name} ({scheme.short_name or 'no short name'}) is administered by "
                    f"{scheme.ministry}. {scheme.description} Eligible project types under this scheme "
                    f"in the NIRMAN reference table are: {eligible}. Official portal: "
                    f"{scheme.source_url or 'not recorded'}. Verification status: "
                    f"{scheme.verification_status}. Confirm eligibility with the administering "
                    f"ministry before any funding decision."
                ),
                source_name=scheme.ministry,
                source_url=scheme.source_url,
                source_type="public_programme_reference",
                verification_status=scheme.verification_status,
                is_demo_data=False,
            )
        )

    for ds in db.scalars(select(DataSource)).all():
        documents.append(
            Document(
                source_id=registry_source.id,
                title=f"Dataset: {ds.dataset_name}",
                doc_type="data_source",
                content=(
                    f"The dataset {ds.dataset_name} comes from {ds.source_name} "
                    f"({ds.source_type}). {ds.description or ''} Geographic scope: "
                    f"{ds.geographic_scope}. Licence: {ds.license}. Verification status: "
                    f"{ds.verification_status}. Demonstration data: {'yes' if ds.is_demo_data else 'no'}. "
                    f"It holds {ds.record_count} records. Lineage: the metric "
                    f"{ds.lineage_metric} is produced by {ds.lineage_processing} feeding the "
                    f"{ds.lineage_engine}, which outputs {ds.lineage_output}."
                ),
                source_name=ds.source_name,
                source_url=ds.source_url,
                source_type=ds.source_type,
                verification_status=ds.verification_status,
                is_demo_data=ds.is_demo_data,
            )
        )

    db.add_all(documents)
    db.flush()

    chunk_count = 0
    for doc in documents:
        for i, text in enumerate(_chunk(doc.content)):
            db.add(
                DocumentChunk(
                    document_id=doc.id,
                    chunk_index=i,
                    content=text,
                    token_estimate=max(1, len(text) // 4),
                )
            )
            chunk_count += 1
    db.flush()
    return {"sources": 3, "documents": len(documents), "chunks": chunk_count}


# ---------------------------------------------------------------------------
# Embedding + retrieval
# ---------------------------------------------------------------------------

_vectoriser = None
_svd = None


def embed_corpus(db: Session) -> int:
    """Fit the deterministic embedder on the corpus and store the vectors."""
    global _vectoriser, _svd
    import numpy as np
    from sklearn.decomposition import TruncatedSVD
    from sklearn.feature_extraction.text import TfidfVectorizer

    chunks = db.scalars(select(DocumentChunk).order_by(DocumentChunk.id)).all()
    if not chunks:
        return 0

    texts = [c.content for c in chunks]
    _vectoriser = TfidfVectorizer(stop_words="english", sublinear_tf=True, min_df=1)
    matrix = _vectoriser.fit_transform(texts)

    dims = min(EMBED_DIMS, max(2, min(matrix.shape) - 1))
    _svd = TruncatedSVD(n_components=dims, random_state=42)
    vectors = _svd.fit_transform(matrix)

    db.query(Embedding).delete()
    db.flush()
    for chunk, vec in zip(chunks, vectors):
        norm = float(np.linalg.norm(vec)) or 1.0
        db.add(
            Embedding(
                chunk_id=chunk.id,
                model=EMBED_MODEL,
                dimensions=int(dims),
                norm=norm,
                vector_json=json.dumps([round(float(v), 6) for v in vec]),
            )
        )
    db.commit()
    log.info("Embedded %d chunks at %d dimensions", len(chunks), dims)
    return len(chunks)


def _ensure_embedder(db: Session) -> None:
    if _vectoriser is None or _svd is None:
        embed_corpus(db)


@dataclass
class Retrieved:
    score: float
    chunk_id: int
    document_title: str
    doc_type: str
    content: str
    source_name: str | None
    source_url: str | None
    verification_status: str
    is_demo_data: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "similarity": round(self.score, 4),
            "chunk_id": self.chunk_id,
            "document": self.document_title,
            "doc_type": self.doc_type,
            "excerpt": self.content[:400] + ("…" if len(self.content) > 400 else ""),
            "source": self.source_name,
            "source_url": self.source_url,
            "verification_status": self.verification_status,
            "is_demo_data": self.is_demo_data,
        }


def search(db: Session, query: str, top_k: int = 4, min_similarity: float = 0.05) -> list[Retrieved]:
    """Cosine similarity over stored chunk embeddings."""
    import numpy as np

    if not query or not query.strip():
        return []
    _ensure_embedder(db)
    if _vectoriser is None or _svd is None:
        return []

    q = _svd.transform(_vectoriser.transform([query]))[0]
    q_norm = float(np.linalg.norm(q)) or 1.0

    rows = db.scalars(
        select(Embedding).options(
            selectinload(Embedding.chunk).selectinload(DocumentChunk.document)
        )
    ).all()

    scored: list[Retrieved] = []
    for row in rows:
        vec = np.array(json.loads(row.vector_json), dtype=float)
        similarity = float(np.dot(q, vec) / (q_norm * (row.norm or 1.0)))
        if similarity < min_similarity:
            continue
        chunk = row.chunk
        doc = chunk.document
        scored.append(
            Retrieved(
                score=similarity,
                chunk_id=chunk.id,
                document_title=doc.title,
                doc_type=doc.doc_type,
                content=chunk.content,
                source_name=doc.source_name,
                source_url=doc.source_url,
                verification_status=doc.verification_status,
                is_demo_data=doc.is_demo_data,
            )
        )

    scored.sort(key=lambda r: r.score, reverse=True)
    return scored[:top_k]


def search_payload(db: Session, query: str, top_k: int = 4) -> dict[str, Any]:
    hits = search(db, query, top_k)
    return {
        "query": query,
        "results": [h.as_dict() for h in hits],
        "matched": len(hits),
        "embedding_model": EMBED_MODEL,
        "data_status": DataStatus.SOURCE,
        "notes": [
            "Retrieval runs over NIRMAN AI's own methodology, scheme reference table and data "
            "registry. Nothing external is scraped.",
            "Embeddings are a deterministic offline TF-IDF projection, so results are "
            "reproducible without an LLM or an API key.",
        ]
        + ([] if hits else ["No passage passed the similarity threshold for this query."]),
    }


def corpus_stats(db: Session) -> dict[str, Any]:
    return {
        "sources": db.query(Source).count(),
        "documents": db.query(Document).count(),
        "chunks": db.query(DocumentChunk).count(),
        "embeddings": db.query(Embedding).count(),
        "embedding_model": EMBED_MODEL,
        "dimensions": EMBED_DIMS,
        "vector_store": "pgvector on PostgreSQL; JSON vectors on SQLite",
    }
