"""IoT ingestion and status service.

Sensors -> ESP32 -> MQTT -> this ingestion path -> FastAPI -> Risk Engine ->
Dashboard. IoT feeds the Risk engine; it never decides anything on its own.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app import repositories as repo
from app.core.constants import DataStatus
from app.engines.risk import sensor_status, sensor_trend
from app.models.iot import SensorDevice, SensorReading

SENSOR_LABELS = {
    "water_level": "Water level",
    "temperature": "Temperature",
    "humidity": "Humidity",
    "vibration": "Vibration",
    "smoke": "Smoke",
    "energy": "Energy draw",
}

STATUS_MESSAGE = {
    "NORMAL": "Within the configured demonstration threshold.",
    "WARNING": "Above the warning threshold - monitor and verify on site.",
    "CRITICAL": "Above the critical threshold - escalate for field verification.",
}


def device_status(db: Session, device: SensorDevice) -> dict[str, Any]:
    readings = repo.recent_readings(db, device.id, limit=12)
    values = [r.value for r in readings]
    current = values[-1] if values else None
    previous = values[-2] if len(values) > 1 else None
    status = (
        sensor_status(current, device.warning_threshold, device.critical_threshold)
        if current is not None
        else "NORMAL"
    )
    return {
        "device_id": device.device_id,
        "sensor_type": device.sensor_type,
        "sensor_label": SENSOR_LABELS.get(device.sensor_type, device.sensor_type),
        "location": device.location,
        "latitude": device.latitude,
        "longitude": device.longitude,
        "unit": device.unit,
        "device_status": device.status,
        "current_value": current,
        "previous_value": previous,
        "change": round(current - previous, 3) if current is not None and previous is not None else None,
        "trend": sensor_trend(values),
        "status": status,
        "status_message": STATUS_MESSAGE[status],
        "warning_threshold": device.warning_threshold,
        "critical_threshold": device.critical_threshold,
        "last_update": readings[-1].timestamp.isoformat() if readings else None,
        "history": [
            {"timestamp": r.timestamp.isoformat(), "value": r.value, "quality_status": r.quality_status}
            for r in readings
        ],
        "is_demo_data": all(r.is_demo_data for r in readings) if readings else True,
        "project_id": device.project_id,
        "site_id": device.site_id,
    }


def fleet_status(db: Session) -> dict[str, Any]:
    devices = repo.devices(db)
    statuses = [device_status(db, d) for d in devices]
    counts = {"NORMAL": 0, "WARNING": 0, "CRITICAL": 0}
    for entry in statuses:
        counts[entry["status"]] += 1
    return {
        "devices": statuses,
        "summary": {
            "total": len(statuses),
            "online": sum(1 for s in statuses if s["device_status"] == "ONLINE"),
            **counts,
        },
        "data_status": DataStatus.DEMO,
        "notes": [
            "Simulated ESP32 fleet. Every reading is flagged is_demo_data=true.",
            "Threshold rules are demonstration logic and are not a guaranteed flood prediction.",
        ],
    }


def ingest(
    db: Session,
    device_code: str,
    value: float,
    unit: str | None = None,
    timestamp: str | None = None,
    is_demo_data: bool = True,
) -> dict[str, Any] | None:
    """Store one reading. This is the same path an MQTT message takes."""
    device = repo.device_by_code(db, device_code)
    if device is None:
        return None

    when = datetime.now(timezone.utc).replace(tzinfo=None)
    if timestamp:
        try:
            when = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            pass

    status = sensor_status(value, device.warning_threshold, device.critical_threshold)
    reading = SensorReading(
        device_id=device.id,
        timestamp=when,
        value=value,
        unit=unit or device.unit,
        quality_status=status,
        is_demo_data=is_demo_data,
    )
    db.add(reading)
    db.commit()
    return device_status(db, device)


def simulate(
    db: Session,
    device_code: str | None = None,
    readings: int = 1,
    escalate: float = 0.0,
) -> dict[str, Any]:
    """Generate demonstration readings.

    ``escalate`` drives a device towards its thresholds so the demo can show a
    NORMAL -> WARNING -> CRITICAL transition on cue.
    """
    devices = repo.devices(db)
    if device_code:
        devices = [d for d in devices if d.device_id == device_code]
    if not devices:
        return {"generated": 0, "devices": [], "notes": ["No matching sensor device."]}

    generated = 0
    for device in devices:
        history = repo.recent_readings(db, device.id, limit=1)
        current = history[-1].value if history else (device.warning_threshold or 1.0) * 0.5
        ceiling = device.critical_threshold or (current * 2)

        for _ in range(readings):
            if escalate > 0:
                # Close a fraction of the remaining distance to critical.
                current = current + (ceiling * 1.08 - current) * (0.35 * escalate)
            elif escalate < 0:
                current = max(0.0, current * (1 + 0.25 * escalate))
            else:
                current = max(0.0, current * random.uniform(0.985, 1.015))

            value = round(current, 2)
            status = sensor_status(value, device.warning_threshold, device.critical_threshold)
            db.add(
                SensorReading(
                    device_id=device.id,
                    timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
                    value=value,
                    unit=device.unit,
                    quality_status=status,
                    is_demo_data=True,
                )
            )
            generated += 1

    db.commit()
    return {
        "generated": generated,
        "devices": [device_status(db, d) for d in devices],
        "data_status": DataStatus.DEMO,
        "notes": [
            "Simulated readings only, all flagged is_demo_data=true.",
            "A real ESP32 publishes the same JSON payload to MQTT topic "
            "nirman/sensors/<device_id>, which is stored through the identical ingest path.",
        ],
    }
