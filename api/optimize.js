import { GoogleGenAI } from "@google/genai";

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

  if (!jobDescription || !jobDescription.trim()) {
    return res.status(400).json({ error: "Descrição da vaga não informada." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `
Você é um especialista em recrutamento técnico de elite, recolocação profissional e otimização de currículos para sistemas de triagem ATS (Applicant Tracking Systems) e para revisão humana por recrutadores técnicos (Tech Recruiters).
Sua tarefa é ler um currículo estruturado em JSON e a descrição de uma vaga de emprego, e então adaptar o currículo de forma personalizada para a vaga.

Siga rigorosamente as seguintes diretrizes:
1. Detecte se a vaga está em inglês ou português e adapte todo o conteúdo para esse idioma. Defina o campo "language" como "en" ou "pt".
2. NÃO use buzzwords ou adjetivos vazios (ex: "proativo", "motivado"). Foque em fatos e realizações técnicas.
3. Integre as palavras-chave da vaga de forma natural nas experiências e competências.
4. Comece cada bullet point com um verbo de ação forte no passado e quantifique resultados sempre que possível.
5. NÃO invente empresas, datas ou formações acadêmicas. Preserve os campos de contato e URLs.
6. O resultado deve ser EXCLUSIVAMENTE um objeto JSON válido no mesmo schema.
`;

    const userPrompt = `
CURRÍCULO BASE (JSON):
${JSON.stringify(resume, null, 2)}

DESCRIÇÃO DA VAGA:
${jobDescription}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Resposta da IA vazia.");
    }

    const tailoredJson = JSON.parse(text);
    return res.status(200).json(tailoredJson);
  } catch (err) {
    return res.status(500).json({ error: `Erro na otimização da IA: ${err.message}` });
  }
}

