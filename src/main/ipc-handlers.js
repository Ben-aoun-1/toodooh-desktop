import { BrowserWindow } from 'electron'
import { listPorts, openSerialMonitor, closeSerialMonitor } from './serial-manager'
import { flashFirmware, getManifest } from './flasher'
import { provisionWifi } from './provision'

export function registerIpcHandlers(ipcMain) {
  ipcMain.handle('get-ports', async () => {
    return await listPorts()
  })

  ipcMain.handle('get-firmware-info', async () => {
    try {
      const m = getManifest()
      return { ok: true, base: m.base, board: m.board }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // Full flow behind one click: flash -> reboot -> provision WiFi -> confirm online.
  ipcMain.handle('flash-device', async (event, { comPort, ssid, pass, agent }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const log = (line) => win.webContents.send('flash-output', { line: line.endsWith('\n') ? line : line + '\n' })
    const progress = (data) => win.webContents.send('flash-progress', data)

    try {
      progress({ phase: 'flashing', percent: 0 })
      log('Flashing firmware...')
      await flashFirmware(comPort, {
        onLog: log,
        onProgress: ({ percent }) => progress({ phase: 'flashing', percent }),
      })

      progress({ phase: 'provisioning' })
      const res = await provisionWifi(comPort, ssid, pass, agent, { onLog: log })

      if (res.mqttConnected) {
        progress({ phase: 'online' })
        return { success: true, ...res }
      }
      if (res.wifiConnected) {
        progress({ phase: 'wifi-only' })
        return { success: true, online: false, ...res }
      }
      progress({ phase: 'error' })
      return {
        success: false,
        ...res,
        error: res.authFail ? 'wifi-auth' : 'no-connect',
      }
    } catch (err) {
      progress({ phase: 'error' })
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('serial-open', async (event, port) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return await openSerialMonitor(port, 115200, win)
  })

  ipcMain.handle('serial-close', async () => {
    return await closeSerialMonitor()
  })
}
