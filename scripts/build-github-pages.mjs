import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const distDir = path.join(rootDir, "dist");

const entryFiles = ["index.html", "styles.css", "data.js", "app.js"];
const copied = new Set();
const queued = [];

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

async function copyFile(relativePath) {
  const normalized = toPosix(path.normalize(relativePath));
  if (copied.has(normalized)) return;
  copied.add(normalized);

  const source = path.join(rootDir, normalized);
  const target = path.join(distDir, normalized);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);

  if (normalized.endsWith(".js")) queued.push(normalized);
}

function getRelativeImports(source) {
  const imports = [];
  const patterns = [
    /import\s+(?:[^'"]*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/g,
    /import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g,
    /export\s+[^'"]*?\s+from\s+["'](\.{1,2}\/[^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match) {
      imports.push(match[1]);
      match = pattern.exec(source);
    }
  }
  return imports;
}

function resolveImport(fromRelativePath, importPath) {
  const baseDir = path.dirname(fromRelativePath);
  const resolved = path.normalize(path.join(baseDir, importPath));
  if (path.extname(resolved)) return toPosix(resolved);
  return toPosix(`${resolved}.js`);
}

async function copyBrowserModuleGraph() {
  for (let index = 0; index < queued.length; index += 1) {
    const current = queued[index];
    const source = await fs.readFile(path.join(rootDir, current), "utf8");
    const imports = getRelativeImports(source);
    for (const importPath of imports) {
      await copyFile(resolveImport(current, importPath));
    }
  }
}

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

for (const file of entryFiles) {
  await copyFile(file);
}
await copyBrowserModuleGraph();
await fs.writeFile(path.join(distDir, ".nojekyll"), "");

console.log(`GitHub Pages static files generated in ${path.relative(rootDir, distDir)}`);
