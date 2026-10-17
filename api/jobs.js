import fs from "node:fs";
import path from "node:path";
import { runJobSync } from "../scripts/fetch-jobs.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { search = "", limit = 30, refresh = "false" } = req.query || {};
  const root = process.cwd();
  const cachePath = path.join(root, "data", "jobs-cache.json");

  let cacheData = null;

  try {
    // If cache exists and refresh not explicitly forced
    if (fs.existsSync(cachePath) && refresh !== "true") {
      const fileContent = fs.readFileSync(cachePath, "utf8");
      cacheData = JSON.parse(fileContent);
    } else {
      // Run sync on the fly if cache is missing or refresh requested
      cacheData = await runJobSync();
    }
  } catch (err) {
    console.error("Erro ao ler cache de vagas:", err.message);
    try {
      cacheData = await runJobSync();
    } catch (syncErr) {
      return res.status(500).json({ error: "Erro ao carregar banco de vagas." });
    }
  }

  const allJobs = cacheData?.jobs || [];
  const q = search.trim().toLowerCase();

  let filteredJobs = allJobs;

  if (q && q !== "todas") {
    filteredJobs = allJobs.filter((j) => {
      const inTitle = (j.title || "").toLowerCase().includes(q);
      const inCompany = (j.company || "").toLowerCase().includes(q);
      const inLoc = (j.location || "").toLowerCase().includes(q);
      const inCategory = (j.category || "").toLowerCase().includes(q);
      const inTags = (j.tags || []).some(t => t.toLowerCase().includes(q));
      const inDesc = (j.description || "").toLowerCase().includes(q);

      // Handle synonyms & categories
      if (q.includes("hosp") || q.includes("saude") || q.includes("saúde") || q.includes("health") || q.includes("clinic")) {
        return (
          inTitle || inCategory || inTags ||
          j.category.includes("Saúde") ||
          (j.tags || []).some(t => /health|saúde|med|care|hosp/i.test(t)) ||
          /hospital|saúde|saude|health|patient|clínic|clinic/i.test(j.title + " " + j.description)
        );
      }

      if (q.includes("edtech") || q.includes("educa") || q.includes("moodle") || q.includes("ensino") || q.includes("ead")) {
        return (
          inTitle || inCategory || inTags ||
          j.category.includes("EdTech") ||
          (j.tags || []).some(t => /edtech|educa|moodle|ensino|ead/i.test(t)) ||
          /edtech|educa|moodle|ensino|ead|universidade|escola/i.test(j.title + " " + j.description)
        );
      }

      if (q.includes("bh") || q.includes("belo horizonte") || q.includes("presencial")) {
        return (
          j.location_type === "bh" ||
          inLoc ||
          /belo horizonte|bh|minas|nova lima/i.test(j.location + " " + j.title)
        );
      }

      if (q.includes("remoto") || q.includes("pj") || q.includes("clt")) {
        return (
          j.location_type === "remote" ||
          (j.modalities || []).some(m => m.toLowerCase().includes(q)) ||
          /remoto|remote|pj|clt/i.test(j.location + " " + (j.modalities || []).join(" "))
        );
      }

      return inTitle || inCompany || inLoc || inCategory || inTags || inDesc;
    });

    // If query was specific and yielded few results, fallback to all relevant tech jobs
    if (filteredJobs.length === 0) {
      filteredJobs = allJobs.slice(0, 15);
    }
  }

  const finalJobs = filteredJobs.slice(0, Number(limit));

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json({
    success: true,
    count: finalJobs.length,
    total_in_cache: allJobs.length,
    last_updated: cacheData?.formatted_date || "Hoje às 08:00 (BRT)",
    next_update: cacheData?.next_update || "Diariamente às 08:00 (Horário de Brasília)",
    jobs: finalJobs
  });
}
