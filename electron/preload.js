const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform detection
  platform: process.platform,
  isElectron: true,
  
  // App info
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Window controls (for custom title bar if needed)
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  // Native notifications
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  
  // File system (for future native file handling)
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  
  // Deep linking / protocol handling
  onDeepLink: (callback) => ipcRenderer.on('deep-link', (event, url) => callback(url))
})

// Log that we're running in Electron
console.log('Trackli running in Electron')
