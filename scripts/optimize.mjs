import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { execSync } from "node:child_process";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Erro: GEMINI_API_KEY não foi encontrada no arquivo .env");
  process.exit(1);
}

const root = process.cwd();
const resumePath = path.join(root, "data", "resume.json");
const jobPath = path.join(root, "data", "job-description.txt");
const outputPath = path.join(root, "data", "resume.optimized.json");

if (!fs.existsSync(resumePath)) {
  console.error(`Erro: Arquivo de currículo base não encontrado em ${resumePath}`);
  process.exit(1);
}

// Ensure job description file exists or prompt to create it
if (!fs.existsSync(jobPath)) {
  console.log(`Criando arquivo de descrição da vaga padrão em ${jobPath}...`);
  fs.writeFileSync(jobPath, "Cole a descrição da vaga aqui.", "utf8");
  console.log("Por favor, preencha o arquivo data/job-description.txt com a vaga desejada e execute novamente.");
  process.exit(0);
}

const resumeData = fs.readFileSync(resumePath, "utf8");
const jobDescription = fs.readFileSync(jobPath, "utf8");

if (jobDescription.trim() === "Cole a descrição da vaga aqui." || !jobDescription.trim()) {
  console.error("Erro: Por favor, adicione uma descrição de vaga válida em data/job-description.txt");
  process.exit(1);
}

console.log("Iniciando otimização com Gemini...");

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
${resumeData}

DESCRIÇÃO DA VAGA:
${jobDescription}
`;

try {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite",
    contents: [
      { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
    ],
    config: {
      responseMimeType: "application/json"
    }
  });

  const tailoredResumeText = response.text;
  if (!tailoredResumeText) {
    throw new Error("Resposta da IA vazia.");
  }

  // Parse to validate JSON
  const tailoredResumeJson = JSON.parse(tailoredResumeText);

  // Write to output
  fs.writeFileSync(outputPath, JSON.stringify(tailoredResumeJson, null, 2), "utf8");
  console.log(`Currículo otimizado salvo em: ${outputPath}`);

  // Auto-render
  console.log("Renderizando HTML...");
  execSync(`node scripts/render.mjs data/resume.optimized.json`, { stdio: "inherit" });

} catch (err) {
  console.error("Erro durante a otimização com Gemini:", err.message);
  process.exit(1);
}
