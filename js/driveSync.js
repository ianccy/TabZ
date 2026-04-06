async function callBackground(message, retries = 2) {
  try {
    const res = await chrome.runtime.sendMessage(message);
    if (res) {
      if (res.error) throw new Error(res.error);
      return res;
    }
  } catch (err) {
    if (retries <= 0) throw err;
  }
  if (retries <= 0) throw new Error('Background unavailable');
  await new Promise(r => setTimeout(r, 300));
  return callBackground(message, retries - 1);
}

export async function push(data, options = {}) {
  return callBackground({ type: 'drive-push', data, options });
}

export async function pull() {
  const res = await callBackground({ type: 'drive-pull' });
  return res.data ?? null;
}

export async function isRemoteNewer(localTimestamp) {
  const res = await callBackground({ type: 'drive-is-remote-newer', localTimestamp });
  return res.newer === true;
}

export async function exists() {
  const res = await callBackground({ type: 'drive-exists' });
  return res.exists === true;
}

export async function clearCache() {
  return callBackground({ type: 'drive-clear-cache' });
}

export async function ensureFile() {
  return callBackground({ type: 'drive-ensure-file' });
}
