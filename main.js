const { app, BrowserWindow, ipcMain, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');

const DEVIN_API_BASE = 'https://api.devin.ai/v3';
const SECONDS_PER_DAY = 86400;
// Devin billing days start at midnight PST, which corresponds to 08:00 UTC.
const PST_OFFSET_SECONDS = 8 * 3600;

const store = new Store({
  defaults: {
    credentials: {
      apiKey: '',
      orgId: ''
    },
    settings: {
      dailyLimit: 50,
      weeklyLimit: 250,
      refreshMinutes: 5,
      warnThreshold: 75,
      dangerThreshold: 90,
      theme: 'dark',
      alwaysOnTop: true,
      demoMode: false
    },
    windowPosition: null,
    usageHistory: []
  }
});

let mainWindow = null;
let tray = null;
let refreshTimer = null;
let isQuitting = false;

/**
 * Unix timestamp (seconds) of the most recent midnight PST at or before `dateMs`.
 */
function pstMidnightUnix(dateMs) {
  const shifted = new Date(dateMs - PST_OFFSET_SECONDS * 1000);
  const flooredUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  );
  return Math.floor(flooredUtc / 1000) + PST_OFFSET_SECONDS;
}

function createWindow() {
  const savedPosition = store.get('windowPosition');
  const settings = store.get('settings');

  mainWindow = new BrowserWindow({
    width: 340,
    height: 420,
    minWidth: 300,
    minHeight: 200,
    x: savedPosition ? savedPosition.x : undefined,
    y: savedPosition ? savedPosition.y : undefined,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('moved', () => {
    const [x, y] = mainWindow.getPosition();
    store.set('windowPosition', { x, y });
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Devin Quota Usage');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Widget',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Refresh Now',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('refresh-usage');
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });
}

function scheduleAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const settings = store.get('settings');
  const minutes = Math.max(1, Number(settings.refreshMinutes) || 5);
  refreshTimer = setInterval(() => {
    if (mainWindow) mainWindow.webContents.send('refresh-usage');
  }, minutes * 60 * 1000);
}

function recordHistory(usage) {
  const history = store.get('usageHistory') || [];
  history.push({
    timestamp: Date.now(),
    daily: usage.daily.used,
    weekly: usage.weekly.used
  });
  // Keep ~7 days of points at a 5-minute cadence.
  const trimmed = history.slice(-2016);
  store.set('usageHistory', trimmed);
}

function buildDemoUsage() {
  const settings = store.get('settings');
  const dailyUsed = Math.round(settings.dailyLimit * 0.42 * 10) / 10;
  const weeklyUsed = Math.round(settings.weeklyLimit * 0.63 * 10) / 10;
  return {
    demo: true,
    fetchedAt: Date.now(),
    daily: {
      used: dailyUsed,
      limit: settings.dailyLimit,
      percent: Math.min(100, (dailyUsed / settings.dailyLimit) * 100)
    },
    weekly: {
      used: weeklyUsed,
      limit: settings.weeklyLimit,
      percent: Math.min(100, (weeklyUsed / settings.weeklyLimit) * 100)
    },
    breakdown: { devin: weeklyUsed * 0.7, cascade: weeklyUsed * 0.2, terminal: weeklyUsed * 0.1 }
  };
}

async function fetchUsageData() {
  const settings = store.get('settings');

  if (settings.demoMode) {
    const usage = buildDemoUsage();
    recordHistory(usage);
    return { ok: true, usage };
  }

  const { apiKey, orgId } = store.get('credentials');
  if (!apiKey || !orgId) {
    return { ok: false, error: 'missing-credentials' };
  }

  const now = Date.now();
  const todayPst = pstMidnightUnix(now);
  const timeAfter = todayPst - 8 * SECONDS_PER_DAY;
  const timeBefore = Math.floor(now / 1000) + SECONDS_PER_DAY;

  const url = `${DEVIN_API_BASE}/organizations/${encodeURIComponent(orgId)}/consumption/daily` +
    `?time_after=${timeAfter}&time_before=${timeBefore}`;

  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
  } catch (err) {
    return { ok: false, error: 'network', detail: String(err) };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: 'unauthorized' };
  }
  if (!response.ok) {
    return { ok: false, error: 'http', detail: `HTTP ${response.status}` };
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    return { ok: false, error: 'parse', detail: String(err) };
  }

  const entries = Array.isArray(data.consumption_by_date) ? data.consumption_by_date : [];
  const weekStart = todayPst - 6 * SECONDS_PER_DAY;

  let dailyUsed = 0;
  let weeklyUsed = 0;
  const breakdown = { devin: 0, cascade: 0, terminal: 0, review: 0 };

  for (const entry of entries) {
    const entryDate = Number(entry.date);
    const acus = Number(entry.acus) || 0;
    if (entryDate === todayPst) {
      dailyUsed += acus;
    }
    if (entryDate >= weekStart && entryDate <= todayPst) {
      weeklyUsed += acus;
      const p = entry.acus_by_product || {};
      breakdown.devin += Number(p.devin) || 0;
      breakdown.cascade += Number(p.cascade) || 0;
      breakdown.terminal += Number(p.terminal) || 0;
      breakdown.review += Number(p.review) || 0;
    }
  }

  const round = (n) => Math.round(n * 100) / 100;
  const usage = {
    demo: false,
    fetchedAt: now,
    daily: {
      used: round(dailyUsed),
      limit: settings.dailyLimit,
      percent: settings.dailyLimit > 0 ? Math.min(100, (dailyUsed / settings.dailyLimit) * 100) : 0
    },
    weekly: {
      used: round(weeklyUsed),
      limit: settings.weeklyLimit,
      percent: settings.weeklyLimit > 0 ? Math.min(100, (weeklyUsed / settings.weeklyLimit) * 100) : 0
    },
    breakdown
  };

  recordHistory(usage);
  return { ok: true, usage };
}

function registerIpc() {
  ipcMain.handle('get-credentials', () => store.get('credentials'));

  ipcMain.handle('save-credentials', (_event, credentials) => {
    store.set('credentials', {
      apiKey: credentials.apiKey || '',
      orgId: credentials.orgId || ''
    });
    return store.get('credentials');
  });

  ipcMain.handle('delete-credentials', () => {
    store.set('credentials', { apiKey: '', orgId: '' });
    return true;
  });

  ipcMain.handle('get-settings', () => store.get('settings'));

  ipcMain.handle('save-settings', (_event, settings) => {
    const merged = { ...store.get('settings'), ...settings };
    store.set('settings', merged);
    if (mainWindow) mainWindow.setAlwaysOnTop(!!merged.alwaysOnTop);
    scheduleAutoRefresh();
    return merged;
  });

  ipcMain.handle('fetch-usage-data', () => fetchUsageData());

  ipcMain.handle('get-usage-history', () => store.get('usageHistory') || []);

  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('get-window-position', () => {
    if (!mainWindow) return null;
    const [x, y] = mainWindow.getPosition();
    return { x, y };
  });

  ipcMain.handle('set-window-position', (_event, position) => {
    if (mainWindow && position) {
      mainWindow.setPosition(Math.round(position.x), Math.round(position.y));
    }
    return true;
  });

  ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.hide();
  });

  ipcMain.on('close-window', () => {
    isQuitting = true;
    app.quit();
  });

  ipcMain.on('resize-window', (_event, height) => {
    if (mainWindow && height) {
      const [width] = mainWindow.getSize();
      mainWindow.setSize(width, Math.round(height));
    }
  });

  ipcMain.on('open-external', (_event, url) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  createTray();
  scheduleAutoRefresh();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep running in the tray; quit handled explicitly.
});

app.on('before-quit', () => {
  isQuitting = true;
});
