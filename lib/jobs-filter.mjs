// Filtro de vagas compartilhado entre a API da Vercel (api/jobs.js) e o servidor local (scripts/server.mjs).

const lower = (v) => String(v ?? "").toLowerCase();

// Cada "intenção" de busca é detectada por palavra inteira, para que termos como
// "tech lead" não caiam em EdTech (por conter "ead") nem "github" caia em BH.
const INTENTS = [
  {
    name: "empresa",
    query: /\b(sites? da empresa|direto da empresa)\b/i,
    match: (j) => j.source_type === "empresa",
    exclusive: true
  },
  {
    name: "saude",
    query: /\b(hosp\w*|sa[uú]de|health\w*|cl[ií]nic\w*|m[eé]dic\w*)\b/i,
    match: (j) =>
      lower(j.category).includes("saúde") ||
      (j.tags || []).some((t) => /health|saúde|saude|medic|hosp/i.test(t)) ||
      /hospital|saúde|saude|health|patient|cl[ií]nic/i.test(`${j.title} ${j.description}`)
  },
  {
    name: "edtech",
    query: /\b(edtech|educa\w*|moodle|ensino|ead|lms)\b/i,
    match: (j) =>
      lower(j.category).includes("edtech") ||
      (j.tags || []).some((t) => /edtech|educa|moodle|ensino|\bead\b|lms/i.test(t)) ||
      /edtech|educa|moodle|ensino|\bead\b|universidade|escola|\blms\b/i.test(`${j.title} ${j.description}`)
  },
  {
    name: "bh",
    query: /\b(bh|belo horizonte|presencial|h[ií]brido)\b/i,
    match: (j) => j.location_type === "bh" || /belo horizonte|\bbh\b|nova lima/i.test(`${j.location} ${j.title}`)
  },
  {
    name: "internacional",
    query: /\b(inter\w*|gringa?|usd|global|ingl[eê]s|english)\b/i,
    match: (j) =>
      (j.tags || []).some((t) => /inglês|english|global|usd/i.test(t)) ||
      /usd|worldwide|global/i.test(`${j.salary} ${j.location}`)
  },
  {
    name: "remoto",
    query: /\b(remoto|remote|pj|clt|freela\w*)\b/i,
    match: (j, q) =>
      j.location_type === "remote" ||
      (j.modalities || []).some((m) => lower(m).includes(q)) ||
      /remoto|remote/i.test(String(j.location))
  }
];

function matchesText(j, q) {
  return (
    lower(j.title).includes(q) ||
    lower(j.company).includes(q) ||
    lower(j.location).includes(q) ||
    lower(j.category).includes(q) ||
    (j.tags || []).some((t) => lower(t).includes(q)) ||
    lower(j.description).includes(q)
  );
}

export function filterJobs(allJobs = [], search = "", limit = 30) {
  const q = lower(search).trim();
  const max = Math.min(Math.max(Number(limit) || 30, 1), 100);

  if (!q || q === "todas") return allJobs.slice(0, max);

  const intent = INTENTS.find((i) => i.query.test(q));
  const filtered = allJobs.filter((j) =>
    intent?.exclusive ? intent.match(j, q) : matchesText(j, q) || (intent ? intent.match(j, q) : false)
  );

  // Sem resultados => lista vazia (o front-end mostra o estado "nenhuma vaga").
  return filtered.slice(0, max);
}

export function buildJobsResponse(cacheData, search, limit) {
  const allJobs = cacheData?.jobs || [];
  const jobs = filterJobs(allJobs, search, limit);
  const report = cacheData?.quality_report || {};
  return {
    success: true,
    count: jobs.length,
    total_in_cache: allJobs.length,
    last_updated: cacheData?.formatted_date || null,
    next_update: cacheData?.next_update || "Diariamente às 08:00 (Horário de Brasília)",
    max_age_days: cacheData?.max_age_days || null,
    by_source_type: cacheData?.by_source_type || {},
    discarded: report.discarded || {},
    jobs
  };
}
