import fs from "node:fs";
import path from "node:path";
import { filterEvents } from "../lib/events.mjs";
import { runEventsSync } from "../scripts/fetch-events.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { search = "", mode = "", topic = "", window = "", limit = 100, refresh = "false" } = req.query || {};
  const cachePath = path.join(process.cwd(), "data", "events-cache.json");

  let cacheData = null;
  try {
    if (fs.existsSync(cachePath) && refresh !== "true") {
      cacheData = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } else {
      cacheData = await runEventsSync({ writeDisk: false });
    }
  } catch (err) {
    console.error("Erro ao carregar eventos:", err.message);
    try {
      cacheData = await runEventsSync({ writeDisk: false });
    } catch (syncErr) {
      return res.status(500).json({ error: "Erro ao carregar banco de eventos." });
    }
  }

  const allEvents = cacheData?.events || [];
  const filtered = filterEvents(allEvents, { search, mode, topic, window, limit });

  res.setHeader("Cache-Control", refresh === "true" ? "no-store" : "s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json({
    success: true,
    count: filtered.length,
    total_in_cache: allEvents.length,
    counts: cacheData?.counts || {
      bh: allEvents.filter((e) => e.mode === "bh").length,
      online_br: allEvents.filter((e) => e.mode === "online_br").length,
      online_global: allEvents.filter((e) => e.mode === "online_global").length
    },
    last_updated: cacheData?.formatted_date || "Hoje às 08:00 (BRT)",
    next_update: cacheData?.next_update || "Diariamente às 08:00 (Horário de Brasília)",
    events: filtered
  });
}
