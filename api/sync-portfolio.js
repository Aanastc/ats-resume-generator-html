import { runPortfolioSync } from "../scripts/sync-portfolio.mjs";
import { IS_SERVERLESS } from "../lib/runtime.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // Na Vercel só montamos o currículo e devolvemos ao navegador (disco somente leitura).
    const result = await runPortfolioSync({ persist: !IS_SERVERLESS });
    return res.status(200).json(result);
  } catch (err) {
    console.error("Erro ao sincronizar com portfólio:", err);
    return res.status(500).json({
      success: false,
      error: `Erro ao sincronizar com o portfólio: ${err.message}`
    });
  }
}
