# ECE / IoT layer — ESP32 to Risk Engine

```
Sensors → ESP32 → MQTT → IoT ingestion → FastAPI → Risk Engine → Dashboard
```

IoT is a **real-time data input to the Risk engine**, not an independent decision
engine. Nothing in NIRMAN AI treats a sensor reading as a prediction: thresholds
are demonstration rules, and the platform does not claim guaranteed flood
forecasting.

## Message contract

A device publishes JSON to `nirman/sensors/<device_id>`:

```json
{
  "device_id": "NIR-WL-001",
  "sensor_type": "water_level",
  "value": 1.84,
  "unit": "m",
  "timestamp": "2026-09-05T10:32:00Z"
}
```

Supported `sensor_type` values: `water_level`, `temperature`, `humidity`,
`vibration`, `smoke`, `energy`.

The same payload can be posted directly over HTTP, which is exactly what the
MQTT bridge does after it receives a message:

```bash
curl -X POST http://localhost:8000/api/v1/iot/ingest \
  -H "Content-Type: application/json" \
  -d '{"device_id":"NIR-WL-001","sensor_type":"water_level","value":1.84,"unit":"m"}'
```

A reading for an unregistered `device_id` is rejected with `404` rather than
silently creating a device — an unknown sensor is a configuration error, not
data.

## Status rules

Each device carries a warning and a critical threshold. On ingest:

| Condition | Status |
| --- | --- |
| `value >= critical_threshold` | `CRITICAL` |
| `value >= warning_threshold` | `WARNING` |
| otherwise | `NORMAL` |

Trend is derived from the recent reading window: `rising`, `falling` or
`steady` (a ±5% band on the window's first value).

## Demonstration data

Every simulated reading is stored with `is_demo_data = true` and is labelled as
demonstration data in the API response and in the UI. Generate readings with:

```bash
curl -X POST http://localhost:8000/api/v1/iot/simulate \
  -H "Content-Type: application/json" \
  -d '{"device_id":"NIR-WL-001","readings":1,"escalate":0.6}'
```

`escalate` between 0 and 1 drives the device towards its thresholds (used in the
demo to show `NORMAL → WARNING → CRITICAL`); a negative value walks it back down;
`0` produces a steady reading with light noise.

## Reference ESP32 sketch

Arduino framework, using `PubSubClient`. Replace the credentials and the broker
address; never commit real credentials.

```cpp
#include <WiFi.h>
#include <PubSubClient.h>

const char* WIFI_SSID     = "YOUR_SSID";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";
const char* MQTT_BROKER   = "192.168.1.10";   // host running Mosquitto
const int   MQTT_PORT     = 1883;

const char* DEVICE_ID   = "NIR-WL-001";
const char* SENSOR_TYPE = "water_level";
const char* UNIT        = "m";

// HC-SR04 ultrasonic sensor measuring distance to the water surface.
const int TRIG_PIN = 5;
const int ECHO_PIN = 18;
const float SENSOR_HEIGHT_M = 3.0;   // mounting height above the channel bed

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void connectMqtt() {
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  while (!mqtt.connected()) {
    if (!mqtt.connect(DEVICE_ID)) {
      delay(2000);
    }
  }
}

float readWaterLevel() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);   // microseconds
  if (duration == 0) return -1.0;                   // no echo

  float distanceM = (duration * 0.000343) / 2.0;
  float level = SENSOR_HEIGHT_M - distanceM;
  return level < 0 ? 0 : level;
}

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  connectWiFi();
  connectMqtt();
}

void loop() {
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();

  float value = readWaterLevel();
  if (value >= 0) {
    char topic[64];
    snprintf(topic, sizeof(topic), "nirman/sensors/%s", DEVICE_ID);

    char payload[192];
    snprintf(payload, sizeof(payload),
             "{\"device_id\":\"%s\",\"sensor_type\":\"%s\",\"value\":%.2f,\"unit\":\"%s\"}",
             DEVICE_ID, SENSOR_TYPE, value, UNIT);

    mqtt.publish(topic, payload);
  }

  delay(300000);   // one reading every 5 minutes
}
```

## Bridging MQTT to the API

Start the optional broker with the compose profile and run a small bridge that
forwards each message to `/api/v1/iot/ingest`:

```bash
docker compose --profile iot up -d mqtt
```

```python
# scripts/mqtt_bridge.py
import json
import httpx
import paho.mqtt.client as mqtt

API = "http://localhost:8000/api/v1/iot/ingest"


def on_message(client, userdata, message):
    payload = json.loads(message.payload)
    payload.setdefault("unit", "")
    response = httpx.post(API, json=payload, timeout=10)
    if response.status_code == 404:
        print("Unregistered device:", payload.get("device_id"))


client = mqtt.Client()
client.on_message = on_message
client.connect("localhost", 1883)
client.subscribe("nirman/sensors/#")
client.loop_forever()
```

If the broker or the bridge is unavailable the platform keeps working: the IoT
page falls back to the stored readings and the simulator, and the Risk engine
simply runs without a live overlay.
