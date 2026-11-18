import { learningBudgetHandler } from "../lib/learning.mjs";

export default function handler(req, res) {
  return learningBudgetHandler(req, res);
}
