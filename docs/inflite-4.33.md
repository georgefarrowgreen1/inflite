# InFlite 4.33

An app hold can open or shrink its shortcut dialog before the pointer is released. Chromium can then target the dialog backdrop with the release click, which used to dismiss the new panel. The input owner now consumes that single release at document capture, scoped to the original button or returned shortcut sheet. Suppression expires after pointerup and clears on cancellation or teardown; subsequent clicks and keyboard commands retain their native behavior.

Regressions hold and release icons in both the library and dock, verify that the panel stays open without launching an action, and then exercise Escape/Back. The complete 14-case launcher suite passes with CI's Playwright 1.62.1/Chromium driver. Launcher regressions run first in test:web so a failure is reported before the longer material and ecosystem matrix; the full suite remains included. The 4.31 immutable native app graphs and 4.32 stale-control guard are unchanged.
