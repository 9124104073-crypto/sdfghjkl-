"""Local and hosted LLM providers.

Both speak the OpenAI-compatible /chat/completions shape, which is what
llama.cpp, Ollama, vLLM, LM Studio and most hosted free tiers expose. If the
endpoint is unreachable the provider degrades to MockAIProvider rather than
breaking the demo.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import settings
from app.providers.ai.base import CopilotAnswer, LLMProvider
from app.providers.ai.mock import MockAIProvider

log = logging.getLogger(__name__)

REQUEST_TIMEOUT_S = 30.0


class _OpenAICompatibleProvider(LLMProvider):
    """Shared transport for the local and hosted providers."""

    def __init__(self, base_url: str, model: str, api_key: str | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self._fallback = MockAIProvider()

    def available(self) -> bool:
        try:
            with httpx.Client(timeout=3.0) as client:
                response = client.get(f"{self.base_url}/models", headers=self._headers())
            return response.status_code < 500
        except Exception:
            return False

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def explain(self, question: str, context: dict[str, Any]) -> CopilotAnswer:
        prompt = self.build_prompt(question, context)
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT_S) as client:
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2,
                        "max_tokens": 400,
                    },
                )
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"].strip()
        except Exception as exc:
            log.warning("LLM provider '%s' unavailable (%s); falling back to mock.", self.name, exc)
            answer = self._fallback.explain(question, context)
            answer.provider = f"{self.name}:fallback_mock"
            return answer

        answer = CopilotAnswer(
            answer=text,
            sources=context.get("sources", []),
            supporting_data=_supporting_data(context),
            provider=self.name,
            intent=context.get("intent"),
        )
        return answer


class LocalLLMProvider(_OpenAICompatibleProvider):
    """Self-hosted model on the demo machine (llama.cpp, Ollama, vLLM...)."""

    name = "local"

    def __init__(self) -> None:
        super().__init__(
            base_url=settings.llm_base_url or "http://localhost:11434/v1",
            model=settings.llm_model or "llama3.1:8b",
            api_key=settings.llm_api_key,
        )


class HostedLLMProvider(_OpenAICompatibleProvider):
    """Hosted inference API. The key comes from the environment only."""

    name = "hosted"

    def __init__(self) -> None:
        super().__init__(
            base_url=settings.llm_base_url or "https://api.openai.com/v1",
            model=settings.llm_model or "gpt-4o-mini",
            api_key=settings.llm_api_key,
        )


def _supporting_data(context: dict[str, Any]) -> dict[str, Any]:
    """Return the structured engine output the model was allowed to see."""
    keys = ("ranked_sites", "explanation", "scenario", "priority", "scheme", "risk", "project")
    return {k: context[k] for k in keys if k in context}
