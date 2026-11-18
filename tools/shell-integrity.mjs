import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function sealShellWorker(source, worker) {
  const paths = ['FILES', 'OS_FILES'].flatMap(key => JSON.parse(new RegExp('const ' + key + ' = (\\[[^\\]]*\\]);').exec(source)[1]));
  const hashes = Object.fromEntries(paths.filter(path => path !== '/').map(path => {
    const bytes = readFileSync(new URL('.' + path, worker));
    return [path, 'sha256-' + createHash('sha256').update(bytes).digest('base64')];
  }));
  return source.replace(/^const INTEGRITY = .*;$/m, 'const INTEGRITY = ' + JSON.stringify(hashes) + ';');
}
