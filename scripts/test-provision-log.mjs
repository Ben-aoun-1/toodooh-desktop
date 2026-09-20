// Log-interpretation test for WiFi provisioning — no board required.
//
// Feeds real serial logs (captured from a board at a venue, SSID/agent
// anonymised) through the same tracker provisionWifi() uses, and checks the
// verdict the app shows. Guards against two misreadings seen in the field:
//   - "Attempting to connect to <ip>" taken as "WiFi connected": the broker is
//     an IP literal, so the firmware prints it with no network at all;
//   - an AUTH_FAIL from the boot that still runs the OLD credentials (before
//     the SET_WIFI restart) blamed on the password the user just typed.
//
// Usage: node scripts/test-provision-log.mjs
import { createProvisionTracker, classifyProvisioning, DEFAULT_PROVISION_TIMEOUT_MS } from '../src/main/provision.js'

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`)
}

// Feed lines until the tracker says "done"; report what it concluded.
function run(lines) {
  const phases = []
  const tracker = createProvisionTracker({ onPhase: (p) => phases.push(p) })
  let doneAt = -1
  lines.forEach((l, i) => { if (doneAt < 0 && tracker.feed(l)) doneAt = i })
  const { phase, ...verdict } = classifyProvisioning(tracker.result)
  return { result: { ...tracker.result }, phase, verdict, phases, doneAt }
}

// --- fixtures ---------------------------------------------------------------
// Boot right after the flash: runs the credentials already in NVS, receives
// SET_WIFI, saves, and restarts — the old attempt's AUTH_FAIL lands AFTER
// WIFI_SAVED, while the restart is tearing WiFi down.
const BOOT1_OLD_CREDS = [
  'rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)',
  'I (36) src/main.cpp: Starting paxcounter_c6cdd7a8 v3.6.2 (runmode=0 / restarts=0)',
  'I (3325) src/mqttclient.cpp: WiFi connecting to SSID: CAFE-WIFI (provisioned=1, open=0)',
  'WIFI_SAVED',
  'I (3338) src/mqttclient.cpp: Starting MQTTloop...',
  'W (3913) /home/runner/.platformio/packages/framework-arduinoespressif32/libraries/WiFi/src/WiFiGeneric.cpp: Reason: 202 - AUTH_FAIL',
  'E (3914) /home/runner/.platformio/packages/framework-arduinoespressif32/libraries/WiFi/src/WiFiSTA.cpp: disconnect failed!',
  'E (3925) /home/runner/.platformio/packages/framework-arduinoespressif32/libraries/WiFi/src/WiFiSTA.cpp: config failed',
]
const BOOT2_START = [
  'ets Jun  8 2016 00:22:57',
  'rst:0xc (SW_CPU_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)',
  'I (36) src/main.cpp: Starting paxcounter_c6cdd7a8 v3.6.2 (runmode=1 / restarts=1)',
  'I (1103) src/mqttclient.cpp: WiFi connecting to SSID: CAFE-WIFI (provisioned=1, open=0)',
  'I (1109) src/mqttclient.cpp: Starting MQTTloop...',
]
// Firmware 0001-0004 at the venue: associated (no Reason: line) but no DHCP
// lease, so every MQTT attempt dies with errno 118. Verbatim from the field.
const NO_IP_OLD_FIRMWARE = [
  'I (21113) src/mqttclient.cpp: MQTT name is paxcounter_c6cdd7a8',
  'I (21113) src/mqttclient.cpp: Attempting to connect to 54.38.26.121 [54.38.26.121]',
  'E (21116) /home/runner/.platformio/packages/framework-arduinoespressif32/libraries/WiFi/src/WiFiClient.cpp: connect on fd 48, errno: 118, "Host is unreachable"',
  'W (21130) src/mqttclient.cpp: MQTT server not responding, retrying later',
  'I (41136) src/mqttclient.cpp: Attempting to connect to 54.38.26.121 [54.38.26.121]',
  'E (41139) /home/runner/.platformio/packages/framework-arduinoespressif32/libraries/WiFi/src/WiFiClient.cpp: connect on fd 48, errno: 118, "Host is unreachable"',
  'W (41152) src/mqttclient.cpp: MQTT server not responding, retrying later',
]
// The same situation on firmware with patch 0006.
const NO_IP_0006 = [
  'I (1740) src/mqttclient.cpp: WIFI_ASSOCIATED ssid=CAFE-WIFI channel=6',
  'W (21113) src/mqttclient.cpp: WIFI_NO_IP associated to CAFE-WIFI (channel 6, rssi -71 dBm) but the router gave no IP address (DHCP)',
  'W (41136) src/mqttclient.cpp: WIFI_NO_IP associated to CAFE-WIFI (channel 6, rssi -70 dBm) but the router gave no IP address (DHCP)',
]
const GOT_IP_0006 = [
  'I (1740) src/mqttclient.cpp: WIFI_ASSOCIATED ssid=CAFE-WIFI channel=6',
  'I (2911) src/mqttclient.cpp: WIFI_GOT_IP ip=192.168.1.23 gw=192.168.1.1',
  'I (21113) src/mqttclient.cpp: MQTT name is paxcounter_c6cdd7a8',
  'I (21113) src/mqttclient.cpp: Attempting to connect to 54.38.26.121 [54.38.26.121]',
]
const MQTT_OK = ['I (21240) src/mqttclient.cpp: MQTT server connected, subscribing...']
const MQTT_DOWN = ['W (21130) src/mqttclient.cpp: MQTT server not responding, retrying later']
const WRONG_PASS_0006 = [
  'W (1690) /home/runner/.platformio/packages/framework-arduinoespressif32/libraries/WiFi/src/WiFiGeneric.cpp: Reason: 202 - AUTH_FAIL',
  'W (21113) src/mqttclient.cpp: WIFI_NOT_CONNECTED station not joined to the network',
]

// --- cases ------------------------------------------------------------------
let r = run([...BOOT1_OLD_CREDS, ...BOOT2_START, ...NO_IP_OLD_FIRMWARE])
check('field log (old firmware): "Attempting to connect" is not WiFi, stale AUTH_FAIL ignored',
  r.result, { saved: true, wifiConnected: false, mqttConnected: false, authFail: false, noIp: false })
check('field log (old firmware): verdict', r.verdict, { success: false, error: 'no-connect' })

r = run([...BOOT1_OLD_CREDS, ...BOOT2_START, ...NO_IP_0006])
check('associated without DHCP lease: verdict names the missing IP', r.verdict, { success: false, error: 'wifi-no-ip' })
check('associated without DHCP lease: stepper shows the error', r.phase, 'error')

r = run([...BOOT1_OLD_CREDS, ...BOOT2_START, ...GOT_IP_0006, ...MQTT_OK, 'trailing line'])
check('online: verdict', r.verdict, { success: true })
check('online: stepper ends on online', r.phase, 'online')
check('online: stops at the MQTT line', r.doneAt, BOOT1_OLD_CREDS.length + BOOT2_START.length + GOT_IP_0006.length)
check('online: "connecting" announced once, on the new boot', r.phases, ['connecting'])

r = run([...BOOT1_OLD_CREDS, ...BOOT2_START, ...GOT_IP_0006, ...MQTT_DOWN])
check('IP but broker unreachable: WiFi-only', r.verdict, { success: true, online: false })

r = run([...BOOT1_OLD_CREDS, ...BOOT2_START, ...WRONG_PASS_0006])
check('AUTH_FAIL on the NEW credentials: wrong password', r.verdict, { success: false, error: 'wifi-auth' })

r = run([
  'I (3325) src/mqttclient.cpp: WiFi connecting to SSID: OLD-NET (provisioned=1, open=0)',
  ...GOT_IP_0006, ...MQTT_OK, // online on the OLD network before SET_WIFI is read
  'WIFI_SAVED', ...BOOT2_START, ...NO_IP_0006,
])
check('online on the OLD credentials is not success', r.verdict, { success: false, error: 'wifi-no-ip' })
check('online on the OLD credentials does not stop early', r.doneAt, -1)

r = run([...BOOT2_START, ...GOT_IP_0006, ...MQTT_OK])
check('no WIFI_SAVED ack: credentials not stored', r.verdict, { success: false, error: 'not-saved' })

// Firmware 0007 boots into the scan window first: the WiFi lines only appear
// ~60 s later, after libpax releases the radio. Nothing in between may be
// mistaken for the live boot's WiFi state.
const BOOT2_SCAN_FIRST = [
  'ets Jun  8 2016 00:22:57',
  'rst:0xc (SW_CPU_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)',
  'I (36) src/main.cpp: Starting paxcounter_c6cdd7a8 v3.6.2 (runmode=1 / restarts=1)',
  'I (110) src/main.cpp: WIFISCAN: on',
  'I (113) src/main.cpp: BLESCAN: on',
  'I (1048) .pio/libdeps/usb/libpax/lib/libpax/blescan.cpp: Bluetooth scanner started',
  'I (1106) src/mqttclient.cpp: MQTT send queue created, size 510 Bytes',
  'I (61150) libpax: Stopping libpax.',
  'I (61203) src/mqttclient.cpp: WiFi connecting to SSID: CAFE-WIFI (provisioned=1, open=0)',
  'I (61210) src/mqttclient.cpp: Starting MQTTloop...',
]
r = run([...BOOT1_OLD_CREDS, ...BOOT2_SCAN_FIRST, ...GOT_IP_0006, ...MQTT_OK])
check('0007 scan-then-uplink boot: online', r.verdict, { success: true })
check('0007 scan-then-uplink boot: "connecting" announced once, after the scan', r.phases, ['connecting'])

check('provisioning waits out the 60 s scan window', DEFAULT_PROVISION_TIMEOUT_MS, 150000)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
