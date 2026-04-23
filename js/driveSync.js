import { getToken } from './auth.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'TabZ_Storage';

async function callBackground(message) {
  const res = await chrome.runtime.sendMessage(message);
  if (!res) throw new Error('Background unavailable');
  if (res.error) throw new Error(res.error);
  return res;
}

async function ensureBgFolderId(token) {
  const { driveFolderId } = await chrome.storage.local.get('driveFolderId');
  if (driveFolderId) return driveFolderId;

  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const findRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (findRes.ok) {
    const { files } = await findRes.json();
    if (files?.length > 0) {
      const folderId = files[0].id;
      await chrome.storage.local.set({ driveFolderId: folderId });
      return folderId;
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
  if (!createRes.ok) {
    throw new Error(`Drive create folder failed: ${createRes.status}`);
  }
  const folder = await createRes.json();
  await chrome.storage.local.set({ driveFolderId: folder.id });
  return folder.id;
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
  const token = await getToken();
  const folderId = await ensureBgFolderId(token);

  if (previousFileId) {
    try {
      await fetch(`${DRIVE_API}/files/${previousFileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {
      // ignore - previous file may already be removed
    }
  }

  const metadata = { name: fileName, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob, fileName);

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,modifiedTime`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });

  if (!res.ok) {
    throw new Error(`Drive bg upload failed: ${res.status}`);
  }

  const payload = await res.json();
  return {
    fileId: payload.id,
    modifiedTime: Number(new Date(payload.modifiedTime).getTime()) || Date.now()
  };
}

export async function downloadBgImage(fileId) {
  const token = await getToken();
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Drive bg download failed: ${res.status}`);
  }
  return await res.blob();
}

export async function deleteBgImage(fileId) {
  await callBackground({ type: 'drive-bg-delete', fileId });
}
