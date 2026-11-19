import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const staticPath = /^\/(?:[\w.-]+\/)*[\w.-]+\.(?:js|css|svg|png|webp|webmanifest)$/;

export function sealShellWorker(source, worker) {
  const paths = ['FILES', 'OS_FILES'].flatMap(key => JSON.parse(new RegExp('const ' + key + ' = (\\[[^\\]]*\\]);').exec(source)[1]));
  if (new Set(paths).size !== paths.length || !paths.includes('/')) throw Error('Invalid shell asset list.');
  const hashes = Object.fromEntries(paths.map(path => {
    if (path !== '/' && (!staticPath.test(path) || path.split('/').some(part => /^(?:\.{1,2}|api)$/i.test(part)))) {
      throw Error(`Invalid shell asset path: ${path}`);
    }
    const bytes = readFileSync(new URL(path === '/' ? './index.html' : '.' + path, worker));
    return [path, 'sha256-' + createHash('sha256').update(bytes).digest('base64')];
  }));
  return source.replace(/^const INTEGRITY = .*;$/m, 'const INTEGRITY = ' + JSON.stringify(hashes) + ';');
}
