// Helpers com acesso a disco para ambientes locais (CLI e servidor Express).
import fs from "node:fs";
import path from "node:path";
import { renderResumeHtml } from "./render.mjs";

export function loadTemplate(root = process.cwd()) {
  return {
    template: fs.readFileSync(path.join(root, "templates", "ats.html"), "utf8"),
    css: fs.readFileSync(path.join(root, "templates", "style.css"), "utf8")
  };
}

export function renderToHtml(data, root = process.cwd()) {
  return renderResumeHtml(data, loadTemplate(root));
}

// Gera dist/cv.html e devolve o caminho do arquivo.
export function renderToDist(data, root = process.cwd()) {
  const distDir = path.join(root, "dist");
  fs.mkdirSync(distDir, { recursive: true });
  const outPath = path.join(distDir, "cv.html");
  fs.writeFileSync(outPath, renderToHtml(data, root), "utf8");
  return outPath;
}
