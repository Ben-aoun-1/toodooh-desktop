// Loop-back test for WiFi provisioning — no board required.
//
// socat gives us a virtual serial pair; one end runs a fake ESP32 that parses
// SET_WIFI exactly the way the firmware does (mqttclient.cpp
// wifi_provisioning_task: split on tab indexes, so empty fields survive), the
// other end runs the app's real provisionWifi(). Asserts that an OPEN network
// (no password) reaches the device as an EMPTY pass field rather than a
// dropped/shifted one.
//
// Usage: node scripts/test-provision-openwifi.mjs
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SerialPort } from 'serialport'
import { provisionWifi, buildSetWifiLine, DEFAULT_PROVISION_TIMEOUT_MS } from '../src/main/provision.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const dir = mkdtempSync(path.join(tmpdir(), 'tdh-pty-'))
const HOST = path.join(dir, 'host')
const DEV = path.join(dir, 'device')

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`)
}

// --- the fake ESP32 -------------------------------------------------------
// Mirrors the firmware parser byte for byte: read chars, break the line on
// \n or \r, then slice on the 1st/2nd/3rd tab.
function parseSetWifi(line) {
  if (!line.startsWith('SET_WIFI\t')) return null
  const t1 = line.indexOf('\t')
  const t2 = line.indexOf('\t', t1 + 1)
  if (!(t2 > t1)) return null
  const t3 = line.indexOf('\t', t2 + 1)
  return {
    ssid: line.slice(t1 + 1, t2),
    pass: t3 > t2 ? line.slice(t2 + 1, t3) : line.slice(t2 + 1),
    agent: t3 > t2 ? line.slice(t3 + 1) : '',
  }
}

function startFakeDevice(onParsed) {
  const port = new SerialPort({ path: DEV, baudRate: 115200 })
  let line = ''
  port.on('data', (buf) => {
    for (const ch of buf.toString('binary')) {
      if (ch === '\n' || ch === '\r') {
        const parsed = parseSetWifi(line)
        if (parsed) {
          onParsed(parsed)
          // Same sequence the firmware emits: ack, restart onto the new
          // credentials, join, get a lease, reach the broker.
          port.write('WIFI_SAVED\n')
          const open = parsed.pass ? 0 : 1
          setTimeout(() => port.write(`I (1103) src/mqttclient.cpp: WiFi connecting to SSID: ${parsed.ssid} (provisioned=1, open=${open})\n`), 100)
          setTimeout(() => port.write('I (2911) src/mqttclient.cpp: WIFI_GOT_IP ip=192.168.1.23 gw=192.168.1.1\n'), 200)
          setTimeout(() => port.write('MQTT server connected, subscribing...\n'), 300)
        }
        line = ''
      } else if (line.length < 200) {
        line += ch
      }
    }
  })
  return port
}

async function runCase(name, { ssid, pass, agent }, expected) {
  let parsed = null
  const device = startFakeDevice((p) => { parsed = p })
  await new Promise((r) => device.on('open', r))
  const res = await provisionWifi(HOST, ssid, pass, agent, { onLog: () => {}, timeoutMs: 15000 })
  await new Promise((r) => device.close(r))
  check(`${name} — fields seen by firmware`, parsed, expected)
  check(`${name} — provisioning result`, { saved: res.saved, wifi: res.wifiConnected, mqtt: res.mqttConnected },
    { saved: true, wifi: true, mqtt: true })
}

// --- wire-format unit checks (no serial) ----------------------------------
check('open network keeps the empty pass field',
  buildSetWifiLine('Cafe Wifi', '', 'AGENT-007'), 'SET_WIFI\tCafe Wifi\t\tAGENT-007\n')
check('open network without an agent',
  buildSetWifiLine('Cafe Wifi', '', ''), 'SET_WIFI\tCafe Wifi\t\n')
check('WPA network unchanged',
  buildSetWifiLine('Cafe Wifi', 'secret pass', 'AGENT-007'), 'SET_WIFI\tCafe Wifi\tsecret pass\tAGENT-007\n')
check('a tab inside a value cannot shift the fields',
  buildSetWifiLine('Ca\tfe', 'se\tcret', 'AG\tENT'), 'SET_WIFI\tCafe\tsecret\tAGENT\n')

// --- loop-back over a virtual serial pair ---------------------------------
if (!process.env.SKIP_SERIAL) {
  const socat = spawn('socat', [`PTY,raw,echo=0,link=${HOST}`, `PTY,raw,echo=0,link=${DEV}`])
  socat.on('error', (e) => { console.log('FAIL  socat could not start:', e.message); failures++ })
  for (let i = 0; i < 50 && !(existsSync(HOST) && existsSync(DEV)); i++) await sleep(100)

  if (existsSync(HOST) && existsSync(DEV)) {
    await runCase('WPA network', { ssid: 'Cafe des Sports', pass: 'p@ss word', agent: 'AGENT-007' },
      { ssid: 'Cafe des Sports', pass: 'p@ss word', agent: 'AGENT-007' })
    await runCase('OPEN network (no password)', { ssid: 'Cafe des Sports', pass: '', agent: 'AGENT-007' },
      { ssid: 'Cafe des Sports', pass: '', agent: 'AGENT-007' })
    await runCase('OPEN network, no agent', { ssid: 'Aeroport Free WiFi', pass: '', agent: '' },
      { ssid: 'Aeroport Free WiFi', pass: '', agent: '' })

    // The default timeout is the only thing standing between an installer and a
    // board that now reports ~100 s after the restart, so it must be the real one
    // — a literal creeping back into the signature would not fail any other check.
    // Capture the delay provisionWifi schedules rather than waiting it out.
    async function checkDefaultTimeoutWired() {
      const device = startFakeDevice(() => {})
      await new Promise((r) => device.on('open', r))
      const realSetTimeout = globalThis.setTimeout
      const delays = []
      globalThis.setTimeout = (fn, ms, ...rest) => {
        delays.push(ms)
        return realSetTimeout(fn, ms, ...rest)
      }
      try {
        await provisionWifi(HOST, 'Cafe des Sports', 'p@ss word', 'AGENT-007', { onLog: () => {} })
      } finally {
        globalThis.setTimeout = realSetTimeout
        await new Promise((r) => device.close(r))
      }
      check('provisionWifi with no timeoutMs schedules the real provisioning timeout',
        delays.includes(DEFAULT_PROVISION_TIMEOUT_MS), true)
    }

    await checkDefaultTimeoutWired()
  } else {
    console.log('FAIL  virtual serial pair never appeared')
    failures++
  }
  socat.kill()
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
