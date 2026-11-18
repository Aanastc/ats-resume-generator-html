import fs from "node:fs";
import path from "node:path";
import {
  cleanArticleText,
  detectArticleLanguage,
  detectArticleTopics,
  isEngineeringArticle,
  parseRssOrAtom
} from "../lib/articles.mjs";

const root = process.cwd();
const dataDir = path.join(root, "data");
const UA = "Mozilla/5.0 (compatible; CareerStudio-Articles/1.0)";

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

const TRUSTED_ENGINEERING_SOURCES = new Set([
  "AWS Architecture Blog",
  "Martin Fowler",
  "Cloudflare Blog"
]);

function normalizeArticle(raw) {
  if (!raw?.url || !/^https?:\/\//i.test(raw.url) || !raw.title) return null;
  const title = cleanArticleText(raw.title);
  const desc = cleanArticleText(raw.description || "");
  const tags = [...new Set((raw.tags || []).map((t) => cleanArticleText(t)).filter(Boolean))].slice(0, 6);
  const trusted = TRUSTED_ENGINEERING_SOURCES.has(raw.source);

  if (!isEngineeringArticle(title, desc, tags, trusted)) return null;

  let topics = detectArticleTopics(title, desc, tags);
  if (!topics.length && trusted) {
    topics = raw.source === "Martin Fowler" ? ["arquitetura"] : ["cloud"];
  }
  if (!topics.length) return null;

  const lang = detectArticleLanguage(title, desc, raw.defaultLang || "en");

  // Relevância alinhada aos 5 pilares 2027 (Cloud/AWS, Arquitetura, IA/Agents/RAG, DevOps, Qualidade)
  let relevance = 60;
  if (trusted) relevance += 18;
  if (topics.includes("ia")) relevance += 10;
  if (topics.includes("arquitetura")) relevance += 10;
  if (topics.includes("cloud")) relevance += 10;
  if (topics.includes("qualidade")) relevance += 6;
  if (topics.includes("fullstack")) relevance += 5;
  if (raw.popularity) relevance += Math.min(12, Math.round(Math.log10(raw.popularity + 1) * 5));

  return {
    id: raw.id,
    title,
    url: raw.url,
    author: cleanArticleText(raw.author || raw.source),
    source: raw.source,
    lang,
    published_at: raw.published_at || new Date().toISOString(),
    reading_time: raw.reading_time || null,
    description: desc.slice(0, 320),
    topics,
    tags,
    relevance: Math.min(100, relevance)
  };
}

// 1. TabNews (Brasil - PT-BR)
async function fetchTabNews() {
  try {
    const res = await fetchWithTimeout("https://www.tabnews.com.br/api/v1/contents?strategy=relevant&per_page=30");
    if (!res.ok) return [];
    const rows = await res.json();
    return rows
      .filter((r) => r.status === "published" && r.title && r.tabcoins >= 2)
      .map((r) =>
        normalizeArticle({
          id: `tabnews-${r.id}`,
          title: r.title,
          url: `https://www.tabnews.com.br/${r.owner_username}/${r.slug}`,
          author: r.owner_username,
          source: "TabNews",
          defaultLang: "pt",
          published_at: r.published_at || r.created_at,
          description: r.source_url ? `Discussão técnica na comunidade TabNews (${r.tabcoins} tabcoins).` : `Artigo em destaque na comunidade TabNews (${r.tabcoins} tabcoins).`,
          tags: ["Brasil", "Comunidade"],
          popularity: r.tabcoins * 10
        })
      )
      .filter(Boolean);
  } catch (e) {
    console.warn("[Artigos/TabNews] Aviso:", e.message);
    return [];
  }
}

// 2. DEV.to (Top artigos dos últimos 7 dias nas trilhas 2027)
async function fetchDevTo() {
  const tags = ["architecture", "devops", "ai", "aws", "typescript", "react"];
  const all = [];
  const results = await Promise.all(
    tags.map((tag) =>
      fetchWithTimeout(`https://dev.to/api/articles?tag=${tag}&top=7&per_page=8`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
    )
  );

  for (const list of results) {
    for (const a of list || []) {
      if ((a.public_reactions_count || 0) < 5) continue;
      all.push(
        normalizeArticle({
          id: `devto-${a.id}`,
          title: a.title,
          url: a.url,
          author: a.user?.name || a.user?.username || "DEV.to",
          source: "DEV.to",
          defaultLang: "en",
          published_at: a.published_timestamp || a.published_at,
          reading_time: a.reading_time_minutes || null,
          description: a.description || "",
          tags: a.tag_list || [],
          popularity: a.public_reactions_count || 0
        })
      );
    }
  }
  return all.filter(Boolean);
}

// 3. AWS Architecture Blog (RSS oficial)
async function fetchAwsBlog() {
  try {
    const res = await fetchWithTimeout("https://aws.amazon.com/blogs/architecture/feed/");
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssOrAtom(xml, {
      source: "AWS Architecture Blog",
      defaultLang: "en",
      defaultTags: ["AWS", "Architecture"]
    })
      .slice(0, 12)
      .map(normalizeArticle)
      .filter(Boolean);
  } catch (e) {
    console.warn("[Artigos/AWS] Aviso:", e.message);
    return [];
  }
}

// 4. Martin Fowler (Atom oficial — Arquitetura, Refactoring & AI Engineering)
async function fetchMartinFowler() {
  try {
    const res = await fetchWithTimeout("https://martinfowler.com/feed.atom");
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssOrAtom(xml, {
      source: "Martin Fowler",
      defaultLang: "en",
      defaultTags: ["Architecture", "Software Engineering"]
    })
      .slice(0, 10)
      .map(normalizeArticle)
      .filter(Boolean);
  } catch (e) {
    console.warn("[Artigos/MartinFowler] Aviso:", e.message);
    return [];
  }
}

// 5. Cloudflare Engineering Blog (RSS oficial)
async function fetchCloudflareBlog() {
  try {
    const res = await fetchWithTimeout("https://blog.cloudflare.com/rss/");
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssOrAtom(xml, {
      source: "Cloudflare Blog",
      defaultLang: "en",
      defaultTags: ["Cloud", "Systems"]
    })
      .slice(0, 10)
      .map(normalizeArticle)
      .filter(Boolean);
  } catch (e) {
    console.warn("[Artigos/Cloudflare] Aviso:", e.message);
    return [];
  }
}

// 6. Hacker News (Top Front Page filtrado para engenharia)
async function fetchHackerNews() {
  try {
    const res = await fetchWithTimeout("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=25");
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits || [])
      .filter((h) => h.url && h.title && (h.points || 0) >= 40)
      .map((h) =>
        normalizeArticle({
          id: `hn-${h.objectID}`,
          title: h.title,
          url: h.url,
          author: h.author || "Hacker News",
          source: "Hacker News",
          defaultLang: "en",
          published_at: h.created_at,
          description: `Em destaque no Hacker News (${h.points} pontos · ${h.num_comments || 0} comentários técnicos).`,
          tags: ["Engenharia", "Trending"],
          popularity: h.points || 0
        })
      )
      .filter(Boolean);
  } catch (e) {
    console.warn("[Artigos/HN] Aviso:", e.message);
    return [];
  }
}

export async function runArticlesSync({ writeDisk = true } = {}) {
  console.log("Iniciando coleta diária de artigos de engenharia (PT-BR e EN)...");
  const cachePath = path.join(dataDir, "articles-cache.json");

  let prevArticles = [];
  try {
    if (fs.existsSync(cachePath)) {
      prevArticles = JSON.parse(fs.readFileSync(cachePath, "utf8")).articles || [];
    }
  } catch {
    prevArticles = [];
  }

  const sources = [
    ["TabNews", fetchTabNews],
    ["DEV.to", fetchDevTo],
    ["AWS Architecture Blog", fetchAwsBlog],
    ["Martin Fowler", fetchMartinFowler],
    ["Cloudflare Blog", fetchCloudflareBlog],
    ["Hacker News", fetchHackerNews]
  ];

  const settled = await Promise.all(
    sources.map(async ([name, fn]) => {
      try {
        const items = await fn();
        if (items.length > 0) return items;
        return prevArticles.filter((a) => a.source === name);
      } catch (err) {
        console.warn(`[Artigos/${name}] Falha — reaproveitando cache anterior:`, err.message);
        return prevArticles.filter((a) => a.source === name);
      }
    })
  );

  // Deduplica por URL e limita mantendo variedade de fontes
  const seenUrls = new Set();
  const unique = [];
  for (const art of settled.flat()) {
    const normUrl = art.url.replace(/\/+$/, "").toLowerCase();
    if (seenUrls.has(normUrl)) continue;
    seenUrls.add(normUrl);
    unique.push(art);
  }

  // Ordena por data de publicação mais recente
  unique.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
  const finalArticles = unique.slice(0, 75);

  const now = new Date();
  const payload = {
    updated_at: now.toISOString(),
    formatted_date: now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    next_update: "Diariamente às 08:00 (Horário de Brasília)",
    total_articles: finalArticles.length,
    counts: {
      pt: finalArticles.filter((a) => a.lang === "pt").length,
      en: finalArticles.filter((a) => a.lang === "en").length
    },
    articles: finalArticles
  };

  if (writeDisk) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), "utf8");
      console.log(`✅ ${finalArticles.length} artigos técnicos salvos em data/articles-cache.json (PT: ${payload.counts.pt}, EN: ${payload.counts.en})`);
    } catch (err) {
      console.warn("Aviso ao gravar articles-cache.json:", err.message);
    }
  }

  return payload;
}

if (process.argv[1] && process.argv[1].endsWith("fetch-articles.mjs")) {
  runArticlesSync()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Erro na coleta de artigos:", err);
      process.exit(1);
    });
}
