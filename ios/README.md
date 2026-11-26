# InFlite for iPhone

Beta **0.2.0**, build **1**, targets iOS 17 and later. SwiftUI renders Today, Weather, Markets, Fitness, Mail, Notes, Calendar and Files using the existing InFlite services. The app uses InFlite’s hosted sign-in and keeps its session credential in the device Keychain.

The app includes the Today summary and agenda, weather forecasts and warnings, market quotes and holdings, fitness plans and activities, Mail folders and plain-text messages, Notes and Calendar editing, and Files browsing and export. Mail preserves the existing account and recent verification requirements. Chats, People, full account management and Status open through their existing web screens. Advanced Mail features and detailed fitness planning remain available on the web.

## Run on a Mac

Open [InFlite.xcodeproj](InFlite.xcodeproj) in Xcode 26, choose the **InFlite** scheme and an iPhone simulator, then choose **Run**. The shared scheme includes native workspace and backend tests. The iOS beta workflow builds and tests on macOS and packages the simulator app. Unzip the package and drag `InFlite.app` into a booted iPhone simulator to install it.

For route testing, use a supported link such as `inflite://weather` or `inflite://mail`. Signing in opens the native Today screen.

## Run on an iPhone

Set `DEVELOPMENT_TEAM` in `Config/Signing.local.xcconfig` to the Apple Developer team that owns the app’s bundle identifier. Select the iPhone as the Xcode run destination.

Passkeys and HTTPS app links need the Associated Domains capability, a provisioning profile that includes it, and matching `apple-app-site-association` files on the relevant live domains. Once those are set up, set `CODE_SIGN_ENTITLEMENTS = InFlite/InFlite.entitlements` in the local config and verify the flows on a signed device. The entitlements include the current `inflite.ai` passkey domain and `georgefarrowgreen.com` for older passkeys. The simulator package is for simulator testing. TestFlight and native push delivery need device signing and Apple Developer configuration.
