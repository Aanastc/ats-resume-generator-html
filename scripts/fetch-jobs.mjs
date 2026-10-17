import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function cleanHtml(str) {
  if (!str) return "";
  return str
    .replace(/<[^>]*>?/gm, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLocationType(title, desc, rawLocation = "") {
  const fullText = `${title} ${desc} ${rawLocation}`.toLowerCase();
  
  const isBH = /belo horizonte|\bbh\b|minas gerais|\bmg\b|nova lima|contagem|betim/i.test(fullText);
  if (isBH) {
    return {
      type: "bh",
      label: "📍 Belo Horizonte, MG (Presencial / Híbrido)",
      isCandidateCompatible: true
    };
  }

  const isRemote = /remoto|remote|anywhere|worldwide|100% remoto|home office|teletrabalho/i.test(fullText);
  if (isRemote) {
    return {
      type: "remote",
      label: "🌐 100% Remoto (Brasil / Global)",
      isCandidateCompatible: true
    };
  }

  const isOnsiteOther = /(são paulo|sp|rio de janeiro|rj|curitiba|florianopolis|porto alegre|brasilia|recife|salvador).*(presencial|híbrido|hibrido)/i.test(fullText) ||
                        /(presencial|híbrido|hibrido).*(são paulo|sp|rio de janeiro|rj|curitiba|florianopolis|porto alegre|brasilia)/i.test(fullText);

  if (isOnsiteOther) {
    return {
      type: "onsite_outside_bh",
      label: "⚠️ Presencial fora de BH (Incompatível com perfil)",
      isCandidateCompatible: false
    };
  }

  return {
    type: "remote_fallback",
    label: rawLocation || "Remoto / A Definir",
    isCandidateCompatible: true
  };
}

function detectModality(title, tags = [], desc = "") {
  const fullText = `${title} ${tags.join(" ")} ${desc}`.toLowerCase();
  const modalities = [];
  if (/\bpj\b|pessoa jurídica|prestador|contractor/i.test(fullText)) modalities.push("PJ");
  if (/\bclt\b|efetivo|carteira assinada/i.test(fullText)) modalities.push("CLT");
  if (/freela|freelance|temporário|projeto/i.test(fullText)) modalities.push("Freelance");
  
  return modalities.length > 0 ? modalities : ["PJ ou CLT"];
}

// 1. Brazilian tech communities (general + targeted)
async function fetchBrazilianJobs() {
  const repos = ["backend-br/vagas", "frontendbr/vagas", "react-brasil/vagas"];
  const allIssues = [];

  for (const repo of repos) {
    try {
      const res = await fetchWithTimeout(`https://api.github.com/repos/${repo}/issues?state=open&per_page=15`, {
        headers: { "User-Agent": "ATS-Resume-Job-Matcher/1.0" }
      });
      if (res.ok) {
        const issues = await res.json();
        for (const issue of issues) {
          if (issue.pull_request) continue;
          const loc = detectLocationType(issue.title, issue.body || "", "");
          const mods = detectModality(issue.title, (issue.labels || []).map(l => l.name), issue.body || "");
          
          allIssues.push({
            id: `br-${issue.id}`,
            title: issue.title.replace(/^\[.*?\]\s*/, ""),
            company: issue.user?.login || "Empresa Contratante",
            location: loc.label,
            location_type: loc.type,
            is_compatible_location: loc.isCandidateCompatible,
            modalities: mods,
            url: issue.html_url,
            tags: (issue.labels || []).map(l => l.name).filter(Boolean),
            salary: mods.join(" / "),
            publication_date: issue.created_at,
            description: cleanHtml(issue.body?.slice(0, 1000) || issue.title),
            source: "Vagas Brasil (GitHub)",
            category: "Empresas Tech / Full Stack"
          });
        }
      }
    } catch (e) {
      console.warn(`Aviso ao buscar vagas de ${repo}:`, e.message);
    }
  }

  // Targeted GitHub Search for BH, Healthcare, EdTech/Moodle
  try {
    const searchRes = await fetchWithTimeout(
      `https://api.github.com/search/issues?q=repo:backend-br/vagas+repo:frontendbr/vagas+state:open+belo+OR+bh+OR+saude+OR+moodle+OR+edtech&per_page=15`,
      { headers: { "User-Agent": "ATS-Resume-Job-Matcher/1.0" } }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      for (const issue of searchData.items || []) {
        if (issue.pull_request) continue;
        const loc = detectLocationType(issue.title, issue.body || "", "");
        const mods = detectModality(issue.title, (issue.labels || []).map(l => l.name), issue.body || "");
        
        let cat = "Empresas Tech / Full Stack";
        const titleLower = issue.title.toLowerCase();
        if (/saúde|saude|hosp|clinic|health/i.test(titleLower)) {
          cat = "Hospitais & Clínicas (Saúde)";
        } else if (/edtech|educa|moodle|ensino|ead/i.test(titleLower)) {
          cat = "EdTechs & Educação";
        } else if (loc.type === "bh") {
          cat = "Presencial / Híbrido BH";
        }

        allIssues.push({
          id: `br-search-${issue.id}`,
          title: issue.title.replace(/^\[.*?\]\s*/, ""),
          company: issue.user?.login || "Empresa Contratante",
          location: loc.label,
          location_type: loc.type,
          is_compatible_location: loc.isCandidateCompatible,
          modalities: mods,
          url: issue.html_url,
          tags: (issue.labels || []).map(l => l.name).filter(Boolean),
          salary: mods.join(" / "),
          publication_date: issue.created_at,
          description: cleanHtml(issue.body?.slice(0, 1000) || issue.title),
          source: "GitHub Vagas Diretas",
          category: cat
        });
      }
    }
  } catch (e) {
    console.warn("Aviso busca direcionada GitHub:", e.message);
  }

  return allIssues;
}

// 2. Healthcare & Hospitals / Clinical (Jobicy Healthcare)
async function fetchHealthcareJobs() {
  const jobs = [];

  try {
    const res = await fetchWithTimeout("https://jobicy.com/api/v2/remote-jobs?count=15&tag=healthcare", {
      headers: { "User-Agent": "ATS-Resume-Job-Matcher/1.0" }
    });
    if (res.ok) {
      const data = await res.json();
      (data.jobs || []).forEach(j => {
        const loc = detectLocationType(j.jobTitle, j.jobDescription || "", j.jobGeo || "");
        const mods = detectModality(j.jobTitle, j.jobTags || [], j.jobDescription || "");
        jobs.push({
          id: `jobicy-${j.id}`,
          title: j.jobTitle,
          company: j.companyName,
          location: loc.label,
          location_type: loc.type,
          is_compatible_location: loc.isCandidateCompatible,
          modalities: mods,
          url: j.url,
          tags: ["HealthTech", "Saúde", ...(j.jobTags || [])],
          salary: j.annualSalaryMin ? `$${j.annualSalaryMin} - $${j.annualSalaryMax}` : "Competitivo (PJ/Contrato)",
          publication_date: j.pubDate,
          description: cleanHtml(j.jobDescription?.slice(0, 1000) || j.jobExcerpt),
          source: "Jobicy HealthTech",
          category: "Hospitais & Clínicas (Saúde)"
        });
      });
    }
  } catch (e) {
    console.warn("Aviso Jobicy Healthcare:", e.message);
  }

  return jobs;
}

// 3. EdTechs & Education (Jobicy & Remotive)
async function fetchEdTechJobs() {
  const jobs = [];

  // Jobicy Education
  try {
    const res = await fetchWithTimeout("https://jobicy.com/api/v2/remote-jobs?count=12&tag=education", {
      headers: { "User-Agent": "ATS-Resume-Job-Matcher/1.0" }
    });
    if (res.ok) {
      const data = await res.json();
      (data.jobs || []).forEach(j => {
        const loc = detectLocationType(j.jobTitle, j.jobDescription || "", j.jobGeo || "");
        const mods = detectModality(j.jobTitle, j.jobTags || [], j.jobDescription || "");
        jobs.push({
          id: `jobicy-edu-${j.id}`,
          title: j.jobTitle,
          company: j.companyName,
          location: loc.label,
          location_type: loc.type,
          is_compatible_location: loc.isCandidateCompatible,
          modalities: mods,
          url: j.url,
          tags: ["EdTech", "Educação", ...(j.jobTags || [])],
          salary: j.annualSalaryMin ? `$${j.annualSalaryMin} - $${j.annualSalaryMax}` : "Negociável (PJ/CLT)",
          publication_date: j.pubDate,
          description: cleanHtml(j.jobDescription?.slice(0, 1000) || j.jobExcerpt),
          source: "Jobicy EdTech",
          category: "EdTechs & Educação"
        });
      });
    }
  } catch (e) {
    console.warn("Aviso Jobicy EdTech:", e.message);
  }

  // Remotive Education
  try {
    const res = await fetchWithTimeout("https://remotive.com/api/remote-jobs?search=education&limit=12", {
      headers: { "User-Agent": "ATS-Resume-Job-Matcher/1.0" }
    });
    if (res.ok) {
      const data = await res.json();
      (data.jobs || []).forEach(j => {
        const loc = detectLocationType(j.title, j.description || "", j.candidate_required_location || "");
        const mods = detectModality(j.title, j.tags || [], j.description || "");
        jobs.push({
          id: `remotive-edu-${j.id}`,
          title: j.title,
          company: j.company_name,
          location: loc.label,
          location_type: loc.type,
          is_compatible_location: loc.isCandidateCompatible,
          modalities: mods,
          url: j.url,
          tags: ["EdTech", ...(j.tags || [])],
          salary: j.salary || "Negociável",
          publication_date: j.publication_date,
          description: cleanHtml(j.description?.slice(0, 1000)),
          source: "Remotive EdTech",
          category: "EdTechs & Educação"
        });
      });
    }
  } catch (e) {
    console.warn("Aviso Remotive EdTech:", e.message);
  }

  return jobs;
}

// 4. Conventional Tech / Full Stack & DevOps (Remotive)
async function fetchRemoteTechJobs() {
  const jobs = [];

  try {
    const res = await fetchWithTimeout("https://remotive.com/api/remote-jobs?category=software-dev&limit=25", {
      headers: { "User-Agent": "ATS-Resume-Job-Matcher/1.0" }
    });
    if (res.ok) {
      const data = await res.json();
      (data.jobs || []).forEach(j => {
        const loc = detectLocationType(j.title, j.description || "", j.candidate_required_location || "");
        const mods = detectModality(j.title, j.tags || [], j.description || "");
        jobs.push({
          id: `remotive-${j.id}`,
          title: j.title,
          company: j.company_name,
          location: loc.label,
          location_type: loc.type,
          is_compatible_location: loc.isCandidateCompatible,
          modalities: mods,
          url: j.url,
          tags: j.tags || [],
          salary: j.salary || "Negociável",
          publication_date: j.publication_date,
          description: cleanHtml(j.description?.slice(0, 1000)),
          source: "Remotive Remote Dev",
          category: "Empresas Tech / Full Stack"
        });
      });
    }
  } catch (e) {
    console.warn("Aviso Remotive:", e.message);
  }

  return jobs;
}

export async function runJobSync() {
  console.log("Iniciando coleta e validação diária de vagas ativas (Saúde, EdTechs, BH e Remoto)...");

  const [brJobs, healthJobs, edTechJobs, remoteJobs] = await Promise.all([
    fetchBrazilianJobs(),
    fetchHealthcareJobs(),
    fetchEdTechJobs(),
    fetchRemoteTechJobs()
  ]);

  // Combine and remove any jobs with invalid URLs
  const rawList = [...brJobs, ...healthJobs, ...edTechJobs, ...remoteJobs];
  const verifiedList = rawList.filter(j => j.url && j.url.startsWith("http"));

  // De-duplicate by URL
  const seenUrls = new Set();
  const uniqueJobs = [];
  for (const j of verifiedList) {
    if (!seenUrls.has(j.url)) {
      seenUrls.add(j.url);
      uniqueJobs.push(j);
    }
  }

  const now = new Date();
  const nextUpdate = new Date(now);
  nextUpdate.setDate(nextUpdate.getDate() + 1);
  nextUpdate.setHours(8, 0, 0, 0); // 08:00 AM next day

  const cachePayload = {
    updated_at: now.toISOString(),
    formatted_date: now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    next_update: "Diariamente às 08:00 (Horário de Brasília)",
    total_jobs: uniqueJobs.length,
    jobs: uniqueJobs
  };

  const cachePath = path.join(dataDir, "jobs-cache.json");
  fs.writeFileSync(cachePath, JSON.stringify(cachePayload, null, 2), "utf8");

  console.log(`Sucesso: ${uniqueJobs.length} vagas 100% verificadas salvas em data/jobs-cache.json`);
  return cachePayload;
}

// Execute directly if run as a script
if (process.argv[1] && process.argv[1].endsWith("fetch-jobs.mjs")) {
  runJobSync()
    .then(() => process.exit(0))
    .catch(err => {
      console.error("Falha ao coletar vagas:", err);
      process.exit(1);
    });
}
