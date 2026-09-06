"""AIProvider abstraction.

The frontend never learns which provider is in use. Providers explain
structured results that the NIRMAN decision engines produced - they never
originate a score, cost, scheme, coordinate, population figure or regulation.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any

from app.core.constants import DataStatus

SYSTEM_CONTRACT = """You are NIRMAN Copilot, the explanation layer of a public-infrastructure
decision-support system for the Chennai Metropolitan Area.

Hard rules you must never break:
1. You must not invent site scores, costs, government schemes, coordinates,
   population figures, rainfall values or regulations. Use only the structured
   NIRMAN results supplied to you in the context block.
2. If the context does not contain what is needed, reply exactly:
   "Insufficient verified data available." and say what data would be required.
3. Always state when a value comes from demonstration data.
4. Use decision-support language. NIRMAN AI advises planners; it does not
   approve, sanction or replace engineers, planners or statutory authorities.
"""


@dataclass
class CopilotAnswer:
    answer: str
    sources: list[dict[str, Any]] = field(default_factory=list)
    supporting_data: dict[str, Any] = field(default_factory=dict)
    actions: list[dict[str, str]] = field(default_factory=list)
    data_status: str = DataStatus.AI_GENERATED
    confidence: float | None = None
    provider: str = "mock"
    intent: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "answer": self.answer,
            "sources": self.sources,
            "supporting_data": self.supporting_data,
            "actions": self.actions,
            "data_status": self.data_status,
            "confidence": self.confidence,
            "provider": self.provider,
            "intent": self.intent,
        }


class AIProvider(abc.ABC):
    """Every provider takes a question plus engine-produced context."""

    name: str = "base"

    @abc.abstractmethod
    def explain(self, question: str, context: dict[str, Any]) -> CopilotAnswer:
        """Return a sourced natural-language answer over ``context``."""

    def available(self) -> bool:
        return True


class LLMProvider(AIProvider):
    """Marker base for providers that call a language model."""

    def build_prompt(self, question: str, context: dict[str, Any]) -> str:
        import json

        return (
            f"{SYSTEM_CONTRACT}\n\n"
            f"STRUCTURED NIRMAN CONTEXT (the only facts you may use):\n"
            f"{json.dumps(context, indent=2, default=str)}\n\n"
            f"PLANNER QUESTION: {question}\n\n"
            f"Answer in at most 150 words, citing the context fields you relied on."
        )
