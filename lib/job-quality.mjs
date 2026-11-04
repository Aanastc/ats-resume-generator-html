// Regras de qualidade das vagas: é vaga de desenvolvimento? a localidade serve? é vaga fantasma?
// Funções puras (sem rede), cobertas por tests/jobs.test.mjs.

export const MAX_AGE_DAYS = Number(process.env.JOBS_MAX_AGE_DAYS || 30);

export const CATEGORY = {
  saude: "Hospitais & Clínicas (Saúde)",
  edtech: "EdTechs & Educação",
  tech: "Empresas Tech / Full Stack"
};

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#038": "&" };

export function decodeEntities(str = "") {
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export function cleanHtml(str = "") {
  // Decodifica antes (Greenhouse envia HTML escapado) e depois remove as tags.
  return decodeEntities(decodeEntities(String(str)))
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKey(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// É vaga de desenvolvimento?
// ---------------------------------------------------------------------------
const NON_DEV = [
  "copywriter", "copy writer", "content writer", "writer", "office assistant", "virtual assistant",
  "executive assistant", "administrative assistant", "dental", "dentist", "nurse", "physician", "doctor",
  "therapist", "clinical data manager", "csm", "customer success", "customer support", "support specialist",
  "call center", "sales", "account executive", "inside sales", "sdr", "bdr", "recruiter", "talent acquisition",
  "human resources", "marketing", "social media", "seo specialist", "agile coach", "coach", "trainer",
  "fraud analyst", "legal counsel", "paralegal", "operations specialist", "billing specialist",
  "enfermeir[oa]", "m[eé]dic[oa]", "t[eé]cnic[oa] de enfermagem", "vendedor", "comercial", "atendente",
  "recepcionista", "engenheir[oa] (civil|cl[ií]nic[oa]|de produ[cç][aã]o|mec[aâ]nic[oa]|el[eé]tric[oa]|qu[ií]mic[oa]|ambiental|de seguran[cç]a)",
  "clinical engineer", "mechanical engineer", "civil engineer", "electrical engineer"
];
const NON_DEV_RE = new RegExp(`\\b(${NON_DEV.join("|")})\\b`, "i");

const DEV_RE = new RegExp(
  [
    "developer", "desenvolvedor", "desenvolvedora", "programador", "programadora", "programmer",
    "devops", "\\bsre\\b", "site reliability", "full[ -]?stack", "front[ -]?end", "back[ -]?end",
    "software", "tech lead", "l[ií]der t[eé]cnic[oa]", "engineering manager",
    "arquitet[oa] de (software|solu[cç][oõ]es|sistemas|dados|cloud)", "(software|solutions|cloud|data) architect",
    "(platform|cloud|data|product|web|mobile|infrastructure|ml|ai|machine learning|backend|frontend|full ?stack) engineer",
    "engenheir[oa] de (dados|software|plataforma|cloud|computa[cç][aã]o|sistemas|confiabilidade|devops|machine learning)",
    "analista (de )?(sistemas|desenvolvimento|programador)", "analista desenvolvedor",
    "\\b(ios|android|react|node(\\.js)?|python|php|java|golang|\\.net|typescript|moodle)\\b"
  ].join("|"),
  "i"
);

const JUNIOR_ONLY_RE = /\b(est[aá]gio|estagi[aá]ri[oa]|intern|internship|trainee|aprendiz)\b/i;

export function isSoftwareDevRole(title = "", tags = []) {
  const t = String(title);
  if (JUNIOR_ONLY_RE.test(t)) return false;
  if (NON_DEV_RE.test(t) && !/developer|software engineer|desenvolvedor/i.test(t)) return false;
  if (DEV_RE.test(t)) return true;
  // Títulos genéricos ("Senior Engineer") contam se as tags forem de desenvolvimento.
  return /\b(engineer|engenheir[oa])\b/i.test(t) && DEV_RE.test(tags.join(" "));
}

// ---------------------------------------------------------------------------
// Vaga fantasma?
// ---------------------------------------------------------------------------
const GHOST_TITLE_RE =
  /banco de talentos|talent pool|talent community|talent network|general application|candidatura espont[aâ]nea|cadastro reserva|open application|future opportunit|join our talent|expression of interest|always hiring|evergreen/i;

/**
 * Retorna o motivo para descartar a vaga, ou null se ela parecer real e ativa.
 * - título de banco de talentos / candidatura genérica
 * - publicada há mais de MAX_AGE_DAYS dias
 * - prazo de inscrição (expiresAt) já vencido
 * - sem link direto ou sem empresa
 */
export function ghostReason(job, now = new Date(), maxAgeDays = MAX_AGE_DAYS) {
  if (!job.url || !/^https?:\/\//.test(job.url)) return "sem link direto";
  if (!job.company || !String(job.company).trim()) return "sem empresa identificada";
  if (GHOST_TITLE_RE.test(job.title || "")) return "banco de talentos / candidatura genérica";
  if (job.publication_date) {
    const published = new Date(job.publication_date);
    if (!Number.isNaN(published.getTime())) {
      const days = (now - published) / 86400000;
      if (days > maxAgeDays) return `publicada há ${Math.floor(days)} dias`;
    }
  } else if (job.source_type !== "empresa") {
    // Agregadores e comunidades sem data não são confiáveis.
    return "sem data de publicação";
  }
  if (job.expires_at) {
    const exp = new Date(job.expires_at);
    if (!Number.isNaN(exp.getTime()) && exp < new Date(now.toDateString())) return "prazo de inscrição encerrado";
  }
  return null;
}

export function daysAgo(dateStr, now = new Date()) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((now - d) / 86400000));
}

// ---------------------------------------------------------------------------
// Localidade: presencial/híbrido só na Grande BH; remoto Brasil; remoto internacional sem visto.
// ---------------------------------------------------------------------------
const BH_METRO_RE =
  /belo horizonte|\bbh\b|nova lima|contagem|betim|confins|lagoa santa|sabar[aá]|santa luzia|ribeir[aã]o das neves|vespasiano|ibirit[eé]|brumadinho/i;
const BRAZIL_RE = /brazil|brasil|\bbr\b/i;
const LATAM_GLOBAL_RE = /latam|latin america|south america|americas|worldwide|anywhere|global|any location|all countries/i;
const REMOTE_RE = /remote|remoto|home ?office|teletrabalho|anywhere|distributed/i;

const VISA_RESTRICTED = [
  "us only", "usa only", "united states only", "only us", "must reside in the us", "must reside in usa",
  "us citizen", "green card", "us work authorization required", "authorized to work in the us without sponsorship",
  "no visa sponsorship", "canada only", "must reside in canada", "uk only", "must be based in the uk",
  "must reside in the uk", "eu only", "europe only", "must reside in europe", "must be located in germany",
  "no international applicants"
];
const STRICT_COUNTRY_RE =
  /^(usa|us|united states|uk|united kingdom|canada|germany|poland|portugal|spain|czechia|romania|france|australia|india|philippines|ukraine|netherlands|ireland|mexico|argentina|colombia|chile)$/i;

// Vaga internacional aceita quem mora no Brasil sem visto?
export function isEligibleInternationalLocation(rawGeo = "", title = "", desc = "") {
  const text = `${rawGeo} ${String(desc).slice(0, 600)}`.toLowerCase();
  if (VISA_RESTRICTED.some((p) => text.includes(p))) return false;
  if (rawGeo && !(BRAZIL_RE.test(rawGeo) || LATAM_GLOBAL_RE.test(rawGeo))) {
    const parts = String(rawGeo).split(/[,;/|]| or /).map((p) => p.trim()).filter(Boolean);
    if (parts.length && parts.every((p) => STRICT_COUNTRY_RE.test(p))) return false;
  }
  return true;
}

/**
 * Classifica a localidade.
 * input: { remote, hybrid, text, country, brazilianCompany, description }
 * output: { type: "bh"|"remote_br"|"remote_global", label, isCandidateCompatible } ou null (incompatível)
 */
export function classifyLocation({ remote = false, text = "", country = "", brazilianCompany = false, description = "" }) {
  const loc = `${text} ${country}`.trim();
  const isRemote = remote || REMOTE_RE.test(loc);

  if (!isRemote) {
    if (BH_METRO_RE.test(loc)) {
      return { type: "bh", label: `📍 ${text || "Belo Horizonte, MG"} (Presencial / Híbrido)`, isCandidateCompatible: true };
    }
    return null; // presencial/híbrido fora da Grande BH
  }

  if (BRAZIL_RE.test(loc) || (brazilianCompany && !LATAM_GLOBAL_RE.test(loc) && !/\b(us|usa|uk|europe|emea)\b/i.test(loc))) {
    return { type: "remote", label: "🇧🇷 Remoto (Brasil)", isCandidateCompatible: true };
  }
  if (!isEligibleInternationalLocation(loc, "", description)) return null;
  if (LATAM_GLOBAL_RE.test(loc)) {
    return { type: "remote", label: `🌐 Remoto internacional (${text || "Global"}) — sem visto`, isCandidateCompatible: true };
  }
  // "Remote" sem país definido: mantemos, mas pedimos confirmação.
  if (!loc || /^(remote|remoto|fully remote|100% remote)$/i.test(loc.trim())) {
    return { type: "remote", label: "🌐 Remoto (confirme o país na vaga)", isCandidateCompatible: true };
  }
  return null; // remoto restrito a outro país
}

export function detectModalities(text = "", fallback = ["PJ ou CLT"]) {
  const mods = [];
  if (/\bpj\b|pessoa jur[ií]dica|prestador|contractor|legal entity/i.test(text)) mods.push("PJ / Contractor");
  if (/\bclt\b|efetiv[oa]|carteira assinada|vacancy_type_effective/i.test(text)) mods.push("CLT");
  if (/freela|freelance|tempor[aá]ri[oa]/i.test(text)) mods.push("Freelance / Temporário");
  return mods.length ? mods : fallback;
}

export function detectSector(text = "", fallback = "tech") {
  if (/hospital|sa[uú]de|health|cl[ií]nic|patient|paciente|medic|telemedicin|care\b/i.test(text)) return "saude";
  if (/edtech|educa|moodle|\blms\b|ensino|\bead\b|universidade|escola|learning|students?\b|course/i.test(text)) return "edtech";
  return fallback;
}
