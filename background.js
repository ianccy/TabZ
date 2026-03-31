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

const AUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get-auth-token') {
    const opts = { interactive: msg.interactive, scopes: AUTH_SCOPES };

    if (msg.clearFirst) {
      // Clear all cached tokens then request fresh one
      chrome.identity.clearAllCachedAuthTokens(() => {
        chrome.identity.getAuthToken(opts, (token) => {
          sendResponse({ token: chrome.runtime.lastError ? null : token || null });
        });
      });
    } else {
      chrome.identity.getAuthToken(opts, (token) => {
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
    chrome.identity.clearAllCachedAuthTokens(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});
