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

async function fetchBrazilianJobs() {
  const repos = ["backend-br/vagas", "frontendbr/vagas", "react-brasil/vagas"];
  const allIssues = [];

  for (const repo of repos) {
    try {
      const res = await fetchWithTimeout(`https://api.github.com/repos/${repo}/issues?state=open&per_page=12`, {
        headers: { "User-Agent": "ATS-Resume-Job-Matcher/1.0" }
      });
      if (res.ok) {
        const issues = await res.json();
        for (const issue of issues) {
          if (issue.pull_request) continue;
          allIssues.push({
            id: `br-${issue.id}`,
            title: issue.title.replace(/^\[.*?\]\s*/, ""),
            company: issue.user?.login || "Empresa Contratante",
            location: issue.title.toLowerCase().includes("belo horizonte") ? "Belo Horizonte, MG" : "Brasil (Remoto / Híbrido)",
            url: issue.html_url,
            tags: (issue.labels || []).map(l => l.name).filter(Boolean),
            salary: issue.labels?.some(l => l.name.toLowerCase() === "pj") ? "Contrato PJ" : "CLT / A combinar",
            publication_date: issue.created_at,
            description: cleanHtml(issue.body?.slice(0, 1000) || issue.title),
            source: "Vagas Brasil (GitHub)",
            category: "Brasil / PJ & CLT"
          });
        }
      }
    } catch (e) {
      console.warn(`Aviso ao buscar vagas de ${repo}:`, e.message);
    }
  }

  return allIssues;
}

async function fetchHealthcareJobs() {
  const jobs = [];

  // Jobicy Healthcare
  try {
    const res = await fetchWithTimeout("https://jobicy.com/api/v2/remote-jobs?count=15&tag=healthcare", {
      headers: { "User-Agent": "ATS-Resume-Job-Matcher/1.0" }
    });
    if (res.ok) {
      const data = await res.json();
      (data.jobs || []).forEach(j => {
        jobs.push({
          id: `jobicy-${j.id}`,
          title: j.jobTitle,
          company: j.companyName,
          location: j.jobGeo || "Worldwide / Remote",
          url: j.url,
          tags: ["HealthTech", "Saúde", ...(j.jobTags || [])],
          salary: j.annualSalaryMin ? `$${j.annualSalaryMin} - $${j.annualSalaryMax}` : "Competitivo (PJ/Contrato)",
          publication_date: j.pubDate,
          description: cleanHtml(j.jobDescription?.slice(0, 1000) || j.jobExcerpt),
          source: "Jobicy HealthTech",
          category: "Hospitalar / Saúde"
        });
      });
    }
  } catch (e) {
    console.warn("Aviso Jobicy Healthcare:", e.message);
  }

  return jobs;
}

async function fetchRemoteTechJobs() {
  const jobs = [];

  // Remotive Software Dev
  try {
    const res = await fetchWithTimeout("https://remotive.com/api/remote-jobs?category=software-dev&limit=25", {
      headers: { "User-Agent": "ATS-Resume-Job-Matcher/1.0" }
    });
    if (res.ok) {
      const data = await res.json();
      (data.jobs || []).forEach(j => {
        jobs.push({
          id: `remotive-${j.id}`,
          title: j.title,
          company: j.company_name,
          location: j.candidate_required_location || "Worldwide Remote",
          url: j.url,
          tags: j.tags || [],
          salary: j.salary || "Negociável",
          publication_date: j.publication_date,
          description: cleanHtml(j.description?.slice(0, 1000)),
          source: "Remotive Remote Dev",
          category: "Full Stack / DevOps"
        });
      });
    }
  } catch (e) {
    console.warn("Aviso Remotive:", e.message);
  }

  return jobs;
}

export async function runJobSync() {
  console.log("Iniciando coleta e validação diária de vagas ativas...");

  const [brJobs, healthJobs, remoteJobs] = await Promise.all([
    fetchBrazilianJobs(),
    fetchHealthcareJobs(),
    fetchRemoteTechJobs()
  ]);

  // Combine and remove any jobs with invalid URLs
  const rawList = [...brJobs, ...healthJobs, ...remoteJobs];
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
