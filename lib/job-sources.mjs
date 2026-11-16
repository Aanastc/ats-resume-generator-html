// Fontes de vagas. Cada função devolve vagas já normalizadas e pré-filtradas
// (cargo de desenvolvimento + localidade compatível). A checagem de vaga fantasma
// e a deduplicação acontecem depois, em scripts/fetch-jobs.mjs.
import {
  CATEGORY,
  cleanHtml,
  classifyLocation,
  decodeEntities,
  detectModalities,
  detectSector,
  isEligibleInternationalLocation,
  isSoftwareDevRole
} from "./job-quality.mjs";

const UA = "Mozilla/5.0 (compatible; ATS-Resume-Job-Matcher/2.0; +https://github.com/Aanastc)";

export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  return fetch(url, {
    ...options,
    headers: { "User-Agent": UA, Accept: "application/json, text/html", ...(options.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs)
  });
}

// Respostas grandes (ex.: 150 vagas com descrição completa) precisam de prazo maior.
// Uma nova tentativa cobre falhas passageiras de rede/5xx.
async function getJson(url, options, { timeoutMs = 30000, retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);
      if (res.status >= 500 && attempt < retries) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} em ${url}`), { final: true });
      return await res.json();
    } catch (err) {
      if (err.final || attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// Executa fn em paralelo com no máximo `limit` requisições simultâneas.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        results[idx] = { error: err };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// Corrige texto UTF-8 lido como Latin-1 (ex.: "SothebyÃ¢Â€Â™s" -> "Sotheby’s").
export function fixMojibake(str = "") {
  const s = String(str);
  if (!/[ÃÂâ][\u0080-ÿ]/.test(s)) return s;
  try {
    const fixed = Buffer.from(s, "latin1").toString("utf8");
    return fixed.includes("�") ? s : fixed;
  } catch {
    return s;
  }
}

const excerpt = (html, max = 1200) => fixMojibake(cleanHtml(html)).slice(0, max);

function cleanTitle(title) {
  return fixMojibake(decodeEntities(String(title || "")))
    .replace(/^\s*\[\s*job\s*[-–]?\s*\d+\s*\]\s*/i, "") // "[Job - 32496] AI Engineer" -> "AI Engineer"
    .replace(/\s+/g, " ")
    .trim();
}

function buildJob(base) {
  const sector = base.sector || "tech";
  return {
    tags: [],
    salary: null,
    expires_at: null,
    ...base,
    title: cleanTitle(base.title),
    company: fixMojibake(decodeEntities(String(base.company || ""))).trim(),
    category: CATEGORY[sector] || CATEGORY.tech,
    sector
  };
}

// ===========================================================================
// 1) SITES DE CARREIRA DAS EMPRESAS (fonte oficial — maior confiabilidade)
// ===========================================================================

export async function fetchGreenhouse(company) {
  const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${company.token}/jobs?content=true`);
  const jobs = [];
  for (const j of data.jobs || []) {
    const deps = (j.departments || []).map((d) => d.name).join(" ");
    if (!isSoftwareDevRole(j.title, [deps])) continue;
    const description = excerpt(j.content);
    const loc = classifyLocation({
      text: j.location?.name || "",
      brazilianCompany: Boolean(company.br) || /brazil|brasil/i.test(j.location?.name || ""),
      description
    });
    if (!loc) continue;
    jobs.push(
      buildJob({
        id: `gh-${company.token}-${j.id}`,
        title: j.title,
        company: company.name,
        location: loc.label,
        location_type: loc.type,
        is_compatible_location: true,
        modalities: detectModalities(`${j.title} ${description}`),
        url: j.absolute_url,
        tags: [deps].filter(Boolean),
        publication_date: j.first_published || j.updated_at,
        description,
        source: `Site da empresa (${company.name})`,
        source_type: "empresa",
        sector: detectSector(`${j.title} ${deps}`, company.sector)
      })
    );
  }
  return jobs;
}

export async function fetchLever(company) {
  const data = await getJson(`https://api.lever.co/v0/postings/${company.token}?mode=json`);
  const jobs = [];
  for (const j of data || []) {
    const team = `${j.categories?.team || ""} ${j.categories?.department || ""}`;
    if (!isSoftwareDevRole(j.text, [team])) continue;
    const description = (j.descriptionPlain || cleanHtml(j.description)).slice(0, 1200);
    const locText = (j.categories?.allLocations || [j.categories?.location]).filter(Boolean).join("; ");
    const loc = classifyLocation({
      remote: j.workplaceType === "remote",
      text: locText,
      country: j.country || "",
      brazilianCompany: j.country === "BR" || Boolean(company.br),
      description
    });
    if (!loc) continue;
    jobs.push(
      buildJob({
        id: `lever-${company.token}-${j.id}`,
        title: j.text,
        company: company.name,
        location: loc.label,
        location_type: loc.type,
        is_compatible_location: true,
        modalities: detectModalities(`${j.categories?.commitment || ""} ${j.text}`),
        url: j.hostedUrl,
        tags: [j.categories?.team, j.categories?.commitment].filter(Boolean),
        publication_date: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        description,
        source: `Site da empresa (${company.name})`,
        source_type: "empresa",
        sector: detectSector(`${j.text} ${team}`, company.sector)
      })
    );
  }
  return jobs;
}

export async function fetchAshby(company) {
  const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${company.token}?includeCompensation=true`);
  const jobs = [];
  for (const j of data.jobs || []) {
    if (j.isListed === false) continue; // vaga despublicada
    if (!isSoftwareDevRole(j.title, [j.department || "", j.team || ""])) continue;
    const description = (j.descriptionPlain || cleanHtml(j.descriptionHtml)).slice(0, 1200);
    const countries = [j.address, ...(j.secondaryLocations || []).map((s) => s.address)]
      .map((a) => a?.postalAddress?.addressCountry)
      .filter(Boolean);
    const locText = [j.location, ...(j.secondaryLocations || []).map((s) => s.location)].filter(Boolean).join("; ");
    const loc = classifyLocation({
      remote: Boolean(j.isRemote) || /remote/i.test(j.workplaceType || ""),
      text: locText,
      country: countries.join(" "),
      brazilianCompany: Boolean(company.br),
      description
    });
    if (!loc) continue;
    jobs.push(
      buildJob({
        id: `ashby-${company.token}-${j.id}`,
        title: j.title,
        company: company.name,
        location: loc.label,
        location_type: loc.type,
        is_compatible_location: true,
        modalities: detectModalities(`${j.employmentType || ""} ${j.title} ${description.slice(0, 300)}`),
        url: j.jobUrl,
        tags: [j.department, j.team, j.employmentType].filter(Boolean),
        salary: j.compensation?.compensationTierSummary || null,
        publication_date: j.publishedAt,
        description,
        source: `Site da empresa (${company.name})`,
        source_type: "empresa",
        sector: detectSector(`${j.title} ${j.department || ""}`, company.sector)
      })
    );
  }
  return jobs;
}

function readNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1])?.props?.pageProps : null;
}

const GUPY_MODALITY = {
  vacancy_legal_entity: ["PJ / Contractor"],
  vacancy_type_effective: ["CLT"],
  vacancy_type_temporary: ["Freelance / Temporário"]
};

// Gupy: página de carreira oficial da empresa (empresa.gupy.io).
// A listagem é pré-filtrada e depois cada vaga candidata é aberta para confirmar
// status "published", data de publicação e prazo de inscrição.
export async function fetchGupy(company) {
  const base = `https://${company.token}.gupy.io`;
  const res = await fetchWithTimeout(`${base}/`);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${base}`);
  const page = readNextData(await res.text());
  const list = page?.jobs || [];

  const candidates = list.filter((j) => {
    if (j.type === "vacancy_type_talent_pool" || j.type === "vacancy_type_internship") return false;
    if (!isSoftwareDevRole(j.title, [j.department || ""])) return false;
    const addr = j.workplace?.address || {};
    return Boolean(
      classifyLocation({
        remote: j.workplace?.workplaceType === "remote",
        text: [addr.city, addr.stateShortName].filter(Boolean).join(", "),
        brazilianCompany: true
      })
    );
  });

  const details = await mapLimit(candidates, 4, async (j) => {
    const r = await fetchWithTimeout(`${base}/jobs/${j.id}`);
    if (!r.ok) return null;
    return readNextData(await r.text())?.job || null;
  });

  const jobs = [];
  candidates.forEach((j, idx) => {
    const d = details[idx];
    if (!d || d.error || d.status !== "published") return; // vaga fechada/pausada
    const city = d.addressCity || j.workplace?.address?.city || "";
    const state = d.addressStateShortName || j.workplace?.address?.stateShortName || "";
    const loc = classifyLocation({
      remote: (d.workplaceType || j.workplace?.workplaceType) === "remote",
      text: [city, state].filter(Boolean).join(", "),
      brazilianCompany: true
    });
    if (!loc) return;
    const description = excerpt(`${d.description || ""} ${d.responsibilities || ""} ${d.prerequisites || ""}`);
    jobs.push(
      buildJob({
        id: `gupy-${company.token}-${j.id}`,
        title: j.title,
        company: company.name,
        location: loc.label,
        location_type: loc.type,
        is_compatible_location: true,
        modalities: GUPY_MODALITY[j.type] || detectModalities(j.title),
        url: `${base}/jobs/${j.id}`,
        tags: [j.department].filter(Boolean),
        publication_date: d.publishedAt,
        expires_at: d.expiresAt || d.registerEndDate || null,
        description,
        source: `Site da empresa (${company.name} via Gupy)`,
        source_type: "empresa",
        sector: detectSector(`${j.title} ${j.department || ""}`, company.sector)
      })
    );
  });
  return jobs;
}

export async function fetchWorkable(company) {
  const data = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${company.token}`);
  const jobs = [];
  for (const j of data.jobs || []) {
    if (!isSoftwareDevRole(j.title, [j.department || ""])) continue;
    const locText = (j.locations || [{ city: j.city, country: j.country }])
      .map((l) => [l.city, l.region, l.country].filter(Boolean).join(", "))
      .join("; ");
    const loc = classifyLocation({
      remote: Boolean(j.telecommuting),
      text: locText,
      brazilianCompany: Boolean(company.br)
    });
    if (!loc) continue;
    jobs.push(
      buildJob({
        id: `workable-${company.token}-${j.shortcode}`,
        title: j.title,
        company: company.name,
        location: loc.label,
        location_type: loc.type,
        is_compatible_location: true,
        modalities: detectModalities(`${j.employment_type || ""} ${j.title}`),
        url: j.url,
        tags: [j.department, j.employment_type].filter(Boolean),
        publication_date: j.published_on || j.created_at,
        description: "",
        source: `Site da empresa (${company.name})`,
        source_type: "empresa",
        sector: detectSector(`${j.title} ${j.department || ""}`, company.sector)
      })
    );
  }
  return jobs;
}

// ===========================================================================
// 2) FONTES DE NICHO: MOODLE E PHP
// ===========================================================================

// Quadro oficial de vagas da comunidade Moodle (moodle.org/jobs).
// Anúncios ficam até o anunciante remover, e a frequência é baixa (~2 por mês):
// aceitamos até 60 dias e sinalizamos "vaga de nicho" para a pessoa confirmar.
export async function fetchMoodleOrg() {
  const res = await fetchWithTimeout("https://moodle.org/mod/data/view.php?d=54&perpage=50", {}, 30000);
  if (!res.ok) throw new Error(`HTTP ${res.status} em moodle.org`);
  const html = await res.text();
  const rows = [...html.matchAll(/<tr class="mod-data-default-template[^"]*">([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const jobs = [];
  for (const row of rows) {
    const link = row.match(/<a href="([^"]*rid=(\d+)[^"]*)">([\s\S]*?)<\/a>/);
    if (!link) continue;
    const cell = (cls) => cleanHtml((row.match(new RegExp(`<td class="${cls}">([\\s\\S]*?)<\\/td>`)) || [])[1] || "");
    const title = cleanHtml(link[3]);
    const type = cell("c1");
    const where = cell("c2");
    const dateTitle = (row.match(/<span title="([^"]+)">/) || [])[1] || "";
    const published = new Date(dateTitle.replace(/^\w+,\s*/, "").replace(/,\s*(\d{1,2}:\d{2}\s*[AP]M)$/i, " $1"));
    if (!isSoftwareDevRole(title, ["moodle"])) continue;
    const loc = classifyLocation({ text: where });
    if (!loc) continue;
    jobs.push(
      buildJob({
        id: `moodleorg-${link[2]}`,
        title,
        company: title.match(/\s[-–—]\s*([^-–—]{2,40})$/)?.[1]?.trim() || "Anunciante no Moodle.org",
        location: loc.label,
        location_type: loc.type,
        is_compatible_location: true,
        modalities: detectModalities(type, ["Contrato (a confirmar)"]),
        url: `https://moodle.org/mod/data/view.php?d=54&rid=${link[2]}`,
        tags: ["Moodle", "PHP", type].filter(Boolean),
        publication_date: Number.isNaN(published.getTime()) ? null : published.toISOString(),
        description: `${title}. ${type}. ${where}. Vaga publicada no quadro oficial de vagas da comunidade Moodle.`,
        source: "Moodle.org Jobs",
        source_type: "comunidade",
        niche: "Moodle",
        max_age_days: 60,
        sector: "edtech"
      })
    );
  }
  return jobs;
}

// ProgramaThor: plataforma brasileira só de vagas para devs. As listagens misturam vagas antigas
// (há anúncios de 2020 ainda listados!), então abrimos cada vaga e usamos a data do JobPosting.
const PROGRAMATHOR_PAGES = ["jobs-php", "jobs-php?page=2", "jobs-php?page=3", "jobs-laravel", "jobs-wordpress"];

function ldField(block, key) {
  return (block.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`)) || [])[1] || null;
}

export async function fetchProgramaThor() {
  const ids = new Map();
  for (const page of PROGRAMATHOR_PAGES) {
    const res = await fetchWithTimeout(`https://programathor.com.br/${page}`, {}, 20000);
    if (!res.ok) continue;
    const html = await res.text();
    for (const m of html.matchAll(/href="(\/jobs\/(\d+)-[^"]+)"/g)) ids.set(Number(m[2]), m[1]);
  }
  if (!ids.size) throw new Error("nenhuma vaga encontrada nas listagens");

  // IDs são sequenciais: anúncios com ID muito menor que o mais recente são antigos (não vale abrir).
  const maxId = Math.max(...ids.keys());
  const recent = [...ids.entries()].filter(([id]) => id > maxId - 1500);

  const details = await mapLimit(recent, 3, async ([id, href]) => {
    const r = await fetchWithTimeout(`https://programathor.com.br${href}`, {}, 20000);
    if (!r.ok) return null;
    const html = await r.text();
    const block = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => m[1])
      .find((s) => s.includes('"JobPosting"'));
    if (!block) return null;
    const desc = (html.match(/<div class="line-height-2-4">([\s\S]*?)<\/div>\s*<\/div>/) || [])[1] || "";
    const techs = [...html.matchAll(/<span class='tag-list[^']*'>([^<]+)<\/span>/g)].map((m) => m[1]);
    return { id, href, block, desc, techs };
  });

  const jobs = [];
  for (const d of details) {
    if (!d || d.error) continue;
    // A ProgramaThor anexa a categoria ao título: "Dev PHP - Back-End" -> "Dev PHP"
    const title = (ldField(d.block, "title") || "").replace(
      /\s+-\s+(Back-End|Front-End|Full[ -]?Stack|Mobile|DevOps|Infraestrutura|Dados|Data Science|QA|Testes|Design|UX\/UI|Gestão|Games|Segurança)$/i,
      ""
    );
    if (!isSoftwareDevRole(title, d.techs)) continue;
    const org = (d.block.match(/"hiringOrganization"[\s\S]*?"name"\s*:\s*"([^"]*)"/) || [])[1];
    const remote = ldField(d.block, "jobLocationType") === "TELECOMMUTE";
    const city = ldField(d.block, "addressLocality");
    const region = ldField(d.block, "addressRegion");
    const loc = classifyLocation({
      remote,
      text: remote ? "Brasil" : [city, region].filter((v) => v && v !== "-").join(", "),
      brazilianCompany: true
    });
    if (!loc) continue;
    const employment = ldField(d.block, "employmentType") || "";
    jobs.push(
      buildJob({
        id: `programathor-${d.id}`,
        title,
        company: org,
        location: loc.label,
        location_type: loc.type,
        is_compatible_location: true,
        modalities: employment === "CONTRACTOR" ? ["PJ / Contractor"] : employment === "FULL_TIME" ? ["CLT"] : detectModalities(title),
        url: `https://programathor.com.br${d.href}`,
        tags: d.techs.slice(0, 8),
        publication_date: ldField(d.block, "datePosted"),
        expires_at: ldField(d.block, "validThrough"),
        description: excerpt(d.desc) || `${title} — ${d.techs.join(", ")}`,
        source: "ProgramaThor",
        source_type: "agregador",
        sector: detectSector(`${title} ${org} ${excerpt(d.desc).slice(0, 400)}`)
      })
    );
  }
  return jobs;
}

// ===========================================================================
// 3) AGREGADORES DE VAGAS REMOTAS (com data de publicação)
// ===========================================================================

// Himalayas: a busca com country=Brazil retorna só vagas que aceitam quem mora no Brasil.
export async function fetchHimalayas() {
  const jobs = [];
  for (const q of ["developer", "software engineer", "devops"]) {
    const data = await getJson(
      `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&country=Brazil&sort=recent`
    );
    for (const j of data.jobs || []) {
      if (!isSoftwareDevRole(j.title, j.categories || [])) continue;
      const description = excerpt(j.description || j.excerpt);
      const countries = j.locationRestrictions || [];
      const scope =
        countries.length === 0 ? "Global" : countries.length === 1 ? countries[0] : countries.length <= 4 ? countries.join(", ") : `${countries.length} países, inclui Brasil`;
      jobs.push(
        buildJob({
          id: `himalayas-${j.guid}`,
          title: j.title,
          company: j.companyName,
          location: countries.length === 1 ? "Remoto · Brasil" : `Remoto internacional · aceita Brasil (${scope})`,
          location_type: "remote",
          is_compatible_location: true,
          modalities: detectModalities(`${j.employmentType || ""} ${j.title}`, ["PJ Internacional / Contractor"]),
          url: j.applicationLink || j.guid,
          tags: (j.categories || []).slice(0, 4).map((c) => c.replace(/-/g, " ")),
          salary: j.minSalary ? `${j.currency || "USD"} ${j.minSalary}–${j.maxSalary} / ${j.salaryPeriod || "ano"}` : null,
          publication_date: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : null,
          expires_at: j.expiryDate ? new Date(j.expiryDate * 1000).toISOString() : null,
          description,
          source: "Himalayas",
          source_type: "agregador",
          sector: detectSector(`${j.title} ${description.slice(0, 400)}`)
        })
      );
    }
  }
  return jobs;
}

export async function fetchRemotive() {
  const data = await getJson("https://remotive.com/api/remote-jobs?category=software-dev&limit=100");
  const jobs = [];
  for (const j of data.jobs || []) {
    if (!isSoftwareDevRole(j.title, j.tags || [])) continue;
    const geo = j.candidate_required_location || "";
    if (!isEligibleInternationalLocation(geo, j.title, j.description || "")) continue;
    const loc = classifyLocation({ remote: true, text: geo });
    if (!loc) continue;
    const description = excerpt(j.description);
    jobs.push(
      buildJob({
        id: `remotive-${j.id}`,
        title: j.title,
        company: j.company_name,
        location: loc.label,
        location_type: "remote",
        is_compatible_location: true,
        modalities: detectModalities(j.job_type || "", ["PJ Internacional / Contractor"]),
        url: j.url,
        tags: (j.tags || []).slice(0, 5),
        salary: j.salary || null,
        publication_date: j.publication_date,
        description,
        source: "Remotive",
        source_type: "agregador",
        sector: detectSector(`${j.title} ${description.slice(0, 400)}`)
      })
    );
  }
  return jobs;
}

export async function fetchJobicy() {
  const urls = [
    "https://jobicy.com/api/v2/remote-jobs?count=50&industry=dev",
    "https://jobicy.com/api/v2/remote-jobs?count=50&geo=latam",
    "https://jobicy.com/api/v2/remote-jobs?count=50&tag=healthcare",
    "https://jobicy.com/api/v2/remote-jobs?count=50&tag=education"
  ];
  const jobs = [];
  for (const url of urls) {
    let data;
    try {
      data = await getJson(url);
    } catch (e) {
      console.warn("Aviso Jobicy:", e.message);
      continue;
    }
    for (const j of data.jobs || []) {
      if (!isSoftwareDevRole(j.jobTitle, [...(j.jobIndustry || []), ...(j.jobTags || [])])) continue;
      if (!isEligibleInternationalLocation(j.jobGeo, j.jobTitle, j.jobDescription || "")) continue;
      const loc = classifyLocation({ remote: true, text: j.jobGeo || "" });
      if (!loc) continue;
      const description = excerpt(j.jobDescription || j.jobExcerpt);
      jobs.push(
        buildJob({
          id: `jobicy-${j.id}`,
          title: j.jobTitle,
          company: j.companyName,
          location: loc.label,
          location_type: "remote",
          is_compatible_location: true,
          modalities: detectModalities((j.jobType || []).join(" "), ["PJ Internacional / Contractor"]),
          url: j.url,
          tags: (j.jobIndustry || []).slice(0, 3),
          salary: j.annualSalaryMin ? `${j.salaryCurrency || "USD"} ${j.annualSalaryMin}–${j.annualSalaryMax} / ano` : null,
          publication_date: j.pubDate,
          description,
          source: "Jobicy",
          source_type: "agregador",
          sector: detectSector(`${j.jobTitle} ${url} ${description.slice(0, 300)}`)
        })
      );
    }
  }
  return jobs;
}

export async function fetchRemoteOK() {
  const data = await getJson("https://remoteok.com/api");
  const jobs = [];
  for (const j of (data || []).slice(1)) {
    if (!j?.position || !isSoftwareDevRole(j.position, j.tags || [])) continue;
    const geo = j.location || "";
    // RemoteOK não informa restrição de país de forma estruturada: aceitamos só "Worldwide"/LATAM/Brasil.
    if (geo && !/worldwide|anywhere|latam|latin|americas|brazil|brasil|global/i.test(geo)) continue;
    if (!isEligibleInternationalLocation(geo, j.position, j.description || "")) continue;
    const description = excerpt(j.description);
    jobs.push(
      buildJob({
        id: `remoteok-${j.id}`,
        title: j.position,
        company: j.company,
        location: `Remoto internacional · ${geo || "Worldwide"} (sem visto)`,
        location_type: "remote",
        is_compatible_location: true,
        modalities: ["PJ Internacional / Contractor"],
        url: j.url,
        tags: (j.tags || []).slice(0, 5),
        salary: j.salary_min ? `USD ${j.salary_min}–${j.salary_max} / ano` : null,
        publication_date: j.date,
        description,
        source: "Remote OK",
        source_type: "agregador",
        sector: detectSector(`${j.position} ${description.slice(0, 400)}`)
      })
    );
  }
  return jobs;
}

// ===========================================================================
// 4) COMUNIDADES BRASILEIRAS (issues abertas no GitHub)
// ===========================================================================
const GITHUB_REPOS = ["backend-br/vagas", "frontendbr/vagas", "react-brasil/vagas", "phpdevbr/vagas"];

// Muitas issues trazem a empresa no título: "Dev Node na Empresa X", "Dev Java - DB1", "Dev (Strider)".
export function companyFromIssueTitle(title = "") {
  const patterns = [
    // "... na WeatherWise — 4 dias" -> palavras capitalizadas logo após "na/no/at/@"
    /\s(?:na|no|at|@)\s+([A-Z0-9][\w&.'-]*(?:\s[A-Z0-9][\w&.'-]*){0,3})/,
    /\s[-–—|]\s*([A-Z0-9][^-–—|]{1,29})$/, // último trecho após o traço: "... - Java & Angular - DB1" -> "DB1"
    /\(([A-Z][\w&.\-' ]{1,30})\)$/
  ];
  const NOT_COMPANY = /^(remoto|remote|pleno|s[eê]nior|junior|j[uú]nior|pl|sr|jr|clt|pj|h[ií]brido|brasil|brazil|bh|sp|rj|latam)\b/i;
  for (const re of patterns) {
    const m = title.match(re);
    if (m && !NOT_COMPANY.test(m[1].trim())) {
      return m[1].split("/")[0].trim();
    }
  }
  return null;
}

export async function fetchGitHubCommunities() {
  const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const jobs = [];
  const batches = [];
  for (const repo of GITHUB_REPOS) {
    try {
      const issues = await getJson(
        `https://api.github.com/repos/${repo}/issues?state=open&sort=created&direction=desc&per_page=60`,
        { headers }
      );
      batches.push({ repo, issues });
    } catch (e) {
      console.warn(`Aviso GitHub ${repo}:`, e.message);
    }
  }
  // Busca direcionada: issues de nicho (PHP/Laravel/Moodle) que já saíram das 60 mais recentes.
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const q = `php OR laravel OR moodle is:issue is:open created:>${since} ${GITHUB_REPOS.map((r) => `repo:${r}`).join(" ")}`;
    const found = await getJson(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=100`, { headers });
    for (const issue of found.items || []) {
      batches.push({ repo: issue.repository_url.split("/repos/")[1], issues: [issue] });
    }
  } catch (e) {
    console.warn("Aviso busca GitHub (PHP/Moodle):", e.message);
  }

  const seenIssues = new Set();
  for (const { repo, issues } of batches) {
    for (const issue of issues) {
      if (seenIssues.has(issue.id)) continue;
      seenIssues.add(issue.id);
      if (issue.pull_request) continue;
      const title = issue.title.replace(/^\s*\[[^\]]*\]\s*/g, "").trim();
      const labels = (issue.labels || []).map((l) => l.name).filter(Boolean);
      if (labels.some((l) => /fechad|closed|preenchid|encerrad/i.test(l))) continue;
      if (!isSoftwareDevRole(issue.title, labels)) continue;
      const body = issue.body || "";
      const all = `${issue.title} ${labels.join(" ")} ${body.slice(0, 1500)}`;
      const loc = classifyLocation({
        remote: /remoto|remote/i.test(`${issue.title} ${labels.join(" ")}`),
        text: issue.title.match(/\[([^\]]+)\]/)?.[1] || labels.join(", "),
        brazilianCompany: true
      });
      if (!loc) continue;
      jobs.push(
        buildJob({
          id: `gh-issue-${issue.id}`,
          title,
          company: companyFromIssueTitle(title) || `Publicada por @${issue.user?.login} (empresa no anúncio)`,
          location: loc.label,
          location_type: loc.type,
          is_compatible_location: true,
          modalities: detectModalities(all),
          url: issue.html_url,
          tags: labels.slice(0, 6),
          publication_date: issue.created_at,
          description: cleanHtml(body).slice(0, 1200),
          source: `Comunidade ${repo}`,
          source_type: "comunidade",
          sector: detectSector(all)
        })
      );
    }
  }
  return jobs;
}
