// CLI: otimiza data/resume.json para a vaga em data/job-description.txt
// Saída: data/resume.optimized.json + dist/cv.html
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { optimizeResume } from "../lib/gemini.mjs";
import { renderToDist } from "../lib/render-files.mjs";

dotenv.config();

const PLACEHOLDER = "Cole a descrição da vaga aqui.";
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

if (!fs.existsSync(jobPath)) {
  fs.writeFileSync(jobPath, PLACEHOLDER, "utf8");
  console.log("Preencha o arquivo data/job-description.txt com a vaga desejada e execute novamente.");
  process.exit(0);
}

const resume = JSON.parse(fs.readFileSync(resumePath, "utf8"));
const jobDescription = fs.readFileSync(jobPath, "utf8");

if (!jobDescription.trim() || jobDescription.trim() === PLACEHOLDER) {
  console.error("Erro: Adicione uma descrição de vaga válida em data/job-description.txt");
  process.exit(1);
}

try {
  console.log("Iniciando otimização com Gemini...");
  const tailored = await optimizeResume({ resume, jobDescription, apiKey });
  fs.writeFileSync(outputPath, JSON.stringify(tailored, null, 2), "utf8");
  console.log(`Currículo otimizado salvo em: ${path.relative(root, outputPath)}`);

  const htmlPath = renderToDist(tailored, root);
  console.log(`Gerado: ${path.relative(root, htmlPath)}`);
} catch (err) {
  console.error("Erro durante a otimização com Gemini:", err.message);
  process.exit(1);
}
