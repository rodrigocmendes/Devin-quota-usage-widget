const api = window.devinAPI;

const els = {
  app: document.getElementById('app'),
  demoBadge: document.getElementById('demoBadge'),
  // views
  usageView: document.getElementById('usageView'),
  loadingView: document.getElementById('loadingView'),
  setupView: document.getElementById('setupView'),
  errorView: document.getElementById('errorView'),
  settingsView: document.getElementById('settingsView'),
  // usage
  dailyValue: document.getElementById('dailyValue'),
  dailyBar: document.getElementById('dailyBar'),
  dailyPercent: document.getElementById('dailyPercent'),
  dailyRemaining: document.getElementById('dailyRemaining'),
  weeklyValue: document.getElementById('weeklyValue'),
  weeklyBar: document.getElementById('weeklyBar'),
  weeklyPercent: document.getElementById('weeklyPercent'),
  weeklyRemaining: document.getElementById('weeklyRemaining'),
  breakdown: document.getElementById('breakdown'),
  lastUpdated: document.getElementById('lastUpdated'),
  // setup / error
  errorTitle: document.getElementById('errorTitle'),
  errorText: document.getElementById('errorText'),
  // onboarding (setup view)
  openDevinBtn: document.getElementById('openDevinBtn'),
  setupApiKey: document.getElementById('setupApiKey'),
  setupOrgId: document.getElementById('setupOrgId'),
  setupError: document.getElementById('setupError'),
  setupDemoBtn: document.getElementById('setupDemoBtn'),
  setupSaveBtn: document.getElementById('setupSaveBtn'),
  // buttons
  refreshBtn: document.getElementById('refreshBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  minimizeBtn: document.getElementById('minimizeBtn'),
  closeBtn: document.getElementById('closeBtn'),
  retryBtn: document.getElementById('retryBtn'),
  cancelSettings: document.getElementById('cancelSettings'),
  saveSettings: document.getElementById('saveSettings'),
  openDevinSettings: document.getElementById('openDevinSettings'),
  docsLink: document.getElementById('docsLink'),
  // settings fields
  demoMode: document.getElementById('demoMode'),
  apiKey: document.getElementById('apiKey'),
  orgId: document.getElementById('orgId'),
  dailyLimit: document.getElementById('dailyLimit'),
  weeklyLimit: document.getElementById('weeklyLimit'),
  warnThreshold: document.getElementById('warnThreshold'),
  dangerThreshold: document.getElementById('dangerThreshold'),
  refreshMinutes: document.getElementById('refreshMinutes'),
  theme: document.getElementById('theme'),
  alwaysOnTop: document.getElementById('alwaysOnTop')
};

const VIEW_HEIGHTS = {
  usage: 252,
  loading: 200,
  setup: 360,
  error: 230,
  settings: 490
};

const DEVIN_SETTINGS_URL = 'https://app.devin.ai/settings';

let currentSettings = null;

const PRODUCT_COLORS = {
  devin: '#6c8cff',
  cascade: '#9b6cff',
  terminal: '#34c759',
  review: '#ffb020'
};

function showView(name) {
  if (name !== 'usage') els.demoBadge.style.display = 'none';
  els.usageView.style.display = name === 'usage' ? 'block' : 'none';
  els.loadingView.style.display = name === 'loading' ? 'flex' : 'none';
  els.setupView.style.display = name === 'setup' ? 'flex' : 'none';
  els.errorView.style.display = name === 'error' ? 'flex' : 'none';
  els.settingsView.style.display = name === 'settings' ? 'flex' : 'none';
  api.resizeWindow(VIEW_HEIGHTS[name] || 360);
}

function applyTheme(theme) {
  els.app.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
}

function barClass(percent, settings) {
  if (percent >= settings.dangerThreshold) return 'bar-fill danger';
  if (percent >= settings.warnThreshold) return 'bar-fill warn';
  return 'bar-fill';
}

function fmt(n) {
  return (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function renderUsage(usage, settings) {
  els.demoBadge.style.display = usage.demo ? 'inline-block' : 'none';

  const d = usage.daily;
  els.dailyValue.textContent = `${fmt(d.used)} / ${fmt(d.limit)}`;
  els.dailyBar.style.width = `${Math.min(100, d.percent)}%`;
  els.dailyBar.className = barClass(d.percent, settings);
  els.dailyPercent.textContent = `${Math.round(d.percent)}%`;
  els.dailyRemaining.textContent = `${fmt(Math.max(0, d.limit - d.used))} left`;

  const w = usage.weekly;
  els.weeklyValue.textContent = `${fmt(w.used)} / ${fmt(w.limit)}`;
  els.weeklyBar.style.width = `${Math.min(100, w.percent)}%`;
  els.weeklyBar.className = barClass(w.percent, settings);
  els.weeklyPercent.textContent = `${Math.round(w.percent)}%`;
  els.weeklyRemaining.textContent = `${fmt(Math.max(0, w.limit - w.used))} left`;

  renderBreakdown(usage.breakdown);

  const dt = new Date(usage.fetchedAt);
  els.lastUpdated.textContent = `Updated ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function renderBreakdown(breakdown) {
  els.breakdown.innerHTML = '';
  if (!breakdown) return;
  const order = ['devin', 'cascade', 'terminal', 'review'];
  for (const key of order) {
    const val = Number(breakdown[key]) || 0;
    if (val <= 0) continue;
    const chip = document.createElement('span');
    chip.className = 'chip';
    const dot = document.createElement('i');
    dot.style.background = PRODUCT_COLORS[key];
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(`${key} ${fmt(val)}`));
    els.breakdown.appendChild(chip);
  }
}

function errorMessage(result) {
  switch (result.error) {
    case 'unauthorized':
      return { title: 'Unauthorized', text: 'Your API key or Org ID was rejected. Check them in Settings.' };
    case 'network':
      return { title: 'Connection error', text: 'Could not reach api.devin.ai. Check your network and try again.' };
    case 'http':
      return { title: 'Request failed', text: result.detail || 'The Devin API returned an error.' };
    case 'parse':
      return { title: 'Unexpected response', text: 'Could not read the API response.' };
    default:
      return { title: 'Something went wrong', text: result.detail || 'Unknown error.' };
  }
}

async function loadUsage(showLoading = true) {
  if (showLoading) showView('loading');
  els.refreshBtn.classList.add('spinning');
  try {
    const result = await api.fetchUsageData();
    if (result.ok) {
      renderUsage(result.usage, currentSettings);
      showView('usage');
    } else if (result.error === 'missing-credentials') {
      showSetup();
    } else {
      const msg = errorMessage(result);
      els.errorTitle.textContent = msg.title;
      els.errorText.textContent = msg.text;
      showView('error');
    }
  } catch (err) {
    els.errorTitle.textContent = 'Something went wrong';
    els.errorText.textContent = String(err);
    showView('error');
  } finally {
    els.refreshBtn.classList.remove('spinning');
  }
}

async function showSetup() {
  const creds = await api.getCredentials();
  els.setupApiKey.value = creds.apiKey || '';
  els.setupOrgId.value = creds.orgId || '';
  els.setupError.style.display = 'none';
  showView('setup');
}

async function connectFromSetup() {
  const apiKey = els.setupApiKey.value.trim();
  const orgId = els.setupOrgId.value.trim();
  if (!apiKey || !orgId) {
    return setupError('Paste both your API key and Org ID.');
  }
  if (!apiKey.startsWith('cog_')) {
    return setupError('API key should start with "cog_".');
  }
  if (!orgId.startsWith('org-')) {
    return setupError('Org ID should start with "org-".');
  }
  els.setupError.style.display = 'none';
  await api.saveCredentials({ apiKey, orgId });
  if (currentSettings.demoMode) {
    currentSettings = await api.saveSettings({ ...currentSettings, demoMode: false });
  }
  await loadUsage();
}

function setupError(text) {
  els.setupError.textContent = text;
  els.setupError.style.display = 'block';
}

async function enableDemoFromSetup() {
  currentSettings = await api.saveSettings({ ...currentSettings, demoMode: true });
  await loadUsage();
}

function fillSettingsForm() {
  els.demoMode.checked = !!currentSettings.demoMode;
  els.dailyLimit.value = currentSettings.dailyLimit;
  els.weeklyLimit.value = currentSettings.weeklyLimit;
  els.warnThreshold.value = currentSettings.warnThreshold;
  els.dangerThreshold.value = currentSettings.dangerThreshold;
  els.refreshMinutes.value = currentSettings.refreshMinutes;
  els.theme.value = currentSettings.theme;
  els.alwaysOnTop.checked = !!currentSettings.alwaysOnTop;
}

async function openSettings() {
  const creds = await api.getCredentials();
  els.apiKey.value = creds.apiKey || '';
  els.orgId.value = creds.orgId || '';
  fillSettingsForm();
  showView('settings');
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

async function saveSettings() {
  const newSettings = {
    demoMode: els.demoMode.checked,
    dailyLimit: Math.max(1, toInt(els.dailyLimit.value, currentSettings.dailyLimit)),
    weeklyLimit: Math.max(1, toInt(els.weeklyLimit.value, currentSettings.weeklyLimit)),
    warnThreshold: Math.min(100, Math.max(1, toInt(els.warnThreshold.value, currentSettings.warnThreshold))),
    dangerThreshold: Math.min(100, Math.max(1, toInt(els.dangerThreshold.value, currentSettings.dangerThreshold))),
    refreshMinutes: Math.min(120, Math.max(1, toInt(els.refreshMinutes.value, currentSettings.refreshMinutes))),
    theme: els.theme.value,
    alwaysOnTop: els.alwaysOnTop.checked
  };

  await api.saveCredentials({ apiKey: els.apiKey.value.trim(), orgId: els.orgId.value.trim() });
  currentSettings = await api.saveSettings(newSettings);
  applyTheme(currentSettings.theme);
  await loadUsage();
}

function bindEvents() {
  els.refreshBtn.addEventListener('click', () => loadUsage(false));
  els.settingsBtn.addEventListener('click', openSettings);
  els.minimizeBtn.addEventListener('click', () => api.minimizeWindow());
  els.closeBtn.addEventListener('click', () => api.closeWindow());
  els.openDevinBtn.addEventListener('click', () => api.openExternal(DEVIN_SETTINGS_URL));
  els.setupSaveBtn.addEventListener('click', connectFromSetup);
  els.setupDemoBtn.addEventListener('click', enableDemoFromSetup);
  els.retryBtn.addEventListener('click', () => loadUsage());
  els.cancelSettings.addEventListener('click', () => loadUsage());
  els.saveSettings.addEventListener('click', saveSettings);
  els.openDevinSettings.addEventListener('click', (e) => {
    e.preventDefault();
    api.openExternal(DEVIN_SETTINGS_URL);
  });
  els.docsLink.addEventListener('click', (e) => {
    e.preventDefault();
    api.openExternal('https://docs.devin.ai/api-reference/v3/consumption/organizations-consumption-daily');
  });
  api.onRefreshUsage(() => loadUsage(false));
}

async function init() {
  bindEvents();
  currentSettings = await api.getSettings();
  applyTheme(currentSettings.theme);
  await loadUsage();
}

init();
