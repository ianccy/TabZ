import { t } from './i18n.js';
import { getStatus as getAuthStatus } from './auth.js';
import { uploadBgImage, downloadBgImage, deleteBgImage } from './driveSync.js';
import { logError } from './logger.js';
import { saveBgToCache, loadBgFromCache, clearBgCache as clearBgCacheDB } from './bgCache.js';

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
