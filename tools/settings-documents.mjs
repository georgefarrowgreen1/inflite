import { readFileSync } from "node:fs";

export function settingsDocuments(root) {
  const documents = {};
  for (const name of ["about", "privacy", "storage", "terms"]) {
    const html = readFileSync(new URL(`${name}/index.html`, root), "utf8");
    const content = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html)?.[1].trim();
    if (!content) throw Error(`Missing main content in ${name}/index.html`);
    documents[name] = content;
  }
  return "// Generated from the public pages by npm run release:shell -- --assets.\n"
    + "export const documents = " + JSON.stringify(documents, null, 2) + ";\n";
}
