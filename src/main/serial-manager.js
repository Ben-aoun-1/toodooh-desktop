import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'

let activePort = null
let activeParser = null

// Known ESP32 USB-UART bridge chips
const ESP32_VENDORS = [
  { vid: '1A86', pid: '55D4', name: 'CH9102' },   // TTGO T3 LoRa32
  { vid: '1A86', pid: '7523', name: 'CH340' },
  { vid: '10C4', pid: 'EA60', name: 'CP210x' },
  { vid: '0403', pid: '6001', name: 'FTDI' },
]

function isEsp32Port(port) {
  const vid = (port.vendorId || '').toUpperCase()
  const pid = (port.productId || '').toUpperCase()
  return ESP32_VENDORS.some((chip) => vid === chip.vid && pid === chip.pid)
}

export async function listPorts() {
  const ports = await SerialPort.list()
  return ports.map((p) => {
    const esp32 = isEsp32Port(p)
    const chip = ESP32_VENDORS.find(
      (c) => (p.vendorId || '').toUpperCase() === c.vid && (p.productId || '').toUpperCase() === c.pid
    )
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
