// Copies the universal firmware builds into resources/firmware-bin/ and writes
// the manifest the flasher reads.
//
//   node scripts/import-firmware.mjs [path/to/toodooh-firmware/universal]
//
// Run `pio run` in the firmware's universal/ folder first. Every env that has
// been built is imported; the others are skipped.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(process.argv[2] || path.join(here, '../../toodooh-firmware/universal'))
const out = path.resolve(here, '../resources/firmware-bin')

// The ROM bootloader looks for the 2nd-stage bootloader at 0x1000 on the
// classic ESP32 and at 0x0 on the newer families.
const BOOTLOADER_ADDR = { esp32: '0x1000', esp32s3: '0x0', esp32c3: '0x0', esp32c6: '0x0' }

const ini = fs.readFileSync(path.join(src, 'platformio.ini'), 'utf8')
const version = (ini.match(/TDH_FW_VERSION=\\"([^\\"]+)\\"/) || [])[1] || 'unknown'

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

const targets = {}
for (const [env, bootAddr] of Object.entries(BOOTLOADER_ADDR)) {
  const build = path.join(src, '.pio', 'build', env)
  const files = [
    ['bootloader.bin', bootAddr],
    ['partitions.bin', '0x8000'],
    ['firmware.bin', '0x10000'],
  ]
  if (!files.every(([f]) => fs.existsSync(path.join(build, f)))) {
    console.log(`skip ${env} (not built)`)
    continue
  }
  fs.mkdirSync(path.join(out, env))
  targets[env] = {
    files: files.map(([f, address]) => {
      fs.copyFileSync(path.join(build, f), path.join(out, env, f))
      return { address, path: `${env}/${f}` }
    }),
  }
  console.log(`import ${env}`)
}

if (!Object.keys(targets).length) {
  console.error(`No builds found under ${src}/.pio/build — run "pio run" there first.`)
  process.exit(1)
}

const manifest = {
  name: 'Toodooh PAX Counter firmware',
  base: `Toodooh universal v${version}`,
  version,
  flashBaud: 460800,
  targets,
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`wrote ${path.join(out, 'manifest.json')}`)
