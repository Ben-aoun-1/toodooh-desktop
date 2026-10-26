import path from 'path'
import fs from 'fs'
import { createHash } from 'crypto'
import { app } from 'electron'
import { SerialPort } from 'serialport'
// esptool-js is ESM with extensionless imports Node can't resolve raw, and
// bundling it via vite corrupts the main entry's CJS/electron interop. So it's
// pre-bundled to a self-contained CJS file (scripts: esbuild) and imported here.
import esptool from './vendor/esptool.cjs'
import { NodeWebSerialPort } from './webserial-node'

const { ESPLoader, Transport } = esptool

function firmwareDir() {
  if (!app.isPackaged) {
    return path.resolve(__dirname, '../../resources/firmware-bin')
  }
  return path.join(process.resourcesPath, 'firmware-bin')
}

// manifest.json: { base, version, targets: { <chipKey>: { files: [{address, path}] } } }
// where chipKey is esptool's chip name lowercased without dashes (esp32c3...).
export function getManifest() {
  const dir = firmwareDir()
  return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
}

export function supportedChips(manifest = getManifest()) {
  return Object.keys(manifest.targets)
}

function loadFileArray(target) {
  const dir = firmwareDir()
  return target.files.map((f) => ({
    address: parseInt(f.address, 16),
    data: new Uint8Array(fs.readFileSync(path.join(dir, f.path))),
  }))
}

// esptool-js picks its reset sequence from the port's USB IDs: Espressif's
// built-in USB-Serial/JTAG (303A:1001) needs a different one than a USB-UART
// bridge, so pass the real IDs of the port instead of assuming a bridge.
async function usbIdsOf(comPort) {
  const ports = await SerialPort.list()
  const p = ports.find((x) => x.path === comPort)
  const hex = (v) => (v ? parseInt(v, 16) : undefined)
  return { usbVendorId: hex(p?.vendorId), usbProductId: hex(p?.productId) }
}

const chipKey = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '')

// Flash the bundled firmware matching whatever chip is on `comPort`.
// `onLog(line)` streams esptool output; `onProgress({written,total,percent})`
// reports overall write progress. Resolves { chip } (e.g. "ESP32-C3").
export async function flashFirmware(comPort, { onLog = () => {}, onProgress = () => {} } = {}) {
  const manifest = getManifest()

  const terminal = {
    clean() {},
    writeLine(d) { onLog(String(d)) },
    write(d) { onLog(String(d)) },
  }

  const device = new NodeWebSerialPort(comPort, await usbIdsOf(comPort))
  const transport = new Transport(device, false)
  const esploader = new ESPLoader({
    transport,
    baudrate: manifest.flashBaud || 460800,
    romBaudrate: 115200,
    terminal,
  })

  try {
    const description = await esploader.main()
    const chip = esploader.chip.CHIP_NAME
    onLog(`Detected ${description}`)
    const target = manifest.targets[chipKey(chip)]
    if (!target) {
      throw new Error(
        `Puce ${chip} non prise en charge (micrologiciels disponibles : ${supportedChips(manifest).join(', ')}).`
      )
    }

    const fileArray = loadFileArray(target)
    const total = fileArray.reduce((n, f) => n + f.data.length, 0)
    const before = fileArray.map((_, i) => fileArray.slice(0, i).reduce((n, f) => n + f.data.length, 0))

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
    return { chip }
  } finally {
    try { await transport.disconnect() } catch {}
  }
}
