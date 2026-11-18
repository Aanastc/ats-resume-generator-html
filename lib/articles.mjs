// Lógica pura de classificação, parsing (RSS/Atom) e filtragem de artigos técnicos
// alinhados aos pilares de Engenharia de Software 2027.

const lower = (v) => String(v ?? "").toLowerCase();

export function cleanArticleText(str = "") {
  return String(str || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]*>?/gm, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export const ARTICLE_TOPICS = {
  ia: {
    label: "IA, LLMs & Agentes",
    re: /\b(llm|llms|rag\b|mcp\b|model context protocol|ai agent|ai agents|agentes? de ia|generative ai|genai|ia generativa|prompt engineering|context engineering|claude|gemini|openai|chatgpt|langchain|vector db|pgvector|embeddings?|evals?|machine learning|copilot|cursor|ai[- ]powered|ai coding)\b/i
  },
  arquitetura: {
    label: "Arquitetura & System Design",
    re: /\b(system design|architecture|arquitetura|clean architecture|solid\b|ddd\b|design patterns|microservices?|micros?servi[cç]os?|distributed systems?|sistemas distribu[ií]dos|event[- ]driven|kafka|rabbitmq|sqs|caching|redis|scalability|escalabilidade|api design|rest api|graphql|grpc|database|postgres|sql|modeling|refactoring|refatora[cç][aã]o|legacy|legado)\b/i
  },
  cloud: {
    label: "Cloud, DevOps & SRE",
    re: /\b(aws|amazon web services|ec2|s3\b|lambda|eks|rds|dynamodb|cloud|devops|platform engineering|kubernetes|k8s|docker|containers?|terraform|iac\b|ci\/cd|github actions|argocd|gitops|sre\b|observability|observabilidade|opentelemetry|prometheus|grafana|finops|linux|serverless|cloudflare|infrastructure|infraestrutura|deploy)\b/i
  },
  fullstack: {
    label: "Full Stack & Web",
    re: /\b(react|next\.?js|typescript|javascript|node\.?js|python|fastapi|django|flask|php|moodle|laravel|front[- ]?end|back[- ]?end|full[- ]?stack|css|tailwind|design system|storybook|web performance|accessibility|acessibilidade|wcag|browser|http|webhooks?|saas)\b/i
  },
  qualidade: {
    label: "Qualidade & Segurança",
    re: /\b(testing|testes?|tdd\b|unit test|e2e|playwright|vitest|jest|pytest|code review|security|seguran[cç]a|owasp|appsec|devsecops|lgpd|hipaa|auth|oauth|jwt|zero trust|debugging|performance|latency|reliability|resilience|chaos engineering)\b/i
  },
  carreira: {
    label: "Carreira & Mercado Global",
    re: /\b(carreira|career|entrevista|interview|curr[ií]culo|resume|remoto|remote work|vaga internacional|engenharia de software|software engineer|senior|staff engineer|tech lead|sal[aá]rio|contractor|ingl[eê]s t[eé]cnico|portf[oó]lio|healthtech|edtech)\b/i
  }
};

// Bloqueia ruído off-topic de agregadores abertos (política, fofoca, esportes, off-topic)
const OFF_TOPIC_RE =
  /\b(elei[cç][oõ]es|pol[ií]tica partid[aá]ria|futebol|campeonato brasileiro|receita de bolo|hor[oó]scopo|fofoca|celebridade|cryptocurrency scam|show hn: my cat)\b/i;

export function detectArticleTopics(title = "", desc = "", tags = []) {
  const hay = `${title} ${tags.join(" ")} ${String(desc).slice(0, 500)}`;
  return Object.entries(ARTICLE_TOPICS)
    .filter(([, cfg]) => cfg.re.test(hay))
    .map(([key]) => key);
}

export function isEngineeringArticle(title = "", desc = "", tags = [], trustedSource = false) {
  if (!title || title.length < 8) return false;
  if (OFF_TOPIC_RE.test(title)) return false;
  if (trustedSource) return true;
  return detectArticleTopics(title, desc, tags).length > 0;
}

const PT_SIGNALS_RE =
  /\b(como|para|com|voc[eê]|desenvolvimento|engenharia|arquitetura|sistema|sistemas|c[oó]digo|programa[cç][aã]o|aprenda|guia|dicas|melhores pr[aá]ticas|produ[cç][aã]o|carreira|vagas|brasil|remoto|banco de dados)\b|[ãõç]/i;

export function detectArticleLanguage(title = "", desc = "", defaultLang = "en") {
  if (defaultLang === "pt") return "pt";
  const text = `${title} ${String(desc).slice(0, 200)}`;
  return PT_SIGNALS_RE.test(text) ? "pt" : "en";
}

/**
 * Parser leve para feeds RSS 2.0 (<item>) e Atom (<entry>).
 */
export function parseRssOrAtom(xml = "", { source = "RSS", defaultLang = "en", defaultTags = [] } = {}) {
  if (!xml) return [];
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blockRe = isAtom ? /<entry[\s>]([\s\S]*?)<\/entry>/gi : /<item[\s>]([\s\S]*?)<\/item>/gi;

  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[1];
    const getTag = (tag) => {
      const r = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return r ? cleanArticleText(r[1]) : "";
    };

    const title = getTag("title");
    let url = "";
    if (isAtom) {
      const linkMatch = block.match(/<link[^>]*href="([^"]+)"/i);
      url = linkMatch ? linkMatch[1] : "";
    } else {
      url = getTag("link");
    }

    const rawDesc = getTag("description") || getTag("summary") || getTag("content");
    const pubDate = getTag("pubDate") || getTag("published") || getTag("updated");
    const author = getTag("dc:creator") || getTag("author") || source;
    const cats = [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
      .map((c) => cleanArticleText(c[1]))
      .filter(Boolean);

    if (!title || !url || !/^https?:\/\//i.test(url)) continue;

    let isoDate = new Date().toISOString();
    if (pubDate) {
      const parsed = new Date(pubDate);
      if (!Number.isNaN(parsed.getTime())) isoDate = parsed.toISOString();
    }

    items.push({
      id: `${lower(source).replace(/\W+/g, "")}-${Buffer.from(url).toString("base64").slice(0, 14)}`,
      title,
      url,
      author: author.slice(0, 60),
      description: rawDesc.slice(0, 360),
      published_at: isoDate,
      tags: [...new Set([...defaultTags, ...cats])].slice(0, 6),
      source,
      defaultLang
    });
  }

  return items;
}

export function filterArticles(articles = [], { search = "", topic = "", lang = "", sort = "recent", limit = 80 } = {}) {
  let list = [...articles];

  const l = lower(lang).trim();
  if (l === "pt" || l === "en") {
    list = list.filter((a) => a.lang === l);
  }

  const t = lower(topic).trim();
  if (t && t !== "all" && t !== "todos") {
    list = list.filter((a) => (a.topics || []).includes(t));
  }

  const q = lower(search).trim();
  if (q) {
    list = list.filter((a) => {
      const hay = lower(`${a.title} ${a.author || ""} ${a.source} ${a.description || ""} ${(a.tags || []).join(" ")} ${(a.topics || []).join(" ")}`);
      return hay.includes(q);
    });
  }

  if (sort === "relevance") {
    list.sort((a, b) => (b.relevance || 0) - (a.relevance || 0) || new Date(b.published_at) - new Date(a.published_at));
  } else {
    list.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
  }

  return list.slice(0, Number(limit) || 80);
}

export function buildArticlesResponse(cacheData, { search = "", topic = "", lang = "", sort = "recent", limit = 80 } = {}) {
  const allArticles = cacheData?.articles || [];
  const filtered = filterArticles(allArticles, { search, topic, lang, sort, limit });
  return {
    success: true,
    count: filtered.length,
    total_in_cache: allArticles.length,
    counts: cacheData?.counts || {
      pt: allArticles.filter((a) => a.lang === "pt").length,
      en: allArticles.filter((a) => a.lang === "en").length
    },
    last_updated: cacheData?.formatted_date || "Hoje às 08:00 (BRT)",
    next_update: cacheData?.next_update || "Diariamente às 08:00 (Horário de Brasília)",
    articles: filtered
  };
}
