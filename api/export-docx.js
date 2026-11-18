import { exportDocxHandler } from "../lib/docx.mjs";

export default function handler(req, res) {
  return exportDocxHandler(req, res);
}
