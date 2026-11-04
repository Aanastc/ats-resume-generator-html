// CLI: node scripts/render.mjs [caminho/do/curriculo.json]  ->  dist/cv.html
import fs from "node:fs";
import path from "node:path";
import { renderToDist } from "../lib/render-files.mjs";

const root = process.cwd();
const dataArg = process.argv[2];
const dataPath = dataArg ? path.resolve(root, dataArg) : path.join(root, "data", "resume.json");

if (!fs.existsSync(dataPath)) {
  console.error(`Arquivo não encontrado: ${dataPath}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const outPath = renderToDist(data, root);
console.log(`Gerado: ${path.relative(root, outPath)}`);
