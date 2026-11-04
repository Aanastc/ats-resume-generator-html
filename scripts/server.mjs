// Servidor local (Express). Usa os mesmos módulos de lib/ que a API da Vercel.
import express from "express";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { runJobSync } from "./fetch-jobs.mjs";
import { runPortfolioSync } from "./sync-portfolio.mjs";
import { renderToHtml } from "../lib/render-files.mjs";
import { buildJobsResponse } from "../lib/jobs-filter.mjs";
import { optimizeResume } from "../lib/gemini.mjs";
import { talentHandler } from "../lib/talent.mjs";
import { projectIdeasHandler } from "../lib/project-ideas.mjs";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const root = process.cwd();

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(root, "web")));

const dataDir = path.join(root, "data");
const distDir = path.join(root, "dist");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

const EMPTY_RESUME = {
  name: "Seu Nome",
  title: "Seu Cargo",
  email: "seu.email@exemplo.com",
  phone_e164: "+5531999999999",
  phone_display: "(31) 99999-9999",
  location: "Belo Horizonte, MG",
  linkedin_url: "",
  github_url: "",
  website_url: "",
  summary: "",
  skills: [],
  projects: [],
  experience: [],
  education: [],
  languages: []
};

// Currículo base
app.get("/api/resume", (req, res) => {
  const resumePath = path.join(dataDir, "resume.json");
  const examplePath = path.join(dataDir, "resume.example.json");

  if (!fs.existsSync(resumePath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, resumePath);
  }
  if (fs.existsSync(resumePath)) {
    return res.json(JSON.parse(fs.readFileSync(resumePath, "utf8")));
  }
  return res.json(EMPTY_RESUME);
});

app.post("/api/resume", (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Currículo inválido." });
  }
  try {
    fs.writeFileSync(path.join(dataDir, "resume.json"), JSON.stringify(req.body, null, 2), "utf8");
    res.json({ success: true, message: "Currículo base salvo com sucesso." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vagas (cache diário; ?refresh=true coleta ao vivo — liberado localmente)
app.get("/api/jobs", async (req, res) => {
  const { search = "", limit = 30, refresh = "false" } = req.query || {};
  const cachePath = path.join(dataDir, "jobs-cache.json");

  try {
    const cacheData =
      refresh !== "true" && fs.existsSync(cachePath)
        ? JSON.parse(fs.readFileSync(cachePath, "utf8"))
        : await runJobSync({ persist: true });
    res.json(buildJobsResponse(cacheData, search, limit));
  } catch (err) {
    console.error("Erro ao carregar vagas:", err.message);
    res.status(500).json({ error: "Erro ao buscar vagas." });
  }
});

// Sincroniza o currículo com o portfólio
app.all("/api/sync-portfolio", async (req, res) => {
  try {
    res.json(await runPortfolioSync({ persist: true }));
  } catch (err) {
    console.error("Erro sync portfólio:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cadastros em sites de talentos (estado salvo em data/talent-status.json)
app.all("/api/talent", (req, res) => talentHandler(req, res, { persist: true, root }));

// Ideias de projetos a partir das lacunas entre vagas e currículo
app.post("/api/project-ideas", (req, res) => projectIdeasHandler(req, res, { root }));

// Otimização com Gemini
app.post("/api/optimize", async (req, res) => {
  const { resume, jobDescription, customApiKey } = req.body || {};
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({
      error: "Chave de API do Gemini (GEMINI_API_KEY) não encontrada. Configure-a no arquivo .env ou informe-a no painel."
    });
  }

  try {
    res.json(await optimizeResume({ resume, jobDescription, apiKey }));
  } catch (err) {
    res.status(err.status || 500).json({ error: `Erro na otimização da IA: ${err.message}` });
  }
});

// Renderiza o HTML em memória (sem arquivo temporário, sem processo filho)
app.post("/api/render", (req, res) => {
  try {
    res.type("html").send(renderToHtml(req.body || {}, root));
  } catch (err) {
    res.status(500).send(`Erro ao renderizar HTML: ${err.message}`);
  }
});

// Exporta PDF com Playwright (carregado sob demanda: é dependência só de desenvolvimento)
app.post("/api/export-pdf", async (req, res) => {
  let browser;
  try {
    const { chromium } = await import("playwright");
    const html = renderToHtml(req.body || {}, root);
    fs.writeFileSync(path.join(distDir, "cv.html"), html, "utf8");

    const outPdf = path.join(distDir, "cv.pdf");
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: outPdf,
      format: "A4",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" }
    });

    res.json({ success: true, path: outPdf });
  } catch (err) {
    res.status(500).json({ error: `Erro ao exportar PDF: ${err.message}` });
  } finally {
    await browser?.close();
  }
});

app.get("/api/download-pdf", (req, res) => {
  const pdfPath = path.join(distDir, "cv.pdf");
  if (!fs.existsSync(pdfPath)) {
    return res.status(404).send("Arquivo PDF não encontrado. Por favor, exporte o PDF primeiro.");
  }
  res.download(pdfPath, "cv.pdf");
});

app.listen(port, () => {
  console.log(`Servidor iniciado em http://localhost:${port}`);
});
