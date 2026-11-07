#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
for appearance in light dark; do
    defaults write ai.inflite.mac.beta appearance -string "$appearance"
    open dist/InFlite.app --args --design-preview
    sleep 4
    osascript -e 'tell application "InFlite" to activate'
    pgrep -x InFlite
    window_id=$(swift -e 'import CoreGraphics
      let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
      if let window = windows.first(where: { ($0[kCGWindowOwnerName as String] as? String) == "InFlite" && ($0[kCGWindowLayer as String] as? Int) == 0 }), let id = window[kCGWindowNumber as String] as? Int { print(id) }')
    if [ -n "$window_id" ]; then
        screencapture -x -o -l "$window_id" "dist/InFlite-Mac-$appearance.png"
    else
        echo "No visible InFlite window" >&2
        exit 1
    fi
    osascript -e 'tell application "InFlite" to quit'
    sleep 1
done
