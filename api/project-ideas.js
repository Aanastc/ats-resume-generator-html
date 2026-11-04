import { projectIdeasHandler } from "../lib/project-ideas.mjs";

export default function handler(req, res) {
  return projectIdeasHandler(req, res);
}
