import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeSkillGaps } from "../lib/skill-gap.mjs";
import {
  buildExports,
  buildLearningBudgetPayload,
  buildStudyPlanPayload,
  computeLearningMetrics,
  computeRoadmapState,
  deleteLearningItem,
  loadCatalog,
  loadLocalLearningState,
  mergeLearningStates,
  recommendLearning,
  sanitizeLearningItem,
  saveLocalLearningState,
  updateLearningProgress,
  upsertLearningItem
} from "../lib/learning.mjs";

const NOW = new Date("2026-11-18T12:00:00Z").getTime();

const SAMPLE_JOBS = [
  { title: "Full Stack Engineer", company: "A", tags: [], description: "React, TypeScript, Node.js, AWS, Docker, Kubernetes, Terraform", sector: "tech" },
  { title: "Backend Engineer", company: "B", tags: [], description: "Node.js, PostgreSQL, Redis, AWS, Kubernetes, RAG, LLM", sector: "tech" },
  { title: "Cloud Software Engineer", company: "C", tags: [], description: "AWS, Kubernetes, Terraform, Docker, OpenTelemetry, CI/CD", sector: "tech" },
  { title: "AI Application Engineer", company: "D", tags: [], description: "TypeScript, Python, RAG, MCP, LLM, PostgreSQL, AWS", sector: "tech" }
];

const SAMPLE_RESUME = {
  title: "Software Engineer | Full Stack Developer",
  skills: [{ group: "Core", items: ["React", "TypeScript", "Node.js", "PostgreSQL", "AWS", "Docker"] }],
  projects: [],
  portfolio_projects: [
    { title: "Design System", stack: "React, TypeScript, Docker, AWS", bullets: ["App em produção com AWS e Docker"] }
  ],
  experience: [{ role: "Dev", company: "X", bullets: ["Desenvolveu APIs REST em Node.js"] }]
};

test("CRUD completo: criar, editar, validar URLs, atualizar progresso e excluir", () => {
  let state = { items: [], deleted_ids: [] };

  // Create
  state = upsertLearningItem(
    state,
    {
      id: "aws-dva",
      title: "AWS Certified Developer – Associate",
      institution: "Amazon Web Services",
      type: "official_certification",
      credential_kind: "official_certification",
      official_url: "https://aws.amazon.com/certification/certified-developer-associate/",
      proof_url: "javascript:alert(1)", // deve ser descartada por segurança
      price_amount: 150,
      currency: "USD",
      duration_hours: 40,
      studied_hours: 10,
      status: "in_progress",
      skills: ["AWS", "Serverless"]
    },
    { now: NOW }
  );
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].proof_url, "", "URL javascript: deve ser bloqueada");
  assert.equal(state.items[0].progress_pct, 25);

  // Progress (+10h => 20h / 40h = 50%)
  state = updateLearningProgress(state, "aws-dva", { add_hours: 10 }, { now: NOW + 1000 });
  assert.equal(state.items[0].studied_hours, 20);
  assert.equal(state.items[0].progress_pct, 50);

  // Complete (100% + status completed)
  state = updateLearningProgress(state, "aws-dva", { status: "completed", progress_pct: 100 }, { now: NOW + 2000 });
  assert.equal(state.items[0].status, "completed");
  assert.equal(state.items[0].progress_pct, 100);

  // Delete + rastreia em deleted_ids para sync seguro
  state = deleteLearningItem(state, "aws-dva", { now: NOW + 3000 });
  assert.equal(state.items.length, 0);
  assert.ok(state.deleted_ids.includes("aws-dva"));
});

test("certificação vencida muda automaticamente para status expired e não conta como ativa", () => {
  const expired = sanitizeLearningItem(
    {
      title: "Certificação Antiga",
      type: "official_certification",
      credential_kind: "official_certification",
      status: "completed",
      expires_at: "2025-01-01",
      skills: ["Kubernetes"]
    },
    { now: NOW }
  );
  assert.equal(expired.status, "expired");

  const active = sanitizeLearningItem(
    {
      title: "AWS Developer",
      type: "official_certification",
      credential_kind: "official_certification",
      status: "completed",
      expires_at: "2027-01-10", // < 90 dias de NOW -> expiring_soon
      skills: ["AWS"]
    },
    { now: NOW }
  );

  const metrics = computeLearningMetrics([expired, active], null, { now: NOW });
  assert.equal(metrics.official_certifications_active, 1);
  assert.equal(metrics.expired_count, 1);
  assert.equal(metrics.expiring_soon, 1);
});

test("skill gaps diferencia declarado, demonstrado em projeto e validado por certificação oficial", () => {
  const records = [
    sanitizeLearningItem(
      {
        title: "CKAD",
        type: "official_certification",
        credential_kind: "official_certification",
        status: "completed",
        expires_at: "2028-11-18",
        skills: ["Kubernetes"]
      },
      { now: NOW }
    )
  ];
  const analysis = analyzeSkillGaps(SAMPLE_JOBS, SAMPLE_RESUME, { minJobs: 2, learningRecords: records });
  const byTech = Object.fromEntries(analysis.top_demand.map((s) => [s.tech, s]));

  assert.equal(byTech.Kubernetes.evidence_level, "certified", "Kubernetes tem certificação oficial válida");
  assert.equal(byTech.AWS.evidence_level, "demonstrated", "AWS está em portfolio_projects");
  assert.equal(byTech["Node.js"].evidence_level, "declared", "Node.js está só no CV, sem projeto/cert");
  assert.equal(byTech.Terraform.evidence_level, "missing", "Terraform ausente em tudo");
});

test("recomendações bloqueiam cursos introdutórios de tecnologias já demonstradas ou certificadas", () => {
  const analysis = analyzeSkillGaps(SAMPLE_JOBS, SAMPLE_RESUME, { minJobs: 2 });
  const catalog = [
    {
      id: "intro-aws-docker",
      title: "AWS & Docker Básico para Iniciantes",
      institution: "AWS",
      type: "course",
      credential_kind: "badge",
      official_url: "https://skillbuilder.aws/",
      level: "beginner",
      language: "pt",
      skills: ["AWS", "Docker"], // ambas já demonstradas em portfolio_projects!
      tracks: ["fullstack", "cloud"],
      verified_at: "2026-11-18"
    },
    {
      id: "terraform-cert",
      title: "HashiCorp Certified: Terraform Associate",
      institution: "HashiCorp",
      type: "official_certification",
      credential_kind: "official_certification",
      official_url: "https://developer.hashicorp.com/certifications/infrastructure-automation",
      level: "intermediate",
      language: "en",
      skills: ["Terraform", "AWS"],
      tracks: ["cloud", "fullstack"],
      verified_at: "2026-11-18"
    }
  ];

  const recs = recommendLearning({ catalog, items: [], skillAnalysis: analysis, targetTrack: "fullstack" });
  assert.ok(!recs.some((r) => r.id === "intro-aws-docker"), "Curso introdutório de skill demonstrada não pode ser recomendado");
  assert.ok(recs.some((r) => r.id === "terraform-cert"), "Certificação cobrindo lacuna real deve ser recomendada");
  assert.match(recs[0].evidence_note, /vagas monitoradas/i, "Deve citar evidência real das vagas monitoradas");
});

test("roadmap resolve dependências (pré-requisitos) e exportação separa credenciais sem mutar o currículo", () => {
  const resumeCopy = JSON.stringify(SAMPLE_RESUME);
  const a = sanitizeLearningItem({ id: "base-docker", title: "Docker Avançado", status: "in_progress", due_date: "2026-12-01", credential_kind: "completion_certificate" }, { now: NOW });
  const b = sanitizeLearningItem({ id: "ckad", title: "CKAD", status: "planned", due_date: "2027-02-01", depends_on: ["base-docker"], credential_kind: "official_certification" }, { now: NOW });
  const c = sanitizeLearningItem({ id: "aws-done", title: "AWS DVA", institution: "AWS", status: "completed", credential_kind: "official_certification", issued_at: "2026-10-01", expires_at: "2029-10-01" }, { now: NOW });
  const d = sanitizeLearningItem({ id: "badge-done", title: "Cloud Badge", institution: "AWS", status: "completed", credential_kind: "badge" }, { now: NOW });

  const road = computeRoadmapState([a, b, c, d]);
  const ckadRow = road.find((x) => x.id === "ckad");
  assert.equal(ckadRow.ready, false);
  assert.equal(ckadRow.blocked_by.length, 1);
  assert.equal(ckadRow.blocked_by[0].id, "base-docker");

  const exp = buildExports([a, b, c, d]);
  assert.match(exp.resume_text, /CERTIFICAÇÕES OFICIAIS/);
  assert.match(exp.resume_text, /BADGES DIGITAIS/);
  assert.equal(exp.counts.official_certifications, 1);
  assert.equal(exp.counts.badges, 1);
  assert.equal(JSON.stringify(SAMPLE_RESUME), resumeCopy, "Currículo-base nunca pode ser modificado");
});

test("persistência em disco, merge de estados e contrato de API para o StudyFlow funcionam", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-hub-test-"));
  try {
    let local = upsertLearningItem({ items: [] }, { id: "rag-course", title: "RAG & Evals", skills: ["RAG / Vector DB"], status: "in_progress", studied_hours: 3 }, { now: NOW });
    saveLocalLearningState(local, tmpDir);
    const reloaded = loadLocalLearningState(tmpDir);
    assert.equal(reloaded.items.length, 1);
    assert.equal(reloaded.items[0].studied_hours, 3);

    // Merge entre dispositivos respeita updated_at e deleted_ids
    const remote = upsertLearningItem(reloaded, { id: "rag-course", title: "RAG & Evals", studied_hours: 6, status: "in_progress" }, { now: NOW + 5000 });
    const merged = mergeLearningStates(reloaded, remote);
    assert.equal(merged.items[0].studied_hours, 6);

    // Contrato StudyFlow inclui competências gerais + itens + recursos + projetos
    const catalog = loadCatalog(process.cwd());
    assert.ok(catalog.items.length >= 10);
    for (const item of catalog.items) {
      assert.match(item.official_url, /^https:\/\//, `URL oficial inválida em ${item.id}`);
      assert.ok(item.verified_at, `verified_at ausente em ${item.id}`);
    }

    const plan = buildStudyPlanPayload({
      resume: SAMPLE_RESUME,
      jobsCache: { jobs: SAMPLE_JOBS, formatted_date: "18/11/2026" },
      learningState: merged,
      catalog: catalog.items,
      projectIdeas: [{ id: "p1", title: "AI Knowledge Platform", stack: ["TypeScript", "RAG / Vector DB"] }]
    });
    assert.equal(plan.schema_version, "1.0");
    assert.equal(plan.source, "career-studio");
    assert.ok(plan.priority_skills.length > 0, "Deve retornar competências gerais a melhorar");
    assert.ok(plan.learning_items.length === 1);
    assert.ok(plan.recommended_resources.length > 0);
    assert.ok(plan.recommended_projects.length === 1);

    // Contrato Finance App (caixinha de reserva de certificações na moeda oficial)
    const budget = buildLearningBudgetPayload({
      resume: SAMPLE_RESUME,
      jobsCache: { jobs: SAMPLE_JOBS, formatted_date: "18/11/2026" },
      learningState: merged,
      catalog: catalog.items
    });
    assert.equal(budget.schema_version, "1.0");
    assert.ok(budget.goals.length >= 4, "Deve listar certificações oficiais pagas com valores verificados");
    assert.ok(budget.totals_by_currency.recommended_catalog.USD > 0);
    for (const g of budget.goals) {
      assert.ok(g.price_amount > 0 && g.currency, `Meta ${g.id} deve ter valor e moeda`);
      assert.ok(g.verified_at, `Meta ${g.id} deve ter data de verificação`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
