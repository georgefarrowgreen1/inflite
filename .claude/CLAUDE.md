# Working on this repository

- Mail (`email/`): with every change to Mail that is pushed, raise its build number by 0.01 (`BUILD` in
  `email/public/app.js`, shown in the profile menu as V1.01, V1.02, ...), in the same commit, and say what's new in `NEWS` beside it
  (shown once the update's in; Mail updates itself when the number changes: InFlite's menu, `IFL.updates`).
- Today (`today/`, the root Worker at inflite.ai): with every change to Today that is pushed, raise its build number by
  0.01 (`BUILD` in `today/public/app.js`, shown in its menu as V1.01, V1.02, ...), in the same commit, and say what's new
  in `NEWS` beside it (Today updates itself when the number changes: `/version`, `IFL.updates`). Its InFlite menu and its
  way in are copied from the georgefarrowgreen repo: `node .tools/iflmenu.mjs ../inflite/email/public ../inflite/today/public`
  and `node .tools/signin.mjs ../inflite/today/public` there.
