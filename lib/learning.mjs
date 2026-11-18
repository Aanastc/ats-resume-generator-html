// Módulo de domínio do Learning Hub — gestão estratégica de aprendizagem, certificações,
// competências prioritárias, recomendações baseadas em evidências e contrato de API para o StudyFlow.
import fs from "node:fs";
import path from "node:path";
import { analyzeSkillGaps, TECHS } from "./skill-gap.mjs";
import { CORE_STACK, readIdeasCache } from "./project-ideas.mjs";

export const ITEM_TYPES = ["course", "official_certification", "workshop", "track", "degree"];
export const CREDENTIAL_KINDS = ["official_certification", "completion_certificate", "badge", "none"];
export const ITEM_STATUSES = ["planned", "in_progress", "completed", "paused", "expired"];
export const ITEM_LEVELS = ["beginner", "intermediate", "advanced"];
export const CURRENCIES = ["BRL", "USD", "EUR"];

export const CREDENTIAL_LABELS = {
  official_certification: "Certificação oficial",
  completion_certificate: "Certificado de conclusão",
  badge: "Badge digital",
  none: "Sem credencial"
};

export const TYPE_LABELS = {
  course: "Curso",
  official_certification: "Certificação oficial",
  workshop: "Workshop",
  track: "Trilha",
  degree: "Formação / Pós"
};

export const STATUS_LABELS = {
  planned: "Planejado",
  in_progress: "Em andamento",
  completed: "Concluído",
  paused: "Pausado",
  expired: "Expirado"
};

function safeHttpUrl(url) {
  const s = String(url ?? "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s.slice(0, 500) : "";
}

function safeIsoDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Aceita YYYY-MM-DD ou ISO completo
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function safeNumber(value, { min = 0, max = 1_000_000, nullable = true } = {}) {
  if (value === null || value === undefined || value === "") return nullable ? null : min;
  const n = Number(value);
  if (!Number.isFinite(n)) return nullable ? null : min;
  return Math.min(max, Math.max(min, n));
}

export function learningItemId(title = "") {
  return String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Sanitiza um único item de estudo/certificação mantendo apenas campos válidos.
 * Calcula expiração automática se `expires_at` já passou em uma credencial concluída.
 */
export function sanitizeLearningItem(raw = {}, { now = Date.now() } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || "").trim().slice(0, 180);
  if (!title) return null;

  const id =
    typeof raw.id === "string" && /^[a-z0-9_-]{2,80}$/i.test(raw.id.trim())
      ? raw.id.trim()
      : `${learningItemId(title) || "item"}-${Date.now().toString(36)}`;

  const type = ITEM_TYPES.includes(raw.type) ? raw.type : "course";
  const credential_kind = CREDENTIAL_KINDS.includes(raw.credential_kind)
    ? raw.credential_kind
    : type === "official_certification"
      ? "official_certification"
      : "completion_certificate";

  const expires_at = safeIsoDate(raw.expires_at);
  let status = ITEM_STATUSES.includes(raw.status) ? raw.status : "planned";
  if (
    expires_at &&
    status === "completed" &&
    new Date(expires_at).getTime() < now
  ) {
    status = "expired";
  }

  const duration_hours = safeNumber(raw.duration_hours, { min: 0, max: 5000, nullable: true });
  const studied_hours = safeNumber(raw.studied_hours, { min: 0, max: 5000, nullable: false });
  let progress_pct = safeNumber(raw.progress_pct, { min: 0, max: 100, nullable: true });
  if (status === "completed" || status === "expired") {
    progress_pct = 100;
  } else if (progress_pct === null) {
    progress_pct = duration_hours && duration_hours > 0 ? Math.min(100, Math.round((studied_hours / duration_hours) * 100)) : 0;
  }

  const skills = Array.isArray(raw.skills)
    ? [...new Set(raw.skills.map((s) => String(s || "").trim()).filter(Boolean))].slice(0, 20)
    : typeof raw.skills === "string"
      ? [...new Set(raw.skills.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 20)
      : [];

  const depends_on = Array.isArray(raw.depends_on)
    ? [...new Set(raw.depends_on.map((d) => String(d || "").trim()).filter((d) => d && d !== id))].slice(0, 10)
    : [];

  const price_amount = safeNumber(raw.price_amount, { min: 0, max: 1_000_000, nullable: true });
  const currency = price_amount !== null && CURRENCIES.includes(raw.currency) ? raw.currency : CURRENCIES.includes(raw.currency) ? raw.currency : null;
  const rating = safeNumber(raw.rating, { min: 1, max: 5, nullable: true });

  const nowIso = new Date(now).toISOString();
  return {
    id,
    title,
    institution: String(raw.institution || "").trim().slice(0, 120),
    type,
    credential_kind,
    official_url: safeHttpUrl(raw.official_url),
    price_amount,
    currency,
    pricing_note: String(raw.pricing_note || "").trim().slice(0, 240),
    duration_hours,
    studied_hours,
    progress_pct: Math.round(progress_pct),
    language: ["pt", "en", "es"].includes(raw.language) ? raw.language : "pt",
    level: ITEM_LEVELS.includes(raw.level) ? raw.level : "intermediate",
    rating: rating !== null ? Math.round(rating) : null,
    status,
    started_at: safeIsoDate(raw.started_at),
    completed_at: safeIsoDate(raw.completed_at),
    due_date: safeIsoDate(raw.due_date),
    issued_at: safeIsoDate(raw.issued_at),
    expires_at,
    credential_id: String(raw.credential_id || "").trim().slice(0, 120),
    proof_url: safeHttpUrl(raw.proof_url),
    verified_at: safeIsoDate(raw.verified_at),
    skills,
    depends_on,
    catalog_id: raw.catalog_id ? String(raw.catalog_id).trim().slice(0, 80) : null,
    notes: String(raw.notes || "").trim().slice(0, 1200),
    created_at: safeIsoDate(raw.created_at) || nowIso,
    updated_at: safeIsoDate(raw.updated_at) || nowIso
  };
}

export function sanitizeLearningState(raw = {}, opts = {}) {
  const items = [];
  const seen = new Set();
  for (const entry of Array.isArray(raw?.items) ? raw.items : []) {
    const clean = sanitizeLearningItem(entry, opts);
    if (clean && !seen.has(clean.id)) {
      items.push(clean);
      seen.add(clean.id);
    }
  }
  const deleted_ids = Array.isArray(raw?.deleted_ids)
    ? [...new Set(raw.deleted_ids.map((id) => String(id || "").trim()).filter((id) => /^[a-z0-9_-]{2,80}$/i.test(id)))]
    : [];
  const target_track = ["fullstack", "backend_ai", "cloud"].includes(raw?.target_track) ? raw.target_track : "fullstack";
  const weekly_hours_goal = safeNumber(raw?.weekly_hours_goal, { min: 1, max: 60, nullable: false }) || 8;

  return {
    items,
    deleted_ids,
    target_track,
    weekly_hours_goal,
    updated_at: safeIsoDate(raw?.updated_at) || new Date(opts.now || Date.now()).toISOString()
  };
}

/**
 * Mescla estado local e remoto (Firestore / arquivo local) sem perder alterações mais recentes
 * e respeitando exclusões explícitas (`deleted_ids`).
 */
export function mergeLearningStates(localRaw = {}, remoteRaw = {}) {
  const local = sanitizeLearningState(localRaw);
  const remote = sanitizeLearningState(remoteRaw);
  const deleted = new Set([...local.deleted_ids, ...remote.deleted_ids]);

  const byId = new Map();
  for (const item of [...remote.items, ...local.items]) {
    if (deleted.has(item.id)) continue;
    const prev = byId.get(item.id);
    if (!prev || String(item.updated_at) > String(prev.updated_at)) {
      byId.set(item.id, item);
    }
  }

  const pickMeta = String(local.updated_at) >= String(remote.updated_at) ? local : remote;
  return {
    items: [...byId.values()].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))),
    deleted_ids: [...deleted].slice(-200),
    target_track: pickMeta.target_track,
    weekly_hours_goal: pickMeta.weekly_hours_goal,
    updated_at: pickMeta.updated_at
  };
}

// CRUD puros (sem mutar o estado original)
export function upsertLearningItem(state, itemInput, opts = {}) {
  const current = sanitizeLearningState(state, opts);
  const nowIso = new Date(opts.now || Date.now()).toISOString();
  const existing = current.items.find((i) => i.id === itemInput?.id);
  const clean = sanitizeLearningItem(
    {
      ...existing,
      ...itemInput,
      created_at: existing?.created_at || itemInput?.created_at || nowIso,
      updated_at: nowIso
    },
    opts
  );
  if (!clean) throw new Error("Informe ao menos o título do curso ou certificação.");

  const items = existing
    ? current.items.map((i) => (i.id === clean.id ? clean : i))
    : [clean, ...current.items];

  return {
    ...current,
    items,
    deleted_ids: current.deleted_ids.filter((id) => id !== clean.id),
    updated_at: nowIso
  };
}

export function deleteLearningItem(state, id, opts = {}) {
  const current = sanitizeLearningState(state, opts);
  const nowIso = new Date(opts.now || Date.now()).toISOString();
  return {
    ...current,
    items: current.items.filter((i) => i.id !== id),
    deleted_ids: [...new Set([...current.deleted_ids, String(id)])].slice(-200),
    updated_at: nowIso
  };
}

export function updateLearningProgress(state, id, patch = {}, opts = {}) {
  const current = sanitizeLearningState(state, opts);
  const existing = current.items.find((i) => i.id === id);
  if (!existing) throw new Error("Registro de estudo não encontrado.");
  const nowIso = new Date(opts.now || Date.now()).toISOString();

  const studied_hours =
    patch.add_hours !== undefined
      ? Math.max(0, (existing.studied_hours || 0) + Number(patch.add_hours || 0))
      : patch.studied_hours !== undefined
        ? Number(patch.studied_hours)
        : existing.studied_hours;

  let progress_pct = patch.progress_pct !== undefined ? Number(patch.progress_pct) : existing.progress_pct;
  if (patch.add_hours !== undefined && existing.duration_hours > 0 && patch.progress_pct === undefined) {
    progress_pct = Math.min(100, Math.round((studied_hours / existing.duration_hours) * 100));
  }

  let status = patch.status || existing.status;
  if (progress_pct >= 100 && status === "in_progress") status = "completed";
  if (progress_pct > 0 && status === "planned") status = "in_progress";

  return upsertLearningItem(
    current,
    {
      ...existing,
      studied_hours,
      progress_pct,
      status,
      started_at: existing.started_at || (status === "in_progress" ? nowIso.slice(0, 10) : null),
      completed_at: status === "completed" ? existing.completed_at || nowIso.slice(0, 10) : existing.completed_at
    },
    opts
  );
}

/**
 * Indicadores consolidados para o Dashboard do Learning Hub.
 */
export function computeLearningMetrics(items = [], skillAnalysis = null, { now = Date.now() } = {}) {
  const list = Array.isArray(items) ? items : [];
  const in90Days = now + 90 * 24 * 60 * 60 * 1000;

  let totalHoursStudied = 0;
  let totalPlannedHours = 0;
  const investments = {};
  let officialCertificationsActive = 0;
  let completionCertificates = 0;
  let badges = 0;
  let expiringSoon = 0;
  let expiredCount = 0;
  let inProgress = 0;
  let completed = 0;
  let planned = 0;

  for (const item of list) {
    totalHoursStudied += Number(item.studied_hours || 0);
    if (item.duration_hours) totalPlannedHours += Number(item.duration_hours);

    if (item.price_amount && item.price_amount > 0 && item.currency) {
      investments[item.currency] = Number(((investments[item.currency] || 0) + item.price_amount).toFixed(2));
    }

    if (item.status === "in_progress") inProgress++;
    else if (item.status === "completed") completed++;
    else if (item.status === "planned") planned++;
    else if (item.status === "expired") expiredCount++;

    if (item.status === "completed") {
      if (item.credential_kind === "official_certification") {
        officialCertificationsActive++;
        if (item.expires_at) {
          const exp = new Date(item.expires_at).getTime();
          if (exp >= now && exp <= in90Days) expiringSoon++;
        }
      } else if (item.credential_kind === "completion_certificate") {
        completionCertificates++;
      } else if (item.credential_kind === "badge") {
        badges++;
      }
    }
  }

  const topPrioritySkills = (skillAnalysis?.top_demand || [])
    .filter((s) => s.evidence_level === "missing" || s.evidence_level === "declared")
    .slice(0, 6)
    .map((s) => ({
      tech: s.tech,
      jobs: s.jobs,
      pct: s.pct,
      evidence_level: s.evidence_level,
      core: CORE_STACK.has(s.tech)
    }));

  return {
    total_items: list.length,
    in_progress: inProgress,
    completed,
    planned,
    official_certifications_active: officialCertificationsActive,
    completion_certificates: completionCertificates,
    badges,
    expiring_soon: expiringSoon,
    expired_count: expiredCount,
    hours_studied: Number(totalHoursStudied.toFixed(1)),
    hours_planned: Number(totalPlannedHours.toFixed(1)),
    investments,
    priority_skills: topPrioritySkills
  };
}

/**
 * Motor de recomendações de cursos e certificações oficiais.
 * Regras:
 * - Cruza demanda real das vagas + currículo + projetos + cursos concluídos + certificações + trilha alvo;
 * - NÃO recomenda curso introdutório (level === "beginner") de tecnologia já demonstrada ou certificada;
 * - Nunca afirma que uma certificação é "valorizada pelo mercado" sem citar a demanda medida nas vagas monitoradas;
 * - Preserva `verified_at` e `official_url`.
 */
export function recommendLearning({ catalog = [], items = [], skillAnalysis = {}, targetTrack = "fullstack" } = {}) {
  const byTech = new Map((skillAnalysis.top_demand || []).map((s) => [s.tech, s]));
  const existingCatalogIds = new Set(items.map((i) => i.catalog_id).filter(Boolean));
  const existingTitleIds = new Set(items.map((i) => learningItemId(i.title)));
  const jobsCount = skillAnalysis.jobs_analyzed || 0;

  const results = [];
  for (const entry of catalog || []) {
    if (!entry || !entry.title || !entry.official_url) continue;
    // Não recomenda itens que a pessoa já cadastrou / concluiu
    if (existingCatalogIds.has(entry.id) || existingTitleIds.has(learningItemId(entry.title))) continue;

    const skills = Array.isArray(entry.skills) ? entry.skills : [];
    const skillStates = skills.map((tech) => {
      const stat = byTech.get(tech);
      return {
        tech,
        jobs: stat?.jobs || 0,
        pct: stat?.pct || 0,
        evidence_level: stat?.evidence_level || "missing",
        isCore: CORE_STACK.has(tech)
      };
    });

    // Regra crítica: bloquear cursos introdutórios quando TODAS as skills cobertas já são demonstradas ou certificadas
    const hasUncoveredOrDeclared = skillStates.some(
      (s) => s.evidence_level === "missing" || s.evidence_level === "declared"
    );
    const alreadyCertifiedAll =
      entry.credential_kind === "official_certification" &&
      skillStates.length > 0 &&
      skillStates.every((s) => s.evidence_level === "certified");

    if (alreadyCertifiedAll) continue;
    if (entry.level === "beginner" && !hasUncoveredOrDeclared) continue;

    let score = 0;
    const matchedDemand = [];
    const gapTargets = [];

    for (const st of skillStates) {
      const demandWeight = Math.max(1, st.jobs);
      if (st.evidence_level === "missing") {
        score += demandWeight * (st.isCore ? 2.4 : 1.6);
        gapTargets.push(`${st.tech} (ausente)`);
      } else if (st.evidence_level === "declared") {
        score += demandWeight * (st.isCore ? 1.8 : 1.2);
        gapTargets.push(`${st.tech} (declarada sem comprovação)`);
      } else if (st.evidence_level === "demonstrated" && entry.credential_kind === "official_certification") {
        // Certificação oficial em skill já praticada agrega validação formal
        score += demandWeight * (st.isCore ? 1.35 : 0.9);
        gapTargets.push(`${st.tech} (validação oficial)`);
      } else if (st.evidence_level === "demonstrated" && entry.level === "advanced") {
        score += demandWeight * 0.7;
      }

      if (st.jobs > 0) matchedDemand.push(st);
    }

    if (score <= 0) continue;

    const tracks = Array.isArray(entry.tracks) ? entry.tracks : [];
    const trackMatch = tracks.includes(targetTrack);
    if (trackMatch) score *= 1.25;

    const priority = score >= 45 ? "high" : score >= 18 ? "medium" : "low";
    const topEv = matchedDemand.sort((a, b) => b.jobs - a.jobs).slice(0, 3);
    const evidenceNote = topEv.length && jobsCount > 0
      ? `Nas ${jobsCount} vagas monitoradas: ${topEv.map((e) => `${e.tech} aparece em ${e.jobs} vagas (${e.pct}%)`).join("; ")}.`
      : "Alinhado à stack central definida para seu objetivo profissional (sem volume mínimo de vagas na coleta atual).";

    const reasonParts = [];
    if (gapTargets.length) {
      reasonParts.push(`Atua sobre: ${gapTargets.slice(0, 3).join(", ")}.`);
    }
    if (entry.credential_kind === "official_certification") {
      reasonParts.push("Permite validar a competência com exame oficial da instituição.");
    } else if (entry.level === "advanced") {
      reasonParts.push("Aprofundamento técnico além do nível introdutório.");
    }
    if (trackMatch) {
      reasonParts.push(`Aderente à trilha alvo (${targetTrack}).`);
    }

    results.push({
      ...entry,
      priority,
      score: Math.round(score),
      evidence_note: evidenceNote,
      justification: reasonParts.join(" "),
      target_skills: gapTargets.slice(0, 4)
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Resolve dependências e ordena o roadmap de estudos (metas com prazos e pré-requisitos).
 */
export function computeRoadmapState(items = []) {
  const byId = new Map((items || []).map((i) => [i.id, i]));
  return (items || [])
    .filter((i) => i.status !== "expired")
    .map((item) => {
      const blocked_by = (item.depends_on || [])
        .map((depId) => byId.get(depId))
        .filter((dep) => dep && dep.status !== "completed")
        .map((dep) => ({ id: dep.id, title: dep.title, status: dep.status }));

      const remaining_hours =
        item.duration_hours !== null && item.duration_hours !== undefined
          ? Math.max(0, Number((item.duration_hours - (item.studied_hours || 0)).toFixed(1)))
          : null;

      return {
        ...item,
        blocked_by,
        ready: blocked_by.length === 0 && item.status !== "completed",
        remaining_hours
      };
    })
    .sort((a, b) => {
      // Concluídos vão para o fim; depois prontos antes de bloqueados; depois menor prazo (due_date)
      const rank = (x) => (x.status === "completed" ? 3 : x.status === "in_progress" ? 0 : x.ready ? 1 : 2);
      const dr = rank(a) - rank(b);
      if (dr !== 0) return dr;
      return String(a.due_date || "9999-12-31").localeCompare(String(b.due_date || "9999-12-31"));
    });
}

/**
 * Gera textos formatados para copiar para Currículo e LinkedIn — NUNCA altera o currículo-base automaticamente.
 */
export function buildExports(items = []) {
  const completed = (items || []).filter((i) => i.status === "completed");
  const official = completed.filter((i) => i.credential_kind === "official_certification");
  const courses = completed.filter((i) => i.credential_kind === "completion_certificate" || i.credential_kind === "none");
  const badges = completed.filter((i) => i.credential_kind === "badge");

  const fmtDate = (d) => (d ? String(d).slice(0, 7) : "");

  const resumeLines = [];
  if (official.length) {
    resumeLines.push("CERTIFICAÇÕES OFICIAIS");
    for (const c of official) {
      const period = [fmtDate(c.issued_at || c.completed_at), c.expires_at ? `válida até ${fmtDate(c.expires_at)}` : ""]
        .filter(Boolean)
        .join(" · ");
      resumeLines.push(`- ${c.title}${c.institution ? ` — ${c.institution}` : ""}${period ? ` (${period})` : ""}${c.credential_id ? ` [ID: ${c.credential_id}]` : ""}`);
    }
    resumeLines.push("");
  }
  if (courses.length) {
    resumeLines.push("FORMAÇÃO COMPLEMENTAR & CURSOS");
    for (const c of courses) {
      const meta = [c.institution, c.duration_hours ? `${c.duration_hours}h` : "", fmtDate(c.completed_at)]
        .filter(Boolean)
        .join(" · ");
      resumeLines.push(`- ${c.title}${meta ? ` (${meta})` : ""}`);
    }
    resumeLines.push("");
  }
  if (badges.length) {
    resumeLines.push("BADGES DIGITAIS");
    for (const c of badges) {
      resumeLines.push(`- ${c.title}${c.institution ? ` — ${c.institution}` : ""}`);
    }
  }

  const linkedinEntries = completed.map((c) => ({
    name: c.title,
    issuing_organization: c.institution || "Informar instituição",
    credential_kind: CREDENTIAL_LABELS[c.credential_kind] || c.credential_kind,
    issue_date: fmtDate(c.issued_at || c.completed_at) || "—",
    expiration_date: c.expires_at ? fmtDate(c.expires_at) : "Não expira / não informada",
    credential_id: c.credential_id || "",
    credential_url: c.proof_url || c.official_url || "",
    skills: c.skills || []
  }));

  const linkedinText = linkedinEntries.length
    ? linkedinEntries
        .map(
          (e) =>
            `Nome: ${e.name}\nTipo: ${e.credential_kind}\nOrganização emissora: ${e.issuing_organization}\nEmissão: ${e.issue_date} | Validade: ${e.expiration_date}${e.credential_id ? `\nCódigo da credencial: ${e.credential_id}` : ""}${e.credential_url ? `\nURL da credencial: ${e.credential_url}` : ""}${e.skills.length ? `\nCompetências: ${e.skills.join(", ")}` : ""}`
        )
        .join("\n\n---\n\n")
    : "";

  return {
    resume_text: resumeLines.join("\n").trim(),
    linkedin_text: linkedinText,
    linkedin_entries: linkedinEntries,
    counts: {
      official_certifications: official.length,
      courses: courses.length,
      badges: badges.length
    }
  };
}

/**
 * Contrato de API estável (v1.0) para o StudyFlow consumir e gerar o cronograma diário de estudos.
 * Inclui TANTO certificações quanto competências gerais a melhorar, itens em andamento e projetos práticos.
 */
export function buildStudyPlanPayload({
  resume = {},
  jobsCache = {},
  learningState = {},
  catalog = [],
  projectIdeas = []
} = {}) {
  const cleanState = sanitizeLearningState(learningState);
  const skillAnalysis = analyzeSkillGaps(jobsCache.jobs || [], resume, {
    minJobs: 2,
    top: 30,
    learningRecords: cleanState.items
  });

  const recommendations = recommendLearning({
    catalog,
    items: cleanState.items,
    skillAnalysis,
    targetTrack: cleanState.target_track
  });

  const roadmap = computeRoadmapState(cleanState.items);

  // Combina competências com lacuna nas vagas + tecnologias centrais (CORE_STACK) que ainda não foram demonstradas/certificadas
  const byTech = new Map((skillAnalysis.top_demand || []).map((s) => [s.tech, s]));
  const priorityMap = new Map();

  for (const s of skillAnalysis.top_demand || []) {
    if (s.evidence_level === "certified") continue;
    const isCore = CORE_STACK.has(s.tech);
    if (s.evidence_level === "demonstrated" && !isCore) continue;
    const priority =
      (s.evidence_level === "missing" && (isCore || s.pct >= 15)) || (s.evidence_level === "declared" && isCore)
        ? "high"
        : s.evidence_level === "missing" || s.evidence_level === "declared"
          ? "medium"
          : "low";
    const suggested_focus =
      s.evidence_level === "missing"
        ? "Fundamentos + prática guiada + projeto no portfólio"
        : s.evidence_level === "declared"
          ? "Projeto prático hands-on para comprovar em portfólio"
          : "Aprofundamento arquitetural ou certificação oficial";
    priorityMap.set(s.tech, {
      skill: s.tech,
      evidence_level: s.evidence_level,
      is_core_stack: isCore,
      demand_jobs: s.jobs,
      demand_pct: s.pct,
      priority,
      suggested_focus,
      study_reason: `Solicitada em ${s.jobs} vagas monitoradas (${s.pct}%) — status atual: ${s.evidence_level}.`
    });
  }

  // Garante presença das tecnologias do núcleo (CORE_STACK) mesmo se ainda tiverem poucas vagas na coleta
  for (const tech of CORE_STACK) {
    if (priorityMap.has(tech)) continue;
    const stat = byTech.get(tech);
    const level = stat?.evidence_level || "missing";
    if (level === "certified") continue;
    priorityMap.set(tech, {
      skill: tech,
      evidence_level: level,
      is_core_stack: true,
      demand_jobs: stat?.jobs || 0,
      demand_pct: stat?.pct || 0,
      priority: level === "missing" ? "high" : "medium",
      suggested_focus:
        level === "missing"
          ? "Estudo estruturado + laboratório prático"
          : "Aprofundamento e documentação técnica",
      study_reason: `Parte da stack central definida para evolução (${cleanState.target_track}).`
    });
  }

  const priorityRank = { high: 0, medium: 1, low: 2 };
  const priority_skills = [...priorityMap.values()].sort(
    (a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority] ||
      b.demand_jobs - a.demand_jobs ||
      Number(b.is_core_stack) - Number(a.is_core_stack)
  );

  return {
    schema_version: "1.0",
    source: "career-studio",
    generated_at: new Date().toISOString(),
    jobs_updated_at: jobsCache.formatted_date || null,
    jobs_analyzed: skillAnalysis.jobs_analyzed,
    profile: {
      target_role: resume.title || "Software Engineer | Full Stack Developer",
      target_track: cleanState.target_track,
      weekly_hours_goal: cleanState.weekly_hours_goal
    },
    priority_skills: priority_skills.slice(0, 18),
    learning_items: roadmap.map((i) => ({
      id: i.id,
      title: i.title,
      institution: i.institution,
      type: i.type,
      credential_kind: i.credential_kind,
      status: i.status,
      progress_pct: i.progress_pct,
      duration_hours: i.duration_hours,
      studied_hours: i.studied_hours,
      remaining_hours: i.remaining_hours,
      due_date: i.due_date,
      expires_at: i.expires_at,
      depends_on: i.depends_on,
      ready: i.ready,
      blocked_by: i.blocked_by,
      skills: i.skills,
      official_url: i.official_url
    })),
    recommended_resources: recommendations.slice(0, 10).map((r) => ({
      id: r.id,
      title: r.title,
      institution: r.institution,
      type: r.type,
      credential_kind: r.credential_kind,
      level: r.level,
      language: r.language,
      priority: r.priority,
      official_url: r.official_url,
      price_amount: r.price_amount,
      currency: r.currency,
      pricing_note: r.pricing_note,
      verified_at: r.verified_at,
      skills: r.skills,
      justification: r.justification,
      evidence_note: r.evidence_note
    })),
    recommended_projects: (projectIdeas || []).slice(0, 6).map((p) => ({
      id: p.id,
      title: p.title,
      sector: p.sector,
      difficulty: p.difficulty,
      weeks: p.weeks,
      stack: p.stack || [],
      covers: p.covers || [],
      features: p.features || []
    }))
  };
}

// -----------------------------------------------------------------------------
// Leitura/escrita local + Handlers HTTP compartilhados (Express e Vercel)
// -----------------------------------------------------------------------------
export function loadCatalog(root = process.cwd()) {
  const file = path.join(root, "data", "learning-catalog.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { verified_at: null, items: [] };
  }
}

export function loadLocalLearningState(root = process.cwd()) {
  const file = path.join(root, "data", "learning-records.json");
  try {
    return sanitizeLearningState(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return sanitizeLearningState({});
  }
}

export function saveLocalLearningState(state, root = process.cwd()) {
  const clean = sanitizeLearningState(state);
  const file = path.join(root, "data", "learning-records.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(clean, null, 2) + "\n", "utf8");
  return clean;
}

function loadContextFiles(root) {
  const resume = JSON.parse(fs.readFileSync(path.join(root, "data", "resume.json"), "utf8"));
  const jobsCache = JSON.parse(fs.readFileSync(path.join(root, "data", "jobs-cache.json"), "utf8"));
  const catalog = loadCatalog(root);
  const ideasCache = readIdeasCache(root);
  return { resume, jobsCache, catalog, projectIdeas: ideasCache?.ideas || [] };
}

function setIntegrationCors(req, res) {
  const origin = req.headers?.origin || "";
  const allowedEnv = [process.env.STUDYFLOW_ORIGIN || "", process.env.FINANCE_APP_ORIGIN || ""]
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  if (origin && (isLocal || allowedEnv.includes(origin) || allowedEnv.includes("*"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

/**
 * Contrato de API estável (v1.0) para o Finance App criar caixinhas de reserva
 * de certificações e cursos pagos (sem inventar câmbio — valores sempre na moeda original).
 */
export function buildLearningBudgetPayload({ resume = {}, jobsCache = {}, learningState = {}, catalog = [] } = {}) {
  const cleanState = sanitizeLearningState(learningState);
  const skillAnalysis = analyzeSkillGaps(jobsCache.jobs || [], resume, {
    minJobs: 2,
    top: 30,
    learningRecords: cleanState.items
  });
  const recommendations = recommendLearning({
    catalog,
    items: cleanState.items,
    skillAnalysis,
    targetTrack: cleanState.target_track
  });

  const goals = [];
  const plannedTotals = {};
  const recommendedTotals = {};
  const addTotal = (bucket, currency, amount) => {
    if (!currency || !(amount > 0)) return;
    bucket[currency] = Number(((bucket[currency] || 0) + amount).toFixed(2));
  };

  // 1) Itens pagos já cadastrados no plano da usuária (ainda não concluídos)
  for (const item of cleanState.items) {
    if (item.status === "completed") continue;
    if (!(item.price_amount > 0) || !item.currency) continue;
    addTotal(plannedTotals, item.currency, item.price_amount);
    goals.push({
      id: item.id,
      source: "user_plan",
      category: "Educação & Certificações",
      title: item.title,
      institution: item.institution,
      type: item.type,
      credential_kind: item.credential_kind,
      status: item.status,
      priority: item.status === "in_progress" ? "high" : "medium",
      price_amount: item.price_amount,
      currency: item.currency,
      pricing_note: item.pricing_note || "",
      due_date: item.due_date || null,
      official_url: item.official_url || "",
      verified_at: item.verified_at || null,
      skills: item.skills || []
    });
  }

  // 2) Certificações/cursos pagos recomendados do catálogo oficial (ainda não cadastrados)
  for (const rec of recommendations) {
    if (!(rec.price_amount > 0) || !rec.currency) continue;
    addTotal(recommendedTotals, rec.currency, rec.price_amount);
    goals.push({
      id: rec.id,
      source: "recommended_catalog",
      category: "Educação & Certificações",
      title: rec.title,
      institution: rec.institution,
      type: rec.type,
      credential_kind: rec.credential_kind,
      status: "recommended",
      priority: rec.priority || "medium",
      price_amount: rec.price_amount,
      currency: rec.currency,
      pricing_note: rec.pricing_note || "",
      due_date: null,
      official_url: rec.official_url || "",
      verified_at: rec.verified_at || null,
      skills: rec.skills || []
    });
  }

  return {
    schema_version: "1.0",
    source: "career-studio",
    generated_at: new Date().toISOString(),
    target_track: cleanState.target_track,
    note: "Valores na moeda oficial de cada instituição (sem conversão cambial fictícia). Conferir impostos locais/IOF na página oficial.",
    totals_by_currency: {
      user_plan: plannedTotals,
      recommended_catalog: recommendedTotals
    },
    goals
  };
}

export function learningHandler(req, res, { root = process.cwd(), persist = false } = {}) {
  try {
    const { resume: baseResume, jobsCache, catalog } = loadContextFiles(root);
    const localState = loadLocalLearningState(root);

    if (req.method === "GET") {
      const skillAnalysis = analyzeSkillGaps(jobsCache.jobs || [], baseResume, {
        learningRecords: localState.items
      });
      const metrics = computeLearningMetrics(localState.items, skillAnalysis);
      const recommendations = recommendLearning({
        catalog: catalog.items || [],
        items: localState.items,
        skillAnalysis,
        targetTrack: localState.target_track
      });
      const roadmap = computeRoadmapState(localState.items);
      const exportsData = buildExports(localState.items);

      return res.status(200).json({
        success: true,
        persist,
        jobs_updated_at: jobsCache.formatted_date || "",
        catalog_verified_at: catalog.verified_at || null,
        catalog_note: catalog.note || "",
        available_skills: Object.keys(TECHS),
        state: localState,
        metrics,
        skill_analysis: skillAnalysis,
        recommendations,
        roadmap,
        exports: exportsData
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const cv = body.resume && typeof body.resume === "object" ? body.resume : baseResume;
      const incomingState = sanitizeLearningState(body.state || localState);

      // action === "analyze": recalcula métricas, skill gaps e recomendações sem exigir escrita em disco (funciona na Vercel!)
      if (body.action === "analyze") {
        const skillAnalysis = analyzeSkillGaps(jobsCache.jobs || [], cv, {
          learningRecords: incomingState.items
        });
        return res.status(200).json({
          success: true,
          persist,
          jobs_updated_at: jobsCache.formatted_date || "",
          catalog_verified_at: catalog.verified_at || null,
          state: incomingState,
          metrics: computeLearningMetrics(incomingState.items, skillAnalysis),
          skill_analysis: skillAnalysis,
          recommendations: recommendLearning({
            catalog: catalog.items || [],
            items: incomingState.items,
            skillAnalysis,
            targetTrack: incomingState.target_track
          }),
          roadmap: computeRoadmapState(incomingState.items),
          exports: buildExports(incomingState.items)
        });
      }

      if (!persist) {
        return res.status(501).json({
          error: "A versão online guarda o Learning Hub no navegador ou na sua conta Firebase.",
          storage: "browser"
        });
      }

      const saved = saveLocalLearningState(incomingState, root);
      const skillAnalysis = analyzeSkillGaps(jobsCache.jobs || [], cv, {
        learningRecords: saved.items
      });
      return res.status(200).json({
        success: true,
        persist: true,
        state: saved,
        metrics: computeLearningMetrics(saved.items, skillAnalysis),
        skill_analysis: skillAnalysis,
        recommendations: recommendLearning({
          catalog: catalog.items || [],
          items: saved.items,
          skillAnalysis,
          targetTrack: saved.target_track
        }),
        roadmap: computeRoadmapState(saved.items),
        exports: buildExports(saved.items)
      });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    return res.status(500).json({ error: `Erro no Learning Hub: ${err.message}` });
  }
}

export function studyPlanHandler(req, res, { root = process.cwd() } = {}) {
  setIntegrationCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const { resume: baseResume, jobsCache, catalog, projectIdeas } = loadContextFiles(root);
    const body = req.method === "POST" ? req.body || {} : {};
    const cv = body.resume && typeof body.resume === "object" ? body.resume : baseResume;
    const state = body.state ? sanitizeLearningState(body.state) : loadLocalLearningState(root);

    const payload = buildStudyPlanPayload({
      resume: cv,
      jobsCache,
      learningState: state,
      catalog: catalog.items || [],
      projectIdeas
    });
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: `Erro ao gerar plano de estudos: ${err.message}` });
  }
}

export function learningBudgetHandler(req, res, { root = process.cwd() } = {}) {
  setIntegrationCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const { resume: baseResume, jobsCache, catalog } = loadContextFiles(root);
    const body = req.method === "POST" ? req.body || {} : {};
    const cv = body.resume && typeof body.resume === "object" ? body.resume : baseResume;
    const state = body.state ? sanitizeLearningState(body.state) : loadLocalLearningState(root);

    const payload = buildLearningBudgetPayload({
      resume: cv,
      jobsCache,
      learningState: state,
      catalog: catalog.items || []
    });
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: `Erro ao gerar orçamento de certificações: ${err.message}` });
  }
}
