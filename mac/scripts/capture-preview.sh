#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
for mode in light dark sample-light sample-dark sample-you; do
    appearance=light
    [[ "$mode" = *dark ]] && appearance=dark
    defaults write ai.inflite.mac.beta appearance -string "$appearance"
    report="$PWD/dist/capture-$mode.json"
    rm -f "$report"
    args=(--capture-report "$report")
    if [[ "$mode" = sample* ]]; then args+=(--fixture-path "$PWD/Tests/InFliteCoreTests/Fixtures/boot.json"); fi
    if [ "$mode" = sample-you ]; then args+=(--screen you); fi
    open dist/InFlite.app --args "${args[@]}"
    for attempt in $(seq 1 60); do
        [ -f "$report" ] && break
        sleep 1
    done
    [ -f "$report" ] || { echo "Native Today did not finish loading" >&2; exit 1; }
    cat "$report"
    sleep 3
    osascript -e 'tell application "InFlite" to activate'
    pgrep -x InFlite
    window_id=$(swift -e 'import CoreGraphics
      let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
      if let window = windows.first(where: { ($0[kCGWindowOwnerName as String] as? String) == "InFlite" && ($0[kCGWindowLayer as String] as? Int) == 0 }), let id = window[kCGWindowNumber as String] as? Int { print(id) }')
    if [ -n "$window_id" ]; then
        screencapture -x -o -l "$window_id" "dist/InFlite-Mac-$mode.png"
    else
        echo "No visible InFlite window" >&2
        exit 1
    fi
    osascript -e 'tell application "InFlite" to quit'
    python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); assert r["loaded"] and r["surface"] == "SwiftUI" and r["sampleData"] == sys.argv[2].startswith("sample"), r' "$report" "$mode"
    sleep 1
done
