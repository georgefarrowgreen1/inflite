import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The stable aliases also supply the version to old service workers and
// clients that are still open during a deployment.
export function compileEntries(directory, transform, format) {
  const read = name => readFileSync(join(directory, name), "utf8");
  const write = (name, body) => writeFileSync(join(directory, name), body);
  const source = read("app.js");
  const build = /\bconst BUILD = "(\d+\.\d+\.\d+)";/.exec(source)?.[1];
  if (!build) throw Error("The entry script must declare a release.");
  const entry = {
    "app.js": `/* const BUILD = "${build}"; */\n` +
      transform(source, { loader: "js", format, minify: true, legalComments: "none", charset: "utf8" }).code,
    "app.css": transform(read("app.css"), { loader: "css", minify: true, legalComments: "none" }).code,
  };
  let html = read("index.html");
  let worker = read("sw.js");
  mkdirSync(join(directory, "assets"), { recursive: true });
  for (const [name, body] of Object.entries(entry)) {
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 24);
    const file = `assets/${hash}-${name}`;
    write(name, body);
    write(file, body);
    html = html.replaceAll(`"/${name}"`, `"/${file}"`);
    worker = worker.replaceAll(`"/${name}"`, `"/${file}"`);
  }
  write("index.html", html);
  write("sw.js", worker);
}
