// Set the next shell build and its user-visible release note together.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../today/public/app.js', import.meta.url);
const worker = new URL('../today/public/sw.js', import.meta.url);
const script = readFileSync(worker, 'utf8');
const source = readFileSync(file, 'utf8');
const current = /^const BUILD = "(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)";$/m.exec(source);
if (!current) throw Error('Expected a major.feature.minor shell build.');
const release = 'const RELEASE = "' + current.slice(1).join('.') + '";';
if (!script.includes(release)) throw Error('Shell and worker releases must match.');
const [action, ...words] = process.argv.slice(2);
function seal(source) {
  const paths = ['FILES', 'OS_FILES'].flatMap(key => JSON.parse(new RegExp('const ' + key + ' = (\\[[^\\]]*\\]);').exec(source)[1]));
  const hashes = Object.fromEntries(paths.filter(path => path !== '/').map(path => {
    const bytes = readFileSync(new URL('.' + path, worker));
    return [path, 'sha256-' + createHash('sha256').update(bytes).digest('base64')];
  }));
  return source.replace(/^const INTEGRITY = .*;$/m, 'const INTEGRITY = ' + JSON.stringify(hashes) + ';');
}
if (action === '--assets') {
  writeFileSync(worker, seal(script));
} else if (action === '--check') {
  if (seal(script) !== script) throw Error('Refresh shell asset integrity with npm run release:shell -- --assets.');
  console.log(current.slice(1).join('.'));
} else {
  const note = words.join(' ').trim();
  if (!['major', 'feature', 'minor'].includes(action) || !note || /[\r\n]/.test(note))
    throw Error('Usage: npm run release:shell -- major|feature|minor "Release note"');
  const [major, feature, minor] = current.slice(1).map(Number);
  const next = action === 'major' ? [major + 1, 0, 1] : action === 'feature' ? [major, feature + 1, 1] : [major, feature, minor + 1];
  if (!next.every(Number.isSafeInteger) || !/^const NEWS = .*;$/m.test(source)) throw Error('Invalid release metadata.');
  const version = next.join('.');
  writeFileSync(file, source.replace(current[0], 'const BUILD = "' + version + '";')
    .replace(/^const NEWS = .*;$/m, () => 'const NEWS = ' + JSON.stringify(note) + ';'));
  writeFileSync(worker, seal(script.replace(release, 'const RELEASE = "' + version + '";')));
  console.log(version);
}
