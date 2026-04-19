#!/bin/bash
set -e

# manifest.json on disk carries the dev client_id for unpacked local dev;
# build.sh swaps in prod_client_id from build.config.json at bundle time.
if [ ! -f build.config.json ]; then
  echo "✗ build.config.json not found — cannot resolve prod_client_id" >&2
  exit 1
fi

# Read version from manifest.json
VERSION=$(node -e "console.log(require('./manifest.json').version)")
NAME=$(node -e "console.log(require('./manifest.json').name.toLowerCase().replace(/\s+/g, '-'))")
ZIP_NAME="${NAME}-v${VERSION}.zip"

# Clean previous build
rm -rf dist/
rm -f "${ZIP_NAME}"

mkdir -p dist/js dist/icons

# Core extension files — manifest.json gets prod client_id injected
node -e "
  const fs = require('fs');
  const m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const c = JSON.parse(fs.readFileSync('build.config.json', 'utf8'));
  if (!c.prod_client_id) throw new Error('build.config.json missing prod_client_id');
  m.oauth2.client_id = c.prod_client_id;
  fs.writeFileSync('dist/manifest.json', JSON.stringify(m, null, 2) + '\n');
"
cp background.js   dist/
cp newtab.html     dist/
cp newtab.css      dist/
cp popup.html      dist/
cp popup.css       dist/
cp popup.js        dist/

# JS modules
cp js/app.js       dist/js/
cp js/auth.js      dist/js/
cp js/bookmarks.js dist/js/
cp js/backgroundImage.js dist/js/
cp js/bgCache.js   dist/js/
cp js/dragdrop.js  dist/js/
cp js/driveSync.js dist/js/
cp js/i18n.js      dist/js/
cp js/logger.js    dist/js/
cp js/render.js    dist/js/
cp js/storage.js   dist/js/

# Icons (only required sizes)
cp icons/icon16.png  dist/icons/
cp icons/icon48.png  dist/icons/
cp icons/icon128.png dist/icons/

# Zip for Chrome Web Store upload
cd dist && zip -r "../${ZIP_NAME}" . && cd ..

echo "✓ Built: ${ZIP_NAME}"
echo "  $(du -sh "${ZIP_NAME}" | cut -f1)  $(unzip -l "${ZIP_NAME}" | tail -1 | awk '{print $2}') files"
