# Mac beta design — web parity

The website is the design source, not a reference to approximate. Beta 2 opens the actual InFlite hub in one WebKit
view. Its rail, tab bar, type, colours, liquid glass, app logos, sheets, settings, responsive layout and transitions
come directly from the live website. The earlier native launcher and duplicate sidebar have been removed.

The only Mac-specific surface is a quiet 40 pt window bar with back/forward/reload, the real InFlite logo, browser
handoff and Mac settings. Standard window controls keep their usual position. File dialogs, menus and in-page find
stay native. Network/process failures offer recovery, but the website renders its own HTTP and sign-in error screens.

All native brand images are exact site SVGs in a compiled asset catalogue with original rendering. Marks retain their
own colours in both themes. System symbols describe actions; they do not stand in for service logos.

Go menu shortcuts use the same Today/Chats/Apps/You order as the web tabs. The website's own keyboard handling remains
available while its content has focus. Normal in-page navigation uses the website's existing SPA and draft behaviour.

Screenshots open the real public website without a demo account. Read-back reports verify its main document loaded.
Authenticated UI comparison and sign-in acceptance still require a real test account on a Mac.
