// Nota ATS (estimativa explicável, 0–100).
// Não existe uma nota universal: cada ATS pontua de um jeito. Aqui somamos critérios objetivos
// que sistemas de triagem e recrutadores avaliam, e mostramos o que falta para subir a nota.
import { TECHS } from "./skill-gap.mjs";

const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean);
const hasNumber = (s) => /\d/.test(String(s || ""));

// Verbos de ação no início do bullet (pt: pretérito em -ei/-i/-u; en: -ed e verbos irregulares comuns)
// (fim de palavra explícito porque \b não reconhece letras acentuadas, ex.: "Construí")
const ACTION_VERB_RE =
  /^(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:ei|i|í|u|ou)(?=[\s,;:]|$)|(?:Led|Built|Ran|Drove|Made|Won|Grew|Cut|Wrote|Taught|Set up|Spearheaded|[A-Z][a-z]+ed)(?=[\s,;:]|$))/;
const BUZZWORDS_RE =
  /\b(proativ[oa]|motivad[oa]|din[aâ]mic[oa]|focad[oa] em resultados|team player|hard[- ]?working|apaixonad[oa]|guru|ninja|rockstar|self[- ]?starter|go[- ]getter|sinergia)\b/gi;
const FIRST_PERSON_RE = /(^|\s)(eu|meu|minha|I|my|me)\s/i;

function techsIn(text) {
  return Object.entries(TECHS)
    .filter(([, re]) => re.test(text))
    .map(([tech]) => tech);
}

function resumeFullText(r) {
  return [
    r.title,
    r.summary,
    ...(r.skills || []).flatMap((g) => [g.group, ...(g.items || [])]),
    ...(r.experience || []).flatMap((e) => [e.role, e.company, ...(e.bullets || [])]),
    ...(r.projects || []).flatMap((p) => [p.title, p.stack, ...(p.bullets || [])])
  ]
    .filter(Boolean)
    .join(" \n ");
}

/**
 * @param resume currículo (JSON)
 * @param opts.pages número de páginas medido na prévia (opcional)
 * @param opts.jobDescription descrição da vaga (opcional) -> mede aderência à vaga
 * @param opts.marketTechs tecnologias mais pedidas no mercado (opcional) -> usado se não houver vaga
 */
export function scoreResume(resume = {}, { pages = null, jobDescription = "", marketTechs = [] } = {}) {
  const checks = [];
  const add = (group, label, points, max, detail, tip = "") =>
    checks.push({ group, label, points: Math.round(points * 10) / 10, max, status: points >= max ? "ok" : points > 0 ? "warn" : "fail", detail, tip });

  // 1) Contato (10)
  const contact = [
    ["e-mail", /\S+@\S+\.\S+/.test(resume.email || "")],
    ["telefone", Boolean(resume.phone_display || resume.phone_e164)],
    ["localização", Boolean(resume.location)],
    ["LinkedIn", /linkedin\.com/i.test(resume.linkedin_url || "")],
    ["GitHub ou portfólio", Boolean(resume.github_url || resume.website_url)]
  ];
  const missingContact = contact.filter(([, ok]) => !ok).map(([n]) => n);
  add("Estrutura", "Dados de contato completos", (contact.length - missingContact.length) * 2, 10,
    missingContact.length ? `Falta: ${missingContact.join(", ")}` : "E-mail, telefone, localização, LinkedIn e links presentes",
    "ATS extraem contato automaticamente; campos faltando reduzem a chance de retorno.");

  // 2) Seções padrão (15)
  const sections = [
    ["resumo", Boolean(words(resume.summary).length)],
    ["habilidades", (resume.skills || []).length > 0],
    ["experiência", (resume.experience || []).length > 0],
    ["formação", (resume.education || []).length > 0],
    ["idiomas", (resume.languages || []).length > 0]
  ];
  const missingSections = sections.filter(([, ok]) => !ok).map(([n]) => n);
  add("Estrutura", "Seções padrão reconhecidas pelo ATS", (sections.length - missingSections.length) * 3, 15,
    missingSections.length ? `Falta: ${missingSections.join(", ")}` : "Resumo, habilidades, experiência, formação e idiomas");

  // 3) Resumo (10): 40–90 palavras é o ponto ideal
  const sw = words(resume.summary).length;
  const summaryPts = sw === 0 ? 0 : sw >= 40 && sw <= 90 ? 10 : sw < 40 ? 6 : sw <= 120 ? 6 : 3;
  add("Conteúdo", "Resumo objetivo (40–90 palavras)", summaryPts, 10, `${sw} palavras`,
    sw > 90 ? "Encurte o resumo: recrutadores leem os primeiros segundos; foque em cargo, stack e resultado." : sw < 40 && sw > 0 ? "Amplie o resumo com cargo-alvo, principais tecnologias e domínio." : "");

  // 4) Experiências (25)
  const exps = resume.experience || [];
  const bullets = exps.flatMap((e) => e.bullets || []);
  const complete = exps.filter((e) => e.role && e.company && e.date).length;
  add("Conteúdo", "Experiências com cargo, empresa e período", exps.length ? (complete / exps.length) * 5 : 0, 5,
    exps.length ? `${complete} de ${exps.length} completas` : "Nenhuma experiência");

  const goodCount = exps.filter((e) => (e.bullets || []).length >= 2 && (e.bullets || []).length <= 6).length;
  add("Conteúdo", "2 a 6 bullets por experiência", exps.length ? (goodCount / exps.length) * 5 : 0, 5,
    exps.length ? `${goodCount} de ${exps.length} experiências no intervalo` : "—");

  const verbRatio = bullets.length ? bullets.filter((b) => ACTION_VERB_RE.test(String(b).trim())).length / bullets.length : 0;
  add("Conteúdo", "Bullets começando com verbo de ação", verbRatio * 7, 7, `${Math.round(verbRatio * 100)}% dos bullets`,
    verbRatio < 0.8 ? "Comece cada bullet com verbo no passado: Desenvolvi, Implementei, Reduzi, Liderei…" : "");

  const numRatio = bullets.length ? bullets.filter(hasNumber).length / bullets.length : 0;
  const numPts = Math.min(1, numRatio / 0.4) * 8; // 40% dos bullets com número já é ótimo
  add("Conteúdo", "Resultados quantificados (números, %, prazos)", numPts, 8, `${Math.round(numRatio * 100)}% dos bullets têm números`,
    numRatio < 0.4 ? "Inclua números reais: volume de usuários, % de redução, tempo economizado, tamanho do time." : "");

  // 5) Palavras-chave (20)
  const cvText = resumeFullText(resume);
  const cvTechs = new Set(techsIn(cvText));
  const target = jobDescription && jobDescription.trim().length > 40 ? techsIn(jobDescription) : marketTechs.slice(0, 15);
  if (target.length) {
    const covered = target.filter((t) => cvTechs.has(t));
    const missing = target.filter((t) => !cvTechs.has(t));
    add("Palavras-chave",
      jobDescription && jobDescription.trim().length > 40 ? "Aderência às tecnologias da vaga" : "Aderência às tecnologias mais pedidas no mercado",
      (covered.length / target.length) * 20, 20,
      `${covered.length} de ${target.length} encontradas${missing.length ? ` · faltam: ${missing.slice(0, 6).join(", ")}` : ""}`,
      missing.length ? "Inclua as tecnologias que você domina de verdade com os mesmos termos da vaga." : "");
  } else {
    add("Palavras-chave", "Aderência a palavras-chave", cvTechs.size >= 10 ? 20 : cvTechs.size * 2, 20, `${cvTechs.size} tecnologias identificadas`,
      "Cole uma vaga em “Adaptar com IA” para medir a aderência a ela.");
  }

  // 6) Tamanho (10): 1–2 páginas
  if (pages) {
    const pagePts = pages <= 2 ? 10 : pages === 3 ? 5 : 0;
    add("Formato", "Tamanho de 1 a 2 páginas", pagePts, 10, `${pages} página${pages > 1 ? "s" : ""}`,
      pages > 2 ? "Reduza para no máximo 2 páginas: corte bullets antigos, projetos menos relevantes e resumo longo." : "");
  }

  // 7) Legibilidade (10)
  const longBullets = bullets.filter((b) => words(b).length > 40).length;
  const buzz = [...new Set((cvText.match(BUZZWORDS_RE) || []).map((w) => w.toLowerCase()))];
  const firstPerson = bullets.filter((b) => FIRST_PERSON_RE.test(` ${b} `)).length;
  add("Formato", "Bullets curtos (até 40 palavras)", bullets.length ? (1 - longBullets / bullets.length) * 4 : 4, 4,
    longBullets ? `${longBullets} bullets longos` : "Todos objetivos");
  add("Formato", "Sem clichês nem primeira pessoa", (buzz.length ? 0 : 3) + (firstPerson ? 0 : 3), 6,
    [buzz.length ? `Clichês: ${buzz.join(", ")}` : "", firstPerson ? `${firstPerson} bullets em primeira pessoa` : ""].filter(Boolean).join(" · ") || "Linguagem objetiva");

  const max = checks.reduce((s, c) => s + c.max, 0);
  const got = checks.reduce((s, c) => s + c.points, 0);
  const score = Math.round((got / max) * 100);
  const grade = score >= 85 ? "Excelente" : score >= 70 ? "Bom" : score >= 50 ? "Regular" : "Fraco";
  return { score, grade, pages, mode: jobDescription && jobDescription.trim().length > 40 ? "vaga" : "mercado", checks };
}
