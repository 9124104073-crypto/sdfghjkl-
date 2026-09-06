"""MQTT ingestion for the ECE/IoT layer.

Completes the documented chain in code:

    Sensors -> ESP32 -> MQTT -> IoT ingestion -> FastAPI -> Risk Engine -> Dashboard

A background subscriber listens on `nirman/sensors/#` and pushes each message
through exactly the same ingest path as `POST /api/v1/iot/ingest`, so an HTTP
reading and an MQTT reading are stored and classified identically.

The broker is optional. If `MQTT_BROKER_URL` is unset, or the broker is
unreachable, the platform runs normally — the build plan requires the
application to work when MQTT is unavailable.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Any
from urllib.parse import urlparse

from app.core.config import settings
from app.core.database import SessionLocal

log = logging.getLogger(__name__)

TOPIC = "nirman/sensors/#"
DEFAULT_PORT = 1883


class MqttIngestor:
    """Threaded MQTT subscriber. Never raises into application startup."""

    def __init__(self) -> None:
        self._client = None
        self._thread: threading.Thread | None = None
        self._connected = False
        self._error: str | None = None
        self._received = 0
        self._accepted = 0
        self._rejected = 0
        self._last_message: dict[str, Any] | None = None

    # -- status ---------------------------------------------------------

    def status(self) -> dict[str, Any]:
        return {
            "configured": bool(settings.mqtt_broker_url),
            "broker_url": settings.mqtt_broker_url,
            "topic": TOPIC if settings.mqtt_broker_url else None,
            "connected": self._connected,
            "error": self._error,
            "messages_received": self._received,
            "readings_accepted": self._accepted,
            "readings_rejected": self._rejected,
            "last_message": self._last_message,
            "notes": [
                "IoT is an input to the Risk engine, not an independent decision engine.",
                "MQTT is optional: the platform runs normally when no broker is configured.",
            ],
        }

    # -- lifecycle ------------------------------------------------------

    def start(self) -> None:
        if not settings.mqtt_broker_url:
            log.info("MQTT_BROKER_URL not set; MQTT ingestion disabled.")
            return
        if self._thread and self._thread.is_alive():
            return

        try:
            import paho.mqtt.client as mqtt
        except Exception as exc:  # pragma: no cover
            self._error = f"paho-mqtt unavailable: {exc}"
            log.warning(self._error)
            return

        parsed = urlparse(settings.mqtt_broker_url)
        host = parsed.hostname or "localhost"
        port = parsed.port or DEFAULT_PORT

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="nirman-ingestor")
        client.on_connect = self._on_connect
        client.on_disconnect = self._on_disconnect
        client.on_message = self._on_message
        if parsed.username:
            client.username_pw_set(parsed.username, parsed.password or "")

        self._client = client
        try:
            client.connect_async(host, port, keepalive=60)
            client.loop_start()
            self._thread = threading.Thread(target=lambda: None, daemon=True)
            log.info("MQTT ingestion connecting to %s:%s (topic %s)", host, port, TOPIC)
        except Exception as exc:  # pragma: no cover
            self._error = f"{type(exc).__name__}: {exc}"
            log.warning("MQTT ingestion could not start: %s", self._error)

    def stop(self) -> None:
        if self._client is not None:
            try:
                self._client.loop_stop()
                self._client.disconnect()
            except Exception:  # pragma: no cover
                pass
        self._connected = False

    # -- callbacks ------------------------------------------------------

    def _on_connect(self, client, userdata, flags, reason_code, properties=None) -> None:
        if getattr(reason_code, "is_failure", reason_code != 0):
            self._error = f"connect failed: {reason_code}"
            self._connected = False
            log.warning("MQTT connect failed: %s", reason_code)
            return
        self._connected = True
        self._error = None
        client.subscribe(TOPIC, qos=1)
        log.info("MQTT ingestion subscribed to %s", TOPIC)

    def _on_disconnect(self, client, userdata, *args) -> None:
        self._connected = False
        log.info("MQTT ingestion disconnected")

    def _on_message(self, client, userdata, message) -> None:
        self._received += 1
        try:
            payload = json.loads(message.payload.decode("utf-8"))
        except Exception as exc:
            self._rejected += 1
            self._last_message = {"topic": message.topic, "error": f"invalid JSON: {exc}"}
            return
        self.handle_payload(payload, topic=message.topic)

    # -- ingest ---------------------------------------------------------

    def handle_payload(self, payload: dict[str, Any], topic: str | None = None) -> dict[str, Any]:
        """Validate and store one reading. Shared by MQTT and tests."""
        from app.services import iot_service

        device_id = payload.get("device_id")
        value = payload.get("value")
        if not device_id or value is None:
            self._rejected += 1
            result = {"topic": topic, "error": "payload must include device_id and value"}
            self._last_message = result
            return result

        try:
            value = float(value)
        except (TypeError, ValueError):
            self._rejected += 1
            result = {"topic": topic, "error": f"value is not numeric: {value!r}"}
            self._last_message = result
            return result

        with SessionLocal() as db:
            # Readings arriving over MQTT are real device data, not simulated.
            state = iot_service.ingest(
                db,
                device_code=str(device_id),
                value=value,
                unit=payload.get("unit"),
                timestamp=payload.get("timestamp"),
                is_demo_data=bool(payload.get("is_demo_data", False)),
            )

        if state is None:
            self._rejected += 1
            result = {"topic": topic, "device_id": device_id, "error": "device not registered"}
            self._last_message = result
            return result

        self._accepted += 1
        self._last_message = {
            "topic": topic,
            "device_id": device_id,
            "value": value,
            "status": state["status"],
        }
        return self._last_message


ingestor = MqttIngestor()
