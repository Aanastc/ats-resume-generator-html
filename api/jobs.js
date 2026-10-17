export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { search = "hospitalar", limit = 15 } = req.query || {};
  const queryLower = search.toLowerCase();

  // Curated hospital & healthtech jobs for BH / Brasil / Remote PJ & CLT
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

  // If query is specifically for healthcare/hospital or BH
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

    // Merge curated healthcare/BH jobs with live remote results
    let combinedJobs = [];
    if (isHealthcare || isBH) {
      combinedJobs = [...hospitalarCuratedJobs, ...remoteJobs];
    } else {
      combinedJobs = remoteJobs.length ? remoteJobs : hospitalarCuratedJobs;
    }

    const finalJobs = combinedJobs.slice(0, Number(limit));
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    return res.status(200).json({ success: true, count: finalJobs.length, jobs: finalJobs });
  } catch (err) {
    console.error("Erro /api/jobs:", err.message);
    const fallback = isHealthcare || isBH ? hospitalarCuratedJobs : hospitalarCuratedJobs.slice(0, 3);
    return res.status(200).json({ success: true, count: fallback.length, jobs: fallback });
  }
}
