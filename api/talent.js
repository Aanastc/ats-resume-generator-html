import { talentHandler } from "../lib/talent.mjs";
import { IS_SERVERLESS } from "../lib/runtime.mjs";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return talentHandler(req, res, { persist: !IS_SERVERLESS });
}
