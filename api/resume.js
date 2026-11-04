import fs from "node:fs";
import path from "node:path";
import { IS_SERVERLESS } from "../lib/runtime.mjs";

export default function handler(req, res) {
  const root = process.cwd();
  const dataPath = path.join(root, "data", "resume.json");
  const examplePath = path.join(root, "data", "resume.example.json");

  if (req.method === "GET") {
    try {
      const source = fs.existsSync(dataPath) ? dataPath : fs.existsSync(examplePath) ? examplePath : null;
      if (!source) return res.status(404).json({ error: "Currículo não encontrado." });
      return res.status(200).json(JSON.parse(fs.readFileSync(source, "utf8")));
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    // Na Vercel o disco é somente leitura: avisamos o cliente em vez de fingir que salvou.
    // O front-end guarda o currículo no navegador quando recebe 501.
    if (IS_SERVERLESS) {
      return res.status(501).json({
        error: "Salvar no servidor não está disponível na versão online.",
        storage: "browser"
      });
    }
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "Currículo inválido." });
      }
      fs.writeFileSync(dataPath, JSON.stringify(req.body, null, 2), "utf8");
      return res.status(200).json({ success: true, message: "Currículo atualizado com sucesso." });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Método não permitido." });
}
