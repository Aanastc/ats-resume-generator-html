// Ideias de projetos pessoais para comprovar as tecnologias que as vagas pedem.
// Mantém uma lista persistente que carrega automaticamente, cria ideias novas sem repetir
// as existentes e permite evoluir/melhorar ideias que já estão no backlog.
import fs from "node:fs";
import path from "node:path";
import { generateJson } from "./gemini.mjs";
import { analyzeSkillGaps } from "./skill-gap.mjs";

export function ideaId(title = "") {
	return String(title || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 72);
}

export function normalizeIdea(raw = {}, extra = {}) {
	const now = new Date().toISOString();
	const title = String(raw.title || "").trim();
	const id = String(raw.id || ideaId(title) || `idea-${Date.now()}`);
	return {
		id,
		title,
		sector: String(raw.sector || "Tech geral"),
		problem: String(raw.problem || ""),
		stack: Array.isArray(raw.stack)
			? [...new Set(raw.stack.map((s) => String(s).trim()).filter(Boolean))]
			: [],
		covers: Array.isArray(raw.covers)
			? [...new Set(raw.covers.map((c) => String(c).trim()).filter(Boolean))]
			: [],
		features: Array.isArray(raw.features)
			? raw.features.map((f) => String(f).trim()).filter(Boolean)
			: [],
		resume_bullet: String(
			raw.resume_bullet ||
				`Desenvolvi ${title.charAt(0).toLowerCase()}${title.slice(1)}${Array.isArray(raw.stack) && raw.stack.length ? `, utilizando ${raw.stack.slice(0, 5).join(", ")}` : ""}.`,
		),
		difficulty: String(raw.difficulty || "Intermediário"),
		weeks: Number(raw.weeks) || 3,
		version: Math.max(1, Number(raw.version) || 1),
		origin: raw.origin || extra.origin || "catalogo",
		improved_note: raw.improved_note ? String(raw.improved_note) : "",
		created_at: raw.created_at || now,
		updated_at: raw.updated_at || now,
		...extra,
	};
}

export function readIdeasCache(root = process.cwd()) {
	const filePath = path.join(root, "data", "project-ideas-cache.json");
	try {
		if (!fs.existsSync(filePath)) return null;
		const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
		if (!data || !Array.isArray(data.ideas)) return null;
		return data;
	} catch {
		return null;
	}
}

export function writeIdeasCache(root = process.cwd(), payload = {}) {
	const filePath = path.join(root, "data", "project-ideas-cache.json");
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
	return filePath;
}

// Catálogo curado (4 projetos flagship 2026/2027 + setores-alvo: saúde, educação e tech).
// "techs" usa os nomes canônicos de lib/skill-gap.mjs.
export const CATALOG = [
	{
		title: "AI Knowledge Platform (SaaS RAG, AI Agents & Multi-tenant)",
		sector: "tech",
		flagship: true,
		problem:
			"Empresas precisam cadastrar documentos internos (PDF/DOCX) e fazer perguntas com IA de forma confiável, auditável e com controle de acesso — indo muito além de um chatbot simples.",
		techs: [
			"React",
			"TypeScript",
			"Node.js",
			"Python",
			"PostgreSQL",
			"Redis",
			"AWS",
			"Docker",
			"LLMs / IA generativa",
			"RAG / Vector DB",
			"MCP / AI Agents",
			"Segurança",
			"Testes automatizados",
			"System Design",
		],
		features: [
			"Upload e pipeline de extração, chunking e embeddings de PDF/DOCX com armazenamento no AWS S3 e pgvector",
			"RAG com citação obrigatória das fontes utilizadas e prevenção de alucinações",
			"Agentes (MCP/tool-calling) executando ferramentas autorizadas com controle de acesso por empresa e usuário (RBAC)",
			"Histórico de conversas, suíte de avaliação de respostas (evals), controle de custos e testes automatizados",
		],
		weeks: 4,
		difficulty: "Avançado",
	},
	{
		title: "SaaS de Integração e Automação Empresarial (estilo mini-n8n)",
		sector: "tech",
		flagship: true,
		problem:
			"Times operacionais conectam APIs e webhooks manualmente; demonstrar arquitetura backend distribuída com filas, retries e isolamento multi-tenant resolve uma dor real de mercado.",
		techs: [
			"React",
			"Node.js",
			"TypeScript",
			"PostgreSQL",
			"Redis",
			"AWS",
			"AWS SQS/SNS",
			"Docker",
			"REST APIs",
			"Event-driven",
			"Clean Architecture",
			"System Design",
			"Segurança",
			"Testes automatizados",
		],
		features: [
			"Conexão com APIs externas, recebimento de webhooks e fluxos condicionais por etapas",
			"Filas assíncronas (Redis/BullMQ ou AWS SQS) com retry exponencial, idempotência e dead-letter queue",
			"Logs estruturados, histórico de execução, alertas de falha e autenticação com isolamento multi-tenant",
			"Clean Architecture, testes unitários/integração/E2E e deploy containerizado na AWS",
		],
		weeks: 4,
		difficulty: "Avançado",
	},
	{
		title:
			"Cloud Infrastructure & Platform Engineering (AWS EKS, Terraform e GitOps)",
		sector: "tech",
		flagship: true,
		problem:
			"Mostrar na prática que você sabe operar em produção o que desenvolve — combinando IaC, Kubernetes, observabilidade e segurança sem inflar experiência.",
		techs: [
			"AWS",
			"Kubernetes",
			"Terraform",
			"ArgoCD",
			"GitHub Actions",
			"CI/CD",
			"Docker",
			"Observabilidade",
			"Segurança",
		],
		features: [
			"Infraestrutura provisionada 100% em Terraform na AWS (EKS, RDS, S3, SQS e IAM com menor privilégio)",
			"Esteira CI/CD no GitHub Actions com scan de vulnerabilidades (DevSecOps) e GitOps com ArgoCD",
			"Observabilidade ponta a ponta com OpenTelemetry, Prometheus e Grafana (logs, métricas e tracing)",
			"Alarmes de SLO, análise de custos (FinOps) e documentação arquitetural completa",
		],
		weeks: 4,
		difficulty: "Avançado",
	},
	{
		title:
			"AI Career Studio (Evolução para Plataforma SaaS de Inteligência de Carreira)",
		sector: "tech",
		flagship: true,
		problem:
			"Evoluir o próprio gerador ATS para um produto real de engenharia de IA e dados, útil na busca por vagas e excelente para demonstrar produto e arquitetura em entrevistas.",
		techs: [
			"React",
			"TypeScript",
			"Node.js",
			"PostgreSQL",
			"AWS",
			"Docker",
			"CI/CD",
			"LLMs / IA generativa",
			"REST APIs",
			"Testes automatizados",
			"Observabilidade",
			"System Design",
		],
		features: [
			"Coleta/classificação automatizada de vagas + matching estruturado por requisitos, senioridade e localização",
			"Extração estruturada de requisitos com LLM e adaptação de currículo com validação contra o histórico real",
			"Histórico de versões de currículo por candidatura e analytics de conversão por versão e mercado",
			"Preparação e simulador de entrevistas com IA avaliando clareza, profundidade técnica e inglês",
		],
		weeks: 4,
		difficulty: "Avançado",
	},
	{
		title:
			"API de prontuário interoperável (FHIR) com trilha de auditoria LGPD",
		sector: "saude",
		problem:
			"Clínicas pequenas não conseguem trocar dados de pacientes com hospitais e laboratórios de forma padronizada e auditável.",
		techs: [
			"Node.js",
			"TypeScript",
			"NestJS",
			"PostgreSQL",
			"HL7/FHIR (saúde)",
			"LGPD/HIPAA",
			"Testes automatizados",
			"Docker",
			"REST APIs",
		],
		features: [
			"Recursos FHIR Patient/Encounter/Observation",
			"Consentimento do paciente e log de acesso imutável",
			"Anonimização para exportação",
			"Testes de contrato + cobertura > 80%",
		],
		weeks: 4,
		difficulty: "Intermediário",
	},
	{
		title:
			"Agendamento clínico orientado a eventos com lembretes e fila de espera",
		sector: "saude",
		problem:
			"Faltas em consultas custam caro; a clínica precisa reaproveitar horários vagos automaticamente.",
		techs: [
			"Java",
			"Spring Boot",
			"Kafka",
			"PostgreSQL",
			"Redis",
			"Event-driven",
			"Docker",
			"Testes automatizados",
			"Observabilidade",
		],
		features: [
			"Reserva com lock otimista (sem overbooking)",
			"Eventos de cancelamento disparam oferta para a fila",
			"Lembretes via WhatsApp/e-mail (mock)",
			"Dashboards Grafana de ocupação",
		],
		weeks: 5,
		difficulty: "Avançado",
	},
	{
		title: "Assistente de protocolos clínicos com RAG (IA generativa)",
		sector: "saude",
		problem:
			"Profissionais perdem tempo procurando a conduta certa em protocolos extensos do Ministério da Saúde.",
		techs: [
			"Python",
			"FastAPI",
			"LLMs / IA generativa",
			"PostgreSQL",
			"Docker",
			"Observabilidade",
			"LGPD/HIPAA",
			"Testes automatizados",
		],
		features: [
			"Ingestão de PDFs públicos e busca vetorial (pgvector)",
			"Respostas com citação da fonte",
			"Avaliação automática de qualidade das respostas",
			"Nenhum dado de paciente enviado ao LLM",
		],
		weeks: 3,
		difficulty: "Intermediário",
	},
	{
		title: "Pipeline de dados de saúde pública (DATASUS) no Databricks",
		sector: "saude",
		problem:
			"Gestores precisam de indicadores de internações e leitos atualizados, mas os dados brutos são difíceis de usar.",
		techs: ["Databricks", "Spark", "Python", "SQL", "Airflow", "dbt"],
		features: [
			"Ingestão incremental (camadas bronze/prata/ouro)",
			"Modelos dbt testados",
			"Orquestração diária",
			"Painel de ocupação por região",
		],
		weeks: 3,
		difficulty: "Intermediário",
	},
	{
		title: "Tutor de IA integrado ao Moodle via LTI 1.3",
		sector: "edtech",
		problem:
			"Alunos de EAD ficam sem resposta fora do horário do tutor; a instituição precisa de suporte escalável.",
		techs: [
			"Next.js",
			"TypeScript",
			"Node.js",
			"LMS/Moodle",
			"LLMs / IA generativa",
			"PostgreSQL",
			"Testes automatizados",
		],
		features: [
			"Launch LTI 1.3 dentro do curso",
			"Respostas baseadas no material da disciplina",
			"Relatório de dúvidas frequentes para o professor",
			"Limites de uso por aluno",
		],
		weeks: 4,
		difficulty: "Avançado",
	},
	{
		title: "Analytics de engajamento de alunos (plugin Moodle + BigQuery)",
		sector: "edtech",
		problem:
			"Coordenações descobrem a evasão tarde demais; faltam alertas de alunos em risco.",
		techs: ["PHP", "LMS/Moodle", "BigQuery", "Python", "SQL", "Airflow"],
		features: [
			"Plugin que exporta eventos de log",
			"Modelo simples de risco de evasão",
			"Alertas semanais por e-mail",
			"Dashboard por turma",
		],
		weeks: 3,
		difficulty: "Intermediário",
	},
	{
		title: "Busca inteligente de cursos com Elasticsearch",
		sector: "edtech",
		problem:
			"Catálogos grandes de cursos têm busca ruim (sem sinônimos, sem tolerância a erro de digitação).",
		techs: [
			"Elasticsearch",
			"Node.js",
			"React",
			"TypeScript",
			"Docker",
			"Testes automatizados",
		],
		features: [
			"Sinônimos e correção ortográfica",
			"Facetas (área, carga horária, preço)",
			"Indexação via fila",
			"Testes de relevância",
		],
		weeks: 2,
		difficulty: "Intermediário",
	},
	{
		title: "Simulador de pagamentos PIX com DDD e mensageria",
		sector: "tech",
		problem:
			"Demonstrar domínio de sistemas financeiros: idempotência, consistência e alto volume.",
		techs: [
			"Java",
			"Spring Boot",
			"Kafka",
			"PostgreSQL",
			"Redis",
			"Pagamentos",
			"DDD",
			"Event-driven",
			"Testes automatizados",
			"Observabilidade",
		],
		features: [
			"Chaves PIX e QR Code",
			"Idempotência e saga para estornos",
			"Teste de carga (k6) com métricas",
			"Arquitetura hexagonal documentada",
		],
		weeks: 5,
		difficulty: "Avançado",
	},
	{
		title: "Microsserviço .NET na Azure (AKS) com infraestrutura em Terraform",
		sector: "tech",
		problem:
			"Muitas vagas pedem .NET + Azure; o projeto mostra o ciclo completo do código à produção.",
		techs: [
			"C#/.NET",
			"Azure",
			"Kubernetes",
			"Terraform",
			"CI/CD",
			"Observabilidade",
			"Docker",
		],
		features: [
			"API minimal com testes",
			"AKS provisionado via Terraform",
			"Pipeline com deploy blue/green",
			"Application Insights + alertas",
		],
		weeks: 3,
		difficulty: "Intermediário",
	},
	{
		title: "Plataforma GitOps no GCP (GKE + ArgoCD + Helm)",
		sector: "tech",
		problem:
			"Times precisam de deploy padronizado e reversível; o projeto mostra uma plataforma interna mínima.",
		techs: [
			"GCP",
			"Kubernetes",
			"Terraform",
			"Helm",
			"ArgoCD",
			"CI/CD",
			"Observabilidade",
		],
		features: [
			"Ambientes dev/prod com Terraform",
			"Charts Helm versionados",
			"Rollback automático por SLO",
			"Custos monitorados (FinOps)",
		],
		weeks: 3,
		difficulty: "Avançado",
	},
	{
		title: "Painel administrativo em Angular para gestão de convênios",
		sector: "saude",
		problem:
			"Equipes administrativas de clínicas controlam convênios e guias em planilhas.",
		techs: [
			"Angular",
			"TypeScript",
			"Java",
			"Spring Boot",
			"PostgreSQL",
			"Testes automatizados",
		],
		features: [
			"CRUD com formulários reativos",
			"Upload e validação de guias (TISS)",
			"Permissões por perfil",
			"Testes e2e com Playwright",
		],
		weeks: 3,
		difficulty: "Intermediário",
	},
	{
		title: "App de acompanhamento de pacientes crônicos (React Native)",
		sector: "saude",
		problem:
			"Pacientes crônicos esquecem medições e remédios; o médico não vê a evolução entre consultas.",
		techs: [
			"React Native",
			"TypeScript",
			"Node.js",
			"Supabase",
			"LGPD/HIPAA",
			"Testes automatizados",
		],
		features: [
			"Registro offline com sincronização",
			"Lembretes de medicação",
			"Gráfico de evolução para o médico",
			"Consentimento e exclusão de dados (LGPD)",
		],
		weeks: 4,
		difficulty: "Intermediário",
	},
];

const SECTOR_LABEL = {
	saude: "Saúde / Hospitalar",
	edtech: "EdTech / Educação",
	tech: "Tech geral",
};

// Camadas de evolução determinística (usadas ao melhorar uma ideia sem IA ou quando a IA falha)
const EVOLUTION_UPGRADES = [
	{
		key: "observabilidade",
		re: /opentelemetry|prometheus|grafana|observabil|slo|telemetria/i,
		stackAdd: ["Observabilidade", "OpenTelemetry"],
		feature:
			"Instrumentação com OpenTelemetry (traces, métricas e logs estruturados) + painel Grafana com alertas de SLO",
		note: "Adicionada camada de Observabilidade (OpenTelemetry + Grafana + SLOs) para elevar maturidade de produção.",
	},
	{
		key: "testes",
		re: /playwright|k6|contrato|carga|e2e|cobertura/i,
		stackAdd: ["Testes automatizados", "Playwright"],
		feature:
			"Suíte de testes automatizados (integração, E2E com Playwright e teste de carga k6) bloqueando merge via CI",
		note: "Adicionada estratégia completa de qualidade (testes de integração, E2E e carga no CI).",
	},
	{
		key: "seguranca",
		re: /owasp|rbac|rate limit|auditoria|jwt|seguran/i,
		stackAdd: ["Segurança"],
		feature:
			"Hardening de segurança (RBAC/JWT, rate limiting, validação de payload, headers OWASP e trilha de auditoria)",
		note: "Adicionada camada de Segurança de APIs (RBAC, rate limiting, checklist OWASP e auditoria).",
	},
	{
		key: "resiliencia",
		re: /redis|dlq|dead-letter|idempot|retry|circuit breaker|cache/i,
		stackAdd: ["Redis", "AWS SQS/SNS"],
		feature:
			"Resiliência em produção com cache Redis, processamento assíncrono com retry/DLQ e chaves de idempotência",
		note: "Adicionada arquitetura resiliente (cache Redis, filas com retry/DLQ e idempotência).",
	},
	{
		key: "iac",
		re: /terraform|blue\/green|canary|github actions|zero-downtime/i,
		stackAdd: ["Terraform", "GitHub Actions", "Docker"],
		feature:
			"Infraestrutura versionada com Terraform + pipeline GitHub Actions com scan de vulnerabilidades e deploy zero-downtime",
		note: "Adicionada automação de Infraestrutura como Código (Terraform) e CI/CD com segurança.",
	},
	{
		key: "adr",
		re: /\badr\b|architecture decision|diagrama|c4 model|trade-off/i,
		stackAdd: ["System Design"],
		feature:
			"Documentação de System Design (diagrama C4, ADRs de trade-offs técnicos e guia de execução em 1 comando)",
		note: "Adicionada documentação de System Design (ADRs e diagrama C4) para defesa técnica em entrevistas.",
	},
];

function gapWeights(analysis) {
	const w = {};
	(analysis.missing || []).forEach((s) => (w[s.tech] = s.jobs * 1.5)); // falta no CV: peso maior
	(analysis.unproven || []).forEach((s) => (w[s.tech] = s.jobs)); // no CV mas sem projeto que comprove
	return w;
}

function buildExcludedSet(excludeTitles = []) {
	return new Set((excludeTitles || []).map((t) => ideaId(t)).filter(Boolean));
}

// Stack central recomendada (evita dispersar em 10 stacks paralelas fora do foco Full Stack + Backend + AI + Cloud)
export const CORE_STACK = new Set([
	"TypeScript",
	"Node.js",
	"React",
	"Python",
	"PostgreSQL",
	"Redis",
	"AWS",
	"Docker",
	"Kubernetes",
	"Terraform",
	"LLMs / IA generativa",
	"RAG / Vector DB",
]);

// Ranqueia o catálogo pela demanda das lacunas que cada ideia cobre, excluindo títulos já existentes.
export function rankCatalog(analysis, limit = 6, { excludeTitles = [] } = {}) {
	const w = gapWeights(analysis);
	const excluded = buildExcludedSet(excludeTitles);

	const demandByTech = Object.fromEntries(
		(analysis.top_demand || []).map((s) => [s.tech, s.jobs]),
	);

	const scored = CATALOG.filter(
		(idea) => !excluded.has(ideaId(idea.title)),
	).map((idea) => {
		const covers = idea.techs.filter((t) => w[t]);
		const coreMatches = idea.techs.filter((t) => CORE_STACK.has(t)).length;
		const coreBoost = idea.flagship ? 1.5 : coreMatches >= 3 ? 1.2 : 1;
		const sectorBoost = idea.sector === "tech" ? 1 : 1.15;
		// Para projetos flagship no backlog real (>= 20 vagas), soma demanda de mercado do núcleo (TypeScript/Node/React/Python/AWS/K8s/Terraform/AI)
		const flagshipMarketBonus =
			idea.flagship && (analysis.jobs_analyzed || 0) >= 20
				? idea.techs
						.filter((t) => CORE_STACK.has(t))
						.reduce((sum, t) => sum + (demandByTech[t] || 0) * 0.45, 0)
				: 0;
		const score =
			(covers.reduce((sum, t) => sum + w[t], 0) + flagshipMarketBonus) *
			sectorBoost *
			coreBoost;
		return { ...idea, covers, score };
	});

	// Prefere ideias que cobrem lacunas (e projetos flagship no backlog real); se sobrarem poucas após exclusões, usa o restante.
	const isRealBacklog = (analysis.jobs_analyzed || 0) >= 20;
	const matching = scored
		.filter((i) => i.covers.length || (i.flagship && isRealBacklog))
		.sort((a, b) => b.score - a.score);
	const chosen = matching.length
		? matching.slice(0, limit)
		: scored.slice(0, limit);

	return chosen.map((i) =>
		normalizeIdea(
			{
				title: i.title,
				sector: SECTOR_LABEL[i.sector] || "Tech geral",
				problem: i.problem,
				stack: i.techs,
				covers: i.covers.length ? i.covers : i.techs.slice(0, 4),
				features: i.features,
				resume_bullet: `Desenvolvi ${i.title.charAt(0).toLowerCase()}${i.title.slice(1)}, utilizando ${i.techs.slice(0, 5).join(", ")}.`,
				difficulty: i.difficulty,
				weeks: i.weeks,
			},
			{ origin: "catalogo" },
		),
	);
}

const IDEAS_SYSTEM = `
Você é mentor(a) de carreira para pessoas desenvolvedoras e tech recruiter sênior.
Gere ideias de PROJETOS PESSOAIS (portfólio) que comprovem, na prática, as tecnologias que o mercado está pedindo e que a pessoa ainda não comprova.

Regras:
- Cada ideia resolve um problema REAL e específico (nada de "to-do list" ou "clone da Netflix").
- Priorize os setores-alvo da pessoa (saúde/hospitais, educação/EdTech e engenharia 2027) quando fizer sentido, sem forçar.
- Cada ideia deve cobrir várias lacunas ao mesmo tempo, priorizando as mais pedidas.
- NUNCA repita nem gere variações parecidas de projetos que a pessoa já tem ou de ideias que já estão na lista.
- Escopo realista para 2 a 5 semanas de dedicação parcial; inclua o que torna o projeto convincente para recrutadores (arquitetura, testes, segurança, deploy, observabilidade, README com decisões técnicas).
- "covers" deve conter apenas nomes que aparecem nas listas de lacunas fornecidas.
- Escreva em português do Brasil.

Formato de saída: EXCLUSIVAMENTE JSON:
{"ideas":[{"title":"","sector":"Saúde / Hospitalar | EdTech / Educação | Tech geral","problem":"","stack":[""],"covers":[""],"features":[""],"resume_bullet":"bullet de currículo em PRIMEIRA PESSOA no pretérito (ex.: 'Desenvolvi...', 'Implementei...'), sem inventar métricas","difficulty":"Iniciante | Intermediário | Avançado","weeks":3}]}
`;

const IMPROVE_SYSTEM = `
Você é mentor(a) de engenharia de software (Staff Engineer / Tech Recruiter) focado no mercado de 2027.
Sua tarefa é EVOLUIR uma ideia de projeto de portfólio já existente, elevando seu nível técnico (System Design, resiliência, segurança, observabilidade, testes automatizados, CI/CD, IA aplicada ou cobertura de lacunas de alta demanda nas vagas atuais), mantendo o escopo realista (2 a 5 semanas).

Regras:
- Mantenha a essência/domínio da ideia original, mas refine problema, stack, entregas ("features") e o bullet de currículo.
- Adicione pelo menos 1 melhoria arquitetural ou de engenharia concreta que torne o projeto excelente para defender em entrevistas técnicas.
- Preencha "improved_note" com 1 frase curta e objetiva explicando o que evoluiu nesta versão.
- Não invente métricas falsas no "resume_bullet".
- Escreva em português do Brasil.

Formato de saída: EXCLUSIVAMENTE JSON:
{"idea":{"title":"","sector":"Saúde / Hospitalar | EdTech / Educação | Tech geral","problem":"","stack":[""],"covers":[""],"features":[""],"resume_bullet":"","difficulty":"Iniciante | Intermediário | Avançado","weeks":4,"improved_note":""}}
`;

export async function generateProjectIdeas({
	analysis,
	resume,
	apiKey,
	count = 3,
	excludeTitles = [],
	deadlineMs = 45000,
}) {
	const existingProjects = [
		...(resume?.projects || []),
		...(resume?.portfolio_projects || []),
	].map((p) => p.title);
	const allExcluded = [
		...new Set([...excludeTitles, ...existingProjects].filter(Boolean)),
	];
	const excludedSet = buildExcludedSet(allExcluded);

	const fallback = () => ({
		generated_by: "catalogo",
		ideas: rankCatalog(analysis, count, { excludeTitles: allExcluded }),
	});
	if (!apiKey) return fallback();

	const fmt = (list) =>
		(list || [])
			.map((s) => `- ${s.tech}: pedido em ${s.jobs} vagas (${s.pct}%)`)
			.join("\n") || "- (nenhuma)";
	const prompt = `
VAGAS ANALISADAS: ${analysis.jobs_analyzed}

TECNOLOGIAS PEDIDAS QUE FALTAM NO CURRÍCULO:
${fmt(analysis.missing)}

TECNOLOGIAS QUE ESTÃO NO CURRÍCULO, MAS NENHUM PROJETO COMPROVA:
${fmt(analysis.unproven)}

JÁ COMPROVADAS POR PROJETOS: ${(analysis.proven || []).join(", ") || "(nenhuma)"}

PROJETOS QUE A PESSOA JÁ TEM NO PORTFÓLIO (NÃO REPETIR):
${existingProjects.join(" | ") || "(nenhum)"}

IDEIAS QUE JÁ EXISTEM NA LISTA (NÃO REPETIR NEM CRIAR VARIAÇÕES PARECIDAS):
${(excludeTitles || []).join(" | ") || "(nenhuma)"}

CARGO ATUAL: ${resume?.title || ""}
SETORES-ALVO: ${(resume?.work_preference?.target_sectors || ["Saúde", "EdTech", "Tech"]).join(", ")}

Gere ${count} ideias NOVAS e diferentes de todas as listadas acima.`;

	try {
		const out = await generateJson({
			apiKey,
			system: IDEAS_SYSTEM,
			prompt,
			deadlineMs,
		});
		const rawIdeas = Array.isArray(out.ideas)
			? out.ideas.filter((i) => i && i.title)
			: [];
		const fresh = rawIdeas
			.filter((i) => !excludedSet.has(ideaId(i.title)))
			.slice(0, count)
			.map((i) => normalizeIdea(i, { origin: "ia" }));
		if (!fresh.length) return fallback();
		return { generated_by: "ia", ideas: fresh };
	} catch (err) {
		return {
			...fallback(),
			warning: `IA indisponível, usando catálogo: ${err.message}`,
		};
	}
}

export async function improveProjectIdea({
	idea,
	analysis,
	resume,
	apiKey,
	deadlineMs = 45000,
}) {
	const base = normalizeIdea(idea);
	const nextVersion = (base.version || 1) + 1;
	const now = new Date().toISOString();

	const deterministicImprove = (warning) => {
		const haystack = `${base.title} ${base.problem} ${base.stack.join(" ")} ${base.features.join(" ")}`;
		const nextUpgrade =
			EVOLUTION_UPGRADES.find((u) => !u.re.test(haystack)) ||
			EVOLUTION_UPGRADES[(nextVersion - 2) % EVOLUTION_UPGRADES.length];

		// Incorpora também até 1 lacuna real de alta demanda que ainda não está nos covers da ideia
		const extraGap = [
			...(analysis?.missing || []),
			...(analysis?.unproven || []),
		].find(
			(g) => !base.covers.includes(g.tech) && !base.stack.includes(g.tech),
		);

		const nextStack = [
			...new Set([
				...base.stack,
				...nextUpgrade.stackAdd,
				...(extraGap ? [extraGap.tech] : []),
			]),
		];
		const nextCovers = [
			...new Set([...base.covers, ...(extraGap ? [extraGap.tech] : [])]),
		];
		const nextFeatures = [...base.features];
		if (!nextFeatures.includes(nextUpgrade.feature))
			nextFeatures.push(nextUpgrade.feature);
		if (extraGap && nextFeatures.length < 6) {
			nextFeatures.push(
				`Integração prática com ${extraGap.tech} documentada no README para cobrir lacuna de mercado`,
			);
		}

		const improved = normalizeIdea(
			{
				...base,
				stack: nextStack,
				covers: nextCovers,
				features: nextFeatures,
				difficulty: nextVersion >= 2 ? "Avançado" : base.difficulty,
				weeks: Math.min(
					5,
					Math.max(base.weeks || 3, 3) + (nextFeatures.length > 5 ? 1 : 0),
				),
				version: nextVersion,
				origin: "catalogo",
				improved_note: extraGap
					? `${nextUpgrade.note} Também adicionada cobertura para ${extraGap.tech}.`
					: nextUpgrade.note,
				updated_at: now,
			},
			{ id: base.id },
		);
		return warning
			? { generated_by: "catalogo", idea: improved, warning }
			: { generated_by: "catalogo", idea: improved };
	};

	if (!apiKey) return deterministicImprove();

	const fmt = (list) =>
		(list || [])
			.slice(0, 8)
			.map((s) => `- ${s.tech} (${s.jobs} vagas)`)
			.join("\n") || "- (nenhuma)";
	const prompt = `
IDEIA ATUAL (v${base.version}):
${JSON.stringify(
	{
		title: base.title,
		sector: base.sector,
		problem: base.problem,
		stack: base.stack,
		covers: base.covers,
		features: base.features,
		resume_bullet: base.resume_bullet,
		difficulty: base.difficulty,
		weeks: base.weeks,
	},
	null,
	2,
)}

LACUNAS ATUAIS NAS VAGAS:
Faltam no currículo:
${fmt(analysis?.missing)}

Sem comprovação em projetos:
${fmt(analysis?.unproven)}

CARGO ALVO: ${resume?.title || "Software Engineer | Full Stack Developer"}

Evolua esta ideia para a versão v${nextVersion}, deixando-a mais forte para processos seletivos de 2027.`;

	try {
		const out = await generateJson({
			apiKey,
			system: IMPROVE_SYSTEM,
			prompt,
			deadlineMs,
		});
		if (!out?.idea?.title) return deterministicImprove();
		const improved = normalizeIdea(
			{
				...base,
				...out.idea,
				id: base.id, // preserva o mesmo id para evoluir in-place na lista
				version: nextVersion,
				origin: "ia",
				created_at: base.created_at,
				updated_at: now,
				improved_note:
					out.idea.improved_note ||
					`Versão v${nextVersion} aprofundada com melhorias de arquitetura e engenharia.`,
			},
			{ id: base.id },
		);
		return { generated_by: "ia", idea: improved };
	} catch (err) {
		return deterministicImprove(
			`IA indisponível, melhoria aplicada pelo motor de engenharia: ${err.message}`,
		);
	}
}

/**
 * Evolui automaticamente a lista persistida de ideias (usado na atualização diária e no bootstrap):
 * - Completa até `targetCount` ideias inéditas se a lista ainda estiver pequena;
 * - Depois alterna: cria 1 nova ideia diferente das existentes (até `maxIdeas`) ou melhora a ideia mais antiga/menor versão.
 */
export async function evolveIdeasList({
	currentIdeas = [],
	analysis,
	resume,
	apiKey = null,
	targetCount = 6,
	maxIdeas = 12,
	deadlineMs = 45000,
}) {
	const list = (currentIdeas || []).map((i) => normalizeIdea(i));
	const excludeTitles = list.map((i) => i.title);
	let action = "bootstrap";
	let generatedBy = apiKey ? "ia" : "catalogo";

	if (list.length < targetCount) {
		const needed = targetCount - list.length;
		const res = await generateProjectIdeas({
			analysis,
			resume,
			apiKey,
			count: needed,
			excludeTitles,
			deadlineMs,
		});
		generatedBy = res.generated_by;
		const seen = new Set(list.map((i) => i.id));
		for (const item of res.ideas) {
			if (!seen.has(item.id)) {
				list.push(item);
				seen.add(item.id);
			}
		}
		return { ideas: list, action: "bootstrap", generated_by: generatedBy };
	}

	// Se ainda há espaço no backlog, tenta adicionar 1 ideia nova diferente; se esgotar o catálogo, melhora uma existente.
	if (list.length < maxIdeas) {
		const res = await generateProjectIdeas({
			analysis,
			resume,
			apiKey,
			count: 1,
			excludeTitles,
			deadlineMs,
		});
		generatedBy = res.generated_by;
		const fresh = (res.ideas || []).find(
			(i) => !list.some((x) => x.id === i.id),
		);
		if (fresh) {
			list.unshift(fresh);
			action = "added_new";
			return { ideas: list, action, generated_by: generatedBy };
		}
	}

	// Melhora a ideia com menor versão (e em empate, a atualizada há mais tempo)
	if (list.length) {
		let pickIdx = 0;
		for (let i = 1; i < list.length; i++) {
			const a = list[i];
			const b = list[pickIdx];
			if ((a.version || 1) < (b.version || 1)) pickIdx = i;
			else if (
				(a.version || 1) === (b.version || 1) &&
				String(a.updated_at || "") < String(b.updated_at || "")
			) {
				pickIdx = i;
			}
		}
		const res = await improveProjectIdea({
			idea: list[pickIdx],
			analysis,
			resume,
			apiKey,
			deadlineMs,
		});
		list[pickIdx] = res.idea;
		generatedBy = res.generated_by;
		action = "improved_existing";
	}

	return { ideas: list, action, generated_by: generatedBy };
}

// Handler compartilhado (Express e Vercel).
// GET: devolve imediatamente a lista persistida + análise atualizada (nunca vem vazia).
// POST: { action: "sync" | "new" | "improve", resume, customApiKey, useAi, existingTitles, idea, count }
export async function projectIdeasHandler(
	req,
	res,
	{ root = process.cwd(), persist = false } = {},
) {
	if (req.method !== "GET" && req.method !== "POST") {
		return res.status(405).json({ error: "Method Not Allowed" });
	}
	try {
		const body = req.method === "POST" ? req.body || {} : {};
		const cv =
			body.resume && typeof body.resume === "object"
				? body.resume
				: JSON.parse(
						fs.readFileSync(path.join(root, "data", "resume.json"), "utf8"),
					);
		const jobsCache = JSON.parse(
			fs.readFileSync(path.join(root, "data", "jobs-cache.json"), "utf8"),
		);
		const analysis = analyzeSkillGaps(jobsCache.jobs || [], cv);
		const cached = readIdeasCache(root);

		// GET ou POST action="sync": carrega a lista pronta imediatamente sem exigir clique do usuário
		if (req.method === "GET" || body.action === "sync") {
			let ideas = (cached?.ideas || []).map((i) => normalizeIdea(i));
			let generatedBy = cached?.generated_by || "catalogo";
			let updatedAt = cached?.updated_at || new Date().toISOString();

			if (!ideas.length) {
				ideas = rankCatalog(analysis, 6);
				generatedBy = "catalogo";
				if (persist) {
					writeIdeasCache(root, {
						updated_at: updatedAt,
						jobs_updated_at: jobsCache.formatted_date,
						generated_by: generatedBy,
						ideas,
					});
				}
			}
			return res.status(200).json({
				success: true,
				action: "sync",
				jobs_updated_at: jobsCache.formatted_date,
				updated_at: updatedAt,
				generated_by: generatedBy,
				analysis,
				ideas,
			});
		}

		const useAi = body.useAi !== false;
		const apiKey = useAi
			? body.customApiKey || process.env.GEMINI_API_KEY
			: null;

		// POST action="improve": evolui uma ideia específica já existente
		if (body.action === "improve") {
			if (!body.idea || !body.idea.title) {
				return res
					.status(400)
					.json({ error: "Ideia para melhorar não informada." });
			}
			const result = await improveProjectIdea({
				idea: body.idea,
				analysis,
				resume: cv,
				apiKey,
			});
			if (persist && cached) {
				const nextList = (cached.ideas || []).map((i) =>
					i.id === result.idea.id ? result.idea : i,
				);
				writeIdeasCache(root, {
					...cached,
					updated_at: new Date().toISOString(),
					ideas: nextList,
				});
			}
			return res.status(200).json({
				success: true,
				action: "improve",
				jobs_updated_at: jobsCache.formatted_date,
				updated_at: new Date().toISOString(),
				analysis,
				...result,
			});
		}

		// POST action="new" (ou padrão): gera ideias novas diferentes das existentes
		const count = Math.min(6, Math.max(1, Number(body.count) || 3));
		const existingTitles = Array.isArray(body.existingTitles)
			? body.existingTitles
			: [];
		const result = await generateProjectIdeas({
			analysis,
			resume: cv,
			apiKey,
			count,
			excludeTitles: existingTitles,
		});

		if (persist && result.ideas.length) {
			const baseList = (cached?.ideas || []).map((i) => normalizeIdea(i));
			const seen = new Set(baseList.map((i) => i.id));
			const merged = [
				...result.ideas.filter((i) => !seen.has(i.id)),
				...baseList,
			].slice(0, 18);
			writeIdeasCache(root, {
				updated_at: new Date().toISOString(),
				jobs_updated_at: jobsCache.formatted_date,
				generated_by: result.generated_by,
				ideas: merged,
			});
		}

		return res.status(200).json({
			success: true,
			action: "new",
			jobs_updated_at: jobsCache.formatted_date,
			updated_at: new Date().toISOString(),
			analysis,
			...result,
		});
	} catch (err) {
		return res
			.status(500)
			.json({ error: `Erro ao gerar ideias: ${err.message}` });
	}
}
