import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const distHtml = path.resolve(process.cwd(), "dist", "cv.html");
const dataArg = process.argv[2];
const resumeDataPath = dataArg
  ? path.resolve(process.cwd(), dataArg)
  : (fs.existsSync(path.resolve(process.cwd(), "data", "resume.optimized.json"))
      ? path.resolve(process.cwd(), "data", "resume.optimized.json")
      : path.resolve(process.cwd(), "data", "resume.json"));

if (!fs.existsSync(distHtml)) {
  console.error("dist/cv.html não existe. Rode: npm run build");
  process.exit(1);
}

if (!fs.existsSync(resumeDataPath)) {
  console.error(`Arquivo não encontrado: ${resumeDataPath}`);
  process.exit(1);
}

const resumeData = JSON.parse(fs.readFileSync(resumeDataPath, "utf8"));
const language = resumeData.language || "en";

// Remove acentos para o nome do arquivo
const normalizedName = resumeData.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Converte ANA LETICIA ALVES CLAUDIANO para Ana Leticia Alves Claudiano
const formattedName = normalizedName
  .toLowerCase()
  .split(" ")
  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
  .join(" ");

const titleForFile = resumeData.title
  ? resumeData.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\/\\?%*:|"<>]/g, "-")
  : "Curriculo";

let pdfFilename = `${titleForFile} - ${formattedName}.pdf`;

const outPdf = path.resolve(process.cwd(), "dist", pdfFilename);
const genericPdf = path.resolve(process.cwd(), "dist", "cv.pdf");

const html = fs.readFileSync(distHtml, "utf8");
const baseUrl = `file://${path.dirname(distHtml)}/`;

const browser = await chromium.launch();
const page = await browser.newPage();

await page.setContent(html, { waitUntil: "load", baseURL: baseUrl });

await page.pdf({
  path: outPdf,
  format: "A4",
  printBackground: true,
  margin: { top: "0.28in", right: "0.35in", bottom: "0.28in", left: "0.35in" },
});

await browser.close();
fs.copyFileSync(outPdf, genericPdf);
console.log(`Gerado: dist/${pdfFilename}`);
console.log(`Copiado: dist/cv.pdf`);
