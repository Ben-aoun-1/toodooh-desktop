// Pulse EN low->high (IO0 high) to reboot the board into the app.
import { SerialPort } from 'serialport'
const PORT = process.argv[2] || 'COM11'
const port = new SerialPort({ path: PORT, baudRate: 115200 })
const set = (o) => new Promise((res, rej) => port.set(o, (e) => (e ? rej(e) : res())))
port.on('open', async () => {
  await set({ dtr: false, rts: true, brk: false })
  await new Promise((r) => setTimeout(r, 120))
  await set({ dtr: false, rts: false, brk: false })
  await new Promise((r) => setTimeout(r, 200))
  port.close(() => { console.log('reset pulse sent on ' + PORT); process.exit(0) })
})
port.on('error', (e) => { console.error(e.message); process.exit(1) })
