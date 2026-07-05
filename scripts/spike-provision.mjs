// M1b end-to-end: flash the built firmware via esptool-js, then provision WiFi
// over serial (SET_WIFI) and watch for the WiFi/MQTT connect logs.
// Usage: node spike-provision.bundle.mjs <COM> <ssid> <pass> [buildDir]
import { ESPLoader, Transport, HardReset } from 'esptool-js'
import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import { NodeWebSerialPort } from './webserial-node.mjs'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const PORT = process.argv[2] || 'COM11'
const SSID = process.argv[3] || 'Ooredoo 6E25FB'
const PASS = process.argv[4] || 'marrouma123'
const AGENT = process.argv[5] || ''
const BUILD = process.argv[6] || 'C:/toodooh-build/toodooh-firmware/vendor/ESP32-Paxcounter/.pio/build/usb'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const terminal = { clean() {}, writeLine(d) { console.log('[esp]', d) }, write(d) { process.stdout.write(d) } }

// Paxcounter's build.py renames the app bin and emits no flasher_args.json, so
// use the standard ESP32 (PICO-D4) offsets explicitly.
const BOOT_APP0 = process.env.BOOT_APP0 ||
  'C:/Users/Med amine ben aoun/.platformio/packages/framework-arduinoespressif32@3.20011.230801/tools/partitions/boot_app0.bin'
const APP_BIN = process.env.APP_BIN || 'firmware_ttgov21new_v3.6.2.bin'

function loadFiles() {
  const u8 = (p) => new Uint8Array(readFileSync(p))
  const fileArray = [
    { address: 0x1000, data: u8(path.join(BUILD, 'bootloader.bin')) },
    { address: 0x8000, data: u8(path.join(BUILD, 'partitions.bin')) },
    { address: 0xe000, data: u8(BOOT_APP0) },
    { address: 0x10000, data: u8(path.join(BUILD, APP_BIN)) },
  ]
  // 'keep' preserves each image header's flash mode/freq/size (already correct).
  return { fileArray, settings: { flash_mode: 'keep', flash_freq: 'keep', flash_size: 'keep' } }
}

async function flash() {
  const { fileArray, settings } = loadFiles()
  console.log('Flashing files:', fileArray.map((f) => `0x${f.address.toString(16)} (${f.data.length}B)`).join(', '))
  const device = new NodeWebSerialPort(PORT, { usbVendorId: 0x1a86, usbProductId: 0x55d4 })
  const transport = new Transport(device, false)
  const esploader = new ESPLoader({ transport, baudrate: 460800, romBaudrate: 115200, terminal })
  await esploader.main()
  await esploader.writeFlash({
    fileArray,
    flashMode: settings.flash_mode || 'keep',
    flashFreq: settings.flash_freq || 'keep',
    flashSize: settings.flash_size || 'keep',
    eraseAll: false,
    compress: true,
    reportProgress: (i, w, t) => process.stdout.write(`\r  file ${i}: ${Math.round((w / t) * 100)}%   `),
    calculateMD5Hash: (img) => createHash('md5').update(Buffer.from(img)).digest('hex'),
  })
  console.log('\nFlash complete. Closing flasher transport...')
  await transport.disconnect()
}

// EN low -> high pulse (IO0 held high) to reboot the chip into the app.
function resetIntoApp(port) {
  return new Promise((resolve, reject) => {
    port.set({ dtr: false, rts: true, brk: false }, (e1) => {       // EN low = reset
      if (e1) return reject(e1)
      setTimeout(() => {
        port.set({ dtr: false, rts: false, brk: false }, (e2) =>    // EN high = run app
          e2 ? reject(e2) : resolve())
      }, 120)
    })
  })
}

async function provisionAndWatch() {
  const port = new SerialPort({ path: PORT, baudRate: 115200 })
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))
  let lineCount = 0, saved = false, wifiUp = false, mqttUp = false
  parser.on('data', (line) => {
    const l = line.trim()
    if (l) { console.log('   |', l); lineCount++ }
    if (l.includes('WIFI_SAVED')) saved = true
    if (l.includes('Attempting to connect to')) wifiUp = true
    if (l.includes('MQTT server connected')) mqttUp = true
  })
  await new Promise((r) => port.on('open', r))
  console.log('Monitor open; pulsing reset into app...')
  await resetIntoApp(port)
  await sleep(3000) // let it boot + start logging
  const fields = [SSID, PASS]
  if (AGENT) fields.push(AGENT)
  const cmd = `SET_WIFI\t${fields.join('\t')}\n`
  console.log(`\n>> sending: SET_WIFI\\t${SSID}\\t<pass>${AGENT ? `\\t${AGENT}` : ''}`)
  port.write(cmd)

  const deadline = Date.now() + 75000
  while (Date.now() < deadline && !mqttUp) await sleep(500)
  await new Promise((r) => port.close(r))

  console.log('\n==============================')
  console.log('serial lines seen    :', lineCount)
  console.log('WIFI_SAVED ack       :', saved ? 'YES' : 'no')
  console.log('WiFi connected (DNS) :', wifiUp ? 'YES' : 'no')
  console.log('MQTT broker connected:', mqttUp ? 'YES' : 'no')
  console.log('==============================')
}

try {
  await flash()
  await provisionAndWatch()
} catch (e) {
  console.error('\nFAILED:', e && e.message ? e.message : e)
  process.exitCode = 1
} finally {
  setTimeout(() => process.exit(process.exitCode || 0), 300)
}
