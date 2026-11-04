// Rastreador de cadastros em sites de talentos.
// Um cadastro fica "desatualizado" quando o portfólio muda depois da última vez
// que você atualizou o perfil naquele site.
//
// Armazenamento (sem banco de dados):
//  - local: data/talent-status.json (versionado no git => mesmo estado em qualquer computador)
//  - Vercel (disco somente leitura): o navegador guarda o estado (localStorage)
import fs from "node:fs";
import path from "node:path";
import { PORTFOLIO_REPO } from "../scripts/sync-portfolio.mjs";

const PORTFOLIO_CONTENT_PATH = "src/locales"; // onde ficam os textos do portfólio
let portfolioCache = { at: 0, value: null };

export function loadPlatforms(root = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(root, "data", "talent-platforms.json"), "utf8"));
}

export function loadStatus(root = process.cwd()) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "data", "talent-status.json"), "utf8"));
  } catch {
    return {};
  }
}

// Mantém só campos conhecidos e datas válidas (o corpo vem do navegador).
export function sanitizeStatus(input = {}, validIds = null) {
  const out = {};
  for (const [id, s] of Object.entries(input || {})) {
    if (!/^[a-z0-9-]{1,60}$/.test(id) || (validIds && !validIds.has(id)) || !s || typeof s !== "object") continue;
    const date = (v) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : null);
    out[id] = {
      registered: Boolean(s.registered),
      registered_at: date(s.registered_at),
      updated_at: date(s.updated_at),
      changed_at: date(s.changed_at),
      note: typeof s.note === "string" ? s.note.slice(0, 300) : ""
    };
  }
  return out;
}

export function saveStatus(status, root = process.cwd()) {
  fs.writeFileSync(path.join(root, "data", "talent-status.json"), JSON.stringify(status, null, 2) + "\n", "utf8");
}

// Data da última alteração de conteúdo do portfólio (último commit em src/locales).
export async function fetchPortfolioLastChange() {
  if (portfolioCache.value && Date.now() - portfolioCache.at < 10 * 60 * 1000) return portfolioCache.value;
  const headers = { "User-Agent": "ATS-Resume-Talent-Tracker", Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(
    `https://api.github.com/repos/${PORTFOLIO_REPO}/commits?path=${PORTFOLIO_CONTENT_PATH}&per_page=1`,
    { headers, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`);
  const [last] = await res.json();
  const value = last
    ? {
        last_change_at: last.commit?.committer?.date || last.commit?.author?.date,
        message: (last.commit?.message || "").split("\n")[0],
        url: last.html_url,
        repo: PORTFOLIO_REPO
      }
    : null;
  portfolioCache = { at: Date.now(), value };
  return value;
}

export function isOutdated(entry, portfolioChangedAt) {
  if (!entry?.registered || !portfolioChangedAt) return false;
  const updated = new Date(entry.updated_at || entry.registered_at || 0);
  return updated < new Date(portfolioChangedAt);
}

// Handler compartilhado (Express e Vercel têm a mesma API de req/res usada aqui).
export async function talentHandler(req, res, { persist, root = process.cwd() }) {
  if (req.method === "GET") {
    const data = loadPlatforms(root);
    let portfolio = null;
    let portfolio_error = null;
    try {
      portfolio = await fetchPortfolioLastChange();
    } catch (err) {
      portfolio_error = err.message;
    }
    return res.status(200).json({ ...data, status: loadStatus(root), portfolio, portfolio_error, persist });
  }

  if (req.method === "POST") {
    if (!persist) {
      return res.status(501).json({ error: "A versão online guarda os cadastros no navegador.", storage: "browser" });
    }
    const ids = new Set(loadPlatforms(root).platforms.map((p) => p.id));
    const status = sanitizeStatus(req.body?.status, ids);
    saveStatus(status, root);
    return res.status(200).json({ success: true, status });
  }

  return res.status(405).json({ error: "Método não permitido." });
}
