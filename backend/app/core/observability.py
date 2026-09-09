"""Request timing, in-process metrics and ETag support.

Three things the service was missing and that a reviewer would ask for.

*Timing* — every response carries how long it took, and anything slow is
logged with its route, so a degraded engine is visible rather than merely felt.

*Metrics* — per-route counts and latency percentiles, held in memory. This is
deliberately not Prometheus: the platform runs as a single process, and a
dependency-free ring buffer answers "which endpoint is slow" without adding an
exporter and a scrape target to the deployment.

*ETags* — the MCDA engines are deterministic, so the same request produces a
byte-identical response. That is exactly the condition an ETag is for: a
repeat caller gets a 304 and sends no body over the wire, which matters most
on the tunnelled demo link where bandwidth is the constraint.
"""

from __future__ import annotations

import hashlib
import logging
import time
from collections import defaultdict, deque
from threading import Lock

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

log = logging.getLogger("nirman.observability")

# Requests slower than this are logged at WARNING. The engines are pure
# computation over a few hundred rows; anything approaching a second means
# something has regressed.
SLOW_REQUEST_SECONDS = 1.0

# Per-route sample window. 200 keeps percentiles meaningful while bounding
# memory to a few thousand floats across the whole API.
WINDOW = 200


class Metrics:
    """Per-route request counts and latency samples, guarded by a lock."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._samples: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=WINDOW))
        self._counts: dict[str, int] = defaultdict(int)
        self._errors: dict[str, int] = defaultdict(int)
        self._started = time.time()

    def record(self, route: str, seconds: float, status: int) -> None:
        with self._lock:
            self._samples[route].append(seconds)
            self._counts[route] += 1
            if status >= 500:
                self._errors[route] += 1

    def reset(self) -> None:
        with self._lock:
            self._samples.clear()
            self._counts.clear()
            self._errors.clear()

    def snapshot(self) -> dict:
        with self._lock:
            routes = []
            for route, samples in self._samples.items():
                ordered = sorted(samples)
                if not ordered:
                    continue
                routes.append(
                    {
                        "route": route,
                        "requests": self._counts[route],
                        "errors": self._errors[route],
                        "avg_ms": round(sum(ordered) / len(ordered) * 1000, 2),
                        "p50_ms": round(_percentile(ordered, 0.50) * 1000, 2),
                        "p95_ms": round(_percentile(ordered, 0.95) * 1000, 2),
                        "max_ms": round(ordered[-1] * 1000, 2),
                    }
                )
            total = sum(self._counts.values())
            errors = sum(self._errors.values())
            uptime = time.time() - self._started

        routes.sort(key=lambda r: r["p95_ms"], reverse=True)
        return {
            "uptime_seconds": round(uptime, 1),
            "total_requests": total,
            "total_server_errors": errors,
            "routes": routes,
        }


def _percentile(ordered: list[float], q: float) -> float:
    """Nearest-rank percentile. Exact for the small windows held here."""
    if not ordered:
        return 0.0
    index = max(0, min(len(ordered) - 1, int(round(q * (len(ordered) - 1)))))
    return ordered[index]


metrics = Metrics()


def _route_label(request: Request) -> str:
    """The templated path, so /sites/5 and /sites/9 aggregate together."""
    route = request.scope.get("route")
    path = getattr(route, "path", None) or request.url.path
    return f"{request.method} {path}"


class TimingMiddleware(BaseHTTPMiddleware):
    """Time every request, record it, and report it on the response."""

    async def dispatch(self, request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        elapsed = time.perf_counter() - started

        # The route is only attached to the scope once routing has run, so the
        # label has to be read after the handler, not before.
        label = _route_label(request)
        metrics.record(label, elapsed, response.status_code)

        response.headers["X-Process-Time-Ms"] = f"{elapsed * 1000:.1f}"
        # Server-Timing is what browser devtools read natively.
        response.headers["Server-Timing"] = f"app;dur={elapsed * 1000:.1f}"

        if elapsed > SLOW_REQUEST_SECONDS:
            log.warning("Slow request: %s took %.0f ms", label, elapsed * 1000)
        return response


class ETagMiddleware(BaseHTTPMiddleware):
    """Add an ETag to cacheable GETs and answer repeat requests with 304.

    Only applied to successful GET JSON responses. Anything streamed, any
    write, and anything already carrying validators is passed straight
    through — a wrong ETag is far worse than a missing one.
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        if request.method != "GET" or response.status_code != 200:
            return response
        if "etag" in response.headers:
            return response
        if not response.headers.get("content-type", "").startswith("application/json"):
            return response

        body = b""
        async for chunk in response.body_iterator:
            body += chunk

        etag = '"' + hashlib.sha256(body).hexdigest()[:32] + '"'
        headers = dict(response.headers)
        headers["etag"] = etag

        if request.headers.get("if-none-match") == etag:
            # 304 must not carry a body, and Content-Length would then lie.
            headers.pop("content-length", None)
            return Response(status_code=304, headers=headers)

        headers["content-length"] = str(len(body))
        return Response(
            content=body,
            status_code=response.status_code,
            headers=headers,
            media_type=response.media_type,
        )
