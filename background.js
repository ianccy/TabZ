// Notify new tab page when tabs change
chrome.tabs.onCreated.addListener(notifyNewTab);
chrome.tabs.onRemoved.addListener(notifyNewTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.title) {
    notifyNewTab();
  }
});
chrome.tabs.onMoved.addListener(notifyNewTab);
chrome.tabs.onActivated.addListener(notifyNewTab);

function notifyNewTab() {
  chrome.runtime.sendMessage({ type: 'tabs-updated' }).catch(() => {});
}

// === Auth message handler (chrome.identity only available in service worker) ===
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get-auth-token') {
    if (msg.clearFirst) {
      // Force clear cached token, then get fresh one with new scopes
      chrome.identity.getAuthToken({ interactive: false }, (oldToken) => {
        if (oldToken) {
          chrome.identity.removeCachedAuthToken({ token: oldToken }, () => {
            chrome.identity.getAuthToken({ interactive: msg.interactive }, (token) => {
              sendResponse({ token: chrome.runtime.lastError ? null : token || null });
            });
          });
        } else {
          chrome.identity.getAuthToken({ interactive: msg.interactive }, (token) => {
            sendResponse({ token: chrome.runtime.lastError ? null : token || null });
          });
        }
      });
    } else {
      chrome.identity.getAuthToken({ interactive: msg.interactive }, (token) => {
        if (chrome.runtime.lastError || !token) {
          sendResponse({ token: null });
        } else {
          sendResponse({ token });
        }
      });
    }
    return true;
  }

  if (msg.type === 'remove-auth-token') {
    chrome.identity.removeCachedAuthToken({ token: msg.token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
