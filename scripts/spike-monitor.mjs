// Reset the board and stream its serial output for N seconds, flagging the
// WiFi/MQTT/send-cycle lines. Usage: node spike-monitor.mjs <COM> [seconds]
import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'

const PORT = process.argv[2] || 'COM11'
const SECONDS = Number(process.argv[3] || 120)
const set = (port, o) => new Promise((res, rej) => port.set(o, (e) => (e ? rej(e) : res())))

const port = new SerialPort({ path: PORT, baudRate: 115200 })
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))

parser.on('data', (line) => {
  const l = line.trim()
  if (!l) return
  const hot = /SSID|connect|MQTT|sent to MQTT|Battery|voltage|sendData|payload|Sending|deepsleep|sleep|WIFI_SAVED|AUTH|disconnect/i.test(l)
  console.log((hot ? '>> ' : '   ') + l)
})

port.on('open', async () => {
  console.log(`[monitor] open ${PORT}; pulsing reset...`)
  await set(port, { dtr: false, rts: true, brk: false })
  await new Promise((r) => setTimeout(r, 120))
  await set(port, { dtr: false, rts: false, brk: false })
  setTimeout(() => port.close(() => process.exit(0)), SECONDS * 1000)
})
port.on('error', (e) => { console.error(e.message); process.exit(1) })
