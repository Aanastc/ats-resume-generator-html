import fs from "node:fs";
import path from "node:path";
import { renderToDist } from "../lib/render-files.mjs";

const root = process.cwd();
export const PORTFOLIO_REPO = "Aanastc/ana_leticia.ac__portifolio";
const PORTFOLIO_PT_URL = `https://raw.githubusercontent.com/${PORTFOLIO_REPO}/main/src/locales/pt.json`;
const PORTFOLIO_EN_URL = `https://raw.githubusercontent.com/${PORTFOLIO_REPO}/main/src/locales/en.json`;

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

// Converte frases nominalizadas do portfólio ("Desenvolvimento de...") em bullets de engenharia com verbo de ação forte,
// preservando 100% dos fatos e tecnologias sem inventar métricas.
export function normalizeActionBullet(text = "") {
  let s = String(text || "").trim();
  const replacements = [
    [/^Desenvolvimento e customização de\s+/i, "Desenvolveu e customizou "],
    [/^Desenvolvimento de\s+/i, "Desenvolveu "],
    [/^Integração do\s+/i, "Integrou o "],
    [/^Integração da\s+/i, "Integrou a "],
    [/^Integração de\s+/i, "Integrou "],
    [/^Sustentação proativa da\s+/i, "Sustentou a "],
    [/^Sustentação da\s+/i, "Sustentou a "],
    [/^Sustentação de\s+/i, "Sustentou "],
    [/^Homologação contínua de\s+/i, "Homologou continuamente "],
    [/^Homologação de\s+/i, "Homologou "],
    [/^Liderança técnica na\s+/i, "Liderou tecnicamente a "],
    [/^Liderança técnica no\s+/i, "Liderou tecnicamente o "],
    [/^Capacitação e mentoria técnica de\s+/i, "Capacitou e mentorou "],
    [/^Arquitetura e sustentação de\s+/i, "Arquitetou e sustentou "],
    [/^Arquitetura de\s+/i, "Arquitetou "],
    [/^Gestão e resolução de\s+/i, "Gerenciou e resolveu "],
    [/^Gestão de\s+/i, "Gerenciou "],
    [/^Implementação de\s+/i, "Implementou "],
    [/^Construção de\s+/i, "Construiu "],
    [/^Customização técnica e sustentação de\s+/i, "Customizou e sustentou "],
    [/^Customização de\s+/i, "Customizou "],
    [/^Pesquisa aplicada no\s+/i, "Conduziu pesquisa aplicada no "],
    [/^Pesquisa aplicada em\s+/i, "Conduziu pesquisa aplicada em "],
    [/^Otimização de\s+/i, "Otimizou "],
    [/^Automação de\s+/i, "Automatizou "],
    [/^Manutenção de\s+/i, "Manteve "],
    [/^Criação de\s+/i, "Criou "]
  ];
  for (const [re, rep] of replacements) {
    if (re.test(s)) {
      s = s.replace(re, rep);
      break;
    }
  }
  return s.replace(/\bproativ[oa]\b\s*/gi, "");
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
    ? "Software Engineer | Full Stack, Cloud/DevOps & AI Engineering"
    : "Engenheira de Software | Full Stack, Cloud/DevOps & IA Aplicada";

  const summary = isEn
    ? "Full Stack & DevOps Software Engineer experienced in architecting, evolving, and operating production web applications, resilient REST APIs, distributed service integrations, and automated cloud infrastructure. Proven delivery across HealthTech (Connect Care), EdTech (Moodle/PHP and CRM/billing integrations at Lingopass; institutional Design System via NPM at UNIFOR), and modern engineering with React, TypeScript, Node.js, Python, AWS, Docker, Kubernetes, Terraform, and applied AI. Open to PJ/Contractor or CLT (on-site/hybrid in Belo Horizonte, MG or 100% remote Brazil/Global; B2–C1 English, no visa required)."
    : "Engenheira de Software Full Stack & DevOps com experiência na arquitetura, evolução e sustentação de aplicações web em produção, APIs REST resilientes, integração de serviços e automação em cloud. Atuação comprovada em Saúde/HealthTech (Connect Care), EdTechs (plugins Moodle/PHP e integrações corporativas na Lingopass; Design System via NPM na UNIFOR) e engenharia moderna com React, TypeScript, Node.js, Python, AWS, Docker, Kubernetes, Terraform e IA aplicada. Aberta a PJ ou CLT (presencial/híbrido em Belo Horizonte, MG ou 100% remoto Brasil/Global, inglês B2–C1).";

  // Map experiences from portfolio
  const rawExps = source.experience?.items || [];
  const experience = rawExps.map((exp) => {
    let role = exp.role || "";
    let company = exp.company || "";
    let date = exp.period || "";
    let bullets = (exp.activities || []).map((act) => (isEn ? act.trim() : normalizeActionBullet(act)));

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

  // Map skills into 2027 engineering-oriented pillars
  const skills = isEn
    ? [
        {
          group: "Architecture, System Design & Backend",
          items: [
            "Clean Architecture, SOLID & Resilient REST APIs",
            "Microservices, Webhooks & Event-Driven Integrations",
            "Node.js, TypeScript, Python (FastAPI/Flask) & PHP (Moodle LMS)",
            "PostgreSQL, Supabase, MySQL, Redis Caching & BigQuery"
          ]
        },
        {
          group: "Cloud, DevOps & Platform Engineering",
          items: [
            "AWS (EC2, S3, ECS, EKS, Lambda, SQS, IAM)",
            "Docker, Kubernetes & Terraform (IaC)",
            "CI/CD Automation (GitHub Actions, Vercel) & GitOps (ArgoCD)",
            "Observability & SRE (Prometheus, Grafana, OpenTelemetry, Linux)"
          ]
        },
        {
          group: "Frontend & UI Systems",
          items: [
            "React.js, Next.js, TypeScript & React Native",
            "Reusable Design Systems (NPM, Storybook, Tailwind CSS)",
            "Web Performance, Accessibility (WCAG) & Responsive UX"
          ]
        },
        {
          group: "Applied AI, Quality & Domains (HealthTech & EdTech)",
          items: [
            "LLM & AI API Integration (Gemini), AI Workflow Automation",
            "Automated Testing (Playwright, Jest, Vitest), Code Review & OWASP",
            "HealthTech & Clinical Systems (Connect Care, LGPD Compliance)",
            "EdTech & Corporate Integrations (Moodle LMS, HubSpot, Stripe, Intercom)"
          ]
        }
      ]
    : [
        {
          group: "Arquitetura, System Design & Backend",
          items: [
            "Clean Architecture, SOLID e APIs REST Resilientes",
            "Microsserviços, Webhooks e Integrações Orientadas a Eventos",
            "Node.js, TypeScript, Python (FastAPI/Flask) e PHP (Moodle LMS)",
            "PostgreSQL, Supabase, MySQL, Cache Redis e BigQuery"
          ]
        },
        {
          group: "Cloud, DevOps & Platform Engineering",
          items: [
            "AWS (EC2, S3, ECS, EKS, Lambda, SQS, IAM)",
            "Docker, Kubernetes e Terraform (Infraestrutura como Código)",
            "CI/CD Avançado (GitHub Actions, Vercel) e GitOps (ArgoCD)",
            "Observabilidade e SRE (Prometheus, Grafana, OpenTelemetry, Linux)"
          ]
        },
        {
          group: "Frontend & UI Systems",
          items: [
            "React.js, Next.js, TypeScript e React Native",
            "Design Systems Reutilizáveis (NPM, Storybook, Tailwind CSS)",
            "Performance Web, Acessibilidade (WCAG) e UX Responsiva"
          ]
        },
        {
          group: "IA Aplicada, Qualidade & Domínios (Saúde & EdTech)",
          items: [
            "Integração com LLMs e APIs de IA (Gemini), Automação de Workflows com IA",
            "Testes Automatizados (Playwright, Jest, Vitest), Code Review e OWASP",
            "Ambientes Hospitalares e HealthTech (Connect Care, Conformidade LGPD)",
            "EdTechs e Integrações Corporativas (Moodle LMS, HubSpot, Stripe, Intercom)"
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
        { name: "English", level: "Advanced / Professional (B2 - C1)", note: "Full professional working proficiency for global distributed engineering teams (Remote from Brazil, no visa sponsorship required)" },
        { name: "Portuguese", level: "Native", note: "Native speaker" }
      ]
    : [
        { name: "Inglês", level: "Avançado / Profissional (B2 - C1)", note: "Proficiência profissional completa para atuação em times globais remotos do Brasil (sem necessidade de visto)" },
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
      remote: "Remoto (Brasil ou Global — Contractor / PJ Internacional sem necessidade de visto)",
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

// persist=false (ex.: Vercel, disco somente leitura) apenas monta e devolve o currículo.
export async function runPortfolioSync({ persist = true } = {}) {
  const { ptData, enData } = await fetchPortfolioData();

  const resumePt = buildResumeFromPortfolio(ptData, enData, "pt");

  if (persist) {
    const dataDir = path.join(root, "data");
    fs.mkdirSync(dataDir, { recursive: true });

    const resumeJsonPath = path.join(dataDir, "resume.json");
    const resumePtJsonPath = path.join(dataDir, "resume-pt.json");

    // Só regrava se o conteúdo mudou (ignorando synced_at), evitando commits diários sem mudança real.
    const withoutStamp = (o) => JSON.stringify({ ...o, synced_at: undefined });
    let previous = null;
    try {
      previous = JSON.parse(fs.readFileSync(resumeJsonPath, "utf8"));
    } catch {
      /* primeiro sync */
    }
    if (previous && withoutStamp(previous) === withoutStamp(resumePt)) {
      resumePt.synced_at = previous.synced_at;
      console.log("✅ Portfólio sem mudanças desde o último sync; currículo base mantido.");
    } else {
      fs.writeFileSync(resumeJsonPath, JSON.stringify(resumePt, null, 2), "utf8");
      fs.writeFileSync(resumePtJsonPath, JSON.stringify(resumePt, null, 2), "utf8");
      console.log(`✅ Currículo base atualizado com sucesso a partir do portfólio em: ${resumeJsonPath}`);
    }

    try {
      renderToDist(resumePt, root);
      console.log("✅ HTML do currículo re-renderizado com sucesso.");
    } catch (err) {
      console.warn("⚠️ Aviso ao renderizar HTML após sync:", err.message);
    }
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

