"""AI provider selection.

AI_PROVIDER=mock|local|hosted. The frontend never learns which one is active.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import settings
from app.providers.ai.base import AIProvider, CopilotAnswer
from app.providers.ai.mock import MockAIProvider

log = logging.getLogger(__name__)


@lru_cache
def get_ai_provider() -> AIProvider:
    choice = settings.ai_provider
    if choice == "mock":
        return MockAIProvider()

    # Imported lazily so a missing httpx endpoint never affects the mock path.
    from app.providers.ai.llm import HostedLLMProvider, LocalLLMProvider

    provider: AIProvider = LocalLLMProvider() if choice == "local" else HostedLLMProvider()
    if not provider.available():
        log.warning("AI_PROVIDER=%s is not reachable; using MockAIProvider.", choice)
        return MockAIProvider()
    return provider


__all__ = ["AIProvider", "CopilotAnswer", "MockAIProvider", "get_ai_provider"]
