import fs from "node:fs";
import path from "node:path";
import {
  cleanText,
  classifyEventLocation,
  detectEventTopics,
  isTechEvent,
  isUpcomingEvent,
  parseDevEventsRss,
  parseSymplaEvents
} from "../lib/events.mjs";

const root = process.cwd();
const dataDir = path.join(root, "data");
const UA = "Mozilla/5.0 (compatible; CareerStudio-Events/1.0)";

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: { "User-Agent": UA, ...(options.headers || {}) },
      signal: controller.signal
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function normalizeEvent(raw) {
  if (!raw?.url || !/^https?:\/\//i.test(raw.url) || !raw.title) return null;
  if (!isUpcomingEvent(raw.start_date)) return null;

  const title = cleanText(raw.title);
  const desc = cleanText(raw.description || "");
  const tags = [...new Set((raw.tags || []).map((t) => cleanText(t)).filter(Boolean))].slice(0, 8);

  if (!isTechEvent(title, desc, tags)) return null;

  const loc = classifyEventLocation({
    city: raw.city,
    state: raw.state,
    country: raw.country,
    isOnline: raw.isOnline,
    isHybrid: raw.isHybrid,
    rawText: `${title} ${raw.venue || ""} ${raw.location_raw || ""}`
  });

  if (!loc.eligible) return null;

  const topics = detectEventTopics(title, desc, tags);
  return {
    id: raw.id,
    title,
    organizer: cleanText(raw.organizer || raw.source || "Comunidade Tech"),
    url: raw.url,
    start_date: raw.start_date,
    end_date: raw.end_date || null,
    mode: loc.mode,
    location: loc.label,
    venue: cleanText(raw.venue || ""),
    description: desc.slice(0, 420),
    topics,
    tags,
    price: raw.price || (raw.isFree ? "Gratuito" : ""),
    source: raw.source
  };
}

// 1. Sympla Belo Horizonte (Presencial/Híbrido BH) & Online Brasil
async function fetchSymplaSource() {
  const targets = [
    { url: "https://www.sympla.com.br/eventos/belo-horizonte-mg/tecnologia", defaultCity: "Belo Horizonte", defaultState: "MG", defaultOnline: false },
    { url: "https://www.sympla.com.br/eventos/belo-horizonte-mg?s=inteligencia+artificial", defaultCity: "Belo Horizonte", defaultState: "MG", defaultOnline: false },
    { url: "https://www.sympla.com.br/eventos/belo-horizonte-mg?s=programacao", defaultCity: "Belo Horizonte", defaultState: "MG", defaultOnline: false },
    { url: "https://www.sympla.com.br/eventos/online/tecnologia", defaultCity: "", defaultState: "", defaultOnline: true }
  ];

  const all = [];
  for (const t of targets) {
    try {
      const res = await fetchWithTimeout(t.url);
      if (!res.ok) continue;
      const html = await res.text();
      const parsed = parseSymplaEvents(html, t);
      all.push(...parsed);
    } catch (e) {
      console.warn(`[Eventos/Sympla] Aviso em ${t.url}:`, e.message);
    }
  }
  return all.map(normalizeEvent).filter(Boolean);
}

// 2. GDG Belo Horizonte (capítulo 743) + GDG Virtual (Online Global/Brasil)
async function fetchGdgSource() {
  const out = [];

  // GDG Belo Horizonte (Presencial/Híbrido)
  try {
    const res = await fetchWithTimeout("https://gdg.community.dev/api/event/?chapter=743&status=Live&page_size=20");
    if (res.ok) {
      const data = await res.json();
      for (const e of data.results || []) {
        out.push(
          normalizeEvent({
            id: `gdg-bh-${e.id}`,
            title: e.title,
            organizer: e.chapter?.title || "GDG Belo Horizonte",
            url: e.url,
            start_date: e.start_date,
            end_date: e.end_date,
            city: e.chapter?.city || "Belo Horizonte",
            state: "MG",
            country: "BR",
            venue: e.venue_name || e.venue_address || "Belo Horizonte, MG",
            isOnline: Boolean(e.is_virtual_event),
            description: e.description_short || e.description || "",
            tags: ["GDG", "Comunidade", ...(e.tags || [])],
            isFree: true,
            source: "GDG Belo Horizonte"
          })
        );
      }
    }
  } catch (e) {
    console.warn("[Eventos/GDG-BH] Aviso:", e.message);
  }

  // GDG Virtual/Online (próximos 35 eventos online)
  try {
    const res = await fetchWithTimeout("https://gdg.community.dev/api/event_slim/?status=Live&is_virtual=true&page_size=35&order_by=start_date");
    if (res.ok) {
      const data = await res.json();
      for (const e of data.results || []) {
        const country = e.chapter?.country || "";
        out.push(
          normalizeEvent({
            id: `gdg-on-${e.id}`,
            title: e.title,
            organizer: e.chapter?.title || "Google Developer Groups",
            url: e.url,
            start_date: e.start_date,
            end_date: e.end_date,
            country: country === "BR" ? "BR" : "Global",
            isOnline: true,
            description: e.description_short || "",
            tags: ["GDG", ...(e.tags || [])],
            isFree: true,
            source: "GDG Online"
          })
        );
      }
    }
  } catch (e) {
    console.warn("[Eventos/GDG-Online] Aviso:", e.message);
  }

  return out.filter(Boolean);
}

// 3. CNCF Cloud Native (Kubernetes, DevOps, Platform Engineering, Observabilidade)
async function fetchCncfSource() {
  const out = [];
  try {
    const res = await fetchWithTimeout("https://community.cncf.io/api/event_slim/?status=Live&page_size=40&order_by=start_date");
    if (res.ok) {
      const data = await res.json();
      for (const e of data.results || []) {
        const city = e.chapter?.city || "";
        const country = e.chapter?.country || "";
        const isVirtual = Boolean(e.is_virtual_event) || /virtual|online/i.test(`${e.event_type_title || ""} ${e.title}`);
        out.push(
          normalizeEvent({
            id: `cncf-${e.id}`,
            title: e.title,
            organizer: e.chapter?.title || "CNCF Cloud Native",
            url: e.url,
            start_date: e.start_date,
            end_date: e.end_date,
            city,
            country,
            venue: e.venue_name || "",
            isOnline: isVirtual,
            description: e.description_short || "",
            tags: ["CNCF", "Cloud Native", "Kubernetes", "DevOps", ...(e.tags || [])],
            isFree: true,
            source: "CNCF Community"
          })
        );
      }
    }
  } catch (e) {
    console.warn("[Eventos/CNCF] Aviso:", e.message);
  }
  return out.filter(Boolean);
}

// 4. Agenda Tech Brasil (GitHub comunidade BR)
const AGENDA_MONTHS = {
  janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12"
};

async function fetchAgendaTechBrSource() {
  const out = [];
  try {
    const res = await fetchWithTimeout("https://raw.githubusercontent.com/agenda-tech-brasil/agenda-tech-brasil/main/src/db/database.json");
    if (!res.ok) return out;
    const db = await res.json();
    const curYear = new Date().getFullYear();

    for (const yearBlock of db.eventos || []) {
      if (Number(yearBlock.ano) < curYear) continue;
      for (const monthBlock of yearBlock.meses || []) {
        const mm = AGENDA_MONTHS[String(monthBlock.mes || "").toLowerCase()];
        if (!mm) continue;
        for (const ev of monthBlock.eventos || []) {
          const days = Array.isArray(ev.data) ? ev.data : [ev.data];
          const firstDay = String(days[0] || "01").padStart(2, "0");
          const lastDay = String(days[days.length - 1] || firstDay).padStart(2, "0");
          const startIso = `${yearBlock.ano}-${mm}-${firstDay}T09:00:00-03:00`;
          const endIso = `${yearBlock.ano}-${mm}-${lastDay}T18:00:00-03:00`;
          const tipo = String(ev.tipo || "").toLowerCase();

          out.push(
            normalizeEvent({
              id: `agendabr-${yearBlock.ano}-${mm}-${firstDay}-${String(ev.nome || "").slice(0, 18).replace(/\W+/g, "")}`,
              title: ev.nome,
              organizer: "Agenda Tech Brasil",
              url: ev.url,
              start_date: startIso,
              end_date: endIso,
              city: ev.cidade || "",
              state: ev.uf || "",
              country: "BR",
              isOnline: tipo.includes("online"),
              isHybrid: tipo.includes("híbrido") || tipo.includes("hibrido"),
              description: `Evento ${ev.tipo || "tech"} listado na Agenda Tech Brasil${ev.cidade ? ` (${ev.cidade}/${ev.uf})` : ""}.`,
              tags: ["Brasil", ev.tipo || "Tech"].filter(Boolean),
              source: "Agenda Tech Brasil"
            })
          );
        }
      }
    }
  } catch (e) {
    console.warn("[Eventos/AgendaTechBR] Aviso:", e.message);
  }
  return out.filter(Boolean);
}

// 5. Confs.tech (Conferências Tech 2026 & 2027 — Online ou Brasil)
async function fetchConfsTechSource() {
  const out = [];
  const curYear = new Date().getFullYear();
  const years = [curYear, curYear + 1];
  const topics = ["javascript", "devops", "python", "typescript", "php", "security", "data", "general"];

  const fetches = [];
  for (const y of years) {
    for (const t of topics) {
      fetches.push(
        fetchWithTimeout(`https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences/${y}/${t}.json`)
          .then(async (r) => (r.ok ? { topic: t, items: await r.json() } : null))
          .catch(() => null)
      );
    }
  }

  const results = await Promise.all(fetches);
  for (const block of results) {
    if (!block?.items) continue;
    for (const c of block.items) {
      if (!c.online && !/brazil|brasil/i.test(c.country || "")) continue;
      out.push(
        normalizeEvent({
          id: `confstech-${c.startDate}-${String(c.name || "").slice(0, 20).replace(/\W+/g, "")}`,
          title: c.name,
          organizer: "Confs.tech",
          url: c.url,
          start_date: c.startDate ? `${c.startDate}T12:00:00Z` : null,
          end_date: c.endDate ? `${c.endDate}T18:00:00Z` : null,
          city: c.city || "",
          country: c.country || "Global",
          isOnline: Boolean(c.online),
          description: `Conferência internacional de ${block.topic}${c.cfpUrl ? " (Call for Papers aberto)" : ""}.`,
          tags: [block.topic, "Conferência", ...(c.online ? ["Online"] : [])],
          source: "Confs.tech"
        })
      );
    }
  }

  return out.filter(Boolean);
}

// 6. Dev.events RSS (Masterclasses e Conferências Online)
async function fetchDevEventsSource() {
  try {
    const res = await fetchWithTimeout("https://dev.events/rss.xml");
    if (!res.ok) return [];
    const xml = await res.text();
    return parseDevEventsRss(xml).map(normalizeEvent).filter(Boolean);
  } catch (e) {
    console.warn("[Eventos/Dev.events] Aviso:", e.message);
    return [];
  }
}

export async function runEventsSync({ writeDisk = true } = {}) {
  console.log("Iniciando coleta diária de eventos de tecnologia (Online e Presencial em BH)...");
  const cachePath = path.join(dataDir, "events-cache.json");

  let prevEvents = [];
  try {
    if (fs.existsSync(cachePath)) {
      prevEvents = JSON.parse(fs.readFileSync(cachePath, "utf8")).events || [];
    }
  } catch {
    prevEvents = [];
  }

  const sources = [
    ["Sympla", fetchSymplaSource],
    ["GDG", fetchGdgSource],
    ["CNCF", fetchCncfSource],
    ["Agenda Tech Brasil", fetchAgendaTechBrSource],
    ["Confs.tech", fetchConfsTechSource],
    ["Dev.events", fetchDevEventsSource]
  ];

  const settled = await Promise.all(
    sources.map(async ([name, fn]) => {
      try {
        const items = await fn();
        if (items.length > 0) return items;
        // Se uma fonte retornou vazio por instabilidade temporária, reaproveita eventos futuros dela
        const fallback = prevEvents.filter((e) => (e.source || "").toLowerCase().includes(name.toLowerCase()) && isUpcomingEvent(e.start_date));
        return fallback;
      } catch (err) {
        console.warn(`[Eventos/${name}] Falha — reaproveitando cache anterior:`, err.message);
        return prevEvents.filter((e) => (e.source || "").toLowerCase().includes(name.toLowerCase()) && isUpcomingEvent(e.start_date));
      }
    })
  );

  // Deduplica por URL e por título+dia
  const seenUrls = new Set();
  const seenKeys = new Set();
  const unique = [];

  for (const ev of settled.flat()) {
    const normUrl = ev.url.replace(/\/+$/, "").toLowerCase();
    const dayKey = `${ev.title.toLowerCase().replace(/\W+/g, "")}::${String(ev.start_date).slice(0, 10)}`;
    if (seenUrls.has(normUrl) || seenKeys.has(dayKey)) continue;
    seenUrls.add(normUrl);
    seenKeys.add(dayKey);
    unique.push(ev);
  }

  // Ordena cronologicamente
  unique.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  const now = new Date();
  const payload = {
    updated_at: now.toISOString(),
    formatted_date: now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    next_update: "Diariamente às 08:00 (Horário de Brasília)",
    total_events: unique.length,
    counts: {
      bh: unique.filter((e) => e.mode === "bh").length,
      online_br: unique.filter((e) => e.mode === "online_br").length,
      online_global: unique.filter((e) => e.mode === "online_global").length
    },
    events: unique
  };

  if (writeDisk) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), "utf8");
      console.log(`✅ ${unique.length} eventos futuros verificados salvos em data/events-cache.json (BH: ${payload.counts.bh}, Online BR: ${payload.counts.online_br}, Online Global: ${payload.counts.online_global})`);
    } catch (err) {
      console.warn("Aviso ao gravar events-cache.json (ambiente somente leitura):", err.message);
    }
  }

  return payload;
}

if (process.argv[1] && process.argv[1].endsWith("fetch-events.mjs")) {
  runEventsSync()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Erro na coleta de eventos:", err);
      process.exit(1);
    });
}
