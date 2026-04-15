#!/bin/bash
set -e

# Read version from manifest.json
VERSION=$(node -e "console.log(require('./manifest.json').version)")
NAME=$(node -e "console.log(require('./manifest.json').name.toLowerCase().replace(/\s+/g, '-'))")
ZIP_NAME="${NAME}-v${VERSION}.zip"

# Clean previous build
rm -rf dist/
rm -f "${ZIP_NAME}"

mkdir -p dist/js dist/icons

# Core extension files
cp manifest.json   dist/
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
