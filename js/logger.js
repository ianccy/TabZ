function detectDevBuild() {
  try {
    const manifest = chrome.runtime?.getManifest?.();
    if (!manifest) return true;

    // Unpacked extension has no update_url; bundled/published build usually has one.
    return !manifest.update_url;
  } catch {
    return true;
  }
}

export const IS_DEV_BUILD = detectDevBuild();

export function logError(...args) {
  if (IS_DEV_BUILD) console.error(...args);
}

export function logWarn(...args) {
  if (IS_DEV_BUILD) console.warn(...args);
}
