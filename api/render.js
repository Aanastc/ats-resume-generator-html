import fs from "node:fs";
import path from "node:path";
import { exportDocxHandler } from "../lib/docx.mjs";
import { renderResumeHtml } from "../lib/render.mjs";

export default function handler(req, res) {
  const fmt = String(req.query?.format || "").toLowerCase();
  const url = String(req.url || "");
  if (fmt === "docx" || url.includes("/export-docx")) {
    return exportDocxHandler(req, res);
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const root = process.cwd();
    const template = fs.readFileSync(path.join(root, "templates", "ats.html"), "utf8");
    const css = fs.readFileSync(path.join(root, "templates", "style.css"), "utf8");

    const html = renderResumeHtml(req.body || {}, { template, css });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (err) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(500).send(`Erro ao renderizar HTML: ${err.message}`);
  }
}
