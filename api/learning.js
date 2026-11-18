import { learningHandler } from "../lib/learning.mjs";

export default function handler(req, res) {
  return learningHandler(req, res, { persist: false });
}
