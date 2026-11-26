# InFlite for iPhone

Beta **0.2.1**, build **1**, targets iOS 17 and later. SwiftUI renders the InFlite workspace and its apps using the existing InFlite services. Native authentication exchanges a one-time code for an account session stored in the device Keychain.

The app includes Today, Weather, Markets, Fitness, Mail, Chats, Notes, Calendar, People, Files and Status. The workspace also includes native Quick Capture, Reminders, Settings, device notification history, About, Contact and legal pages. Native Mail preserves its existing account and verification requirements and renders message text and links with iOS attachment previews. Chats uses the existing encrypted conversation protocol. Fitness route planning uses MapKit and the existing route service.

Today opens linked calendar entries and reminders directly. Quick Capture saves unfinished text on the device and restores it when reopened. The dock uses account-specific pins and includes a compact layout for larger text. On launch, a recent read-only Today summary can appear while the app verifies the session and refreshes its data.

Some advanced web workflows have no equivalent in this beta. These include full HTML Mail layout, specialized Mail tools and advanced Fitness training-plan editing. Atlas has no iPhone entry. The notification inbox reads delivered device notifications. Live native delivery needs an APNs provider and device registration.

## Run on a Mac

Open [InFlite.xcodeproj](InFlite.xcodeproj) in Xcode 26, choose the **InFlite** scheme and an iPhone simulator, then choose **Run**. The shared scheme includes native workspace and backend tests. The iOS beta workflow builds and tests on macOS and packages the simulator app. Unzip the package and drag `InFlite.app` into a booted iPhone simulator to install it.

For route testing, use a supported link such as `inflite://weather` or `inflite://mail`. Signing in opens the native Today screen.

## Run on an iPhone

Set `DEVELOPMENT_TEAM` in `Config/Signing.local.xcconfig` to the Apple Developer team that owns the app’s bundle identifier. Select the iPhone as the Xcode run destination.

Passkeys and HTTPS app links need the Associated Domains capability, a matching provisioning profile, and live `apple-app-site-association` documents. The InFlite Worker serves its association on `inflite.ai` when `IOS_APPLICATION_IDENTIFIER` is set to the profile’s full application identifier, such as `EXAMPLE123.ai.inflite.ios`. The older passkey domain `georgefarrowgreen.com` needs its own association. Set `CODE_SIGN_ENTITLEMENTS = InFlite/InFlite.entitlements` in the local signing configuration. Verify passkeys, password recovery with a passkey, and Universal Links on a signed iPhone.

Password reset and computer sign-in links can also be pasted into their native screens. Mail’s additive Later pagination and inline attachment metadata require the updated Mail Worker. The GitHub Actions simulator package and unsigned iPhone archive are for verification. TestFlight needs Apple distribution signing and App Store Connect configuration.
