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
        await resetIntoApp(port)
        await sleep(2500)
        onLog(`Provisioning WiFi "${ssid}"${agent ? ` (agent ${agent})` : ''}...`)
        // SET_WIFI<TAB>ssid<TAB>pass[<TAB>agent] — tabs allow spaces in fields.
        const fields = [ssid, pass]
        if (agent) fields.push(agent)
        port.write(`SET_WIFI\t${fields.join('\t')}\n`)
      } catch (e) {
        reject(e)
      }
    })
    port.on('error', (e) => { if (!settled) { settled = true; reject(e) } })
  })
}
