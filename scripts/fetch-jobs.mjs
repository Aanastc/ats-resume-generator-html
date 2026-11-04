// Coleta diária de vagas: sites de carreira das empresas + agregadores + comunidades.
// Só entram vagas reais e ativas: descartamos banco de talentos, vagas antigas,
// prazos vencidos, links quebrados e duplicatas. CLI: npm run jobs
import fs from "node:fs";
import path from "node:path";
import { IS_SERVERLESS } from "../lib/runtime.mjs";
import { daysAgo, ghostReason, MAX_AGE_DAYS, normalizeKey } from "../lib/job-quality.mjs";
import {
  fetchAshby,
  fetchGitHubCommunities,
  fetchGreenhouse,
  fetchGupy,
  fetchHimalayas,
  fetchJobicy,
  fetchLever,
  fetchRemoteOK,
  fetchRemotive,
  fetchWithTimeout,
  mapLimit
} from "../lib/job-sources.mjs";

// Reexportados para manter compatibilidade com imports existentes (testes, API).
export { isSoftwareDevRole, isEligibleInternationalLocation } from "../lib/job-quality.mjs";

const root = process.cwd();
const dataDir = path.join(root, "data");

// Prioridade na deduplicação: site da empresa > comunidade > agregador.
const SOURCE_RANK = { empresa: 0, comunidade: 1, agregador: 2 };

function loadCompanies() {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, "job-sources.json"), "utf8"));
  } catch {
    return { greenhouse: [], lever: [], ashby: [], gupy: [] };
  }
}

// Link ainda abre? Descartamos 404/410 e redirecionamentos para a página inicial do site.
// 403/429 (proteção anti-robô) não provam que a vaga sumiu, então a vaga é mantida.
async function checkLink(url) {
  try {
    let res = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" }, 10000);
    if (res.status === 405 || res.status === 501) {
      res = await fetchWithTimeout(url, { method: "GET", redirect: "follow" }, 10000);
    }
    if (res.status === 404 || res.status === 410) return { alive: false, reason: `link retornou ${res.status}` };
    const finalPath = new URL(res.url).pathname.replace(/\/+$/, "");
    if (res.redirected && (finalPath === "" || /\/(jobs|careers|vagas)$/.test(finalPath))) {
      return { alive: false, reason: "link redireciona para a lista geral (vaga encerrada)" };
    }
    return { alive: true, verified: res.ok };
  } catch {
    return { alive: true, verified: false }; // falha de rede não é prova de vaga encerrada
  }
}

function loadPreviousCache() {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, "jobs-cache.json"), "utf8"));
  } catch {
    return null;
  }
}

// Se uma fonte falhar (timeout, instabilidade), reaproveita as vagas dela da coleta anterior,
// desde que continuem passando nas regras anti-fantasma. Evita que uma falha passageira
// apague dezenas de vagas válidas por um dia inteiro.
export async function runSource(label, fn, report, previousJobs = []) {
  const started = Date.now();
  try {
    const jobs = (await fn()).map((j) => ({ ...j, source_key: label }));
    report.sources.push({ source: label, ok: true, found: jobs.length, ms: Date.now() - started });
    return jobs;
  } catch (err) {
    const reused = previousJobs.filter((j) => j.source_key === label);
    report.sources.push({ source: label, ok: false, error: err.message, reused_from_previous: reused.length, ms: Date.now() - started });
    console.warn(`Aviso [${label}]: ${err.message}${reused.length ? ` — reaproveitando ${reused.length} vagas da coleta anterior` : ""}`);
    return reused.map((j) => ({ ...j, from_previous_run: true }));
  }
}

export async function collectJobs({ verifyLinks = true, now = new Date() } = {}) {
  const previousJobs = loadPreviousCache()?.jobs || [];
  const companies = loadCompanies();
  const report = { sources: [], discarded: {}, checked_links: 0 };

  const companyTasks = [
    ...(companies.greenhouse || []).map((c) => [`Greenhouse/${c.name}`, () => fetchGreenhouse(c)]),
    ...(companies.lever || []).map((c) => [`Lever/${c.name}`, () => fetchLever(c)]),
    ...(companies.ashby || []).map((c) => [`Ashby/${c.name}`, () => fetchAshby(c)]),
    ...(companies.gupy || []).map((c) => [`Gupy/${c.name}`, () => fetchGupy(c)])
  ];
  const otherTasks = [
    ["Himalayas", fetchHimalayas],
    ["Remotive", fetchRemotive],
    ["Jobicy", fetchJobicy],
    ["Remote OK", fetchRemoteOK],
    ["Comunidades GitHub", fetchGitHubCommunities]
  ];

  const results = await mapLimit([...companyTasks, ...otherTasks], 6, ([label, fn]) => runSource(label, fn, report, previousJobs));
  const raw = results.flat().filter((j) => j && !j.error);

  // 1) Regras anti-fantasma
  const discard = (reason) => (report.discarded[reason] = (report.discarded[reason] || 0) + 1);
  const valid = raw.filter((j) => {
    const reason = ghostReason(j, now);
    if (reason) {
      discard(reason.replace(/\d+ dias/, `mais de ${MAX_AGE_DAYS} dias`));
      return false;
    }
    return true;
  });

  // 2) Deduplicação (mesma URL ou mesma empresa + cargo), preferindo o site da empresa
  valid.sort((a, b) => (SOURCE_RANK[a.source_type] ?? 9) - (SOURCE_RANK[b.source_type] ?? 9));
  const seen = new Set();
  const unique = [];
  for (const j of valid) {
    const keys = [j.url.toLowerCase(), `${normalizeKey(j.company)}|${normalizeKey(j.title)}`];
    if (keys.some((k) => seen.has(k))) {
      discard("duplicada em outra fonte");
      continue;
    }
    keys.forEach((k) => seen.add(k));
    unique.push(j);
  }

  // 3) Links de agregadores/comunidades: confirma que a vaga ainda abre.
  //    Vagas do site da empresa vêm da API oficial e já estão ativas por definição.
  const verifiedAt = now.toISOString();
  const checks = await mapLimit(unique, 8, async (j) => {
    if (j.source_type === "empresa" || !verifyLinks) return { alive: true, verified: j.source_type === "empresa" };
    report.checked_links++;
    return checkLink(j.url);
  });

  const jobs = [];
  unique.forEach((j, idx) => {
    const check = checks[idx] || { alive: true };
    if (!check.alive) return discard(check.reason || "link indisponível");
    // Vaga internacional sem modalidade explícita: contratação a partir do Brasil é como contractor/PJ.
    if (/internacional|aceita brasil/i.test(j.location) && j.modalities.join() === "PJ ou CLT") {
      j.modalities = ["PJ Internacional / Contractor"];
    }
    jobs.push({
      ...j,
      verified: Boolean(check.verified),
      verified_at: verifiedAt,
      days_ago: daysAgo(j.publication_date, now),
      salary: j.salary || j.modalities.join(" / ")
    });
  });

  // Mais recentes primeiro; site da empresa desempata
  jobs.sort(
    (a, b) =>
      (a.days_ago ?? 99) - (b.days_ago ?? 99) || (SOURCE_RANK[a.source_type] ?? 9) - (SOURCE_RANK[b.source_type] ?? 9)
  );

  return { jobs, report: { ...report, raw: raw.length, kept: jobs.length } };
}

// persist=false (padrão na Vercel, disco somente leitura) apenas coleta e devolve as vagas.
export async function runJobSync({ persist = !IS_SERVERLESS, verifyLinks = true } = {}) {
  console.log("Coletando vagas (sites de empresas, agregadores e comunidades)...");
  const now = new Date();
  const { jobs, report } = await collectJobs({ verifyLinks, now });

  const bySource = jobs.reduce((acc, j) => ((acc[j.source_type] = (acc[j.source_type] || 0) + 1), acc), {});
  const cachePayload = {
    updated_at: now.toISOString(),
    formatted_date: now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    next_update: "Diariamente às 08:00 (Horário de Brasília)",
    max_age_days: MAX_AGE_DAYS,
    total_jobs: jobs.length,
    by_source_type: bySource,
    quality_report: report,
    jobs
  };

  if (persist) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "jobs-cache.json"), JSON.stringify(cachePayload, null, 2), "utf8");
  }

  const discardedTotal = Object.values(report.discarded).reduce((a, b) => a + b, 0);
  console.log(
    `✅ ${jobs.length} vagas ativas (${bySource.empresa || 0} de sites de empresas, ${bySource.agregador || 0} de agregadores, ${bySource.comunidade || 0} de comunidades).`
  );
  console.log(`🧹 ${discardedTotal} descartadas:`, report.discarded);
  const failed = report.sources.filter((s) => !s.ok);
  if (failed.length) console.log(`⚠️ ${failed.length} fontes falharam:`, failed.map((s) => s.source).join(", "));
  return cachePayload;
}

if (process.argv[1] && process.argv[1].endsWith("fetch-jobs.mjs")) {
  runJobSync()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Falha ao coletar vagas:", err);
      process.exit(1);
    });
}
