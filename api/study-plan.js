import { studyPlanHandler } from "../lib/learning.mjs";

export default function handler(req, res) {
  return studyPlanHandler(req, res);
}
