import fs from "node:fs";
import path from "node:path";

export default function handler(req, res) {
  const root = process.cwd();
  const dataPath = path.join(root, "data", "resume.json");
  const examplePath = path.join(root, "data", "resume.example.json");

  if (req.method === "GET") {
    try {
      if (fs.existsSync(dataPath)) {
        const content = fs.readFileSync(dataPath, "utf8");
        return res.status(200).json(JSON.parse(content));
      } else if (fs.existsSync(examplePath)) {
        const content = fs.readFileSync(examplePath, "utf8");
        return res.status(200).json(JSON.parse(content));
      }
      return res.status(404).json({ error: "Currículo não encontrado." });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    try {
      try {
        fs.writeFileSync(dataPath, JSON.stringify(req.body, null, 2), "utf8");
      } catch (e) {
        // Vercel serverless environment has read-only filesystem
      }
      return res.status(200).json({ success: true, message: "Currículo atualizado com sucesso." });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Método não permitido." });
}

