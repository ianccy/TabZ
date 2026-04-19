import { t } from './i18n.js';
import { getStatus as getAuthStatus } from './auth.js';
import { uploadBgImage, downloadBgImage, deleteBgImage } from './driveSync.js';
import { logError } from './logger.js';
import { saveBgToCache, loadBgFromCache, clearBgCache as clearBgCacheDB } from './bgCache.js';
import { loadCloudData, saveCloudData } from './storage.js';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

let currentObjectUrl = null;

function releaseObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

function applyBlobAsBackground(blob) {
  releaseObjectUrl();
  currentObjectUrl = URL.createObjectURL(blob);
  document.body.style.backgroundImage = `url("${currentObjectUrl}")`;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center';
  document.body.style.backgroundAttachment = 'fixed';
  document.body.style.backgroundColor = '';
  document.body.classList.add('has-bg-image');
}

function clearBackgroundDisplay() {
  releaseObjectUrl();
  document.body.style.backgroundImage = '';
  document.body.classList.remove('has-bg-image');
}

export async function clearBgCache() {
  await clearBgCacheDB();
  clearBackgroundDisplay();
}

async function applyCachedBackground() {
  try {
    const entry = await loadBgFromCache();
    if (entry?.blob) {
      applyBlobAsBackground(entry.blob);
      return true;
    }
  } catch (err) {
    logError('applyCachedBackground failed:', err);
  }
  return false;
}

export async function initBackgroundImage() {
  await applyCachedBackground();
}

export async function uploadBackgroundImage(file) {
  if (!ALLOWED_MIME.includes(file.type)) {
    throw new Error(t('bgFileBadFormat'));
  }
  if (file.size > MAX_BYTES) {
    throw new Error(t('bgFileTooBig'));
  }

  const status = await getAuthStatus();
  if (!status.isSignedIn) {
    throw new Error(t('bgUploadHint'));
  }

  const ext = MIME_EXT[file.type];
  const fileName = `tabz-bg.${ext}`;

  const cloudData = await loadCloudData();
  const previousFileId = cloudData.background?.fileId || null;

  const { fileId, modifiedTime } = await uploadBgImage(file, fileName, previousFileId);

  cloudData.background = { fileId, fileName, modifiedTime };
  await saveCloudData(cloudData, { immediate: true });

  await saveBgToCache({ blob: file, fileId, modifiedTime });
  applyBlobAsBackground(file);

  await chrome.storage.local.remove('bgImage');
}

export async function removeBackgroundImage() {
  const status = await getAuthStatus();
  const cloudData = await loadCloudData();
  const fileId = cloudData.background?.fileId || null;

  if (status.isSignedIn && fileId) {
    try {
      await deleteBgImage(fileId);
    } catch (err) {
      logError('Drive bg delete failed:', err);
    }
  }

  cloudData.background = null;
  await saveCloudData(cloudData, { immediate: true });
  await clearBgCache();
}
