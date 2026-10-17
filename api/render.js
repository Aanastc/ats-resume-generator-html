import fs from "node:fs";
import path from "node:path";

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function skillsHtml(skills) {
  if (!skills) return "";
  return skills
    .map(
      (g) =>
        `<div class="item"><div class="item-title">${escapeHtml(g.group)}:</div> ${escapeHtml(
          g.items.join(", ")
        )}</div>`
    )
    .join("\n");
}

function bulletsHtml(bullets) {
  if (!bullets) return "";
  return `<ul class="bullets">${bullets
    .map((b) => {
      const escaped = escapeHtml(b);
      const withLinks = escaped.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" style="text-decoration: underline;">$1</a>'
      );
      return `<li>${withLinks}</li>`;
    })
    .join("")}</ul>`;
}

function projectsHtml(projects, t) {
  if (!projects || !projects.length) return "";
  return projects
    .map((p) => {
      const links = (p.links ?? [])
        .map(
          (l) =>
            `<li>${escapeHtml(l.label)}: <a href="${l.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(
              l.url
            )}</a></li>`
        )
        .join("");
      return `
<div class="item">
  <div class="item-title">${escapeHtml(p.title)}</div>
  <div class="tech-line">${t.stack}: ${escapeHtml(p.stack || "")}</div>
  ${bulletsHtml(p.bullets)}
  ${links ? `<ul class="bullets">${links}</ul>` : ""}
</div>`;
    })
    .join("\n");
}

function experienceHtml(exps) {
  if (!exps) return "";
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
  if (!eds) return "";
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
  if (!langs) return "";
  return langs
    .map(
      (l) => `
<div class="item">
  <div class="item-header">
    <div class="item-title">${escapeHtml(l.name)} — ${escapeHtml(l.level)}</div>
    <div class="item-date">${escapeHtml(l.note || "")}</div>
  </div>
</div>`
    )
    .join("\n");
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const root = process.cwd();
    const templatePath = path.join(root, "templates", "ats.html");
    const cssPath = path.join(root, "templates", "style.css");

    const tpl = fs.readFileSync(templatePath, "utf8");
    const css = fs.readFileSync(cssPath, "utf8");
    const data = req.body || {};

    const l10n = {
      pt: {
        summary: "Resumo",
        skills: "Habilidades",
        projects: "Projetos",
        experience: "Experiência",
        education: "Formação Acadêmica",
        languages: "Idiomas",
        stack: "Stack"
      },
      en: {
        summary: "Summary",
        skills: "Skills",
        projects: "Projects",
        experience: "Experience",
        education: "Education",
        languages: "Languages",
        stack: "Tech Stack"
      }
    };

    const lang = data.language === "en" ? "en" : "pt";
    const t = l10n[lang];

    const dsLink = data.design_system_url
      ? ` |\n          <a href="${data.design_system_url}" target="_blank" rel="noopener noreferrer">Design System (Live Demo)</a>`
      : "";

    const html = tpl
      .replace(
        `<link rel="stylesheet" href="./style.css" />`,
        `<style>${css}</style>`
      )
      .replaceAll("{{NAME}}", escapeHtml(data.name || ""))
      .replaceAll("{{TITLE}}", escapeHtml(data.title || ""))
      .replaceAll("{{EMAIL}}", escapeHtml(data.email || ""))
      .replaceAll("{{PHONE_E164}}", escapeHtml(data.phone_e164 || ""))
      .replaceAll("{{PHONE_DISPLAY}}", escapeHtml(data.phone_display || ""))
      .replaceAll("{{LOCATION}}", escapeHtml(data.location || ""))
      .replaceAll("{{LINKEDIN_URL}}", data.linkedin_url || "#")
      .replaceAll("{{GITHUB_URL}}", data.github_url || "#")
      .replaceAll("{{WEBSITE_URL}}", data.website_url || "#")
      .replaceAll("{{LINKEDIN_TEXT}}", (data.linkedin_url || "").replace(/^https?:\/\//, ""))
      .replaceAll("{{GITHUB_TEXT}}", (data.github_url || "").replace(/^https?:\/\//, ""))
      .replaceAll("{{WEBSITE_TEXT}}", data.language === "en" ? "Portfolio" : "Portfólio")
      .replaceAll("{{DESIGN_SYSTEM_LINK}}", dsLink)
      .replaceAll("{{SUMMARY}}", escapeHtml(data.summary || ""))
      .replaceAll("{{SKILLS_HTML}}", skillsHtml(data.skills))
      .replaceAll("{{PROJECTS_HTML}}", projectsHtml(data.projects, t))
      .replaceAll("{{EXPERIENCE_HTML}}", experienceHtml(data.experience))
      .replaceAll("{{EDUCATION_HTML}}", educationHtml(data.education))
      .replaceAll("{{LANGUAGES_HTML}}", languagesHtml(data.languages))
      .replaceAll("{{L10N_SUMMARY}}", t.summary)
      .replaceAll("{{L10N_SKILLS}}", t.skills)
      .replaceAll("{{L10N_PROJECTS}}", t.projects)
      .replaceAll("{{L10N_EXPERIENCE}}", t.experience)
      .replaceAll("{{L10N_EDUCATION}}", t.education)
      .replaceAll("{{L10N_LANGUAGES}}", t.languages);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(`Erro ao renderizar HTML: ${err.message}`);
  }
}

