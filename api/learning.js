import { learningBudgetHandler, learningHandler, studyPlanHandler } from "../lib/learning.mjs";

export default function handler(req, res) {
  const ep = String(req.query?.endpoint || "").toLowerCase();
  const url = String(req.url || "");
  if (ep === "study-plan" || url.includes("/study-plan")) {
    return studyPlanHandler(req, res);
  }
  if (ep === "budget" || url.includes("/learning-budget")) {
    return learningBudgetHandler(req, res);
  }
  return learningHandler(req, res, { persist: false });
}
