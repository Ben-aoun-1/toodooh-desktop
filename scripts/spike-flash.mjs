// M0 de-risk spike: prove esptool-js can reset (DTR/RTS) the real board into
// the ROM bootloader, SYNC, detect the chip, and upload the stub — over node
// `serialport` via our Web Serial adapter. No firmware bin needed; chip detect
// exercises the entire hardware/protocol path.
import { ESPLoader, Transport } from 'esptool-js'
import { NodeWebSerialPort } from './webserial-node.mjs'

const PATH = process.argv[2] || 'COM11'

const terminal = {
  clean() {},
  writeLine(data) { console.log('[esp]', data) },
  write(data) { process.stdout.write(data) },
}

const device = new NodeWebSerialPort(PATH, { usbVendorId: 0x1a86, usbProductId: 0x55d4 })
const transport = new Transport(device, false)
const esploader = new ESPLoader({ transport, baudrate: 115200, terminal })

try {
  console.log(`Connecting to ${PATH} ...`)
  const chip = await esploader.main()
  console.log('\n==============================')
  console.log('CHIP DETECTED:', chip)
  try {
    const size = await esploader.detectFlashSize()
    console.log('FLASH SIZE  :', size)
  } catch (e) {
    console.log('flash size n/a:', e.message)
  }
  console.log('==============================')
  console.log('M0 PASS: reset + sync + chip detect + stub all worked.')
} catch (e) {
  console.error('\nM0 FAILED:', e && e.message ? e.message : e)
  process.exitCode = 1
} finally {
  try { await transport.disconnect() } catch {}
  setTimeout(() => process.exit(process.exitCode || 0), 300)
}
