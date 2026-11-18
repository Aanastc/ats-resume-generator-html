import fs from "node:fs";
import path from "node:path";
import { buildArticlesResponse } from "../lib/articles.mjs";
import { isAuthorized } from "../lib/runtime.mjs";
import { runArticlesSync } from "../scripts/fetch-articles.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { search = "", topic = "", lang = "", sort = "recent", limit = 80, refresh = "false" } = req.query || {};
  const cachePath = path.join(process.cwd(), "data", "articles-cache.json");

  // Coleta ao vivo na nuvem só com autorização (CRON_SECRET), evitando abuso de cotas das APIs externas.
  const forceRefresh = refresh === "true" && isAuthorized(req);

  let cacheData = null;
  try {
    if (!forceRefresh && fs.existsSync(cachePath)) {
      cacheData = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } else {
      cacheData = await runArticlesSync({ writeDisk: false });
    }
  } catch (err) {
    console.error("Erro ao carregar artigos:", err.message);
    return res.status(500).json({ error: "Erro ao carregar banco de artigos." });
  }

  res.setHeader("Cache-Control", forceRefresh ? "no-store" : "s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json(buildArticlesResponse(cacheData, { search, topic, lang, sort, limit }));
}
