// Validate the identities used by the updater, standalone scripts and native modules.
import { readFileSync } from 'node:fs';
import { REGISTRY } from '../today/public/roof/router.js';
const root = new URL('../', import.meta.url);
const apps = new URL('../georgefarrowgreen/', root);
const read = (base, path) => readFileSync(new URL(path, base), 'utf8');
const pattern = /^\d+\.\d+\.\d+$/;
function version(base, path) {
  const build = /\bconst (?:BUILD|APP_VERSION)\s*=\s*["']([\d.]+)["']/.exec(read(base,path))?.[1];
  if (!pattern.test(build)) throw Error('Expected major.feature.minor in ' + path);
  return build;
}
for (const [app, base, entry, module] of [
  ['Today',root,'today/public/app.js'], ['Mail',root,'email/public/app.js','email/public/roof/mail.js'],
  ['Weather',apps,'weather/app.js','weather/roof/weather.js'], ['Fitness',apps,'fitness/app.js','fitness/roof/fitness.js'],
  ['Markets',apps,'markets/app.js','markets/roof/markets.js'], ['Chats',apps,'pigeon/app.js','pigeon/roof/chats.js'],
  ['Account and sign-in',apps,'account/app.js'], ['Status',apps,'status/app.js']
]) {
  const build = version(base,entry);
  if (module && version(base,module) !== build) throw Error(app+' build mismatch');
  console.log(app,build);
}
for (const app of ['calendar','notes','people']) {
  const build = version(root,'today/public/'+app+'/roof/'+app+'.js');
  const path = REGISTRY[app].entry;
  if (!path.includes('/releases/'+build+'/') || version(root,'today/public'+path) !== build)
    throw Error(app+' published module mismatch');
  console.log(REGISTRY[app].name,build);
}
