// Otimização do currículo com Gemini — compartilhada pela CLI, pelo servidor local e pela API da Vercel.
import { GoogleGenAI } from "@google/genai";

// Pode ser sobrescrito com GEMINI_MODELS="modelo-a,modelo-b" no .env / Vercel.
// Testado com chamadas reais (nov/2026): gemini-1.5/2.0/2.5 recusam ("no longer available to new users").
// Os aliases "-latest" acompanham automaticamente o modelo estável mais novo, então ficam como rede de segurança.
const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"];

export const MAX_JOB_DESCRIPTION_CHARS = 20000;

// Campos que a IA nunca pode alterar: são restaurados do currículo original após a resposta.
const PROTECTED_FIELDS = [
  "name",
  "email",
  "phone_e164",
  "phone_display",
  "linkedin_url",
  "github_url",
  "website_url",
  "design_system_url"
];

export function getModels() {
  const fromEnv = (process.env.GEMINI_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_MODELS;
}

export const SYSTEM_PROMPT = `
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
   - Cada tópico (bullet) deve começar com um **verbo de ação forte** (ex: "Liderei", "Arquitetei", "Otimizei", "Automatizei", "Implementei" / "Led", "Designed", "Optimized", "Automated", "Implemented").
   - Escreva os tópicos focando no **impacto prático e resultados técnicos**. Quando o currículo original fornecer dados ou quando puder ser inferido logicamente, conecte a ação ao resultado técnico.
   - Relacione as tecnologias utilizadas diretamente na ação (ex: "...utilizando React, TypeScript e Storybook").

5. **Ajuste de Seções**:
   - **title**: Ajuste o título para corresponder diretamente ao cargo da vaga, desde que faça sentido com o perfil do currículo.
   - **summary**: No máximo 3 ou 4 frases, respondendo: "Por que este candidato é ideal para esta vaga específica?". Destaque as principais tecnologias exigidas pela vaga que o candidato domina.
   - **skills**: Coloque no topo o grupo com as habilidades mais pedidas na vaga. Remova habilidades irrelevantes se necessário, preservando a amplitude técnica do candidato.

6. **Preservação de Dados Reais**:
   - **NÃO invente** experiências, empresas, datas, certificados, formação acadêmica ou dados de contato.
   - Mantenha inalterados os campos: "name", "email", "phone_e164", "phone_display", "linkedin_url", "github_url", "website_url".
   - Mantenha datas ("date") e nomes de instituições/empresas exatamente como estão, apenas traduzindo cargos e descrições quando necessário.

7. **Alinhamento Estratégico aos Setores-Alvo** (use apenas o que existir no currículo de entrada):
   - **Hospitais, Clínicas & Saúde (HealthTech)**: destaque projetos de saúde (ex.: Connect Care), agendamentos, segurança de dados (LGPD/HIPAA) e alta disponibilidade.
   - **EdTechs & Plataformas Educacionais**: destaque experiência com Moodle (plugins PHP e temas), integrações corporativas, Design Systems e portais acadêmicos.
   - **Empresas de Tecnologia em Geral**: destaque Full Stack moderna (React, Next.js, Node.js, Python) e DevOps (AWS, Docker, Kubernetes, CI/CD, Terraform, observabilidade).
   - **Localidade, Modalidades e Idioma**: respeite as preferências descritas em "work_preference", "modalities" e "languages" do currículo de entrada. Para vagas internacionais remotas, deixe claro que a atuação é remota a partir do Brasil como contractor, sem necessidade de visto.

8. **Projetos Relevantes**:
   - Mantenha os projetos pertinentes no array "projects", adaptando os resumos para demonstrar aderência técnica direta à vaga. Preserve os links.

9. **Formato de Saída**:
   - O resultado deve ser EXCLUSIVAMENTE um objeto JSON válido, com exatamente a mesma estrutura (schema) do JSON de entrada.
   - Não inclua markdown de código na resposta, apenas o JSON puro.
`;


function parseJson(text) {
  const clean = String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (!clean) throw new Error("Resposta da IA vazia.");
  const parsed = JSON.parse(clean);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("A IA não retornou um objeto JSON de currículo.");
  }
  return parsed;
}

// Garante que contato/links nunca sejam alterados ou inventados pela IA.
export function restoreProtectedFields(original = {}, tailored = {}) {
  const result = { ...tailored };
  for (const field of PROTECTED_FIELDS) {
    if (original[field] !== undefined) result[field] = original[field];
  }
  for (const key of ["skills", "projects", "experience", "education", "languages"]) {
    if (!Array.isArray(result[key])) result[key] = Array.isArray(original[key]) ? original[key] : [];
  }
  if (result.language !== "en" && result.language !== "pt") result.language = original.language || "pt";
  return result;
}

/**
 * Otimiza o currículo para a vaga, tentando os modelos em sequência.
 * `deadlineMs` evita estourar o timeout de funções serverless.
 */
export async function optimizeResume({ resume, jobDescription, apiKey, deadlineMs = 50000, log = console }) {
  if (!apiKey) throw Object.assign(new Error("Chave de API do Gemini não informada."), { status: 400 });
  if (!resume || typeof resume !== "object") {
    throw Object.assign(new Error("Currículo base não informado."), { status: 400 });
  }
  const job = String(jobDescription || "").trim();
  if (!job) throw Object.assign(new Error("Descrição da vaga não informada."), { status: 400 });
  if (job.length > MAX_JOB_DESCRIPTION_CHARS) {
    throw Object.assign(
      new Error(`Descrição da vaga muito longa (máx. ${MAX_JOB_DESCRIPTION_CHARS} caracteres).`),
      { status: 400 }
    );
  }

  const userPrompt = `CURRÍCULO BASE (JSON):\n${JSON.stringify(resume, null, 2)}\n\nDESCRIÇÃO DA VAGA:\n${job}`;
  const tailored = await generateJson({ apiKey, system: SYSTEM_PROMPT, prompt: userPrompt, deadlineMs, log });
  return restoreProtectedFields(resume, tailored);
}

const isRateLimit = (err) => /\b429\b|rate limit|resource has been exhausted/i.test(String(err?.message || ""));

/**
 * Chamada genérica ao Gemini que devolve um objeto JSON, com fallback entre modelos e prazo máximo.
 * - 503 / alta demanda / modelo indisponível: pula direto para o próximo modelo (insistir só gasta o prazo)
 * - 429 (limite de taxa): espera um pouco e tenta o mesmo modelo mais uma vez
 * - cada chamada tem tempo máximo, para um modelo lento não consumir o prazo inteiro
 */
export async function generateJson({ apiKey, system, prompt, deadlineMs = 50000, perCallMs = 30000, log = console }) {
  if (!apiKey) throw Object.assign(new Error("Chave de API do Gemini não informada."), { status: 400 });
  const ai = new GoogleGenAI({ apiKey });
  const startedAt = Date.now();
  let lastError = null;

  for (const model of getModels()) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const remaining = deadlineMs - (Date.now() - startedAt);
      if (remaining < 3000) break;
      try {
        log.info?.(`[Gemini] Modelo ${model} (tentativa ${attempt})...`);
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            abortSignal: AbortSignal.timeout(Math.min(perCallMs, remaining))
          }
        });
        return parseJson(response.text);
      } catch (err) {
        lastError = err;
        log.warn?.(`[Gemini] Falha no modelo ${model} (tentativa ${attempt}): ${String(err.message).slice(0, 160)}`);
        if (isRateLimit(err) && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        break; // próximo modelo
      }
    }
  }

  throw new Error(
    `Não foi possível usar a IA no momento. Detalhes: ${lastError?.message || "tempo limite atingido."}`
  );
}
