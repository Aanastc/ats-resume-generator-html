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
