// Atualiza e evolui diariamente o backlog de ideias de projetos em data/project-ideas-cache.json.
// Cria novas ideias diferentes das existentes ou melhora uma ideia já cadastrada com base nas vagas do dia.
import fs from "node:fs";
import path from "node:path";
import { analyzeSkillGaps } from "../lib/skill-gap.mjs";
import { evolveIdeasList, readIdeasCache, writeIdeasCache } from "../lib/project-ideas.mjs";

const root = process.cwd();

export async function runProjectIdeasSync({ persist = true } = {}) {
  const resume = JSON.parse(fs.readFileSync(path.join(root, "data", "resume.json"), "utf8"));
  const jobsCache = JSON.parse(fs.readFileSync(path.join(root, "data", "jobs-cache.json"), "utf8"));
  const analysis = analyzeSkillGaps(jobsCache.jobs || [], resume);
  const previous = readIdeasCache(root);
  const apiKey = process.env.GEMINI_API_KEY || null;

  const evolved = await evolveIdeasList({
    currentIdeas: previous?.ideas || [],
    analysis,
    resume,
    apiKey,
    targetCount: 6,
    maxIdeas: 12
  });

  const payload = {
    updated_at: new Date().toISOString(),
    jobs_updated_at: jobsCache.formatted_date || "",
    last_action: evolved.action,
    generated_by: evolved.generated_by,
    ideas: evolved.ideas
  };

  if (persist) {
    writeIdeasCache(root, payload);
  }
  return payload;
}

if (process.argv[1] && process.argv[1].endsWith("fetch-project-ideas.mjs")) {
  runProjectIdeasSync()
    .then((res) => {
      console.log(
        `✅ Ideias atualizadas (${res.last_action} via ${res.generated_by}): ${res.ideas.length} ideias salvas em data/project-ideas-cache.json.`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Erro ao atualizar ideias de projetos:", err);
      process.exit(1);
    });
}
