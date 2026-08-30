#!/bin/bash
# Builds Lock Watch into /Applications. No dependencies, nothing downloaded.
set -e
APP="/Applications/Lock Watch.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Lock Watch</string>
  <key>CFBundleDisplayName</key><string>Lock Watch</string>
  <key>CFBundleIdentifier</key><string>com.ghostlock.lockwatch</string>
  <key>CFBundleExecutable</key><string>LockWatch</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

swiftc -O -framework Cocoa -framework CoreAudio -framework CoreMediaIO -framework ServiceManagement \
  LockWatch.swift -o "$APP/Contents/MacOS/LockWatch"

# icon: white padlock on black, from the same artwork as the Lock app
if [ -f icon.png ]; then
  ICONSET=$(mktemp -d)/AppIcon.iconset; mkdir -p "$ICONSET"
  for s in 16 32 64 128 256 512; do
    sips -z $s $s icon.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null 2>&1
    sips -z $((s*2)) $((s*2)) icon.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null 2>&1
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns" 2>/dev/null || true
fi

# ad-hoc sign so macOS treats it as a stable, consistent app
codesign --force --deep --sign - "$APP" 2>/dev/null || true
echo "Built: $APP"
