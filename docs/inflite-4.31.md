# InFlite 4.31

This completes the 4.30 launcher and native-app release without changing its visual design. Calendar, Notes and People load invitation/export controls only on explicit use, keeping each independent first-open JavaScript graph below the existing 14 KiB limit. The optional actions file is explicitly included in the native offline allowlist, connector and immutable release builder. Earlier app graphs remain untouched.

The native collection return finishes the editor's owned flush after the framework's initial scroll restoration. Its route/editor-generation guards then restore the collection's remembered position and originating record focus, without a later framework callback applying the editor's offset. A real long-list regression exercises this in Chromium and WebKit, alongside the launcher-shortcut, draft and immutable-asset checks. Lazy export tests retain note text, file names and exclusive calendar dates, and reject work after account release.

The shared sheet handles Escape on keydown so an inner page can return during an opening transition. Browser checks exercise that interruption and wait for the finite geometry animation before inspecting the restored controls. Module cancellation still uses AbortError and cannot adopt a released app or account.
