import { optimizeResume } from "../lib/gemini.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { resume, jobDescription, customApiKey } = req.body || {};
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({
      error: "Chave de API do Gemini não informada. Forneça a chave no painel ou configure GEMINI_API_KEY na Vercel."
    });
  }

  try {
    // Margem abaixo do maxDuration configurado no vercel.json (60s).
    const tailored = await optimizeResume({ resume, jobDescription, apiKey, deadlineMs: 45000 });
    return res.status(200).json(tailored);
  } catch (err) {
    return res.status(err.status || 500).json({ error: `Erro na otimização da IA: ${err.message}` });
  }
}
