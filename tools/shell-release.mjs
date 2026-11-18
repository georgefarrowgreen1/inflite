// Set the next shell build and its user-visible release note together.
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../today/public/app.js', import.meta.url);
const source = readFileSync(file, 'utf8');
const current = /^const BUILD = "(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)";$/m.exec(source);
if (!current) throw Error('Expected a major.feature.minor shell build.');
const [action, ...words] = process.argv.slice(2);
if (action === '--check') {
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
  console.log(version);
}
