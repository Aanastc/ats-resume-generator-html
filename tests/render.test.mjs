import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderResumeHtml, safeUrl } from "../lib/render.mjs";
import { loadTemplate } from "../lib/render-files.mjs";

const root = process.cwd();
const tpl = loadTemplate(root);
const example = JSON.parse(fs.readFileSync(path.join(root, "data", "resume.json"), "utf8"));

test("não sobra nenhum placeholder {{...}} no HTML final", () => {
  const html = renderResumeHtml(example, tpl);
  assert.doesNotMatch(html, /\{\{[A-Z0-9_]+\}\}/);
});

test("seção de projetos é renderizada quando há projetos", () => {
  const data = { ...example, projects: [{ title: "Projeto X", stack: "React", bullets: ["Fiz algo"], links: [] }] };
  const html = renderResumeHtml(data, tpl);
  assert.match(html, /Projeto X/);
  assert.match(html, /<h2 class="section-title">Projetos<\/h2>/);
});

test("seção de projetos some quando não há projetos", () => {
  const html = renderResumeHtml({ ...example, projects: [] }, tpl);
  assert.doesNotMatch(html, /section-title">(Projetos|Projects)</);
});

test("rótulos em inglês quando language = en", () => {
  const html = renderResumeHtml({ ...example, language: "en" }, tpl);
  assert.match(html, />Experience</);
  assert.match(html, />\s*Portfolio\s*</);
});

test("conteúdo é escapado (sem injeção de HTML)", () => {
  const html = renderResumeHtml({ ...example, summary: "<script>alert(1)</script>" }, tpl);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test("links javascript: são neutralizados", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "#");
  assert.equal(safeUrl("https://github.com/x"), "https://github.com/x");
  const html = renderResumeHtml({ ...example, linkedin_url: "javascript:alert(1)" }, tpl);
  assert.doesNotMatch(html, /href="javascript:/);
});

test("um valor contendo {{NAME}} não é reinterpretado como placeholder", () => {
  const html = renderResumeHtml({ ...example, name: "Fulana", summary: "texto {{NAME}}" }, tpl);
  assert.match(html, /texto /);
  assert.doesNotMatch(html, /texto Fulana/);
});

test("campos ausentes não quebram a renderização", () => {
  const html = renderResumeHtml({}, tpl);
  assert.match(html, /<html/i);
});
