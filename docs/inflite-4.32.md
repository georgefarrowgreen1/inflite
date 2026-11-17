# InFlite 4.32

The 4.30 launcher and 4.31 native-app refinements are retained. Dismissed shortcut controls also require a connected action body and an open owning sheet, in addition to the existing account, route and app-access guards. A regression closes a real shortcut sheet, invokes its detached controls, and verifies that neither the route nor favourites change. The framework build advances so the existing code-only updater can renew the shell safely. Native app graphs remain immutable at 4.31.
