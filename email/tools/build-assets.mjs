import { cpSync, existsSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";
import { compileEntries } from "../../tools/entry-assets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const stage = mkdtempSync(join(root, ".assets-stage-"));
const next = join(stage, "next");
const previous = join(stage, "previous");
const target = join(root, ".assets");
try {
  cpSync(join(root, "public"), next, { recursive: true });
  compileEntries(next, transformSync);
  if (existsSync(target)) renameSync(target, previous);
  try {
    renameSync(next, target);
  } catch (error) {
    if (existsSync(previous)) renameSync(previous, target);
    throw error;
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}
