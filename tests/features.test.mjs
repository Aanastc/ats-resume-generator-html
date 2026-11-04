import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeSkillGaps } from "../lib/skill-gap.mjs";
import { CATALOG, generateProjectIdeas, rankCatalog } from "../lib/project-ideas.mjs";
import { isOutdated, sanitizeStatus } from "../lib/talent.mjs";

const job = (title, description = "") => ({ title, description, tags: [], company: "X", sector: "tech" });

const JOBS = [
  job("Senior Java Developer", "Spring Boot, Kafka, PostgreSQL"),
  job("Java Backend Engineer", "Spring, microservices, AWS"),
  job("Backend Java Pleno", "Kafka e Docker"),
  job("Full Stack React", "React, Node.js, TypeScript"),
  job("Frontend React", "React e TypeScript"),
  job("Node.js Developer", "Node.js, PostgreSQL, Docker")
];

const RESUME = {
  skills: [{ group: "Backend", items: ["Node.js", "TypeScript", "PostgreSQL"] }],
  projects: [{ title: "App", stack: "React, TypeScript", bullets: ["Feito em React"] }],
  experience: []
};

test("analyzeSkillGaps separa falta, sem comprovação e comprovado", () => {
  const a = analyzeSkillGaps(JOBS, RESUME, { minJobs: 2 });
  const missing = a.missing.map((s) => s.tech);
  const unproven = a.unproven.map((s) => s.tech);
  assert.ok(missing.includes("Java"), "Java deveria faltar");
  assert.ok(unproven.includes("Node.js"), "Node.js está nas skills mas sem projeto");
  assert.ok(a.proven.includes("React"), "React é comprovado por projeto");
  assert.equal(a.jobs_analyzed, JOBS.length);
});

test("tecnologias do catálogo existem no dicionário de análise", async () => {
  const { TECHS } = await import("../lib/skill-gap.mjs");
  for (const idea of CATALOG) {
    for (const t of idea.techs) assert.ok(TECHS[t], `"${t}" (em "${idea.title}") não existe em TECHS`);
  }
});

test("rankCatalog prioriza ideias que cobrem as maiores lacunas", () => {
  const a = analyzeSkillGaps(JOBS, RESUME, { minJobs: 2 });
  const ideas = rankCatalog(a, 3);
  assert.ok(ideas.length > 0);
  assert.ok(ideas[0].covers.includes("Java"), "a primeira ideia deveria cobrir Java (maior lacuna)");
  assert.match(ideas[0].resume_bullet, /^Desenvolvi /);
});

test("sem chave de API usa o catálogo", async () => {
  const a = analyzeSkillGaps(JOBS, RESUME, { minJobs: 2 });
  const out = await generateProjectIdeas({ analysis: a, resume: RESUME, apiKey: null });
  assert.equal(out.generated_by, "catalogo");
  assert.ok(out.ideas.length > 0);
});

test("cadastro fica desatualizado quando o portfólio muda depois da última atualização", () => {
  const portfolio = "2026-10-06T22:31:25Z";
  assert.equal(isOutdated({ registered: true, updated_at: "2026-10-01T00:00:00Z" }, portfolio), true);
  assert.equal(isOutdated({ registered: true, updated_at: "2026-10-10T00:00:00Z" }, portfolio), false);
  assert.equal(isOutdated({ registered: false }, portfolio), false);
  assert.equal(isOutdated({ registered: true, updated_at: "2026-10-01T00:00:00Z" }, null), false);
});

test("sanitizeStatus descarta ids desconhecidos e campos estranhos", () => {
  const ids = new Set(["linkedin"]);
  const out = sanitizeStatus(
    {
      linkedin: { registered: 1, updated_at: "2026-10-10", evil: "<script>" },
      hacker: { registered: true },
      "../etc": { registered: true }
    },
    ids
  );
  assert.deepEqual(Object.keys(out), ["linkedin"]);
  assert.equal(out.linkedin.registered, true);
  assert.equal(out.linkedin.evil, undefined);
});

test("lista de sites tem mais de 10 entradas com ids únicos e links https", () => {
  const data = JSON.parse(fs.readFileSync("data/talent-platforms.json", "utf8"));
  assert.ok(data.platforms.length > 10);
  const ids = data.platforms.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of data.platforms) {
    assert.match(p.url, /^https:\/\//);
    assert.ok(data.categories[p.category], `categoria inválida em ${p.id}`);
  }
});
