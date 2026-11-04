// Utilitários de ambiente compartilhados.

// Na Vercel (serverless) o sistema de arquivos é somente leitura, exceto /tmp.
export const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Operações caras (refresh de vagas, sync do portfólio) exigem o CRON_SECRET quando ele está configurado.
// Sem CRON_SECRET (ex.: ambiente local), a operação é liberada.
export function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return !IS_SERVERLESS;
  const header = req.headers?.authorization || "";
  return header === `Bearer ${secret}`;
}
