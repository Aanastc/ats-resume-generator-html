import fs from "node:fs";
import path from "node:path";
import { runJobSync } from "../scripts/fetch-jobs.mjs";
import { buildJobsResponse } from "../lib/jobs-filter.mjs";
import { isAuthorized } from "../lib/runtime.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { search = "", limit = 30, refresh = "false" } = req.query || {};
  const cachePath = path.join(process.cwd(), "data", "jobs-cache.json");

  // O cache é atualizado diariamente pelo GitHub Action. Coletar ao vivo só é permitido
  // com CRON_SECRET, para que ninguém esgote a cota das APIs de vagas chamando ?refresh=true.
  const forceRefresh = refresh === "true" && isAuthorized(req);

  let cacheData = null;
  try {
    if (!forceRefresh && fs.existsSync(cachePath)) {
      cacheData = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } else {
      cacheData = await runJobSync();
    }
  } catch (err) {
    console.error("Erro ao carregar vagas:", err.message);
    return res.status(500).json({ error: "Erro ao carregar banco de vagas." });
  }

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json(buildJobsResponse(cacheData, search, limit));
}
