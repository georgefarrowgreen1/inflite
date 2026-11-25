# InFlite for iPhone

Beta **0.1.0**, build **1**, targets iOS 17 and later. It opens the production InFlite apps in WebKit inside a SwiftUI app. The existing web screens, dock, settings, data and sign-in carry over. The iPhone app keeps its web session between launches and provides recovery when the connection or WebKit is interrupted. Downloads from InFlite open in the iOS share sheet.

## Run on a Mac

Open [InFlite.xcodeproj](InFlite.xcodeproj) in Xcode 26, choose the **InFlite** scheme and an iPhone simulator, then choose **Run**. The shared scheme includes navigation and recovery tests and a smoke test of the production sign-in screen. The iOS beta workflow builds and tests on macOS and packages the simulator app.

For route testing, use a supported link such as `inflite://weather` or `inflite://mail`. The first launch opens Today at `https://inflite.ai/`.

## Run on an iPhone

Set `DEVELOPMENT_TEAM` in `Config/Signing.local.xcconfig` to the Apple Developer team that owns the app’s bundle identifier. Select the iPhone as the Xcode run destination.

Passkeys and HTTPS app links need the Associated Domains capability, a provisioning profile that includes it, and matching `apple-app-site-association` files on the relevant live domains. Once those are set up, set `CODE_SIGN_ENTITLEMENTS = InFlite/InFlite.entitlements` in the local config and verify the flows on a signed device. The entitlements include the current `inflite.ai` passkey domain and `georgefarrowgreen.com` for older passkeys. The simulator package is for simulator testing. TestFlight and native push delivery need device signing and Apple Developer configuration.
