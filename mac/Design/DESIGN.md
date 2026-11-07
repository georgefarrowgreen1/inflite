# Mac beta design

## Direction

Give the existing InFlite world a calm Mac home. The window has a fixed 222 pt material sidebar, a restrained 58 pt
toolbar, and a flexible content area. App navigation stays in one place while each service keeps its familiar UI.
Keep the brand's four coloured petals and warm centre, softened violet selection, rounded type and spacious layouts.

The native Workspace is an honest launcher, not a simulated signed-in dashboard. A hero leads to Today; Mail, Weather,
Fitness and Markets each have a descriptive card and a corresponding sidebar item. The account entry explains sign-in.
No fake unread counts, balances, activity, weather or connection indicators.

## Refinements included

- Use the existing app identity, paired with native SF Symbols, materials and system typography.
- Keep sidebar colour as navigation feedback, with quiet neutral cards in the content area.
- A static orbital illustration adds warmth without an always-running animation; supports Reduce Motion by design.
- Preserve open app instances so switching views does not throw away unfinished input.
- Search is named **Switch app**: it searches destinations, not private account content.
- Host text in the toolbar makes account redirects visible; navigation controls expose back, forward and reload.
- Web failures offer reload and browser access; empty search states explain what happened.
- Short windows use a smaller hero and denser cards, keeping the app launchers within reach.
- Theme follows macOS by default, with explicit light/dark preferences.
- Use real button controls and descriptive accessibility labels; never depend on colour alone.
- First launch and Settings state the beta's functional limits, including mobile-only Chat and owner-only Mail.

## Next design pass

After account testing, assess the service pages at desktop sizes, duplicate web navigation, keyboard focus across
WebKit and SwiftUI, native notifications and session expiry. Native feature work should follow verified account flows.
