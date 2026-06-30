const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Serial ports
  getPorts: () => ipcRenderer.invoke('get-ports'),

  // Firmware bundle info (for the status bar)
  getFirmwareInfo: () => ipcRenderer.invoke('get-firmware-info'),

  // Flash + provision (one call does the whole flow)
  flashDevice: (config) => ipcRenderer.invoke('flash-device', config),

  // Streaming listeners (main -> renderer)
  onFlashOutput: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('flash-output', handler)
    return () => ipcRenderer.removeListener('flash-output', handler)
  },
  onFlashProgress: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('flash-progress', handler)
    return () => ipcRenderer.removeListener('flash-progress', handler)
  },

  // Serial monitor
  serialOpen: (port) => ipcRenderer.invoke('serial-open', port),
  serialClose: () => ipcRenderer.invoke('serial-close'),
  onSerialData: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('serial-data', handler)
    return () => ipcRenderer.removeListener('serial-data', handler)
  },
})
