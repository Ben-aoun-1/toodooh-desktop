// Web Serial API shim over node `serialport`, so esptool-js's Transport
// (which targets navigator.serial devices) can drive a port in Node/Electron.
// This is the reusable adapter the real app will use (will move to src/main).
import { SerialPort } from 'serialport'

export class NodeWebSerialPort {
  constructor(path, info = {}) {
    this._path = path
    this._info = info
    this._port = null
    this.readable = null
    this.writable = null
    // node-serialport's .set() resets ANY unspecified flag to its default
    // (dtr:true/rts:true), so we must always send both. Track current state.
    this._dtr = false
    this._rts = false
  }

  // Web Serial: getInfo() -> { usbVendorId, usbProductId }
  getInfo() {
    return { usbVendorId: this._info.usbVendorId, usbProductId: this._info.usbProductId }
  }

  async open(options = {}) {
    await new Promise((resolve, reject) => {
      this._port = new SerialPort(
        {
          path: this._path,
          baudRate: options.baudRate || 115200,
          dataBits: options.dataBits || 8,
          stopBits: options.stopBits || 1,
          parity: options.parity || 'none',
          autoOpen: false,
        },
        () => {}
      )
      this._port.open((err) => (err ? reject(err) : resolve()))
    })
    this._setupReadable()
    this._makeWritable()
  }

  _setupReadable() {
    const port = this._port
    this.readable = new ReadableStream({
      start: (controller) => {
        this._onData = (chunk) => {
          try {
            controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
          } catch {}
        }
        this._onClose = () => {
          try { controller.close() } catch {}
        }
        port.on('data', this._onData)
        port.once('close', this._onClose)
      },
      cancel: () => {
        if (this._onData) port.off('data', this._onData)
      },
    })
  }

  // esptool-js's flushOutput closes the writer; recreate so the device
  // stays usable for subsequent writes.
  _makeWritable() {
    const port = this._port
    this.writable = new WritableStream({
      write: (chunk) =>
        new Promise((resolve, reject) => {
          const buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
          port.write(buf, (err) => {
            if (err) return reject(err)
            port.drain((e) => (e ? reject(e) : resolve()))
          })
        }),
      close: () => { this._makeWritable() },
      abort: () => { this._makeWritable() },
    })
  }

  // Web Serial: setSignals({ dataTerminalReady, requestToSend })
  async setSignals(signals = {}) {
    if ('dataTerminalReady' in signals) this._dtr = signals.dataTerminalReady
    if ('requestToSend' in signals) this._rts = signals.requestToSend
    // Always send BOTH flags — node-serialport resets unspecified ones.
    await new Promise((resolve, reject) => {
      this._port.set({ dtr: this._dtr, rts: this._rts, brk: false }, (err) =>
        err ? reject(err) : resolve()
      )
    })
  }

  async close() {
    if (this._port && this._port.isOpen) {
      await new Promise((resolve) => this._port.close(() => resolve()))
    }
    this._port = null
    this.readable = null
    this.writable = null
  }
}
