export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { search = "full stack", limit = 15 } = req.query || {};

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const query = encodeURIComponent(search);
    const remotiveUrl = `https://remotive.com/api/remote-jobs?category=software-dev&search=${query}`;

    const response = await fetch(remotiveUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ATS-Resume-Generator/1.0"
      }
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Remotive API respondeu com status ${response.status}`);
    }

    const data = await response.json();
    const rawJobs = data.jobs || [];

    // Format and sanitize job objects
    const jobs = rawJobs.slice(0, Number(limit)).map((j) => {
      // Strip html tags for plain description preview
      const plainDesc = (j.description || "")
        .replace(/<[^>]*>?/gm, " ")
        .replace(/\s+/g, " ")
        .trim();

      return {
        id: j.id,
        url: j.url,
        title: j.title,
        company: j.company_name,
        company_logo: j.company_logo,
        category: j.category,
        tags: j.tags || [],
        location: j.candidate_required_location || "Worldwide / Remote",
        salary: j.salary || "Não especificado",
        publication_date: j.publication_date,
        description: plainDesc,
        raw_description: j.description
      };
    });

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    return res.status(200).json({ success: true, count: jobs.length, jobs });
  } catch (err) {
    console.error("Erro ao buscar vagas:", err.message);

    // Fallback curated remote software jobs if external API fails
    const fallbackJobs = [
      {
        id: "fb-1",
        title: "Senior Full Stack Engineer (React, Node.js & Cloud)",
        company: "Vercel Partner Network",
        location: "Worldwide / LATAM Remote",
        salary: "$90,000 - $130,000 USD",
        tags: ["React", "Next.js", "Node.js", "TypeScript", "AWS", "Docker"],
        description: "We are seeking a Senior Full Stack Engineer with strong experience in React, Next.js, Node.js, and Cloud Infrastructure (AWS/Docker). You will lead core platform features, optimize CI/CD pipelines, and design resilient REST/GraphQL APIs.",
        url: "https://remotive.com"
      },
      {
        id: "fb-2",
        title: "DevOps & Platform Software Engineer",
        company: "CloudScale Systems",
        location: "USA & LATAM Timezones",
        salary: "$100,000 - $140,000 USD",
        tags: ["DevOps", "Docker", "Kubernetes", "AWS", "CI/CD", "Terraform", "Python"],
        description: "Join our platform team to automate deployment pipelines, implement Infrastructure as Code using Terraform, containerize microservices with Docker, and maintain 99.9% uptime on AWS infrastructure.",
        url: "https://remotive.com"
      },
      {
        id: "fb-3",
        title: "Senior Product Engineer (Full Stack & AI Systems)",
        company: "NextGen EdTech",
        location: "Remote (Global)",
        salary: "$95,000 - $135,000 USD",
        tags: ["Full Stack", "TypeScript", "Python", "FastAPI", "PostgreSQL", "LLM"],
        description: "Looking for a versatile Product Engineer to build modern web interfaces in React and backend services in Python/Node.js, integrating AI agent workflows and scalable database schemas in PostgreSQL.",
        url: "https://remotive.com"
      }
    ];

    return res.status(200).json({
      success: true,
      count: fallbackJobs.length,
      jobs: fallbackJobs,
      warning: "Usando feed de contingência devido a limite de taxa ou conectividade da API remota."
    });
  }
}
