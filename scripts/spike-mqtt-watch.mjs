// Subscribe to the broker and watch this device's topics; decode the battery
// message on port /8. Usage: node spike-mqtt-watch.mjs [seconds]
import mqtt from 'mqtt'

const HOST = process.env.MQTT_HOST || '54.38.26.121'
const USER = process.env.MQTT_USER || 'toodooh'
const PASS = process.env.MQTT_PASS || ''
const CLIENT = process.env.PAX_CLIENT || 'paxcounter_b6a8b421'
const SECONDS = Number(process.argv[2] || 150)

const client = mqtt.connect(`mqtt://${HOST}:1883`, {
  username: USER,
  password: PASS,
  clientId: 'toodooh-watch-' + USER,
  reconnectPeriod: 2000,
})

client.on('connect', () => {
  console.log(`connected to broker ${HOST}; subscribing to paxcounter/${CLIENT}/#`)
  client.subscribe(`paxcounter/${CLIENT}/#`)
  client.subscribe('paxcounter/#') // catch-all in case clientId differs
})
client.on('error', (e) => console.error('broker error:', e.message))

client.on('message', (topic, payload) => {
  const raw = payload.toString()
  const bytes = Buffer.from(raw, 'base64')
  const hex = bytes.toString('hex')
  const port = topic.split('/').pop()
  let note = ''
  if (port === 'agent') {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${topic}  AGENT CODE = "${raw}" (plain string, retained)`)
    return
  }
  if (port === '8' && bytes.length >= 2) {
    const be = bytes.readUInt16BE(0)
    const le = bytes.readUInt16LE(0)
    note = `  -> BATTERY mV: BE=${be}  LE=${le}`
  }
  if (port === '1') note = '  -> COUNT data'
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${topic}  b64=${raw}  bytes=${hex}${note}`)
})

setTimeout(() => {
  console.log('watch window ended.')
  client.end(true, () => process.exit(0))
}, SECONDS * 1000)
