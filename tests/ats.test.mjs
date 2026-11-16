import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreResume } from "../lib/ats-score.mjs";

const base = {
  name: "Ana",
  email: "ana@exemplo.com",
  phone_display: "+55 31 9999-9999",
  location: "Belo Horizonte, MG",
  linkedin_url: "https://www.linkedin.com/in/ana",
  github_url: "https://github.com/ana",
  summary: Array(60).fill("palavra").join(" "),
  skills: [{ group: "Back-end", items: ["Node.js", "PostgreSQL", "React"] }],
  experience: [
    {
      role: "Dev",
      company: "X",
      date: "2023 — atual",
      bullets: ["Desenvolvi API em Node.js para 20 mil usuários", "Reduzi em 40% o tempo de deploy", "Construí painel em React"]
    }
  ],
  education: [{ title: "ADS", subtitle: "UNIFOR", date: "2023" }],
  languages: [{ name: "Inglês", level: "B2" }]
};

const find = (r, label) => r.checks.find((c) => c.label.startsWith(label));

test("currículo bem estruturado tira nota alta", () => {
  const r = scoreResume(base, { pages: 1, marketTechs: ["Node.js", "React", "PostgreSQL"] });
  assert.ok(r.score >= 90, `nota ${r.score}`);
  assert.equal(r.grade, "Excelente");
});

test("detecta verbos de ação, inclusive acentuados", () => {
  const r = scoreResume(base, { pages: 1 });
  assert.equal(find(r, "Bullets começando").status, "ok");
  const nouns = { ...base, experience: [{ ...base.experience[0], bullets: ["Desenvolvimento de APIs", "Implementação de CI"] }] };
  assert.equal(find(scoreResume(nouns), "Bullets começando").status, "fail");
});

test("penaliza mais de 2 páginas e resumo longo", () => {
  const r = scoreResume({ ...base, summary: Array(130).fill("x").join(" ") }, { pages: 3 });
  assert.equal(find(r, "Tamanho").points, 5);
  assert.equal(find(r, "Resumo").status, "warn");
});

test("com vaga colada, mede aderência às tecnologias da vaga", () => {
  const r = scoreResume(base, { jobDescription: "Buscamos pessoa desenvolvedora Java com Spring Boot, Kafka e PostgreSQL para nosso time." });
  assert.equal(r.mode, "vaga");
  const kw = find(r, "Aderência às tecnologias da vaga");
  assert.match(kw.detail, /faltam: .*Java/);
});

test("aponta clichês e contatos faltando", () => {
  const r = scoreResume({ ...base, linkedin_url: "", summary: base.summary + " proativa e motivada" });
  assert.match(find(r, "Dados de contato").detail, /LinkedIn/);
  assert.match(find(r, "Sem clichês").detail, /proativa/);
});
