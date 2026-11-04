// Renderização do currículo (fonte única usada pela CLI, pelo servidor local e pela API da Vercel).
// Função pura: recebe os dados + template + CSS e devolve o HTML final.

const L10N = {
  pt: {
    summary: "Resumo",
    skills: "Habilidades",
    projects: "Projetos",
    experience: "Experiência",
    education: "Formação Acadêmica",
    languages: "Idiomas",
    stack: "Stack",
    website: "Portfólio"
  },
  en: {
    summary: "Summary",
    skills: "Skills",
    projects: "Projects",
    experience: "Experience",
    education: "Education",
    languages: "Languages",
    stack: "Tech Stack",
    website: "Portfolio"
  }
};

export function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Aceita apenas links http(s), mailto e tel; qualquer outra coisa (ex.: javascript:) vira "#".
export function safeUrl(url) {
  const value = String(url ?? "").trim();
  if (!value) return "";
  if (!/^(https?:|mailto:|tel:)/i.test(value)) return "#";
  return escapeHtml(value);
}

function linkText(url) {
  return escapeHtml(String(url ?? "").replace(/^https?:\/\//, "").replace(/\/$/, ""));
}

function skillsHtml(skills) {
  if (!Array.isArray(skills)) return "";
  return skills
    .map(
      (g) =>
        `<div class="item"><div class="item-title">${escapeHtml(g.group)}:</div> ${escapeHtml(
          (g.items || []).join(", ")
        )}</div>`
    )
    .join("\n");
}

function bulletsHtml(bullets) {
  if (!Array.isArray(bullets) || !bullets.length) return "";
  return `<ul class="bullets">${bullets
    .map((b) => {
      // Suporte a links em markdown [texto](https://...) dentro dos bullets
      const withLinks = escapeHtml(b).replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" style="text-decoration: underline;">$1</a>'
      );
      return `<li>${withLinks}</li>`;
    })
    .join("")}</ul>`;
}

function projectsHtml(projects, t) {
  if (!Array.isArray(projects)) return "";
  return projects
    .map((p) => {
      const links = (p.links ?? [])
        .filter((l) => l && l.url)
        .map(
          (l) =>
            `<li>${escapeHtml(l.label)}: <a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
              l.url
            )}</a></li>`
        )
        .join("");
      return `
<div class="item">
  <div class="item-title">${escapeHtml(p.title)}</div>
  ${p.stack ? `<div class="tech-line">${t.stack}: ${escapeHtml(p.stack)}</div>` : ""}
  ${bulletsHtml(p.bullets)}
  ${links ? `<ul class="bullets">${links}</ul>` : ""}
</div>`;
    })
    .join("\n");
}

function experienceHtml(exps) {
  if (!Array.isArray(exps)) return "";
  return exps
    .map(
      (e) => `
<div class="item">
  <div class="item-header">
    <div>
      <div class="item-title">${escapeHtml(e.role)}</div>
      <div class="item-subtitle">${escapeHtml(e.company)}</div>
    </div>
    <div class="item-date">${escapeHtml(e.date)}</div>
  </div>
  ${bulletsHtml(e.bullets)}
</div>`
    )
    .join("\n");
}

function educationHtml(eds) {
  if (!Array.isArray(eds)) return "";
  return eds
    .map(
      (e) => `
<div class="item">
  <div class="item-header">
    <div>
      <div class="item-title">${escapeHtml(e.title)}</div>
      <div class="item-subtitle">${escapeHtml(e.subtitle)}</div>
    </div>
    <div class="item-date">${escapeHtml(e.date)}</div>
  </div>
</div>`
    )
    .join("\n");
}

function languagesHtml(langs) {
  if (!Array.isArray(langs)) return "";
  return langs
    .map(
      (l) => `
<div class="item">
  <div class="item-header">
    <div class="item-title">${escapeHtml(l.name)} — ${escapeHtml(l.level)}</div>
    <div class="item-date">${escapeHtml(l.note)}</div>
  </div>
</div>`
    )
    .join("\n");
}

export function renderResumeHtml(data = {}, { template, css }) {
  const lang = data.language === "en" ? "en" : "pt";
  const t = L10N[lang];

  const dsLink = data.design_system_url
    ? ` |\n          <a href="${safeUrl(data.design_system_url)}" target="_blank" rel="noopener noreferrer">Design System (Live Demo)</a>`
    : "";

  const projectsSection =
    Array.isArray(data.projects) && data.projects.length > 0
      ? `<section class="section">
        <h2 class="section-title">${t.projects}</h2>
        ${projectsHtml(data.projects, t)}
      </section>`
      : "";

  const replacements = {
    NAME: escapeHtml(data.name),
    TITLE: escapeHtml(data.title),
    EMAIL: escapeHtml(data.email),
    PHONE_E164: escapeHtml(data.phone_e164),
    PHONE_DISPLAY: escapeHtml(data.phone_display),
    LOCATION: escapeHtml(data.location),
    LINKEDIN_URL: safeUrl(data.linkedin_url) || "#",
    GITHUB_URL: safeUrl(data.github_url) || "#",
    WEBSITE_URL: safeUrl(data.website_url) || "#",
    LINKEDIN_TEXT: linkText(data.linkedin_url),
    GITHUB_TEXT: linkText(data.github_url),
    WEBSITE_TEXT: t.website,
    DESIGN_SYSTEM_LINK: dsLink,
    SUMMARY: escapeHtml(data.summary),
    SKILLS_HTML: skillsHtml(data.skills),
    PROJECTS_SECTION: projectsSection,
    PROJECTS_HTML: projectsHtml(data.projects, t),
    EXPERIENCE_HTML: experienceHtml(data.experience),
    EDUCATION_HTML: educationHtml(data.education),
    LANGUAGES_HTML: languagesHtml(data.languages),
    L10N_SUMMARY: t.summary,
    L10N_SKILLS: t.skills,
    L10N_PROJECTS: t.projects,
    L10N_EXPERIENCE: t.experience,
    L10N_EDUCATION: t.education,
    L10N_LANGUAGES: t.languages
  };

  const withCss = template.replace(`<link rel="stylesheet" href="./style.css" />`, `<style>${css}</style>`);

  // Substituição em uma única passada: um valor inserido nunca é reinterpretado como placeholder,
  // e placeholders desconhecidos são removidos em vez de vazarem para o PDF.
  return withCss.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => replacements[key] ?? "");
}
