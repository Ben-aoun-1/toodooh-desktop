import { SerialPort } from 'serialport'

const ESP32_VENDORS = [
  { vid: '1A86', pid: '55D4', name: 'CH9102' },
  { vid: '1A86', pid: '7523', name: 'CH340' },
  { vid: '10C4', pid: 'EA60', name: 'CP210x' },
  { vid: '0403', pid: '6001', name: 'FTDI' },
]

const ports = await SerialPort.list()
console.log(JSON.stringify(ports, null, 2))
for (const p of ports) {
  const vid = (p.vendorId || '').toUpperCase()
  const pid = (p.productId || '').toUpperCase()
  const chip = ESP32_VENDORS.find((c) => c.vid === vid && c.pid === pid)
  console.log(`-> ${p.path}: ${chip ? 'ESP32 (' + chip.name + ')' : (p.manufacturer || 'unknown')}`)
}
