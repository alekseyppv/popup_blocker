const STORAGE_KEY = 'protectedDomains';

const domainListElement = document.getElementById('domain-list');
const emptyStateElement = document.getElementById('empty-state');
const addCurrentButton = document.getElementById('add-current');
const template = document.getElementById('domain-item-template');

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

async function getDomains() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const current = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
  return [...new Set(current.map(normalizeDomain).filter(Boolean))].sort();
}

async function saveDomains(domains) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: domains });
}

function renderDomains(domains) {
  domainListElement.innerHTML = '';

  for (const domain of domains) {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector('.domain-name').textContent = domain;
    fragment.querySelector('.remove-domain').addEventListener('click', async () => {
      const next = domains.filter((item) => item !== domain);
      await saveDomains(next);
      renderDomains(next);
    });
    domainListElement.appendChild(fragment);
  }

  emptyStateElement.style.display = domains.length ? 'none' : 'block';
}

async function addCurrentDomain() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.url) {
    return;
  }

  let hostname = '';
  try {
    hostname = new URL(activeTab.url).hostname;
  } catch {
    return;
  }

  const domain = normalizeDomain(hostname);
  if (!domain) {
    return;
  }

  const domains = await getDomains();
  if (!domains.includes(domain)) {
    domains.push(domain);
    domains.sort();
    await saveDomains(domains);
  }

  renderDomains(domains);
}

addCurrentButton.addEventListener('click', addCurrentDomain);

(async () => {
  const domains = await getDomains();
  renderDomains(domains);
})();
