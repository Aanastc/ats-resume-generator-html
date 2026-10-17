import express from "express";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const root = process.cwd();

app.use(express.json());
app.use(express.static(path.join(root, "web")));

// Ensure directories exist
const dataDir = path.join(root, "data");
const distDir = path.join(root, "dist");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

// Get current base resume
app.get("/api/resume", (req, res) => {
  const resumePath = path.join(dataDir, "resume.json");
  const examplePath = path.join(dataDir, "resume.example.json");

  if (fs.existsSync(resumePath)) {
    return res.json(JSON.parse(fs.readFileSync(resumePath, "utf8")));
  } else if (fs.existsSync(examplePath)) {
    // Copy example to resume.json if resume.json doesn't exist
    fs.copyFileSync(examplePath, resumePath);
    return res.json(JSON.parse(fs.readFileSync(resumePath, "utf8")));
  } else {
    // Return empty schema if nothing is found
    return res.json({
      name: "Seu Nome",
      title: "Seu Cargo",
      email: "seu.email@exemplo.com",
      phone_e164: "+5531999999999",
      phone_display: "(31) 99999-9999",
      location: "Belo Horizonte, MG",
      linkedin_url: "",
      github_url: "",
      website_url: "",
      summary: "",
      skills: [],
      projects: [],
      experience: [],
      education: [],
      languages: []
    });
  }
});

// Search remote and hospital jobs matching profile
app.get("/api/jobs", async (req, res) => {
  const { search = "hospitalar", limit = 15 } = req.query || {};
  const queryLower = search.toLowerCase();

  const hospitalarCuratedJobs = [
    {
      id: "hosp-1",
      title: "Desenvolvedora Full Stack Sênior (Sistemas Hospitalares & PEP)",
      company: "Grupo Mater Dei / Inovação em Saúde",
      location: "Belo Horizonte, MG (Híbrido ou Remoto)",
      salary: "R$ 13.000 - R$ 17.000 (CLT) ou R$ 85 - R$ 115/h (PJ)",
      tags: ["React", "TypeScript", "Node.js", "Python", "PostgreSQL", "Docker", "LGPD"],
      description: "Atuação no desenvolvimento e modernização dos sistemas de Prontuário Eletrônico do Paciente (PEP), teleconsulta e portais de atendimento clínico. Requisitos: experiência sólida com React, Node.js ou Python, modelagem em PostgreSQL, integração de APIs seguras e boas práticas de proteção de dados (LGPD). Conhecimento em DevOps e microsserviços é diferencial.",
      url: "https://materdei.gupy.io/"
    },
    {
      id: "hosp-2",
      title: "Engenheira de Software Full Stack & Cloud (Telemedicina e Clínicas)",
      company: "Unimed-BH / Hub Digital",
      location: "Belo Horizonte, MG (Híbrido em BH)",
      salary: "R$ 12.500 - R$ 16.500 + Benefícios Saúde",
      tags: ["Next.js", "React", "Node.js", "AWS", "CI/CD", "DevOps", "APIs Seguras"],
      description: "Desenvolvimento de soluções digitais voltadas para a jornada do beneficiário e cooperado, integrando sistemas assistenciais com serviços em nuvem na AWS. Buscamos perfil com experiência em Next.js/React, esteiras CI/CD automatizadas e alta tolerância a falhas para suportar milhões de atendimentos anuais.",
      url: "https://unimedbh.gupy.io/"
    },
    {
      id: "hosp-3",
      title: "Desenvolvedora Full Stack (Integração de Laudos & Diagnósticos)",
      company: "Grupo Fleury / Hermes Pardini",
      location: "Belo Horizonte, MG / Vespasiano (Híbrido ou Remoto)",
      salary: "R$ 11.000 - R$ 15.000 (CLT) ou PJ Contrato",
      tags: ["Python", "FastAPI", "React", "PostgreSQL", "Docker", "Microsserviços"],
      description: "Construção de pipelines de dados laboratoriais, APIs de alta vazão para liberação de exames e interfaces para médicos patologistas. Foco em arquitetura limpa, testes automatizados (Jest, pytest) e consistência determinística de dados clínicos.",
      url: "https://fleury.gupy.io/"
    },
    {
      id: "hosp-4",
      title: "Full Stack Engineer (Plataforma HealthTech de Prescrição Digital)",
      company: "Memed HealthTech",
      location: "100% Remoto Brasil (CLT ou PJ)",
      salary: "R$ 14.000 - R$ 18.000 / mês",
      tags: ["TypeScript", "React", "Node.js", "Docker", "AWS", "PostgreSQL", "HealthTech"],
      description: "Evolução do ecossistema de prescrição eletrônica utilizado por milhares de médicos no Brasil. Atuação em squads ágeis com foco em escalabilidade de backend, interfaces intuitivas e integrações com prontuários de hospitais e redes de farmácias.",
      url: "https://memed.gupy.io/"
    },
    {
      id: "hosp-5",
      title: "Desenvolvedora DevOps & Confiabilidade (Ambiente Hospitalar Crítico)",
      company: "MV Sistemas Hospitalares",
      location: "Remoto Brasil (PJ ou CLT)",
      salary: "R$ 13.000 - R$ 16.000 ou Freela PJ",
      tags: ["DevOps", "AWS", "Docker", "Kubernetes", "Terraform", "Monitoramento", "Linux"],
      description: "Garantir 99.99% de disponibilidade para infraestrutura hospitalar em nuvem. Automação de pipelines de CI/CD, sustentação de clusters Kubernetes, observabilidade com Datadog/Prometheus e implementação de planos de Disaster Recovery para sistemas de gestão hospitalar.",
      url: "https://mv.com.br/carreiras"
    }
  ];

  const isHealthcare = queryLower.includes("hosp") || queryLower.includes("saude") || queryLower.includes("saúde") || queryLower.includes("health") || queryLower.includes("med");
  const isBH = queryLower.includes("bh") || queryLower.includes("belo horizonte") || queryLower.includes("brasil");

  try {
    let queryTerm = search;
    if (isHealthcare) queryTerm = "health";
    if (isBH) queryTerm = "full stack";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    const query = encodeURIComponent(queryTerm);
    const remotiveUrl = `https://remotive.com/api/remote-jobs?category=software-dev&search=${query}`;

    const response = await fetch(remotiveUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "ATS-Resume-Generator/1.0" }
    });
    clearTimeout(timeoutId);

    let remoteJobs = [];
    if (response.ok) {
      const data = await response.json();
      remoteJobs = (data.jobs || []).slice(0, 10).map((j) => {
        const plainDesc = (j.description || "")
          .replace(/<[^>]*>?/gm, " ")
          .replace(/\s+/g, " ")
          .trim();

        return {
          id: j.id,
          url: j.url,
          title: j.title,
          company: j.company_name,
          category: j.category,
          tags: j.tags || [],
          location: j.candidate_required_location || "Worldwide / Remote",
          salary: j.salary || "Não especificado",
          publication_date: j.publication_date,
          description: plainDesc,
          raw_description: j.description
        };
      });
    }

    let combinedJobs = [];
    if (isHealthcare || isBH) {
      combinedJobs = [...hospitalarCuratedJobs, ...remoteJobs];
    } else {
      combinedJobs = remoteJobs.length ? remoteJobs : hospitalarCuratedJobs;
    }

    const finalJobs = combinedJobs.slice(0, Number(limit));
    res.json({ success: true, count: finalJobs.length, jobs: finalJobs });
  } catch (err) {
    console.error("Erro /api/jobs local:", err.message);
    const fallback = isHealthcare || isBH ? hospitalarCuratedJobs : hospitalarCuratedJobs.slice(0, 3);
    res.json({ success: true, count: fallback.length, jobs: fallback });
  }
});

// Save resume
app.post("/api/resume", (req, res) => {
  try {
    const resumePath = path.join(dataDir, "resume.json");
    fs.writeFileSync(resumePath, JSON.stringify(req.body, null, 2), "utf8");
    res.json({ success: true, message: "Currículo base salvos com sucesso." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Optimize resume using Gemini
app.post("/api/optimize", async (req, res) => {
  const { resume, jobDescription, customApiKey } = req.body;
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: "Chave de API do Gemini (GEMINI_API_KEY) não encontrada. Configure-a no arquivo .env ou informe-a no painel." });
  }

  if (!jobDescription || !jobDescription.trim()) {
    return res.status(400).json({ error: "Descrição da vaga não informada." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `
Você é um especialista em recrutamento técnico de elite, recolocação profissional e otimização de currículos para sistemas de triagem ATS (Applicant Tracking Systems) e para revisão humana por recrutadores técnicos (Tech Recruiters).
Sua tarefa é ler um currículo estruturado em JSON e a descrição de uma vaga de emprego, e então adaptar o currículo de forma personalizada para a vaga.

Siga rigorosamente as seguintes diretrizes:

1. **Idioma**:
   - Detecte se a descrição da vaga está em inglês ou português.
   - Traduza todo o conteúdo adaptável do currículo (title, summary, skills, projects, experience, education, languages) para o idioma da vaga.
   - Defina o campo "language" no JSON resultante como "en" (se a vaga for em inglês) ou "pt" (se a vaga for em português).

2. **Evitar Generalidades e Clichês (Aparência Não-Genérica para o Recrutador)**:
   - **NÃO use buzzwords ou adjetivos vazios** (ex: "motivado", "proativo", "focado em resultados", "líder dinâmico", "team player"). Recrutadores ignoram esses termos.
   - Em vez de descrever o candidato com adjetivos, **mostre suas qualidades através de fatos e realizações**.
   - Mantenha o tom profissional, direto, técnico e focado em engenharia.

3. **Otimização ATS Natural**:
   - Alinhe a terminologia técnica do currículo com os termos exatos utilizados na descrição da vaga (ex: se a vaga pede "Internal Developer Platforms" e o currículo diz "portais de componentes", use o termo da vaga).
   - Integre as palavras-chave de forma fluida e gramaticalmente natural na descrição das experiências e competências. Evite "keyword stuffing" (repetição artificial e sem nexo).

4. **Metodologia de Impacto nos Bullet Points (Experiências e Projetos)**:
   - Cada tópico (bullet) deve começar com um **verbo de ação forte** (ex: "Liderei", "Arquiteturei", "Otimizei", "Automatizei", "Implementei" / "Led", "Designed", "Optimized", "Automated", "Implemented").
   - Escreva os tópicos focando no **impacto prático e resultados técnicos**. Quando o currículo original fornecer dados ou quando puder ser inferido logicamente, conecte a ação ao resultado técnico (ex: "Reduzi o atrito no desenvolvimento ao padronizar o Design System...").
   - Relacione as tecnologias utilizadas diretamente na ação (ex: "...utilizando React, TypeScript e Storybook").

5. **Ajuste de Seções**:
   - **title**: Ajuste o título para corresponder diretamente ao cargo da vaga (ex: "Platform Engineer" ou "Engenheiro de Software Front-end"), desde que faça sentido com o perfil do currículo.
   - **summary**: O resumo deve conter no máximo 3 ou 4 frases. Ele deve ser uma síntese concisa que responde diretamente à pergunta: "Por que este candidato é ideal para esta vaga específica?". Destaque as principais tecnologias exigidas pela vaga que o candidato domina e a área de atuação dele.
   - **skills**: Organize os grupos de competências de forma lógica, colocando no topo o grupo que contém as principais habilidades solicitadas na vaga. Remova habilidades irrelevantes para a vaga se necessário para manter o currículo focado, mas preserve a amplitude técnica do candidato.

6. **Preservação de Dados Reais**:
   - **NÃO invente** experiências de trabalho, nomes de empresas, datas, certificados, formação acadêmica ou dados de contato.
   - Mantenha inalterados os campos: "name", "email", "phone_e164", "phone_display", "location", "linkedin_url", "github_url", "website_url".
   - Mantenha os períodos de data ("date") e nomes de instituições/empresas exatamente como estão, apenas traduzindo termos de cargo/função e descrições conforme necessário.

7. **Formato de Saída**:
   - O resultado deve ser EXCLUSIVAMENTE um objeto JSON válido, contendo exatamente a mesma estrutura (schema) do JSON de entrada, com os campos adaptados e traduzidos.
   - Não inclua markdown de código (\`\`\`json ...) na resposta, envie apenas a estrutura do JSON pura.
`;

    const userPrompt = `
CURRÍCULO BASE (JSON):
${JSON.stringify(resume, null, 2)}

DESCRIÇÃO DA VAGA:
${jobDescription}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("A resposta obtida da IA está vazia.");
    }

    const tailoredJson = JSON.parse(text);
    res.json(tailoredJson);
  } catch (err) {
    res.status(500).json({ error: `Erro na otimização da IA: ${err.message}` });
  }
});

// Render HTML on the fly and return it
app.post("/api/render", (req, res) => {
  try {
    const tempJsonPath = path.join(dataDir, "resume.temp.json");
    fs.writeFileSync(tempJsonPath, JSON.stringify(req.body, null, 2), "utf8");

    // Run render script on temp file
    execSync(`node scripts/render.mjs data/resume.temp.json`);

    const htmlPath = path.join(distDir, "cv.html");
    const htmlContent = fs.readFileSync(htmlPath, "utf8");

    // Clean up temp file
    if (fs.existsSync(tempJsonPath)) {
      fs.unlinkSync(tempJsonPath);
    }

    res.send(htmlContent);
  } catch (err) {
    res.status(500).send(`Erro ao renderizar HTML: ${err.message}`);
  }
});

// Export to PDF
app.post("/api/export-pdf", async (req, res) => {
  try {
    const tempJsonPath = path.join(dataDir, "resume.temp.json");
    fs.writeFileSync(tempJsonPath, JSON.stringify(req.body, null, 2), "utf8");

    // Render first
    execSync(`node scripts/render.mjs data/resume.temp.json`);

    // Clean up temp file
    if (fs.existsSync(tempJsonPath)) {
      fs.unlinkSync(tempJsonPath);
    }

    // Now export PDF using Playwright
    const distHtml = path.join(distDir, "cv.html");
    const outPdf = path.join(distDir, "cv.pdf");

    if (!fs.existsSync(distHtml)) {
      return res.status(500).json({ error: "Erro: cv.html não foi gerado." });
    }

    const html = fs.readFileSync(distHtml, "utf8");
    const baseUrl = `file://${path.dirname(distHtml)}/`;

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", baseURL: baseUrl });

    await page.pdf({
      path: outPdf,
      format: "A4",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
    });

    await browser.close();

    res.json({ success: true, path: outPdf });
  } catch (err) {
    res.status(500).json({ error: `Erro ao exportar PDF: ${err.message}` });
  }
});

// Download PDF directly from browser
app.get("/api/download-pdf", (req, res) => {
  const pdfPath = path.join(distDir, "cv.pdf");
  if (fs.existsSync(pdfPath)) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="cv.pdf"');
    fs.createReadStream(pdfPath).pipe(res);
  } else {
    res.status(404).send("Arquivo PDF não encontrado. Por favor, exporte o PDF primeiro.");
  }
});

app.listen(port, () => {
  console.log(`Servidor iniciado em http://localhost:${port}`);
});
