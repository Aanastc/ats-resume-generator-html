import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const PORTFOLIO_PT_URL = "https://raw.githubusercontent.com/Aanastc/ana_leticia.ac__portifolio/main/src/locales/pt.json";
const PORTFOLIO_EN_URL = "https://raw.githubusercontent.com/Aanastc/ana_leticia.ac__portifolio/main/src/locales/en.json";

export async function fetchPortfolioData() {
  console.log("Baixando dados atualizados do repositório do portfólio (Aanastc/ana_leticia.ac__portifolio)...");
  
  const [ptRes, enRes] = await Promise.all([
    fetch(PORTFOLIO_PT_URL, { headers: { "User-Agent": "ATS-Resume-Sync/1.0" } }),
    fetch(PORTFOLIO_EN_URL, { headers: { "User-Agent": "ATS-Resume-Sync/1.0" } })
  ]);

  if (!ptRes.ok) {
    throw new Error(`Falha ao obter dados do portfólio em PT (HTTP ${ptRes.status})`);
  }

  const ptData = await ptRes.json();
  const enData = enRes.ok ? await enRes.json() : null;

  return { ptData, enData };
}

export function buildResumeFromPortfolio(ptData, enData, lang = "pt") {
  const isEn = lang === "en";
  const source = isEn && enData ? enData : ptData;

  // Base profile info with strict candidate requirements:
  // - Hospital/Clinica (HealthTech) + EdTech + Conventional tech
  // - PJ / CLT / Freelance
  // - Onsite/Hybrid: strictly Belo Horizonte (BH)
  // - Remote: Brazil / Global
  const location = isEn
    ? "Belo Horizonte, MG (On-site/Hybrid) | Remote (Brazil & Global)"
    : "Belo Horizonte, MG (Presencial/Híbrido) | Remoto (Brasil e Global)";

  const title = isEn
    ? "Senior Full Stack & DevOps Engineer (HealthTech, EdTech & Critical Systems)"
    : "Desenvolvedora Full Stack & DevOps (Sistemas Críticos, Hospitais/Saúde & EdTechs)";

  const summary = isEn
    ? "Senior Full Stack & DevOps Engineer with 5+ years of experience architecting high-availability platforms across three core domains: 1) Healthcare & Clinical Systems (Connect Care HealthTech, patient workflows, data security); 2) EdTech Platforms (Moodle plugin development and infrastructure at Lingopass, institutional Design System at UNIFOR); and 3) Conventional Enterprise Cloud (microservices, CI/CD automation, AWS, Docker, Kubernetes). Proficient in React, Node.js, TypeScript, Python, and PHP. Open to PJ, CLT, and Freelance engagements (on-site/hybrid in Belo Horizonte, MG or 100% remote)."
    : "Desenvolvedora Full Stack & DevOps com mais de 5 anos de experiência na concepção e sustentação de sistemas escaláveis e de alta criticidade. Atuação especializada em três ecossistemas fundamentais: 1) Ambientes Hospitalares e Clínicas (Connect Care HealthTech, agendamentos, segurança de dados em saúde); 2) EdTechs e Plataformas Educacionais (desenvolvimento de plugins e sustentação Moodle na Lingopass, Design System institucional e portais de ensino na UNIFOR); 3) Empresas Convencionais & Tech (microsserviços Node/Python, esteiras CI/CD, Docker, Kubernetes e AWS). Especialista em React, Node.js, TypeScript, Python e PHP. Aberta a regimes PJ, CLT e Freelance (presencial/híbrido estritamente em Belo Horizonte/MG ou 100% remoto para todo o Brasil/exterior).";

  // Map experiences from portfolio
  const rawExps = source.experience?.items || [];
  const experience = rawExps.map((exp) => {
    let role = exp.role || "";
    let company = exp.company || "";
    let date = exp.period || "";
    let bullets = (exp.activities || []).map((act) => act.trim());

    // Highlight domain context
    if (company.toLowerCase().includes("lingopass")) {
      company = isEn ? "Lingopass (EdTech)" : "Lingopass (EdTech)";
    } else if (company.toLowerCase().includes("unifor") && role.toLowerCase().includes("full stack")) {
      company = isEn ? "Universidade de Fortaleza (UNIFOR - EdTech)" : "Universidade de Fortaleza (UNIFOR - EdTech)";
    }

    return {
      role,
      company,
      date,
      mode: exp.mode,
      bullets,
      stacks: exp.stacks || []
    };
  });

  // Map projects from portfolio
  const rawProjects = source.projects?.projectsList || [];
  const projects = rawProjects.map((p) => {
    let stack = (p.technologies || []).join(", ");
    let bullets = [p.description];
    let links = [];

    if (p.demo) {
      links.push({ label: isEn ? "Live Demo" : "Acessar Projeto", url: p.demo });
    }
    if (p.github && p.github.startsWith("http")) {
      links.push({ label: "GitHub", url: p.github });
    }

    return {
      title: p.title,
      category: p.category,
      stack,
      bullets,
      links
    };
  });

  // Map skills into targeted categories
  const skills = isEn
    ? [
        {
          group: "Healthcare & Critical Systems (HealthTech)",
          items: [
            "Connect Care HealthTech Architecture",
            "Clinical & Patient Management Platforms",
            "Data Privacy & Security (LGPD / HIPAA Compliance)",
            "High-Availability APIs & Mission-Critical Reliability"
          ]
        },
        {
          group: "EdTech & Educational Platforms",
          items: [
            "Moodle LMS Development (Custom PHP Plugins & Themes)",
            "Third-Party Integrations (HubSpot, Intercom, Stripe, BigQuery)",
            "Reusable Institutional Design Systems (NPM, Storybook, CI/CD)",
            "High-Volume Multi-Tenant Student Portals"
          ]
        },
        {
          group: "Full Stack & Backend Engineering",
          items: [
            "React.js, Next.js & React Native",
            "Node.js, TypeScript & JavaScript (ES6+)",
            "Python (FastAPI, Flask) & PHP",
            "RESTful APIs, Webhooks & Microservices",
            "PostgreSQL, Supabase, MySQL & Redis Caching"
          ]
        },
        {
          group: "Cloud, DevOps & SRE",
          items: [
            "AWS (EC2, S3, ECS, Lambda, IAM)",
            "Docker Containerization & Kubernetes (EKS)",
            "CI/CD Automation (GitHub Actions, Vercel)",
            "Infrastructure as Code (Terraform) & GitOps (ArgoCD)",
            "Observability & Monitoring (Prometheus, Grafana, OpenTelemetry)"
          ]
        }
      ]
    : [
        {
          group: "Hospitais, Clínicas & Saúde (HealthTech)",
          items: [
            "Arquitetura da Plataforma Connect Care (Home Care e Clínicas)",
            "Sistemas de Agendamento e Fluxo de Pacientes",
            "Privacidade e Segurança de Dados em Saúde (Conformidade LGPD)",
            "APIs Resilientes e Alta Disponibilidade para Ambientes Críticos"
          ]
        },
        {
          group: "EdTechs & Plataformas Educacionais",
          items: [
            "Desenvolvimento Moodle LMS (Plugins Customizados em PHP e Temas)",
            "Integrações Corporativas (HubSpot, Stripe, Intercom, BigQuery)",
            "Design Systems Institucionais Reutilizáveis (NPM, Storybook, CI/CD)",
            "Portais Acadêmicos de Alto Tráfego para Milhares de Alunos"
          ]
        },
        {
          group: "Desenvolvimento Full Stack & Backend",
          items: [
            "React.js, Next.js e React Native",
            "Node.js, TypeScript e JavaScript (ES6+)",
            "Python (FastAPI, Flask) e PHP",
            "APIs RESTful, Webhooks e Microsserviços",
            "PostgreSQL, Supabase, MySQL e Cache Redis"
          ]
        },
        {
          group: "DevOps, Cloud & Observabilidade (SRE)",
          items: [
            "AWS (EC2, S3, ECS, Lambda, IAM)",
            "Conteinerização com Docker e Orquestração com Kubernetes (EKS)",
            "Automação de CI/CD (GitHub Actions, Vercel)",
            "Infraestrutura como Código (Terraform) e GitOps (ArgoCD)",
            "Observabilidade Ponta a Ponta (Prometheus, Grafana, OpenTelemetry)"
          ]
        }
      ];

  // Map education
  const education = isEn
    ? [
        {
          title: "Postgraduate Degree in DevOps and Cloud Architecture",
          subtitle: "FIAP",
          date: "Oct 2025 — Present"
        },
        {
          title: "Bachelor's Degree in Systems Analysis and Development",
          subtitle: "Universidade de Fortaleza (UNIFOR)",
          date: "Completed in 2023"
        }
      ]
    : [
        {
          title: "Pós Tech – DevOps & Arquitetura Cloud",
          subtitle: "FIAP",
          date: "Out/2025 – Em andamento"
        },
        {
          title: "Graduação em Análise e Desenvolvimento de Sistemas",
          subtitle: "Universidade de Fortaleza (UNIFOR)",
          date: "Concluído em Dez/2023"
        }
      ];

  const languages = isEn
    ? [
        { name: "English", level: "Fluent / Advanced (C1+)", note: "Full professional proficiency" },
        { name: "Portuguese", level: "Native", note: "Native speaker" }
      ]
    : [
        { name: "Inglês", level: "Avançado / Fluente (C1+)", note: "Proficiência profissional completa" },
        { name: "Português", level: "Nativo", note: "Língua materna" }
      ];

  return {
    name: "ANA LETÍCIA ALVES CLAUDIANO",
    title,
    email: "analeticia_ac@outlook.com",
    phone_e164: "+5531999679109",
    phone_display: "+55 31 99967-9109",
    location,
    modalities: "PJ, CLT e Freelance",
    work_preference: {
      remote: "Remoto (Brasil ou Global)",
      onsite_hybrid: "Presencial/Híbrido estritamente em Belo Horizonte/MG (ou Região Metropolitana)",
      contracts: ["PJ", "CLT", "Freelance"],
      target_sectors: ["Hospitais & Clínicas (HealthTech)", "EdTechs & Educação", "Empresas Convencionais & Tech"]
    },
    linkedin_url: "https://www.linkedin.com/in/analetícia-react/",
    github_url: "https://github.com/Aanastc",
    website_url: "https://ana-leticia-ac-portifolio-7cxi.vercel.app/",
    design_system_url: "https://designsystemeadedo-git-202612-ana-leticias-projects-198dfb27.vercel.app/",
    portfolio_source_repo: "https://github.com/Aanastc/ana_leticia.ac__portifolio",
    language: lang,
    summary,
    skills,
    projects,
    experience,
    education,
    languages,
    synced_at: new Date().toISOString()
  };
}

export async function runPortfolioSync() {
  const { ptData, enData } = await fetchPortfolioData();

  const resumePt = buildResumeFromPortfolio(ptData, enData, "pt");
  const resumeEn = buildResumeFromPortfolio(ptData, enData, "en");

  const dataDir = path.join(root, "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const resumeJsonPath = path.join(dataDir, "resume.json");
  const resumePtJsonPath = path.join(dataDir, "resume-pt.json");

  // Save updated base resumes
  fs.writeFileSync(resumeJsonPath, JSON.stringify(resumePt, null, 2), "utf8");
  fs.writeFileSync(resumePtJsonPath, JSON.stringify(resumePt, null, 2), "utf8");

  console.log(`✅ Currículo base atualizado com sucesso a partir do portfólio em: ${resumeJsonPath}`);

  // Re-render HTML CV
  try {
    execSync("node scripts/render.mjs", { stdio: "inherit" });
    console.log("✅ HTML do currículo re-renderizado com sucesso.");
  } catch (err) {
    console.warn("⚠️ Aviso ao renderizar HTML após sync:", err.message);
  }

  return {
    success: true,
    synced_at: resumePt.synced_at,
    experiences_count: resumePt.experience.length,
    projects_count: resumePt.projects.length,
    skills_count: resumePt.skills.length,
    portfolio_url: resumePt.website_url,
    resume: resumePt
  };
}

// Direct execution from CLI
if (process.argv[1] && process.argv[1].endsWith("sync-portfolio.mjs")) {
  runPortfolioSync()
    .then((res) => {
      console.log(`\n🎉 Sincronização concluída! ${res.experiences_count} experiências e ${res.projects_count} projetos carregados do portfólio.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Erro na sincronização do portfólio:", err);
      process.exit(1);
    });
}
