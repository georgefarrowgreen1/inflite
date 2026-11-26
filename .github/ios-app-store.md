# InFlite on the App Store

The [iOS App Store workflow](workflows/ios-app-store.yml) builds an iPhone device archive with Xcode on GitHub’s hosted macOS runner. It verifies the device platform, bundle identifier, version and build number against [the beta configuration](../ios/Config/Beta.xcconfig). The device archive attached to branch runs is unsigned.

## Connect the Apple team

1. Register the explicit iOS App ID `ai.inflite.ios` with Associated Domains enabled. Create the InFlite iOS app record in App Store Connect using that ID. The Account Holder needs to accept the current Apple agreements. [Apple’s app record setup](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)
2. Create an Apple Distribution certificate and export it with its private key in a password-protected `.p12`. Generate an App Store distribution provisioning profile for the App ID with that certificate. [Apple’s provisioning instructions](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/)
3. Generate an App Store Connect team API key with permission to upload builds. The workflow uses its key ID, issuer ID and private key to authenticate the upload. [Apple’s API key instructions](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/)

Create the `app-store` [GitHub environment](https://github.com/georgefarrowgreen1/inflite/settings/environments) and add these environment secrets.

| Secret | Value |
| --- | --- |
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Base64-encoded Apple Distribution `.p12` |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `IOS_APP_STORE_PROFILE_BASE64` | Base64-encoded App Store `.mobileprovision` |
| `APP_STORE_CONNECT_KEY_ID` | Team API key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | Team API issuer ID |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Contents of the team API `.p8` private key |

Keep the signing files and private key in GitHub Secrets. On macOS, use `base64 -i path/to/file` to encode each of the two binary signing files for its secret.

## Upload a build

Push `ios-app-store-0.2.0-1` on the revision for version `0.2.0`, build `1`. A release tag uses the version and build number in `ios/Config/Beta.xcconfig`. The tag run checks the provisioning profile, signs the iPhone archive and uploads it to App Store Connect. Give each new upload a distinct build number for its version. [Apple’s build upload requirements](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)

## Prepare for App Review

The signed app’s Associated Domains entitlement uses `inflite.ai` and `georgefarrowgreen.com`. Publish the association files with the Apple Team ID before testing passkeys and HTTPS app links on a signed iPhone. [Apple’s Associated Domains setup](https://developer.apple.com/documentation/xcode/supporting-associated-domains)

The public listing uses https://inflite.ai/privacy/ and https://inflite.ai/contact/ for privacy and support. App Review needs a working demo account and screenshots of the app in use. Enter the App Privacy and age rating answers in App Store Connect, then select the processed build for review. [Apple’s review guidelines](https://developer.apple.com/app-store/review/guidelines/)
