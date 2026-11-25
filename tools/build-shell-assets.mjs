import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sealShellWorker } from './shell-integrity.mjs';
import { settingsDocuments } from './settings-documents.mjs';

const source = fileURLToPath(new URL('../today/public/', import.meta.url));

export function buildShellAssets(destination, transform) {
  const stage = mkdtempSync(join(dirname(destination), '.assets-stage-'));
  const next = join(stage, 'next');
  const previous = join(stage, 'previous');
  try {
    cpSync(source, next, { recursive: true });
    writeFileSync(join(next, "settings-documents.js"), settingsDocuments(pathToFileURL(join(next, "index.html"))));
    const roof = join(next, 'roof');
    const modules = readdirSync(roof, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
      .map(entry => join(roof, entry.name));
    modules.push(join(next, 'ride-departures.js'));
    for (const path of modules) {
      const { code } = transform(readFileSync(path, 'utf8'), {
        sourcefile: basename(path), format: 'esm', target: 'esnext', charset: 'utf8',
        legalComments: 'none', minify: true,
      });
      writeFileSync(path, code);
    }
    const worker = pathToFileURL(join(next, 'sw.js'));
    writeFileSync(worker, sealShellWorker(readFileSync(worker, 'utf8'), worker));
    if (existsSync(destination)) renameSync(destination, previous);
    try {
      renameSync(next, destination);
    } catch (error) {
      if (existsSync(previous)) renameSync(previous, destination);
      throw error;
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { transformSync } = await import('esbuild');
  buildShellAssets(fileURLToPath(new URL('../today/.assets', import.meta.url)), transformSync);
}
