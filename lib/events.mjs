// Lógica pura de classificação, parsing e filtragem de eventos de tecnologia
// (online no Brasil/Global e presencial/híbrido na Grande Belo Horizonte).

const lower = (v) => String(v ?? "").toLowerCase();

// Remove entidades HTML comuns e tags
export function cleanText(str = "") {
  return String(str || "")
    .replace(/<[^>]*>?/gm, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Rejeita eventos que não são de tecnologia/engenharia (ex.: cursos religiosos, artesanato, gastronomia)
const NON_TECH_RE =
  /\b(batizado|padrinhos|gastronomia|culin[aá]ria|artesanato|hist[oó]ria da arte|dan[cç]a|yoga|pilates|corrida de rua|show musical|stand[- ]?up|teatro|churrasco|cerveja artesanal|maquiagem|est[eé]tica|moda|corte e costura|imobili[aá]rio|secovi|odontologia est[eé]tica|harmoniza[cç][aã]o|concurso p[uú]blico administrativo)\b/i;

// Termos fortes de engenharia de software, cloud, IA, produto e comunidade tech
const TECH_RE =
  /\b(dev(?:ops|fest|secops|eloper|s)?|gdg|gdgolo|cncf|cloud native|software|engenharia de software|programa[cç][aã]o|programador|full[- ]?stack|front[- ]?end|back[- ]?end|arquitetura|system design|clean architecture|micros?servi[cç]os?|microservices?|kubernetes|k8s|docker|terraform|aws|azure|gcp|google cloud|cloud|sre|observabilidade|opentelemetry|prometheus|grafana|ci\/cd|gitops|react|next\.?js|typescript|javascript|node\.?js|python|php|moodle|java|golang|rust|linux|api\b|apis|rest|graphql|sql|postgres|redis|dados|data science|data engineering|analytics|machine learning|intelig[eê]ncia artificial|\bia\b|\bai\b|llm|rag\b|mcp\b|agent|ag[eê]ntic|gen ?ai|gemini|claude|openai|ciberseguran[cç]a|cybersecurity|appsec|owasp|cisa|hackathon|tech|webtech|rob[oó]tica|healthtech|edtech|fintech|startup|open source|codigo aberto|c[oó]digo aberto|agilidade|scrum|pmi|tdc|platformcon|qcon|kubecon)\b/i;

export function isTechEvent(title = "", desc = "", tags = []) {
  const combined = `${title} ${tags.join(" ")} ${String(desc).slice(0, 400)}`;
  if (NON_TECH_RE.test(title)) return false;
  return TECH_RE.test(combined);
}

const BH_RE = /\b(belo horizonte|bh|nova lima|contagem|betim|sabara|sabar[aá]|lagoa santa|vespasiano|ribeir[aã]o das neves|santa luzia)\b/i;
const BR_PORTUGUESE_RE = /\b(brasil|brazil|minas gerais|\bmg\b|s[aã]o paulo|rio de janeiro|portugu[eê]s|sympla|puc minas|ufmg|fiemg|sebrae|tdc|gambiconf|bras[ií]lia|curitiba|florian[oó]polis|fortaleza|recife|porto alegre|programa[cç][aã]o|desenvolvimento|intelig[eê]ncia artificial|imers[aã]o|encontro|comunidade)\b|[ãõç]/i;

/**
 * Classifica um evento quanto à elegibilidade geográfica para a candidata:
 * - "bh": presencial ou híbrido na Grande Belo Horizonte
 * - "online_br": 100% online em português / Brasil
 * - "online_global": 100% online internacional (inglês)
 * - "outside": presencial fora de BH (não elegível)
 */
export function classifyEventLocation({ city = "", state = "", country = "", isOnline = false, isHybrid = false, rawText = "" } = {}) {
  const place = `${city} ${state} ${country} ${rawText}`;
  const isBH = BH_RE.test(place) || (/\bmg\b/i.test(state) && /belo horizonte|nova lima|contagem|betim/i.test(place));

  if (isBH) {
    return {
      mode: "bh",
      label: isHybrid ? "📍 Híbrido • Belo Horizonte, MG" : "📍 Presencial • Belo Horizonte, MG",
      eligible: true
    };
  }

  if (isOnline || isHybrid || /\b(online|virtual|remoto|remote|ao vivo|webinar|livestream|transmiss[aã]o online)\b/i.test(place)) {
    const isBr =
      /^br(asil|azil)?$/i.test(String(country).trim()) ||
      BR_PORTUGUESE_RE.test(place);
    return isBr
      ? { mode: "online_br", label: "🌐 Online • Brasil", eligible: true }
      : { mode: "online_global", label: "🌎 Online • Internacional (EN)", eligible: true };
  }

  return {
    mode: "outside",
    label: [city, state, country].filter(Boolean).join(", ") || "Presencial fora de BH",
    eligible: false
  };
}

export const EVENT_TOPICS = {
  ia: {
    label: "IA & Agentes",
    re: /\b(ia\b|ai\b|intelig[eê]ncia artificial|llm|rag\b|mcp\b|agent|ag[eê]ntic|gen ?ai|gemini|claude|openai|machine learning|gemma|vertex)\b/i
  },
  cloud: {
    label: "Cloud & DevOps",
    re: /\b(cloud|devops|kubernetes|k8s|docker|terraform|aws|gcp|azure|cncf|sre|platform|gitops|ci\/cd|observabilidade|prometheus|grafana|opentelemetry|linux|seguran[cç]a|cyber|cisa)\b/i
  },
  fullstack: {
    label: "Full Stack & Web",
    re: /\b(full[- ]?stack|front[- ]?end|back[- ]?end|react|next\.?js|typescript|javascript|node\.?js|python|php|moodle|web|webtech|java|go\b|golang|mobile|api|rest)\b/i
  },
  arquitetura: {
    label: "Arquitetura & Dados",
    re: /\b(arquitetura|architecture|system design|clean architecture|ddd|micros?servi[cç]os?|microservices?|event[- ]?driven|kafka|dados|data|sql|postgres|analytics|etl|big ?data)\b/i
  },
  saude: {
    label: "Saúde & HealthTech",
    re: /\b(sa[uú]de|health ?tech|hospital|cl[ií]nic|fhir|hl7|medicina|telemedicina)\b/i
  },
  edtech: {
    label: "EdTech & Educação",
    re: /\b(edtech|moodle|lms|ensino|educa[cç][aã]o tecnol[oó]gica|ead)\b/i
  },
  comunidade: {
    label: "Comunidade & Carreira",
    re: /\b(gdg|gdgolo|meetup|networking|comunidade|community|devfest|carreira|mulheres na tecnologia|women in tech|hackathon|startup|lideran[cç]a|pmi|agilidade)\b/i
  }
};

export function detectEventTopics(title = "", desc = "", tags = []) {
  const text = `${title} ${tags.join(" ")} ${desc}`;
  const found = Object.entries(EVENT_TOPICS)
    .filter(([, cfg]) => cfg.re.test(text))
    .map(([key]) => key);
  return found.length ? found : ["comunidade"];
}

// Converte data do Sympla ("Qua, 18 Nov - 2026 · 18:30" ou ISO) para ISO YYYY-MM-DDTHH:mm:ss-03:00
const PT_MONTHS = {
  jan: "01", fev: "02", feb: "02", mar: "03", abr: "04", apr: "04",
  mai: "05", may: "05", jun: "06", jul: "07", ago: "08", aug: "08",
  set: "09", sep: "09", out: "10", oct: "10", nov: "11", dez: "12", dec: "12"
};

export function parseSymplaDate(ptDateStr = "") {
  if (!ptDateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(ptDateStr)) return ptDateStr;
  // Ex.: "Qua, 18 Nov - 2026 · 18:30" ou "18 Nov 2026"
  const m = String(ptDateStr).match(/(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,})\s*[-–,]?\s*(\d{4})(?:[^\d]+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const mon = PT_MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  const year = m[3];
  const hh = (m[4] || "09").padStart(2, "0");
  const mm = (m[5] || "00").padStart(2, "0");
  return `${year}-${mon}-${day}T${hh}:${mm}:00-03:00`;
}

/**
 * Extrai objetos de evento do HTML Next.js (RSC) do Sympla.
 */
export function parseSymplaEvents(html = "", { defaultCity = "", defaultState = "", defaultOnline = false } = {}) {
  if (!html) return [];
  // O payload RSC escapa aspas como \" — normalizamos apenas o necessário para localizar campos de evento
  const unescaped = html.replace(/\\"/g, '"');
  const results = [];
  const seen = new Set();

  // Cada evento no RSC possui "url":"https://www.sympla.com.br/evento..." próximo de start_date_formats, organizer e name
  const urlRe = /"url":"(https:\/\/www\.sympla\.com\.br\/evento(?:-online)?\/[a-z0-9-]+\/(\d+))"/gi;
  let match;
  while ((match = urlRe.exec(unescaped)) !== null) {
    const url = match[1];
    const id = match[2];
    if (seen.has(id)) continue;

    // Olha uma janela ao redor do URL no objeto JSON do evento
    const windowStr = unescaped.slice(Math.max(0, match.index - 400), Math.min(unescaped.length, match.index + 1200));
    const nameMatch = windowStr.match(/"name":"([^"]{4,200})"/g) || [];
    // O objeto organizer também tem "name", então pegamos o nome do evento (normalmente após end_date_formats ou que não é o organizer)
    const orgMatch = windowStr.match(/"organizer":\{[^}]*"name":"([^"]*)"/);
    const organizer = orgMatch ? cleanText(orgMatch[1]) : "Sympla";

    const afterEnd = windowStr.match(/"end_date_formats":\{[^}]*\},"name":"([^"]{3,220})"/);
    let title = afterEnd ? cleanText(afterEnd[1]) : "";
    if (!title) {
      const candidate = nameMatch
        .map((s) => s.replace(/^"name":"|"$/g, ""))
        .find((n) => n && n !== organizer && !n.startsWith("http"));
      title = cleanText(candidate || "");
    }
    if (!title) continue;

    const startPt = (windowStr.match(/"start_date_formats":\{[^}]*"pt":"([^"]+)"/) || [])[1] || "";
    const endPt = (windowStr.match(/"end_date_formats":\{[^}]*"pt":"([^"]+)"/) || [])[1] || "";
    const startIso = parseSymplaDate(startPt);
    const endIso = parseSymplaDate(endPt);

    const cityMatch = windowStr.match(/"city":"([^"]+)"/);
    const stateMatch = windowStr.match(/"state":"([^"]+)"/);
    const venueMatch = windowStr.match(/"location":\{[^}]*"name":"([^"]+)"/);

    const isOnlineUrl = /\/evento-online\//i.test(url) || defaultOnline;
    const city = cityMatch ? cleanText(cityMatch[1]) : defaultCity;
    const state = stateMatch ? cleanText(stateMatch[1]) : defaultState;
    const venue = venueMatch ? cleanText(venueMatch[1]) : "";

    seen.add(id);
    results.push({
      id: `sympla-${id}`,
      title,
      organizer,
      url,
      start_date: startIso,
      end_date: endIso,
      date_label: startPt || "",
      city,
      state,
      country: "BR",
      venue,
      isOnline: isOnlineUrl,
      source: isOnlineUrl ? "Sympla Online" : "Sympla BH"
    });
  }

  return results;
}

const EN_MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12"
};

/**
 * Extrai eventos futuros online do RSS do Dev.events.
 */
export function parseDevEventsRss(xml = "") {
  if (!xml) return [];
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const getTag = (tag) => {
      const r = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
      return r ? cleanText(r[1]) : "";
    };
    const title = getTag("title");
    const url = getTag("link");
    const description = getTag("description");
    const categories = [...block.matchAll(/<category>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi)].map((c) => cleanText(c[1]));

    if (!title || !url) continue;
    // Dev.events descrição: "... is happening on December 10, 2026, Online."
    const isOnline = /\bonline\b/i.test(description) || /\bonline\b/i.test(url);
    const isBrazil = /\b(brazil|brasil|belo horizonte)\b/i.test(description);
    if (!isOnline && !isBrazil) continue;

    let startIso = null;
    const dateMatch = description.match(/happening on ([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i);
    if (dateMatch) {
      const mon = EN_MONTHS[dateMatch[1].toLowerCase()];
      if (mon) startIso = `${dateMatch[3]}-${mon}-${dateMatch[2].padStart(2, "0")}T12:00:00Z`;
    }
    if (!startIso) continue;

    items.push({
      id: `devevents-${Buffer.from(url).toString("base64").slice(0, 16)}`,
      title,
      organizer: "Dev.events",
      url,
      start_date: startIso,
      end_date: null,
      description,
      tags: categories,
      isOnline,
      country: isBrazil ? "BR" : "Global",
      source: "Dev.events"
    });
  }
  return items;
}

// Verifica se o evento ainda não passou (com tolerância do dia atual)
export function isUpcomingEvent(isoDate, now = new Date()) {
  if (!isoDate) return false;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  // Descarta eventos passados ou muito distantes (> 14 meses)
  const maxFuture = new Date(startOfToday);
  maxFuture.setMonth(maxFuture.getMonth() + 14);
  return d >= startOfToday && d <= maxFuture;
}

// Gera link direto de 1 clique para adicionar o evento ao Google Agenda
export function buildGoogleCalendarUrl(ev = {}) {
  const start = ev.start_date ? new Date(ev.start_date) : null;
  if (!start || Number.isNaN(start.getTime())) return "";
  const end = ev.end_date && !Number.isNaN(new Date(ev.end_date).getTime())
    ? new Date(ev.end_date)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title || "Evento de Tecnologia",
    dates: `${fmt(start)}/${fmt(end)}`,
    details: [ev.description, ev.url ? `Link do evento: ${ev.url}` : ""].filter(Boolean).join("\n\n"),
    location: ev.venue || ev.location || "Online"
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Filtra eventos por busca textual, modalidade (bh, online_br, online_global, online), tema e janela de tempo.
 */
export function filterEvents(events = [], { search = "", mode = "", topic = "", window: timeWindow = "", limit = 100, now = new Date() } = {}) {
  let list = events.filter((e) => isUpcomingEvent(e.start_date, now));

  const m = lower(mode).trim();
  if (m && m !== "todos" && m !== "all") {
    if (m === "online") {
      list = list.filter((e) => e.mode === "online_br" || e.mode === "online_global");
    } else {
      list = list.filter((e) => e.mode === m);
    }
  }

  const t = lower(topic).trim();
  if (t && t !== "todos" && t !== "all") {
    list = list.filter((e) => (e.topics || []).includes(t));
  }

  const w = lower(timeWindow).trim();
  if (w === "week" || w === "semana") {
    const end = new Date(now.getTime() + 8 * 86400000);
    list = list.filter((e) => new Date(e.start_date) <= end);
  } else if (w === "month" || w === "mes") {
    const end = new Date(now.getTime() + 32 * 86400000);
    list = list.filter((e) => new Date(e.start_date) <= end);
  }

  const q = lower(search).trim();
  if (q) {
    list = list.filter((e) => {
      const hay = lower(`${e.title} ${e.organizer} ${e.location} ${e.venue || ""} ${e.description || ""} ${(e.tags || []).join(" ")} ${(e.topics || []).join(" ")}`);
      return hay.includes(q);
    });
  }

  // Ordena cronologicamente (mais próximos primeiro), desempate dando leve prioridade a BH presencial
  list.sort((a, b) => {
    const da = new Date(a.start_date).getTime();
    const db = new Date(b.start_date).getTime();
    if (Math.abs(da - db) < 43200000 && a.mode !== b.mode) {
      if (a.mode === "bh") return -1;
      if (b.mode === "bh") return 1;
    }
    return da - db;
  });

  return list.slice(0, Number(limit) || 100);
}

export function buildEventsResponse(cacheData, { search = "", mode = "", topic = "", window = "", limit = 100 } = {}) {
  const allEvents = cacheData?.events || [];
  const filtered = filterEvents(allEvents, { search, mode, topic, window, limit });
  return {
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
  };
}
