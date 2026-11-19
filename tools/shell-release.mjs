// Set the next shell build and its user-visible release note together.
import { sealShellWorker } from './shell-integrity.mjs';
import { settingsDocuments } from './settings-documents.mjs';
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
const documents = new URL("settings-documents.js", file);
const content = settingsDocuments(new URL(".", file));
if (action === '--assets') {
  writeFileSync(documents, content);
  writeFileSync(worker, sealShellWorker(script, worker));
} else if (action === '--check') {
  if (readFileSync(documents, "utf8") !== content) throw Error("Refresh Settings documents with npm run release:shell -- --assets.");
  if (sealShellWorker(script, worker) !== script) throw Error('Refresh shell asset integrity with npm run release:shell -- --assets.');
  console.log(current.slice(1).join('.'));
} else {
  const note = words.join(' ').trim();
  if (!['major', 'feature', 'minor'].includes(action) || !note || /[\r\n]/.test(note))
    throw Error('Usage: npm run release:shell -- major|feature|minor "Release note"');
  const [major, feature, minor] = current.slice(1).map(Number);
  const next = action === 'major' ? [major + 1, 0, 1] : action === 'feature' ? [major, feature + 1, 1] : [major, feature, minor + 1];
  if (!next.every(Number.isSafeInteger) || !/^const NEWS = .*;$/m.test(source)) throw Error('Invalid release metadata.');
  const version = next.join('.');
  writeFileSync(documents, content);
  writeFileSync(file, source.replace(current[0], 'const BUILD = "' + version + '";')
    .replace(/^const NEWS = .*;$/m, () => 'const NEWS = ' + JSON.stringify(note) + ';'));
  writeFileSync(worker, sealShellWorker(script.replace(release, 'const RELEASE = "' + version + '";'), worker));
  console.log(version);
}
