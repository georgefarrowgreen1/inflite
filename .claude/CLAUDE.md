# Working on this repository

- Mail (`email/`) is independently versioned. On its next release, use the same major.feature.minor convention on its own major series, and update `BUILD` and `NEWS` together in `email/public/app.js`.
- For every shell release, use `major.feature.minor` as documented in the README. Update `BUILD` and `NEWS` together in `today/public/app.js`. Its InFlite menu and its
  way in are copied from the georgefarrowgreen repo: `node .tools/iflmenu.mjs ../inflite/email/public ../inflite/today/public`
  and `node .tools/signin.mjs ../inflite/today/public` there.
