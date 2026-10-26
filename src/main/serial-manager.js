import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'

let activePort = null
let activeParser = null

// USB IDs seen on ESP32 dev boards: Espressif's own USB port (any PID — S3/C3/C6
// built-in USB-Serial/JTAG is 1001) and the common USB-UART bridge chips.
const ESP32_VENDORS = [
  { vid: '303A', pid: null, name: 'USB natif ESP32' },
  { vid: '1A86', pid: '55D4', name: 'CH9102' },   // TTGO T3 LoRa32
  { vid: '1A86', pid: '55D3', name: 'CH343' },
  { vid: '1A86', pid: '7523', name: 'CH340' },
  { vid: '10C4', pid: 'EA60', name: 'CP210x' },
  { vid: '0403', pid: '6001', name: 'FTDI' },
  { vid: '0403', pid: '6010', name: 'FTDI' },
  { vid: '0403', pid: '6015', name: 'FTDI' },
]

function findChip(port) {
  const vid = (port.vendorId || '').toUpperCase()
  const pid = (port.productId || '').toUpperCase()
  return ESP32_VENDORS.find((c) => vid === c.vid && (c.pid === null || pid === c.pid))
}

export async function listPorts() {
  const ports = await SerialPort.list()
  return ports.map((p) => {
    const chip = findChip(p)
    const esp32 = Boolean(chip)
    return {
      path: p.path,
      manufacturer: p.manufacturer || 'Unknown',
      vendorId: p.vendorId,
      productId: p.productId,
      friendlyName: p.friendlyName || p.path,
      isEsp32: esp32,
      chipName: chip ? chip.name : null
    }
  })
}

export async function openSerialMonitor(portPath, baudRate, win) {
  await closeSerialMonitor()

  return new Promise((resolve) => {
    activePort = new SerialPort({
      path: portPath,
      baudRate: baudRate
    })

    activeParser = activePort.pipe(new ReadlineParser({ delimiter: '\r\n' }))

    activeParser.on('data', (line) => {
      win.webContents.send('serial-data', { data: line })
    })

    activePort.on('open', () => {
      resolve({ success: true })
    })

    activePort.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })

    activePort.on('close', () => {
      win.webContents.send('serial-data', { data: '[Port série fermé]' })
    })
  })
}

export async function closeSerialMonitor() {
  if (activePort && activePort.isOpen) {
    return new Promise((resolve) => {
      activePort.close(() => {
        activePort = null
        activeParser = null
        resolve({ success: true })
      })
    })
  }
  activePort = null
  activeParser = null
  return { success: true }
}
