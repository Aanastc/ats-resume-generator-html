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

2. **Posicionamento de Engenharia 2027 (Evitar "Lista de Ferramentas" e Clichês)**:
   - **NÃO use buzzwords ou adjetivos vazios** (ex: "motivado", "proativo", "focado em resultados", "líder dinâmico", "team player").
   - **NÃO transforme o currículo em uma lista genérica de ferramentas** ("conhecimentos em React, Node, Docker..."). Em vez disso, responda a três perguntas por meio de realizações reais:
     1) Consegue desenvolver, evoluir e manter sistemas reais em produção?
     2) Sabe tomar decisões técnicas e trabalhar com arquitetura/System Design (APIs resilientes, caching, escalabilidade, microsserviços, mensageria)?
     3) Sabe aplicar IA (LLMs, RAG, agentes, automação), Cloud/DevOps (AWS, Docker, Kubernetes, Terraform, CI/CD, observabilidade) e qualidade (testes, segurança) para entregar software confiável?
   - Mantenha o tom profissional, direto, técnico e orientado a engenharia e impacto em produção.

3. **Otimização ATS Natural**:
   - Alinhe a terminologia técnica do currículo com os termos exatos utilizados na descrição da vaga (ex: se a vaga pede "Internal Developer Platforms" ou "Platform Engineering", use o termo da vaga).
   - Integre as palavras-chave de forma fluida e gramaticalmente natural nas experiências, projetos e competências. Evite "keyword stuffing".

4. **Metodologia de Impacto nos Bullet Points (Experiências e Projetos)**:
   - Cada tópico (bullet) deve começar com um **verbo de ação forte no passado** (ex: "Desenvolveu", "Estruturou", "Arquitetei", "Otimizei", "Automatizei", "Implementei" / "Built", "Designed", "Optimized", "Automated", "Implemented").
   - Conecte a decisão técnica/arquitetural ao impacto prático em produção (performance, confiabilidade, redução de atrito, automação de entregas, observabilidade).
   - **NUNCA invente métricas ou números** que não estejam presentes no currículo base. Preserve ou destaque apenas dados reais fornecidos.

5. **Ajuste de Seções e Calibração Honesta (Não Inflar Senioridade)**:
   - **title**: Use um posicionamento abrangente e fiel ao histórico (padrão: "Software Engineer | Full Stack Developer", ajustando para o cargo da vaga quando houver aderência real).
   - **summary**: Conciso (3 a 4 frases, ~50–70 palavras), objetivo e orientado a engenharia: aplicações web, arquitetura de sistemas, integrações corporativas, automação de processos e evolução de plataformas digitais.
   - **skills**: Organize em especialidades claras (Full Stack Development, Arquitetura & Integração de APIs, Cloud & DevOps especificando serviços AWS reais como EKS/RDS/DynamoDB/Redis quando presentes, e Qualidade/Segurança).
   - **Não inflar escopo ou senioridade**: evite expressões exageradas como "alta disponibilidade", "responsável pela infraestrutura inteira" ou "gestão de incidentes críticos" quando o currículo base descrever atuação pontual ou de apoio. Escreva cada bullet com precisão técnica para que a candidata consiga defender decisões, ferramentas e responsabilidades com segurança em entrevistas.

6. **Preservação de Dados Reais**:
   - **NÃO invente** experiências, empresas, datas, certificados, formação acadêmica ou dados de contato.
   - Mantenha inalterados os campos: "name", "email", "phone_e164", "phone_display", "linkedin_url", "github_url", "website_url".
   - Mantenha datas ("date") e nomes de instituições/empresas exatamente como estão, apenas traduzindo cargos e descrições quando necessário.

7. **Alinhamento Estratégico aos Setores-Alvo e Trilha da Vaga** (use apenas o que existir no currículo de entrada):
   - **Foco por trilha (não diluir a candidatura)**: direcione o currículo para o perfil principal da vaga — *Full Stack / Software Engineer* (React, TypeScript, Node.js, integrações de sistemas, APIs REST, produção) OU *Cloud / DevOps / Platform* (AWS, Docker, Kubernetes, Terraform, CI/CD, observabilidade) — evitando tentar destacar todas as especialidades com o mesmo peso em uma única candidatura.
   - **Hospitais, Clínicas & Saúde (HealthTech)**: destaque projetos de saúde (ex.: Connect Care), agendamentos, segurança de dados (LGPD/HIPAA) e confiabilidade operacional.
   - **EdTechs & Plataformas Educacionais**: destaque experiência com Moodle (plugins PHP e temas), integrações corporativas, Design Systems e portais acadêmicos.
   - **Empresas de Tecnologia em Geral**: destaque Full Stack moderna (React, Next.js, Node.js, Python) e DevOps (AWS, Docker, Kubernetes, CI/CD, Terraform, observabilidade).
   - **Localidade, Modalidades e Idioma**: respeite as preferências descritas em "work_preference", "modalities" e "languages" do currículo de entrada. Para vagas internacionais remotas, redija um currículo nativo em inglês (não apenas tradução literal) e deixe claro que a atuação é remota a partir do Brasil (International Contractor / PJ ou EOR), sem necessidade de visto.

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
export async function optimizeResume({ resume, jobDescription, apiKey, language = "auto", deadlineMs = 50000, log = console }) {
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

  const forced = language === "pt" || language === "en" ? language : null;
  const languageRule = forced
    ? `\n\nIDIOMA OBRIGATÓRIO: escreva todo o currículo em ${forced === "pt" ? "PORTUGUÊS DO BRASIL" : "INGLÊS"}, independentemente do idioma da vaga, e defina "language" como "${forced}".`
    : "";
  const userPrompt = `CURRÍCULO BASE (JSON):\n${JSON.stringify(resume, null, 2)}\n\nDESCRIÇÃO DA VAGA:\n${job}${languageRule}`;
  const tailored = await generateJson({ apiKey, system: SYSTEM_PROMPT, prompt: userPrompt, deadlineMs, log });
  const result = restoreProtectedFields(resume, tailored);
  if (forced) result.language = forced; // garante os títulos de seção no idioma escolhido
  return result;
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
