// Análise de lacunas: o que as vagas pedem x o que o currículo mostra (e comprova com projetos).

// Dicionário de tecnologias: nome canônico -> padrão de busca.
export const TECHS = {
  // Linguagens
  TypeScript: /\btypescript\b/i,
  JavaScript: /\bjavascript\b|\bes6\b/i,
  Python: /\bpython\b/i,
  Java: /\bjava\b(?!script)/i,
  Kotlin: /\bkotlin\b/i,
  // "Go" é palavra comum em inglês: só conta como linguagem em contextos inequívocos.
  Go: /\bgolang\b|\b(?:em|in|with|com|e|and) go\b(?![- ](?:to|live|beyond))|\bgo\s*[/,)]|\(go\)|\bgo (developer|engineer|pleno|s[eê]nior|sr|pl)\b/i,
  "C#/.NET": /\bc#|\.net\b|\bdotnet\b|asp\.net/i,
  PHP: /\bphp\b/i,
  Ruby: /\bruby\b|\brails\b/i,
  Rust: /\brust\b/i,
  Scala: /\bscala\b/i,
  Elixir: /\belixir\b/i,
  Swift: /\bswift\b/i,
  Dart: /\bdart\b/i,
  SQL: /\bsql\b/i,
  // Front-end / mobile
  React: /\breact(\.js|js)?\b(?! native)/i,
  "Next.js": /\bnext\.?js\b/i,
  Angular: /\bangular\b/i,
  "Vue.js": /\bvue(\.js|js)?\b/i,
  "React Native": /\breact native\b/i,
  Flutter: /\bflutter\b/i,
  "Tailwind CSS": /\btailwind/i,
  Storybook: /\bstorybook\b/i,
  // Back-end
  "Node.js": /\bnode(\.js|js)?\b/i,
  NestJS: /\bnest(\.js|js)?\b/i,
  Express: /\bexpress(\.js|js)?\b/i,
  FastAPI: /\bfastapi\b/i,
  Django: /\bdjango\b/i,
  Flask: /\bflask\b/i,
  "Spring Boot": /\bspring( boot)?\b/i,
  Laravel: /\blaravel\b/i,
  GraphQL: /\bgraphql\b/i,
  gRPC: /\bgrpc\b/i,
  "REST APIs": /\brest(ful)?\b|\bapis? rest/i,
  Microsserviços: /micro-?servi[cç]|microservices?/i,
  // Dados
  PostgreSQL: /\bpostgres(ql)?\b/i,
  MySQL: /\bmysql\b/i,
  MongoDB: /\bmongo(db)?\b/i,
  Redis: /\bredis\b/i,
  Elasticsearch: /\belastic(search)?\b|\bopensearch\b/i,
  Kafka: /\bkafka\b/i,
  RabbitMQ: /\brabbit ?mq\b/i,
  "AWS SQS/SNS": /\bsqs\b|\bsns\b/i,
  Databricks: /\bdatabricks\b/i,
  Spark: /\bspark\b/i,
  Airflow: /\bairflow\b/i,
  dbt: /\bdbt\b/i,
  BigQuery: /\bbigquery\b/i,
  Supabase: /\bsupabase\b/i,
  // Cloud & DevOps
  AWS: /\baws\b|amazon web services/i,
  GCP: /\bgcp\b|google cloud/i,
  Azure: /\bazure\b/i,
  Docker: /\bdocker\b|containers?\b/i,
  Kubernetes: /\bkubernetes\b|\bk8s\b|\beks\b|\bgke\b|\baks\b/i,
  Terraform: /\bterraform\b|infrastructure as code|\biac\b/i,
  "CI/CD": /\bci\s*\/\s*cd\b|continuous (integration|delivery)|github actions|gitlab ci|jenkins/i,
  "GitHub Actions": /github actions/i,
  ArgoCD: /\bargo ?cd\b|gitops/i,
  Helm: /\bhelm\b/i,
  Linux: /\blinux\b/i,
  Observabilidade: /observabil|prometheus|grafana|opentelemetry|datadog|new relic|\bslo\b/i,
  Serverless: /serverless|\blambda\b|cloud functions/i,
  // Qualidade & arquitetura
  "Testes automatizados": /\b(unit|integration|e2e) tests?|testes? (unit|automatizad|de integra)|\bjest\b|\bcypress\b|\bplaywright\b|\bpytest\b|\btdd\b/i,
  DDD: /\bddd\b|domain[- ]driven/i,
  "Clean Architecture": /clean architecture|arquitetura limpa|hexagonal/i,
  "Event-driven": /event[- ]driven|orientad[oa] a eventos|event sourcing|\bcqrs\b/i,
  Segurança: /\bowasp\b|devsecops|appsec|seguran[cç]a da informa|oauth|\bjwt\b|\bsso\b|keycloak/i,
  // IA
  "LLMs / IA generativa": /\bllms?\b|generative ai|ia generativa|genai|openai|gemini|anthropic|\brag\b|langchain|prompt engineering/i,
  "Machine Learning": /machine learning|\bml\b|mlops|pytorch|tensorflow|scikit/i,
  // Domínios-alvo
  "HL7/FHIR (saúde)": /\bfhir\b|\bhl7\b|interoperabilidade em sa[uú]de|\bdicom\b|\btiss\b/i,
  "LGPD/HIPAA": /\blgpd\b|\bhipaa\b|\bgdpr\b/i,
  "LMS/Moodle": /\bmoodle\b|\blms\b|\blti\b|\bscorm\b|canvas lms/i,
  Pagamentos: /\bpix\b|pagamentos?|payments?|stripe|adquir[eê]ncia/i
};

function resumeText(resume = {}) {
  const parts = [resume.title, resume.summary];
  (resume.skills || []).forEach((g) => parts.push(g.group, ...(g.items || [])));
  (resume.experience || []).forEach((e) => parts.push(e.role, ...(e.bullets || []), ...(e.stacks || [])));
  return parts.filter(Boolean).join(" \n ");
}

function projectsText(resume = {}) {
  return (resume.projects || [])
    .map((p) => [p.title, p.stack, ...(p.bullets || [])].filter(Boolean).join(" "))
    .join(" \n ");
}

/**
 * Para cada tecnologia: quantas vagas pedem, se aparece no currículo e se algum projeto a comprova.
 */
export function analyzeSkillGaps(jobs = [], resume = {}, { minJobs = 3, top = 25 } = {}) {
  const cvText = resumeText(resume);
  const projText = projectsText(resume);
  const total = jobs.length || 1;

  const stats = Object.entries(TECHS).map(([tech, re]) => {
    const matching = jobs.filter((j) => re.test(`${j.title} ${(j.tags || []).join(" ")} ${j.description || ""}`));
    const bySector = matching.reduce((acc, j) => ((acc[j.sector || "tech"] = (acc[j.sector || "tech"] || 0) + 1), acc), {});
    const inProjects = re.test(projText);
    const inResume = inProjects || re.test(cvText);
    return {
      tech,
      jobs: matching.length,
      pct: Math.round((matching.length / total) * 100),
      by_sector: bySector,
      in_resume: inResume,
      proven_by_project: inProjects,
      sample_jobs: matching.slice(0, 3).map((j) => `${j.title} — ${j.company}`)
    };
  });

  const demanded = stats.filter((s) => s.jobs >= minJobs).sort((a, b) => b.jobs - a.jobs);
  return {
    jobs_analyzed: jobs.length,
    top_demand: demanded.slice(0, top),
    missing: demanded.filter((s) => !s.in_resume).slice(0, 12),
    unproven: demanded.filter((s) => s.in_resume && !s.proven_by_project).slice(0, 12),
    proven: demanded.filter((s) => s.proven_by_project).map((s) => s.tech)
  };
}
