// Handler compartilhado (Express e Vercel): POST { resume, pages?, jobDescription? }
import fs from "node:fs";
import path from "node:path";
import { scoreResume } from "./ats-score.mjs";
import { analyzeSkillGaps } from "./skill-gap.mjs";

let marketCache = { mtime: 0, techs: [] };

// Tecnologias mais pedidas nas vagas ativas (usadas quando nenhuma vaga foi colada).
function marketTechs(root) {
  try {
    const file = path.join(root, "data", "jobs-cache.json");
    const mtime = fs.statSync(file).mtimeMs;
    if (mtime !== marketCache.mtime) {
      const jobs = JSON.parse(fs.readFileSync(file, "utf8")).jobs || [];
      marketCache = { mtime, techs: analyzeSkillGaps(jobs, {}, { minJobs: 3, top: 15 }).top_demand.map((s) => s.tech) };
    }
    return marketCache.techs;
  } catch {
    return [];
  }
}

export function atsScoreHandler(req, res, { root = process.cwd() } = {}) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  const { resume, pages, jobDescription } = req.body || {};
  if (!resume || typeof resume !== "object") return res.status(400).json({ error: "Currículo não informado." });
  const n = Number(pages);
  const result = scoreResume(resume, {
    pages: Number.isFinite(n) && n > 0 ? Math.round(n) : null,
    jobDescription: String(jobDescription || "").slice(0, 20000),
    marketTechs: marketTechs(root)
  });
  return res.status(200).json(result);
}
