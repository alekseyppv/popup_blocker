const STORAGE_KEY = 'protectedDomains';
const MIDDLE_CLICK_TTL_MS = 2000;

const state = {
  protectedDomains: new Set(),
  middleClickAllowanceByTab: new Map()
};

async function loadProtectedDomains() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const domains = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
  state.protectedDomains = new Set(domains.map(normalizeDomain).filter(Boolean));
}

function normalizeDomain(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }

  const clean = value.trim().toLowerCase();
  if (!clean) {
    return '';
  }

  if (clean.includes('://')) {
    try {
      return new URL(clean).hostname;
    } catch {
      return '';
    }
  }

  return clean.replace(/^\.+|\.+$/g, '');
}

function isProtectedHost(hostname) {
  const normalized = normalizeDomain(hostname);
  if (!normalized) {
    return false;
  }

  if (state.protectedDomains.has(normalized)) {
    return true;
  }

  const parts = normalized.split('.');
  for (let i = 1; i < parts.length - 1; i += 1) {
    const suffix = parts.slice(i).join('.');
    if (state.protectedDomains.has(suffix)) {
      return true;
    }
  }

  return false;
}

async function getTabHostname(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) {
      return '';
    }
    return new URL(tab.url).hostname;
  } catch {
    return '';
  }
}

function cleanupMiddleClickAllowance() {
  const now = Date.now();
  for (const [tabId, expiresAt] of state.middleClickAllowanceByTab.entries()) {
    if (expiresAt <= now) {
      state.middleClickAllowanceByTab.delete(tabId);
    }
  }
}

function consumeMiddleClickAllowance(tabId) {
  cleanupMiddleClickAllowance();
  const expiresAt = state.middleClickAllowanceByTab.get(tabId);
  if (!expiresAt || expiresAt <= Date.now()) {
    state.middleClickAllowanceByTab.delete(tabId);
    return false;
  }

  state.middleClickAllowanceByTab.delete(tabId);
  return true;
}

async function shouldBlockNewTab(tab) {
  if (!tab.openerTabId || tab.openerTabId === chrome.tabs.TAB_ID_NONE) {
    return false;
  }

  const openerHost = await getTabHostname(tab.openerTabId);
  if (!isProtectedHost(openerHost)) {
    return false;
  }

  const openerTab = await chrome.tabs.get(tab.openerTabId).catch(() => null);
  const openedInNewWindow = !openerTab || openerTab.windowId !== tab.windowId;

  if (openedInNewWindow) {
    return true;
  }

  const wasAllowedByMiddleClick = consumeMiddleClickAllowance(tab.openerTabId);
  return !wasAllowedByMiddleClick;
}

chrome.runtime.onInstalled.addListener(() => {
  loadProtectedDomains();
});

chrome.runtime.onStartup.addListener(() => {
  loadProtectedDomains();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes[STORAGE_KEY]) {
    const next = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
    state.protectedDomains = new Set(next.map(normalizeDomain).filter(Boolean));
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'middle-click' && sender.tab?.id) {
    state.middleClickAllowanceByTab.set(sender.tab.id, Date.now() + MIDDLE_CLICK_TTL_MS);
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === 'is-domain-protected') {
    const hostname = normalizeDomain(message.hostname);
    sendResponse({ protected: isProtectedHost(hostname) });
  }
});

chrome.tabs.onCreated.addListener(async (tab) => {
  const block = await shouldBlockNewTab(tab);
  if (!block || !tab.id) {
    return;
  }

  await chrome.tabs.remove(tab.id).catch(() => {});

  if (tab.windowId !== chrome.windows.WINDOW_ID_NONE) {
    const tabsInWindow = await chrome.tabs.query({ windowId: tab.windowId }).catch(() => []);
    if (tabsInWindow.length === 0) {
      await chrome.windows.remove(tab.windowId).catch(() => {});
    }
  }
});

loadProtectedDomains();
