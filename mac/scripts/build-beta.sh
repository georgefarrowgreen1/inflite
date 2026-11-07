#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$PWD/dist"
APP="$OUT/InFlite.app"
swift test
swift build -c release --arch arm64 --arch x86_64
BIN=$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN/InFlite" "$APP/Contents/MacOS/InFlite"
cp Resources/Info.plist "$APP/Contents/Info.plist"
xcrun actool Resources/BrandAssets.xcassets --compile "$APP/Contents/Resources" \
    --platform macosx --minimum-deployment-target 14.0 --target-device mac \
    --output-format human-readable-text --notices --warnings
ICONSET="$OUT/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
    sips -z "$size" "$size" Resources/AppIcon.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" Resources/AppIcon.png --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
lipo "$APP/Contents/MacOS/InFlite" -verify_arch arm64 x86_64
plutil -lint "$APP/Contents/Info.plist"
cp README.md "$OUT/Read Me.md"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT/InFlite-Mac-0.1.0-beta.3.zip"
STAGING="$OUT/dmg"
mkdir -p "$STAGING"
ditto "$APP" "$STAGING/InFlite.app"
cp "$OUT/Read Me.md" "$STAGING/Read Me.md"
ln -sfn /Applications "$STAGING/Applications"
hdiutil create -volname "InFlite Beta" -srcfolder "$STAGING" -ov -format UDZO "$OUT/InFlite-Mac-0.1.0-beta.3.dmg"
(cd "$OUT" && shasum -a 256 *.zip *.dmg > SHA256SUMS.txt)
echo "Built $APP"
