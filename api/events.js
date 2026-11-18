import fs from "node:fs";
import path from "node:path";
import { buildEventsResponse } from "../lib/events.mjs";
import { isAuthorized } from "../lib/runtime.mjs";
import { runEventsSync } from "../scripts/fetch-events.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { search = "", mode = "", topic = "", window = "", limit = 100, refresh = "false" } = req.query || {};
  const cachePath = path.join(process.cwd(), "data", "events-cache.json");

  // Coleta ao vivo na nuvem só com autorização (CRON_SECRET), evitando abuso de cotas das APIs externas.
  const forceRefresh = refresh === "true" && isAuthorized(req);

  let cacheData = null;
  try {
    if (!forceRefresh && fs.existsSync(cachePath)) {
      cacheData = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } else {
      cacheData = await runEventsSync({ writeDisk: false });
    }
  } catch (err) {
    console.error("Erro ao carregar eventos:", err.message);
    return res.status(500).json({ error: "Erro ao carregar banco de eventos." });
  }

  res.setHeader("Cache-Control", forceRefresh ? "no-store" : "s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json(buildEventsResponse(cacheData, { search, mode, topic, window, limit }));
}
