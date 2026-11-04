import { test } from "node:test";
import assert from "node:assert/strict";
import { isSoftwareDevRole, isEligibleInternationalLocation } from "../scripts/fetch-jobs.mjs";
import { filterJobs } from "../lib/jobs-filter.mjs";
import { classifyLocation, ghostReason } from "../lib/job-quality.mjs";
import { companyFromIssueTitle, fixMojibake } from "../lib/job-sources.mjs";
import { restoreProtectedFields } from "../lib/gemini.mjs";

test("isSoftwareDevRole aceita cargos de desenvolvimento", () => {
  assert.equal(isSoftwareDevRole("Senior Full Stack Developer"), true);
  assert.equal(isSoftwareDevRole("Desenvolvedora Back-end PHP"), true);
  assert.equal(isSoftwareDevRole("DevOps Engineer"), true);
});

test("isSoftwareDevRole rejeita cargos não técnicos", () => {
  assert.equal(isSoftwareDevRole("Customer Success Manager"), false);
  assert.equal(isSoftwareDevRole("Content Writer"), false);
  assert.equal(isSoftwareDevRole("Registered Nurse"), false);
});

test("isSoftwareDevRole rejeita engenharias não-software e estágios", () => {
  assert.equal(isSoftwareDevRole("Engenheiro Civil Pleno"), false);
  assert.equal(isSoftwareDevRole("Engenheira Clínica"), false);
  assert.equal(isSoftwareDevRole("Estágio em Desenvolvimento Web"), false);
  assert.equal(isSoftwareDevRole("Engenheiro de Software Sênior"), true);
  assert.equal(isSoftwareDevRole("Analista de SRE Sr (vaga remota)"), true);
  assert.equal(isSoftwareDevRole("ANALISTA DESENVOLVEDOR DELPHI SR"), true);
});

test("ghostReason detecta vagas fantasma", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const base = { url: "https://x.com/vaga/1", company: "X", title: "Dev Node", source_type: "empresa" };
  assert.equal(ghostReason({ ...base, publication_date: "2026-10-30" }, now), null);
  assert.match(ghostReason({ ...base, publication_date: "2026-08-01" }, now), /publicada há/);
  assert.match(ghostReason({ ...base, title: "Banco de Talentos - Desenvolvimento" }, now), /banco de talentos/);
  assert.match(ghostReason({ ...base, expires_at: "2026-11-01" }, now), /prazo/);
  assert.match(ghostReason({ ...base, url: "" }, now), /link/);
  // agregador sem data não é confiável; site da empresa sem data é (a API oficial só lista vagas abertas)
  assert.match(ghostReason({ ...base, source_type: "agregador" }, now), /sem data/);
  assert.equal(ghostReason(base, now), null);
});

test("classifyLocation: presencial só na Grande BH, remoto Brasil ou internacional sem visto", () => {
  assert.equal(classifyLocation({ text: "Belo Horizonte, Minas Gerais, Brazil" }).type, "bh");
  assert.equal(classifyLocation({ text: "Nova Lima, MG" }).type, "bh");
  assert.equal(classifyLocation({ text: "São Paulo, SP" }), null);
  assert.match(classifyLocation({ text: "Remote - Brazil" }).label, /Brasil/);
  assert.match(classifyLocation({ remote: true, text: "", brazilianCompany: true }).label, /Brasil/);
  assert.equal(classifyLocation({ text: "Remote, US" }), null);
  assert.match(classifyLocation({ text: "Remote, LATAM" }).label, /internacional/);
});

test("companyFromIssueTitle extrai a empresa do título da issue", () => {
  assert.equal(companyFromIssueTitle("Desenvolvedor Java Pleno - DB1/ANYMARKET"), "DB1");
  assert.equal(companyFromIssueTitle("Mobile Developer React Native (Pleno) na Coodesh"), "Coodesh");
  assert.equal(companyFromIssueTitle("Desenvolvedor Backend Sênior"), null);
  assert.equal(companyFromIssueTitle("Senior Front-end / Product Engineer na WeatherWise — 4 dias presenciais"), "WeatherWise");
});

test("fixMojibake corrige texto com codificação quebrada", () => {
  assert.equal(fixMojibake("SÃ£o Paulo"), "São Paulo");
  assert.equal(fixMojibake("São Paulo"), "São Paulo");
});

test("fonte que falha reaproveita as vagas dela da coleta anterior", async () => {
  const { runSource } = await import("../scripts/fetch-jobs.mjs");
  const report = { sources: [] };
  const previous = [
    { id: "a", source_key: "Lever/CI&T" },
    { id: "b", source_key: "Gupy/Outra" }
  ];
  const failing = async () => {
    throw new Error("timeout");
  };
  const jobs = await runSource("Lever/CI&T", failing, report, previous);
  assert.deepEqual(jobs.map((j) => j.id), ["a"]);
  assert.equal(jobs[0].from_previous_run, true);
  assert.equal(report.sources[0].ok, false);
  assert.equal(report.sources[0].reused_from_previous, 1);

  const ok = await runSource("Gupy/Outra", async () => [{ id: "c" }], report, previous);
  assert.deepEqual(ok, [{ id: "c", source_key: "Gupy/Outra" }]);
});

test("isEligibleInternationalLocation bloqueia vagas que exigem visto", () => {
  assert.equal(isEligibleInternationalLocation("USA", "Dev", ""), false);
  assert.equal(isEligibleInternationalLocation("Worldwide", "Dev", "US citizen required"), false);
  assert.equal(isEligibleInternationalLocation("LATAM", "Dev", ""), true);
  assert.equal(isEligibleInternationalLocation("Worldwide", "Dev", ""), true);
});

const JOBS = [
  { title: "Tech Lead Node.js", company: "Acme", location: "Remoto", location_type: "remote", category: "Empresas Tech / Full Stack", tags: [], description: "" },
  { title: "Dev Moodle", company: "Edu", location: "Remoto", location_type: "remote", category: "EdTechs & Educação", tags: ["EdTech"], description: "" },
  { title: "Dev React", company: "Clinica", location: "Belo Horizonte, MG", location_type: "bh", category: "Hospitais & Clínicas (Saúde)", tags: [], description: "" }
];

test("buscar 'tech lead' não cai no filtro de EdTech (por conter 'ead')", () => {
  const res = filterJobs(JOBS, "tech lead");
  assert.deepEqual(res.map((j) => j.title), ["Tech Lead Node.js"]);
});

test("buscas por setor usam os sinônimos", () => {
  assert.deepEqual(filterJobs(JOBS, "moodle").map((j) => j.company), ["Edu"]);
  assert.deepEqual(filterJobs(JOBS, "hospitalar").map((j) => j.company), ["Clinica"]);
  assert.deepEqual(filterJobs(JOBS, "bh").map((j) => j.company), ["Clinica"]);
});

test("busca sem resultado retorna lista vazia (não vagas aleatórias)", () => {
  assert.deepEqual(filterJobs(JOBS, "cobol mainframe"), []);
});

test("limit é respeitado e 'todas' retorna tudo", () => {
  assert.equal(filterJobs(JOBS, "todas").length, 3);
  assert.equal(filterJobs(JOBS, "", 1).length, 1);
});

test("restoreProtectedFields impede a IA de alterar contato", () => {
  const original = { name: "Ana", email: "a@a.com", skills: [{ group: "x", items: [] }] };
  const tailored = { name: "Outra", email: "fake@x.com", summary: "novo", language: "zz" };
  const out = restoreProtectedFields(original, tailored);
  assert.equal(out.name, "Ana");
  assert.equal(out.email, "a@a.com");
  assert.equal(out.summary, "novo");
  assert.deepEqual(out.skills, original.skills);
  assert.equal(out.language, "pt");
});
