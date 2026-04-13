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

const FOLDER_NAME = 'TabZ_Storage';
const FILE_NAME = 'tabz-data.json';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

let cachedFolderId = null;
let cachedFileId = null;
let pushTimer = null;
let queuedPushPayload = null;
let pendingPushResolvers = [];

function isDevBuild() {
  try {
    const manifest = chrome.runtime?.getManifest?.();
    if (!manifest) return true;

    // Unpacked extension has no update_url; bundled/published build usually has one.
    return !manifest.update_url;
  } catch {
    return true;
  }
}

const IS_DEV_BUILD = isDevBuild();

function logWarn(...args) {
  if (IS_DEV_BUILD) console.warn(...args);
}

function getAuthToken(opts) {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken(opts, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
}

async function revokeToken(token) {
  if (!token) return;
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`
    });
  } catch (err) {
    logWarn('Token revoke failed:', err);
  }
}

async function ensureToken() {
  const token = await getAuthToken({ interactive: false, scopes: AUTH_SCOPES });
  if (!token) throw new Error('Not signed in');
  return token;
}

async function ensureFolderId(token) {
  if (cachedFolderId) return cachedFolderId;

  const { driveFolderId } = await chrome.storage.local.get('driveFolderId');
  if (driveFolderId) {
    cachedFolderId = driveFolderId;
    return cachedFolderId;
  }

  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.ok) {
    const { files } = await res.json();
    if (files?.length > 0) {
      cachedFolderId = files[0].id;
      await chrome.storage.local.set({ driveFolderId: cachedFolderId });
      return cachedFolderId;
    }
  }

  const createRes = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  if (!createRes.ok) throw new Error(`Drive create folder failed: ${createRes.status}`);
  const folder = await createRes.json();
  cachedFolderId = folder.id;
  await chrome.storage.local.set({ driveFolderId: cachedFolderId });
  return cachedFolderId;
}

async function findFolderId(token) {
  const { driveFolderId } = await chrome.storage.local.get('driveFolderId');
  if (driveFolderId) {
    cachedFolderId = driveFolderId;
    return driveFolderId;
  }

  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;

  const { files } = await res.json();
  if (!files?.length) return null;

  cachedFolderId = files[0].id;
  await chrome.storage.local.set({ driveFolderId: cachedFolderId });
  return cachedFolderId;
}

async function findFileId(token) {
  const folderId = await findFolderId(token);
  if (!folderId) return null;

  const q = encodeURIComponent(`name='${FILE_NAME}' and '${folderId}' in parents and trashed=false`);
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const { files } = await res.json();
  return files?.length > 0 ? files[0].id : null;
}

async function createFile(token) {
  const folderId = await ensureFolderId(token);
  const metadata = { name: FILE_NAME, parents: [folderId] };
  const initData = {
    version: 1,
    lastModified: Date.now(),
    collections: [],
    uiState: { collapsed: {}, collectionOrder: [] }
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(initData)], { type: 'application/json' }));

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  if (!res.ok) throw new Error(`Drive create file failed: ${res.status}`);
  const { id } = await res.json();
  return id;
}

async function ensureFileId(token) {
  if (cachedFileId) return cachedFileId;

  const { driveFileId } = await chrome.storage.local.get('driveFileId');
  if (driveFileId) {
    cachedFileId = driveFileId;
    return cachedFileId;
  }

  const existing = await findFileId(token);
  if (existing) {
    cachedFileId = existing;
    await chrome.storage.local.set({ driveFileId: cachedFileId });
    return cachedFileId;
  }

  cachedFileId = await createFile(token);
  await chrome.storage.local.set({ driveFileId: cachedFileId });
  return cachedFileId;
}

async function performDrivePush(data) {
  const token = await ensureToken();
  const fileId = await ensureFileId(token);
  const body = JSON.stringify(data);
  const res = await fetch(`${UPLOAD_API}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body
  });
  if (!res.ok) throw new Error(`Drive push failed: ${res.status}`);
}

async function queueDebouncedPush(data, debounceMs) {
  return new Promise((resolve, reject) => {
    queuedPushPayload = data;
    pendingPushResolvers.push({ resolve, reject });

    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      const resolvers = pendingPushResolvers;
      const payload = queuedPushPayload;
      pendingPushResolvers = [];
      queuedPushPayload = null;
      pushTimer = null;

      try {
        await performDrivePush(payload);
        for (const r of resolvers) r.resolve({ success: true });
      } catch (err) {
        for (const r of resolvers) r.reject(err);
      }
    }, debounceMs);
  });
}

async function drivePush(data, opts = {}) {
  const immediate = opts.immediate === true;
  const debounceMs = Number.isFinite(opts.debounceMs) ? opts.debounceMs : 3000;
  if (immediate) {
    await performDrivePush(data);
    return { success: true, debounced: false };
  }
  await queueDebouncedPush(data, debounceMs);
  return { success: true, debounced: true };
}

async function getFileModifiedTime(token, fileId) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?fields=modifiedTime`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;

  const { modifiedTime } = await res.json();
  const ts = new Date(modifiedTime).getTime();
  return Number.isFinite(ts) ? ts : null;
}

async function drivePull() {
  const token = await ensureToken();
  const fileId = await findFileId(token);
  if (!fileId) {
    cachedFileId = null;
    await chrome.storage.local.remove('driveFileId');
    return null;
  }

  cachedFileId = fileId;
  await chrome.storage.local.set({ driveFileId: fileId });

  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    if (res.status === 404) {
      cachedFileId = null;
      await chrome.storage.local.remove('driveFileId');
      return null;
    }
    throw new Error(`Drive pull failed: ${res.status}`);
  }

  const data = await res.json();
  const remoteModifiedTime = await getFileModifiedTime(token, fileId);

  return {
    data,
    remoteModifiedTime
  };
}

async function driveExists() {
  const token = await ensureToken();
  const fileId = await findFileId(token);
  return fileId !== null;
}

async function driveIsRemoteNewer(localTimestamp) {
  const token = await ensureToken();
  const fileId = await findFileId(token);
  if (!fileId) return false;

  const remoteTime = await getFileModifiedTime(token, fileId);
  if (!remoteTime) return false;
  return remoteTime > (localTimestamp || 0);
}

async function driveGetRemoteModifiedTime() {
  const token = await ensureToken();
  const fileId = await findFileId(token);
  if (!fileId) return null;

  const remoteTime = await getFileModifiedTime(token, fileId);
  return remoteTime;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get-auth-token') {
    const opts = { interactive: msg.interactive, scopes: AUTH_SCOPES };

    if (msg.clearFirst) {
      // Clear all cached tokens then request fresh one
      chrome.identity.clearAllCachedAuthTokens(() => {
        chrome.identity.getAuthToken(opts, (token) => {
          if (chrome.runtime.lastError || !token) {
            sendResponse({ token: null, error: chrome.runtime.lastError?.message || 'Failed to get auth token' });
          } else {
            sendResponse({ token });
          }
        });
      });
    } else {
      chrome.identity.getAuthToken(opts, (token) => {
        if (chrome.runtime.lastError || !token) {
          sendResponse({ token: null, error: chrome.runtime.lastError?.message || 'Failed to get auth token' });
        } else {
          sendResponse({ token });
        }
      });
    }
    return true;
  }

  if (msg.type === 'remove-auth-token') {
    (async () => {
      try {
        let tokenToRevoke = msg.token || null;
        if (!tokenToRevoke) {
          tokenToRevoke = await getAuthToken({ interactive: false, scopes: AUTH_SCOPES });
        }

        if (tokenToRevoke) {
          await revokeToken(tokenToRevoke);
          await new Promise((resolve) => {
            chrome.identity.removeCachedAuthToken({ token: tokenToRevoke }, () => resolve());
          });
        }

        await new Promise((resolve) => {
          chrome.identity.clearAllCachedAuthTokens(() => resolve());
        });

        // Cancel any pending debounced push before clearing auth state.
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = null;
        for (const r of pendingPushResolvers) r.resolve({ cancelled: true });
        pendingPushResolvers = [];
        queuedPushPayload = null;

        // Reset in-memory Drive cache tied to previous auth session.
        cachedFolderId = null;
        cachedFileId = null;

        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (msg.type === 'drive-cancel-pending-push') {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = null;
    const resolvers = pendingPushResolvers;
    pendingPushResolvers = [];
    queuedPushPayload = null;
    for (const r of resolvers) r.resolve({ cancelled: true });
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === 'drive-push') {
    drivePush(msg.data, msg.options || {})
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }

  if (msg.type === 'drive-pull') {
    drivePull()
      .then((result) => sendResponse(result || { data: null, remoteModifiedTime: null }))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }

  if (msg.type === 'drive-exists') {
    driveExists()
      .then((exists) => sendResponse({ exists }))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }

  if (msg.type === 'drive-is-remote-newer') {
    driveIsRemoteNewer(msg.localTimestamp)
      .then((newer) => sendResponse({ newer }))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }

  if (msg.type === 'drive-get-remote-modified-time') {
    driveGetRemoteModifiedTime()
      .then((remoteTime) => sendResponse({ remoteTime }))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }
});
