// End-to-end hardware test of the real flash + provisioning code, no GUI:
//
//   node scripts/e2e-flash.mjs <COMx> <ssid> <pass> <agent>
//
// Bundles src/main/{flasher,provision}.js with esbuild and runs them inside
// Electron (flasher.js needs electron's `app` to find resources/firmware-bin).
import { build } from 'esbuild'
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [comPort, ssid, pass = '', agent = 'E2E-TEST'] = process.argv.slice(2)
if (!comPort || !ssid) {
  console.error('usage: node scripts/e2e-flash.mjs <COMx> <ssid> <pass> <agent>')
  process.exit(2)
}

const entry = `
import { app } from 'electron'
import { flashFirmware } from './src/main/flasher'
import { provisionWifi, classifyProvisioning } from './src/main/provision'
const [comPort, ssid, pass, agent] = JSON.parse(process.env.E2E_ARGS)
app.whenReady().then(async () => {
  let code = 1
  try {
    const { chip } = await flashFirmware(comPort, {
      onLog: (l) => process.stdout.write(l.endsWith('\\n') ? l : l + '\\n'),
      onProgress: ({ percent }) => percent % 25 === 0 && console.log('progress', percent + '%'),
    })
    console.log('E2E flashed chip', chip)
    const res = await provisionWifi(comPort, ssid, pass, agent, {
      onLog: (l) => console.log('  |', l),
      onPhase: (p) => console.log('E2E phase', p),
    })
    const outcome = classifyProvisioning(res)
    console.log('E2E result', JSON.stringify({ ...res, ...outcome }))
    code = outcome.success && outcome.online !== false ? 0 : 1
  } catch (e) {
    console.error('E2E error', e)
  }
  app.exit(code)
})
`

const outfile = path.join(root, 'out', 'e2e', 'index.js')
await build({
  stdin: { contents: entry, resolveDir: root, loader: 'js' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  external: ['electron', 'serialport', '@serialport/*'],
  logLevel: 'warning',
  plugins: [
    {
      // The vendored esptool.cjs sets __esModule, so esbuild's default-import
      // interop yields undefined; electron-vite hands over module.exports.
      // Wrap it so the bundle sees what the app sees.
      name: 'esptool-default',
      setup(b) {
        b.onResolve({ filter: /vendor[\\/]esptool\.cjs$/ }, (args) =>
          // The wrapper's own require() must resolve to the real file.
          args.namespace === 'esptool-wrap'
            ? undefined
            : { path: path.join(args.resolveDir, args.path), namespace: 'esptool-wrap' }
        )
        b.onLoad({ filter: /.*/, namespace: 'esptool-wrap' }, (args) => ({
          contents: `const m = require(${JSON.stringify(args.path)}); export default m;`,
          loader: 'js',
          resolveDir: path.dirname(args.path),
        }))
      },
    },
  ],
})

// flasher.js resolves firmware as <__dirname>/../../resources/firmware-bin.
const electron = createRequire(import.meta.url)('electron')
// Terminals inside VS Code inherit ELECTRON_RUN_AS_NODE, which turns Electron
// into plain Node (no `app`). Electron only checks that it is set, so drop it.
const env = { ...process.env, E2E_ARGS: JSON.stringify([comPort, ssid, pass, agent]) }
delete env.ELECTRON_RUN_AS_NODE
const r = spawnSync(electron, [outfile], { stdio: 'inherit', env })
process.exit(r.status ?? 1)
