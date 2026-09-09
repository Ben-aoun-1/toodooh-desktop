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

// Open `comPort`, reboot into the freshly-flashed app, push WiFi credentials
// (SET_WIFI, tab-delimited so SSID/pass may contain spaces), and watch the
// serial log to confirm the device joins WiFi and reaches the MQTT broker.
// Resolves { saved, wifiConnected, mqttConnected }.
export async function provisionWifi(comPort, ssid, pass, agent, {
  onLog = () => {},
  timeoutMs = 90000,
} = {}) {
  const port = new SerialPort({ path: comPort, baudRate: 115200 })
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))
  const result = { saved: false, wifiConnected: false, mqttConnected: false }

  return await new Promise((resolve, reject) => {
    let settled = false
    const finish = async () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { await new Promise((r) => port.close(r)) } catch {}
      resolve(result)
    }
    const timer = setTimeout(finish, timeoutMs)

    parser.on('data', (line) => {
      const l = String(line).trim()
      if (l) onLog(l)
      if (l.includes('WIFI_SAVED')) result.saved = true
      if (l.includes('Attempting to connect to')) result.wifiConnected = true
      if (l.includes('Reason: 202') || l.includes('AUTH_FAIL')) result.authFail = true
      if (l.includes('MQTT server connected')) {
        result.mqttConnected = true
        finish() // fully online — stop early
      }
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
