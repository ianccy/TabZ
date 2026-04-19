async function callBackground(message) {
  const res = await chrome.runtime.sendMessage(message);
  if (!res) throw new Error('Background unavailable');
  if (res.error) throw new Error(res.error);
  return res;
}

export async function push(data, options = {}) {
  return callBackground({ type: 'drive-push', data, options });
}

export async function pull() {
  const res = await callBackground({ type: 'drive-pull' });
  return {
    data: res.data ?? null,
    remoteModifiedTime: Number(res.remoteModifiedTime) || null
  };
}

export async function isRemoteNewer(localTimestamp) {
  const res = await callBackground({ type: 'drive-is-remote-newer', localTimestamp });
  return res.newer === true;
}

export async function getRemoteModifiedTime() {
  const res = await callBackground({ type: 'drive-get-remote-modified-time' });
  return Number(res.remoteTime) || 0;
}

export async function cancelPendingPush() {
  return callBackground({ type: 'drive-cancel-pending-push' });
}

export async function exists() {
  const res = await callBackground({ type: 'drive-exists' });
  return res.exists === true;
}

export async function uploadBgImage(blob, fileName, previousFileId = null) {
  const arrayBuffer = await blob.arrayBuffer();
  const res = await callBackground({
    type: 'drive-bg-upload',
    arrayBuffer,
    mimeType: blob.type,
    fileName,
    previousFileId
  });
  return {
    fileId: res.fileId,
    modifiedTime: Number(res.modifiedTime) || Date.now()
  };
}

export async function downloadBgImage(fileId) {
  const res = await callBackground({ type: 'drive-bg-download', fileId });
  if (!res.arrayBuffer) return null;
  return new Blob([res.arrayBuffer], { type: res.contentType });
}

export async function deleteBgImage(fileId) {
  await callBackground({ type: 'drive-bg-delete', fileId });
}
