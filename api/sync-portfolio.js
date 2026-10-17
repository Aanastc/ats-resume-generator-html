import { runPortfolioSync } from "../scripts/sync-portfolio.mjs";

export default async function handler(req, res) {
  // Allow GET or POST to trigger portfolio sync
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const result = await runPortfolioSync();
    return res.status(200).json(result);
  } catch (err) {
    console.error("Erro ao sincronizar com portfólio:", err);
    return res.status(500).json({
      success: false,
      error: `Erro ao sincronizar com o portfólio: ${err.message}`
    });
  }
}
