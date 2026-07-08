import path from 'path'
import fs from 'fs'
import { createHash } from 'crypto'
import { app } from 'electron'
// esptool-js is ESM with extensionless imports Node can't resolve raw, and
// bundling it via vite corrupts the main entry's CJS/electron interop. So it's
// pre-bundled to a self-contained CJS file (scripts: esbuild) and imported here.
import esptool from './vendor/esptool.cjs'
import { NodeWebSerialPort } from './webserial-node'

const { ESPLoader, Transport } = esptool

// ESP32 USB-UART bridge VID/PID — used to tag the device for esptool.
const KNOWN = { '1A86:55D4': true, '1A86:7523': true, '10C4:EA60': true, '0403:6001': true }

function firmwareDir() {
  if (!app.isPackaged) {
    return path.resolve(__dirname, '../../resources/firmware-bin')
  }
  return path.join(process.resourcesPath, 'firmware-bin')
}

export function getManifest() {
  const dir = firmwareDir()
  return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
}

function loadFileArray(manifest) {
  const dir = firmwareDir()
  return manifest.files.map((f) => ({
    address: parseInt(f.address, 16),
    data: new Uint8Array(fs.readFileSync(path.join(dir, f.path))),
  }))
}

// Flash the bundled firmware to `comPort`. `onLog(line)` streams esptool output;
// `onProgress({written,total,percent})` reports overall write progress.
export async function flashFirmware(comPort, { onLog = () => {}, onProgress = () => {} } = {}) {
  const manifest = getManifest()
  const fileArray = loadFileArray(manifest)
  const total = fileArray.reduce((n, f) => n + f.data.length, 0)
  const before = fileArray.map((_, i) => fileArray.slice(0, i).reduce((n, f) => n + f.data.length, 0))

  const terminal = {
    clean() {},
    writeLine(d) { onLog(String(d)) },
    write(d) { onLog(String(d)) },
  }

  const device = new NodeWebSerialPort(comPort, { usbVendorId: 0x1a86, usbProductId: 0x55d4 })
  const transport = new Transport(device, false)
  const esploader = new ESPLoader({
    transport,
    baudrate: manifest.flashBaud || 460800,
    romBaudrate: 115200,
    terminal,
  })

  try {
    const chip = await esploader.main()
    onLog(`Detected ${chip}`)
    await esploader.writeFlash({
      fileArray,
      flashMode: 'keep',
      flashFreq: 'keep',
      flashSize: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (i, written) => {
        const done = before[i] + written
        onProgress({ written: done, total, percent: Math.round((done / total) * 100) })
      },
      calculateMD5Hash: (img) => createHash('md5').update(Buffer.from(img)).digest('hex'),
    })
    onLog('Flash verified.')
  } finally {
    try { await transport.disconnect() } catch {}
  }
}
