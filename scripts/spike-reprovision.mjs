// Re-provision WiFi over serial (no reflash) and stream serial through a full
// wake->send cycle. Usage: node spike-reprovision.mjs <COM> <ssid> <pass> [sec]
import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'

const PORT = process.argv[2] || 'COM11'
const SSID = process.argv[3]
const PASS = process.argv[4]
const SECONDS = Number(process.argv[5] || 150)
const set = (p, o) => new Promise((res, rej) => p.set(o, (e) => (e ? rej(e) : res())))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const port = new SerialPort({ path: PORT, baudRate: 115200 })
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))
let saved = false, wifiUp = false, mqttUp = false, sent = false

parser.on('data', (line) => {
  const l = line.trim()
  if (!l) return
  const hot = /SSID|connect|MQTT|sent to MQTT|Battery|voltage|sendData|payload|deepsleep|sleep|WIFI_SAVED|AUTH|disconnect|bytes sent/i.test(l)
  console.log((hot ? '>> ' : '   ') + l)
  if (l.includes('WIFI_SAVED')) saved = true
  if (l.includes('Attempting to connect to')) wifiUp = true
  if (l.includes('MQTT server connected')) mqttUp = true
  if (/bytes sent to MQTT/i.test(l)) sent = true
})

port.on('open', async () => {
  console.log(`[reprovision] open ${PORT}; pulsing reset...`)
  await set(port, { dtr: false, rts: true, brk: false })
  await sleep(120)
  await set(port, { dtr: false, rts: false, brk: false })
  await sleep(2500)
  console.log(`>> sending SET_WIFI for "${SSID}"`)
  port.write(`SET_WIFI\t${SSID}\t${PASS}\n`)
  setTimeout(() => {
    console.log('\n== WIFI_SAVED:', saved, '| WiFi up:', wifiUp, '| MQTT up:', mqttUp, '| payload sent:', sent)
    port.close(() => process.exit(0))
  }, SECONDS * 1000)
})
port.on('error', (e) => { console.error(e.message); process.exit(1) })
