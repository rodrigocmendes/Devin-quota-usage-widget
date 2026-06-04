const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_EXTERNAL_DOMAINS = [
  'devin.ai',
  'docs.devin.ai',
  'app.devin.ai',
  'github.com'
];

function isAllowedExternalUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_EXTERNAL_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

contextBridge.exposeInMainWorld('devinAPI', {
  // Credentials
  getCredentials: () => ipcRenderer.invoke('get-credentials'),
  saveCredentials: (credentials) => ipcRenderer.invoke('save-credentials', credentials),
  deleteCredentials: () => ipcRenderer.invoke('delete-credentials'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Usage data
  fetchUsageData: () => ipcRenderer.invoke('fetch-usage-data'),
  getUsageHistory: () => ipcRenderer.invoke('get-usage-history'),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  resizeWindow: (height) => ipcRenderer.send('resize-window', height),
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  setWindowPosition: (position) => ipcRenderer.invoke('set-window-position', position),

  // Misc
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url) => {
    if (isAllowedExternalUrl(url)) {
      ipcRenderer.send('open-external', url);
    } else {
      console.warn('openExternal blocked — URL not allowed:', url);
    }
  },

  // Events
  onRefreshUsage: (callback) => {
    ipcRenderer.on('refresh-usage', () => callback());
  },

  platform: process.platform
});
