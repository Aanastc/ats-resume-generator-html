import { atsScoreHandler } from "../lib/ats-handler.mjs";

export default function handler(req, res) {
  return atsScoreHandler(req, res);
}
