# InFlite 4.04

Windows now use a distinct translucent material, rather than the near-opaque content material. At the default intensity of 70, windows are 83.2% opaque and floating chrome 79%; at maximum intensity these become 76% and 70%. Dark material keeps a restrained palette-derived tint. The existing account switch and 0–100 slider continue to control all apps without changing saved preferences.

Nested groups use a lightweight inset material so multiple nearly opaque layers no longer hide the backdrop. Window-specific primary and secondary inks retain readable contrast. Static text-entry wells, charts, file results, document bodies, financial/training data and semantic destructive actions remain readable and preserve their meaning. Only outer floating windows and chrome sample the backdrop; repeated rows do not gain expensive blur layers.

The pass covers the persistent shell/dock, native sheets and floating app panes, Files, Mail, Account/Auth, Fitness, Weather, Markets, Chats and Status. Geometry, animations, focus ownership, drafts, authentication, encryption and data APIs are preserved. Reduced transparency, increased contrast, unsupported backdrop filters, forced colors and the master-off setting retain opaque fallbacks.

Validation checks actual rendered backdrop transmission, rather than merely testing an alpha CSS value. Real dock, sheet, window and header surfaces must visibly change against different scenes. Both browser engines also verify text contrast across all six palettes, light/dark modes and intensity 0/70/100, plus the existing runtime controls and accessibility/geometry contracts.
