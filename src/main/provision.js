import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function setSignals(port, opts) {
  return new Promise((resolve, reject) =>
    port.set({ brk: false, ...opts }, (e) => (e ? reject(e) : resolve()))
  )
}

// EN low -> high pulse (IO0 held high) to reboot the chip into the app after
// esptool leaves it in the ROM bootloader.
async function resetIntoApp(port) {
  await setSignals(port, { dtr: false, rts: true })
  await sleep(120)
  await setSignals(port, { dtr: false, rts: false })
}

// Build the provisioning frame: SET_WIFI<TAB>ssid<TAB>pass[<TAB>agent]<LF>.
// Tabs delimit (not spaces), so every field may contain spaces. An OPEN network
// (no password) is carried as an EMPTY pass field — the firmware parses by tab
// index (mqttclient.cpp wifi_provisioning_task), so "SET_WIFI\tssid\t\tagent"
// stores pass="" and the device associates with authmode OPEN.
// Tabs/CR/LF are stripped from the fields: one of them inside a value would
// shift every field that follows it.
export function buildSetWifiLine(ssid, pass, agent) {
  const clean = (v) => String(v ?? '').replace(/[\t\r\n]/g, '')
  const fields = [clean(ssid), clean(pass)]
  const a = clean(agent)
  if (a) fields.push(a)
  return `SET_WIFI\t${fields.join('\t')}\n`
}

// Interprets the board's serial log during provisioning. `feed(line)` returns
// true once the device is fully online.
//
// Only the boot that runs the NEW credentials counts. The first boot after a
// flash still runs whatever NVS held before (flashing doesn't erase it) and
// only reads SET_WIFI after WiFi.begin(); it saves, acks WIFI_SAVED and
// restarts — and that old attempt can still log AUTH_FAIL (or even get online)
// after the ack. So: WIFI_SAVED, then the next "WiFi connecting to SSID" line
// marks the new boot; everything before it is ignored.
//
// WiFi state comes from the WIFI_* tokens of firmware patch 0006, never from
// "Attempting to connect to": MQTT_SERVER is an IP literal, so the firmware
// printed that with no network at all.
export function createProvisionTracker({ onPhase = () => {} } = {}) {
  const result = { saved: false, wifiConnected: false, mqttConnected: false, authFail: false, noIp: false }
  let live = false

  const feed = (l) => {
    if (l.includes('WIFI_SAVED')) {
      result.saved = true
      live = false
      return false
    }
    if (!live) {
      if (result.saved && l.includes('WiFi connecting to SSID')) {
        live = true
        onPhase('connecting')
      }
      return false
    }
    if (l.includes('WIFI_GOT_IP')) {
      // An IP proves the password was accepted.
      Object.assign(result, { wifiConnected: true, noIp: false, authFail: false })
    } else if (l.includes('WIFI_LOST_IP')) {
      result.wifiConnected = false
    } else if (l.includes('WIFI_NO_IP')) {
      // Associated, so the password was accepted — the router gave no address.
      Object.assign(result, { noIp: true, authFail: false })
    } else if (l.includes('Reason: 202') || l.includes('AUTH_FAIL')) {
      result.authFail = true
    } else if (l.includes('MQTT server connected')) {
      Object.assign(result, { mqttConnected: true, wifiConnected: true })
      return true
    }
    return false
  }

  return { result, feed }
}

// Turn a provisioning result into what the UI shows: the final stepper phase,
// plus success/online/error for the result banner.
export function classifyProvisioning(res) {
  if (res.mqttConnected) return { phase: 'online', success: true }
  if (res.wifiConnected) return { phase: 'wifi-only', success: true, online: false }
  const error =
    !res.saved ? 'not-saved' :
    res.authFail ? 'wifi-auth' :
    res.noIp ? 'wifi-no-ip' :
    'no-connect'
  return { phase: 'error', success: false, error }
}

// Open `comPort`, reboot into the freshly-flashed app, push WiFi credentials
// (SET_WIFI, tab-delimited so SSID/pass may contain spaces), and watch the
// serial log to confirm the device joins WiFi and reaches the MQTT broker.
// Resolves the tracker's result: { saved, wifiConnected, mqttConnected,
// authFail, noIp }.
export async function provisionWifi(comPort, ssid, pass, agent, {
  onLog = () => {},
  onPhase = () => {},
  timeoutMs = 90000,
} = {}) {
  const port = new SerialPort({ path: comPort, baudRate: 115200 })
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))
  const tracker = createProvisionTracker({ onPhase })

  return await new Promise((resolve, reject) => {
    let settled = false
    const finish = async () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { await new Promise((r) => port.close(r)) } catch {}
      resolve(tracker.result)
    }
    const timer = setTimeout(finish, timeoutMs)

    parser.on('data', (line) => {
      const l = String(line).trim()
      if (l) onLog(l)
      if (tracker.feed(l)) finish() // fully online — stop early
    })

    port.on('open', async () => {
      try {
        onLog('Rebooting device into firmware...')
        // A port that refuses DTR/RTS (some bridges/virtual ports) is not fatal:
        // the board may already be running the app, so still send the frame.
        try {
          await resetIntoApp(port)
        } catch (e) {
          onLog(`Warning: could not pulse reset (${e.message}); continuing.`)
        }
        await sleep(2500)
        const openNet = !String(pass ?? '')
        onLog(
          `Provisioning WiFi "${ssid}"${openNet ? ' (open network, no password)' : ''}` +
          `${agent ? ` (agent ${agent})` : ''}...`
        )
        port.write(buildSetWifiLine(ssid, pass, agent))
      } catch (e) {
        reject(e)
      }
    })
    port.on('error', (e) => { if (!settled) { settled = true; reject(e) } })
  })
}
