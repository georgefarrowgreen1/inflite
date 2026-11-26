#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
config=ios/Config/Beta.xcconfig
version=$(awk '$1 == "MARKETING_VERSION" { print $3 }' "$config")
build=$(awk '$1 == "CURRENT_PROJECT_VERSION" { print $3 }' "$config")
bundle_id=$(awk '$1 == "PRODUCT_BUNDLE_IDENTIFIER" { print $3 }' "$config")
archive="$RUNNER_TEMP/InFlite.xcarchive"
app="$archive/Products/Applications/InFlite.app"
plist_buddy=/usr/libexec/PlistBuddy

build_archive() {
  local sdk actual_version actual_build
  xcodebuild -version
  sdk=$(xcrun --sdk iphoneos --show-sdk-version)
  if [[ ${sdk%%.*} -lt 26 ]]; then
    echo "The iPhoneOS 26 SDK or later is required for App Store upload." >&2
    exit 1
  fi
  xcodebuild -project ios/InFlite.xcodeproj -scheme InFlite -configuration Release \
    -destination "generic/platform=iOS" -derivedDataPath "$RUNNER_TEMP/inflite-device-build" \
    -archivePath "$archive" "$@" archive

  actual_version=$("$plist_buddy" -c 'Print CFBundleShortVersionString' "$app/Info.plist")
  actual_build=$("$plist_buddy" -c 'Print CFBundleVersion' "$app/Info.plist")
  test "$actual_version" = "$version"
  test "$actual_build" = "$build"
  test "$("$plist_buddy" -c 'Print CFBundleIdentifier' "$app/Info.plist")" = "$bundle_id"
  test "$("$plist_buddy" -c 'Print CFBundleSupportedPlatforms:0' "$app/Info.plist")" = "iPhoneOS"
  test "$("$plist_buddy" -c 'Print DTSDKName' "$app/Info.plist")" = "iphoneos$sdk"
  test "$(xcrun lipo -archs "$app/InFlite")" = "arm64"
  echo "Verified InFlite $version ($build) for iPhoneOS using SDK $sdk."
}

if [[ ${1:-} == archive ]]; then
  build_archive CODE_SIGNING_ALLOWED=NO
  ditto -c -k --keepParent "$archive" "$RUNNER_TEMP/InFlite-iPhone-Archive.zip"
  printf 'version=%s\nbuild=%s\n' "$version" "$build" >> "$GITHUB_OUTPUT"
  exit 0
fi

if [[ ${1:-} != upload || ${GITHUB_REF_NAME:-} != "ios-app-store-$version-$build" ]]; then
  echo "Use the ios-app-store-$version-$build tag to upload this build." >&2
  exit 1
fi

missing=0
for secret in IOS_DISTRIBUTION_CERTIFICATE_BASE64 IOS_DISTRIBUTION_CERTIFICATE_PASSWORD \
  IOS_APP_STORE_PROFILE_BASE64 APP_STORE_CONNECT_KEY_ID APP_STORE_CONNECT_ISSUER_ID \
  APP_STORE_CONNECT_PRIVATE_KEY; do
  if [[ -z ${!secret:-} ]]; then
    printf 'Missing app-store secret %s\n' "$secret" >&2
    missing=1
  fi
done
if [[ "$missing" -eq 1 ]]; then
  exit 1
fi

umask 077
signing=$(mktemp -d "$RUNNER_TEMP/inflite-signing.XXXXXX")
keychain="$signing/ios-signing.keychain-db"
installed_profile=
cleanup() {
  if [[ -n "$installed_profile" ]]; then
    rm -f "$installed_profile"
  fi
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  rm -rf "$signing"
}
trap cleanup EXIT

printf '%s' "$IOS_DISTRIBUTION_CERTIFICATE_BASE64" | base64 -D > "$signing/distribution.p12"
printf '%s' "$IOS_APP_STORE_PROFILE_BASE64" | base64 -D > "$signing/distribution.mobileprovision"
printf '%s\n' "$APP_STORE_CONNECT_PRIVATE_KEY" > "$signing/app-store-connect.p8"
unset IOS_DISTRIBUTION_CERTIFICATE_BASE64 IOS_APP_STORE_PROFILE_BASE64 APP_STORE_CONNECT_PRIVATE_KEY

keychain_password=$(openssl rand -hex 24)
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$signing/distribution.p12" -P "$IOS_DISTRIBUTION_CERTIFICATE_PASSWORD" \
  -t cert -f pkcs12 -k "$keychain" -T /usr/bin/codesign
unset IOS_DISTRIBUTION_CERTIFICATE_PASSWORD
security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain"

security cms -D -i "$signing/distribution.mobileprovision" -o "$signing/profile.plist"
python3 - "$signing" "$bundle_id" <<'PY'
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID
import plistlib
import sys

directory = Path(sys.argv[1])
bundle_id = sys.argv[2]
with (directory / "profile.plist").open("rb") as source:
    profile = plistlib.load(source)
entitlements = profile["Entitlements"]
identifier = entitlements.get("application-identifier", "")
prefixes = profile["ApplicationIdentifierPrefix"]
if not any(identifier == f"{prefix}.{bundle_id}" for prefix in prefixes):
    sys.exit(f"The provisioning profile must match {bundle_id}.")
if profile.get("ProvisionedDevices") or profile.get("ProvisionsAllDevices") or entitlements.get("get-task-allow"):
    sys.exit("Use an App Store distribution provisioning profile.")
if profile["ExpirationDate"].replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
    sys.exit("The App Store provisioning profile has expired.")
if "com.apple.developer.associated-domains" not in entitlements:
    sys.exit("Enable Associated Domains on the App ID before generating its provisioning profile.")

with (directory / "export.plist").open("wb") as output:
    plistlib.dump({
        "method": "app-store-connect",
        "destination": "upload",
        "signingStyle": "manual",
        "signingCertificate": "Apple Distribution",
        "teamID": profile["TeamIdentifier"][0],
        "provisioningProfiles": {bundle_id: str(UUID(profile["UUID"])).upper()},
        "manageAppVersionAndBuildNumber": False,
    }, output)
PY

team_id=$("$plist_buddy" -c 'Print TeamIdentifier:0' "$signing/profile.plist")
profile_id=$("$plist_buddy" -c "Print provisioningProfiles:$bundle_id" "$signing/export.plist")
profile_dir="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
mkdir -p "$profile_dir"
installed_profile="$profile_dir/$profile_id.mobileprovision"
cp "$signing/distribution.mobileprovision" "$installed_profile"
build_archive CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="Apple Distribution" \
  DEVELOPMENT_TEAM="$team_id" PROVISIONING_PROFILE_SPECIFIER="$profile_id" \
  CODE_SIGN_ENTITLEMENTS=InFlite/InFlite.entitlements
codesign --verify --deep --strict "$app"

xcodebuild -exportArchive -archivePath "$archive" -exportPath "$signing/export" \
  -exportOptionsPlist "$signing/export.plist" -allowProvisioningUpdates \
  -authenticationKeyPath "$signing/app-store-connect.p8" \
  -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID" \
  -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID"
