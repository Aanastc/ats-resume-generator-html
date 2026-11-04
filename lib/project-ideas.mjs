// Ideias de projetos pessoais para comprovar as tecnologias que as vagas pedem.
// Com chave do Gemini: ideias geradas sob medida. Sem chave: catálogo curado, ranqueado pelas lacunas.
import fs from "node:fs";
import path from "node:path";
import { generateJson } from "./gemini.mjs";
import { analyzeSkillGaps } from "./skill-gap.mjs";

// Handler compartilhado (Express e Vercel). POST { resume, customApiKey, useAi }
export async function projectIdeasHandler(req, res, { root = process.cwd() } = {}) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  try {
    const { resume, customApiKey, useAi = true } = req.body || {};
    const cv = resume && typeof resume === "object" ? resume : JSON.parse(fs.readFileSync(path.join(root, "data", "resume.json"), "utf8"));
    const cache = JSON.parse(fs.readFileSync(path.join(root, "data", "jobs-cache.json"), "utf8"));
    const analysis = analyzeSkillGaps(cache.jobs || [], cv);
    const apiKey = useAi ? customApiKey || process.env.GEMINI_API_KEY : null;
    const result = await generateProjectIdeas({ analysis, resume: cv, apiKey });
    return res.status(200).json({ success: true, jobs_updated_at: cache.formatted_date, analysis, ...result });
  } catch (err) {
    return res.status(500).json({ error: `Erro ao gerar ideias: ${err.message}` });
  }
}

// Catálogo curado (setores-alvo: saúde, educação e tech). "techs" usa os nomes de lib/skill-gap.mjs.
export const CATALOG = [
  {
    title: "API de prontuário interoperável (FHIR) com trilha de auditoria LGPD",
    sector: "saude",
    problem: "Clínicas pequenas não conseguem trocar dados de pacientes com hospitais e laboratórios de forma padronizada e auditável.",
    techs: ["Node.js", "TypeScript", "NestJS", "PostgreSQL", "HL7/FHIR (saúde)", "LGPD/HIPAA", "Testes automatizados", "Docker", "REST APIs"],
    features: ["Recursos FHIR Patient/Encounter/Observation", "Consentimento do paciente e log de acesso imutável", "Anonimização para exportação", "Testes de contrato + cobertura > 80%"],
    weeks: 4,
    difficulty: "Intermediário"
  },
  {
    title: "Agendamento clínico orientado a eventos com lembretes e fila de espera",
    sector: "saude",
    problem: "Faltas em consultas custam caro; a clínica precisa reaproveitar horários vagos automaticamente.",
    techs: ["Java", "Spring Boot", "Kafka", "PostgreSQL", "Redis", "Event-driven", "Docker", "Testes automatizados", "Observabilidade"],
    features: ["Reserva com lock otimista (sem overbooking)", "Eventos de cancelamento disparam oferta para a fila", "Lembretes via WhatsApp/e-mail (mock)", "Dashboards Grafana de ocupação"],
    weeks: 5,
    difficulty: "Avançado"
  },
  {
    title: "Assistente de protocolos clínicos com RAG (IA generativa)",
    sector: "saude",
    problem: "Profissionais perdem tempo procurando a conduta certa em protocolos extensos do Ministério da Saúde.",
    techs: ["Python", "FastAPI", "LLMs / IA generativa", "PostgreSQL", "Docker", "Observabilidade", "LGPD/HIPAA", "Testes automatizados"],
    features: ["Ingestão de PDFs públicos e busca vetorial (pgvector)", "Respostas com citação da fonte", "Avaliação automática de qualidade das respostas", "Nenhum dado de paciente enviado ao LLM"],
    weeks: 3,
    difficulty: "Intermediário"
  },
  {
    title: "Pipeline de dados de saúde pública (DATASUS) no Databricks",
    sector: "saude",
    problem: "Gestores precisam de indicadores de internações e leitos atualizados, mas os dados brutos são difíceis de usar.",
    techs: ["Databricks", "Spark", "Python", "SQL", "Airflow", "dbt"],
    features: ["Ingestão incremental (camadas bronze/prata/ouro)", "Modelos dbt testados", "Orquestração diária", "Painel de ocupação por região"],
    weeks: 3,
    difficulty: "Intermediário"
  },
  {
    title: "Tutor de IA integrado ao Moodle via LTI 1.3",
    sector: "edtech",
    problem: "Alunos de EAD ficam sem resposta fora do horário do tutor; a instituição precisa de suporte escalável.",
    techs: ["Next.js", "TypeScript", "Node.js", "LMS/Moodle", "LLMs / IA generativa", "PostgreSQL", "Testes automatizados"],
    features: ["Launch LTI 1.3 dentro do curso", "Respostas baseadas no material da disciplina", "Relatório de dúvidas frequentes para o professor", "Limites de uso por aluno"],
    weeks: 4,
    difficulty: "Avançado"
  },
  {
    title: "Analytics de engajamento de alunos (plugin Moodle + BigQuery)",
    sector: "edtech",
    problem: "Coordenações descobrem a evasão tarde demais; faltam alertas de alunos em risco.",
    techs: ["PHP", "LMS/Moodle", "BigQuery", "Python", "SQL", "Airflow"],
    features: ["Plugin que exporta eventos de log", "Modelo simples de risco de evasão", "Alertas semanais por e-mail", "Dashboard por turma"],
    weeks: 3,
    difficulty: "Intermediário"
  },
  {
    title: "Busca inteligente de cursos com Elasticsearch",
    sector: "edtech",
    problem: "Catálogos grandes de cursos têm busca ruim (sem sinônimos, sem tolerância a erro de digitação).",
    techs: ["Elasticsearch", "Node.js", "React", "TypeScript", "Docker", "Testes automatizados"],
    features: ["Sinônimos e correção ortográfica", "Facetas (área, carga horária, preço)", "Indexação via fila", "Testes de relevância"],
    weeks: 2,
    difficulty: "Intermediário"
  },
  {
    title: "Simulador de pagamentos PIX com DDD e mensageria",
    sector: "tech",
    problem: "Demonstrar domínio de sistemas financeiros: idempotência, consistência e alto volume.",
    techs: ["Java", "Spring Boot", "Kafka", "PostgreSQL", "Redis", "Pagamentos", "DDD", "Event-driven", "Testes automatizados", "Observabilidade"],
    features: ["Chaves PIX e QR Code", "Idempotência e saga para estornos", "Teste de carga (k6) com métricas", "Arquitetura hexagonal documentada"],
    weeks: 5,
    difficulty: "Avançado"
  },
  {
    title: "Microsserviço .NET na Azure (AKS) com infraestrutura em Terraform",
    sector: "tech",
    problem: "Muitas vagas pedem .NET + Azure; o projeto mostra o ciclo completo do código à produção.",
    techs: ["C#/.NET", "Azure", "Kubernetes", "Terraform", "CI/CD", "Observabilidade", "Docker"],
    features: ["API minimal com testes", "AKS provisionado via Terraform", "Pipeline com deploy blue/green", "Application Insights + alertas"],
    weeks: 3,
    difficulty: "Intermediário"
  },
  {
    title: "Plataforma GitOps no GCP (GKE + ArgoCD + Helm)",
    sector: "tech",
    problem: "Times precisam de deploy padronizado e reversível; o projeto mostra uma plataforma interna mínima.",
    techs: ["GCP", "Kubernetes", "Terraform", "Helm", "ArgoCD", "CI/CD", "Observabilidade"],
    features: ["Ambientes dev/prod com Terraform", "Charts Helm versionados", "Rollback automático por SLO", "Custos monitorados (FinOps)"],
    weeks: 3,
    difficulty: "Avançado"
  },
  {
    title: "Painel administrativo em Angular para gestão de convênios",
    sector: "saude",
    problem: "Equipes administrativas de clínicas controlam convênios e guias em planilhas.",
    techs: ["Angular", "TypeScript", "Java", "Spring Boot", "PostgreSQL", "Testes automatizados"],
    features: ["CRUD com formulários reativos", "Upload e validação de guias (TISS)", "Permissões por perfil", "Testes e2e com Playwright"],
    weeks: 3,
    difficulty: "Intermediário"
  },
  {
    title: "App de acompanhamento de pacientes crônicos (React Native)",
    sector: "saude",
    problem: "Pacientes crônicos esquecem medições e remédios; o médico não vê a evolução entre consultas.",
    techs: ["React Native", "TypeScript", "Node.js", "Supabase", "LGPD/HIPAA", "Testes automatizados"],
    features: ["Registro offline com sincronização", "Lembretes de medicação", "Gráfico de evolução para o médico", "Consentimento e exclusão de dados (LGPD)"],
    weeks: 4,
    difficulty: "Intermediário"
  }
];

const SECTOR_LABEL = { saude: "Saúde / Hospitalar", edtech: "EdTech / Educação", tech: "Tech geral" };

function gapWeights(analysis) {
  const w = {};
  analysis.missing.forEach((s) => (w[s.tech] = s.jobs * 1.5)); // falta no CV: peso maior
  analysis.unproven.forEach((s) => (w[s.tech] = s.jobs)); // no CV mas sem projeto que comprove
  return w;
}

// Ranqueia o catálogo pela demanda das lacunas que cada ideia cobre.
export function rankCatalog(analysis, limit = 6) {
  const w = gapWeights(analysis);
  return CATALOG.map((idea) => {
    const covers = idea.techs.filter((t) => w[t]);
    const score = covers.reduce((sum, t) => sum + w[t], 0) * (idea.sector === "tech" ? 1 : 1.2);
    return { ...idea, covers, score };
  })
    .filter((i) => i.covers.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((i) => ({
      title: i.title,
      sector: SECTOR_LABEL[i.sector],
      problem: i.problem,
      stack: i.techs,
      covers: i.covers,
      features: i.features,
      resume_bullet: `Desenvolvi ${i.title.charAt(0).toLowerCase()}${i.title.slice(1)}, utilizando ${i.techs.slice(0, 5).join(", ")}.`,
      difficulty: i.difficulty,
      weeks: i.weeks
    }));
}

const IDEAS_SYSTEM = `
Você é mentor(a) de carreira para pessoas desenvolvedoras e tech recruiter sênior.
Gere ideias de PROJETOS PESSOAIS (portfólio) que comprovem, na prática, as tecnologias que o mercado está pedindo e que a pessoa ainda não comprova.

Regras:
- Cada ideia resolve um problema REAL e específico (nada de "to-do list" ou "clone da Netflix").
- Priorize os setores-alvo da pessoa (saúde/hospitais, educação/EdTech) quando fizer sentido, sem forçar.
- Cada ideia deve cobrir várias lacunas ao mesmo tempo, priorizando as mais pedidas.
- Não repita projetos que a pessoa já tem.
- Escopo realista para 2 a 5 semanas de dedicação parcial; inclua o que torna o projeto convincente para recrutadores (testes, deploy, observabilidade, README com decisões técnicas).
- "covers" deve conter apenas nomes que aparecem nas listas de lacunas fornecidas.
- Escreva em português do Brasil.

Formato de saída: EXCLUSIVAMENTE JSON:
{"ideas":[{"title":"","sector":"Saúde / Hospitalar | EdTech / Educação | Tech geral","problem":"","stack":[""],"covers":[""],"features":[""],"resume_bullet":"bullet de currículo em PRIMEIRA PESSOA no pretérito (ex.: 'Desenvolvi...', 'Implementei...'), sem inventar métricas","difficulty":"Iniciante | Intermediário | Avançado","weeks":3}]}
`;

export async function generateProjectIdeas({ analysis, resume, apiKey, count = 5, deadlineMs = 45000 }) {
  const fallback = () => ({ generated_by: "catalogo", ideas: rankCatalog(analysis, count) });
  if (!apiKey) return fallback();

  const fmt = (list) => list.map((s) => `- ${s.tech}: pedido em ${s.jobs} vagas (${s.pct}%)`).join("\n") || "- (nenhuma)";
  const prompt = `
VAGAS ANALISADAS: ${analysis.jobs_analyzed}

TECNOLOGIAS PEDIDAS QUE FALTAM NO CURRÍCULO:
${fmt(analysis.missing)}

TECNOLOGIAS QUE ESTÃO NO CURRÍCULO, MAS NENHUM PROJETO COMPROVA:
${fmt(analysis.unproven)}

JÁ COMPROVADAS POR PROJETOS: ${analysis.proven.join(", ") || "(nenhuma)"}

PROJETOS QUE A PESSOA JÁ TEM: ${(resume.projects || []).map((p) => p.title).join(" | ") || "(nenhum)"}
CARGO ATUAL: ${resume.title || ""}
SETORES-ALVO: ${(resume.work_preference?.target_sectors || ["Saúde", "EdTech", "Tech"]).join(", ")}

Gere ${count} ideias.`;

  try {
    const out = await generateJson({ apiKey, system: IDEAS_SYSTEM, prompt, deadlineMs });
    const ideas = Array.isArray(out.ideas) ? out.ideas.filter((i) => i && i.title) : [];
    if (!ideas.length) return fallback();
    return { generated_by: "ia", ideas: ideas.slice(0, count) };
  } catch (err) {
    return { ...fallback(), warning: `IA indisponível, usando catálogo: ${err.message}` };
  }
}
