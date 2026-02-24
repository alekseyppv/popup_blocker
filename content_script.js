function getHostname() {
  try {
    return window.location.hostname;
  } catch {
    return '';
  }
}

function reportMiddleClickIfProtected(event) {
  if (event.button !== 1) {
    return;
  }

  const hostname = getHostname();
  if (!hostname) {
    return;
  }

  chrome.runtime.sendMessage({ type: 'is-domain-protected', hostname }, (response) => {
    if (!response?.protected) {
      return;
    }

    chrome.runtime.sendMessage({ type: 'middle-click' });
  });
}

document.addEventListener('mousedown', reportMiddleClickIfProtected, true);
