# Toodooh PAX Counter — MQTT Data Format

How a Toodooh device publishes data to the broker. Verified on real hardware
(device `paxcounter_b6a8b421`) on 2026-06-18.

---

## 1. Transport & broker

| | |
|---|---|
| Protocol | MQTT 3.1.1 over plain TCP |
| Broker | `54.38.26.121:1883` (Mosquitto on AWS/OVH EC2) |
| Auth | username `toodooh`, password (per-build secret) |
| Uplink | WiFi STA (the device joins the site WiFi, provisioned over serial into NVS) |
| QoS / retain | QoS 0, not retained |
| Encoder | **PLAIN** (`PAYLOAD_ENCODER = 1`) — fixed binary layout, **big-endian** |
| Cadence | wakes from deep sleep every **30 min**, scans BLE ~60 s, publishes, sleeps |

Each device has a stable identity derived from its chip MAC:

```
clientId = "paxcounter_" + <8 hex digits of hashed MAC>      e.g. paxcounter_b6a8b421
```

---

## 2. Topics

| Topic | Direction | When | Retained | Payload |
|---|---|---|---|---|
| `paxcounter` | device → broker | on every (re)connect | no | the literal clientId string (presence/announce) |
| `paxcounter/<clientId>/agent` | device → broker | on every (re)connect | **yes** | **agent code** — plain UTF-8 string |
| `paxcounter/<clientId>/1` | device → broker | each send cycle | no | **count** data (base64) |
| `paxcounter/<clientId>/8` | device → broker | each send cycle | no | **battery** data (base64) |
| `paxin` | broker → device | on demand | — | remote command (subscribed; cleared on connect) |

The port number (`/1`, `/8`) is the last path segment and identifies the data
type (`COUNTERPORT = 1`, `BATTPORT = 8`). The `/agent` segment is a Toodooh
addition, not a port.

> **Important — three different payload encodings:**
> - per-port data (`/1`, `/8`) = **Base64-encoded binary**
> - the root `paxcounter` announce = **plain ASCII string** (the clientId)
> - `/agent` = **plain UTF-8 string** (the agent code, e.g. `AGENT-007`), **retained**

### Agent code (`/agent`)
The operator types an **agent code** in the flasher alongside the WiFi creds; it
is stored in the device's NVS and published — **retained** — on
`paxcounter/<clientId>/agent` every time the device connects. Because it's
retained, the server receives it immediately on subscribe, even between the
device's 30-min wake cycles. Use it to attribute a device to whoever installed it.

---

## 3. Payload layouts (after Base64-decode)

All multi-byte integers are **big-endian** (high byte first).

### Port `/1` — Count  (`COUNT_DATA`)
| Offset | Bytes | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 2 | `wifi_count` | uint16 BE | always present; **0** for Toodooh (WiFi sniffing off) |
| 2 | 2 | `ble_count` | uint16 BE | present because BLE counting is on |

Total: **4 bytes**.

### Port `/8` — Battery  (`BATT_DATA`)
| Offset | Bytes | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 2 | `battery_mV` | uint16 BE | battery voltage in **millivolts** |

Total: **2 bytes**.

> The device sends **voltage (mV)**, not a percentage. The dashboard converts
> mV → % (typical single-cell LiPo: ~3300 mV ≈ 0 %, ~4200 mV ≈ 100 %).

---

## 4. Worked examples (real captured messages)

```
topic: paxcounter/paxcounter_b6a8b421/1
  base64 : AAAABQ==
  bytes  : 00 00 00 05
  decode : wifi_count = 0x0000 = 0
           ble_count  = 0x0005 = 5      -> 5 BLE devices seen this cycle

topic: paxcounter/paxcounter_b6a8b421/8
  base64 : D9A=
  bytes  : 0f d0
  decode : battery_mV = 0x0FD0 = 4048   -> 4.048 V  (~80-85% for a LiPo)

topic: paxcounter
  payload: paxcounter_b6a8b421          (plain string, presence announce)
```

---

## 5. Decoding snippets

**Node.js**
```js
client.on('message', (topic, payload) => {
  const port = topic.split('/').pop()
  const buf = Buffer.from(payload.toString(), 'base64')
  if (port === '1') {
    const wifi = buf.readUInt16BE(0)
    const ble  = buf.readUInt16BE(2)
    console.log({ wifi, ble })
  } else if (port === '8') {
    const mV = buf.readUInt16BE(0)
    console.log({ battery_mV: mV, battery_V: mV / 1000 })
  }
})
```

**Python (paho-mqtt)**
```python
import base64, struct
def on_message(c, u, msg):
    port = msg.topic.split('/')[-1]
    data = base64.b64decode(msg.payload)
    if port == '1':
        wifi, ble = struct.unpack('>HH', data)
        print('wifi', wifi, 'ble', ble)
    elif port == '8':
        (mV,) = struct.unpack('>H', data)
        print('battery_mV', mV, 'V', mV/1000)
```

---

## 6. Notes / gotchas
- A device only publishes during its ~60 s awake window every 30 min, so a
  subscriber may wait up to half an hour for the first message unless the device
  was just reset.
- Topic format is the Toodooh patch `0001` change: upstream Paxcounter publishes
  `<root>/<port>` (no device id); Toodooh publishes `<root>/<clientId>/<port>`
  so every device is addressable.
- If more `PAYLOADMASK` bits are enabled later (e.g. sensors), they appear on
  their own ports (`SENSOR1PORT = 10`, etc.) with their own layouts.
