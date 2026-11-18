import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import { buildResumeDocx } from "../lib/docx.mjs";

const sample = JSON.parse(fs.readFileSync("data/resume.json", "utf8"));

// Extrai arquivos de um ZIP gerado por buildResumeDocx para inspecionar o XML real.
function unzipEntries(buf) {
  const files = {};
  let offset = 0;
  while (offset + 30 <= buf.length && buf.readUInt32LE(offset) === 0x04034b50) {
    const compLen = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    const raw = zlib.inflateRawSync(buf.subarray(dataStart, dataStart + compLen));
    files[name] = raw.toString("utf8");
    offset = dataStart + compLen;
  }
  return files;
}

test("buildResumeDocx gera arquivo ZIP/OOXML válido com estrutura de 1 coluna e Arial", () => {
  const buf = buildResumeDocx(sample);
  assert.equal(buf.readUInt32LE(0), 0x04034b50, "Assinatura PK ZIP válida");
  const files = unzipEntries(buf);
  assert.ok(files["[Content_Types].xml"]);
  assert.ok(files["_rels/.rels"]);
  assert.ok(files["word/document.xml"]);
  assert.ok(files["word/_rels/document.xml.rels"]);
  assert.match(files["word/document.xml"], /Arial/);
  assert.match(files["word/document.xml"], /ANA LETÍCIA ALVES CLAUDIANO/);
  assert.doesNotMatch(files["word/document.xml"], />PROJETOS</, "Não deve incluir seção de projetos quando projects está vazio");
  assert.match(files["word/_rels/document.xml.rels"], /github\.com\/Aanastc/);
});

test("buildResumeDocx usa títulos ATS em inglês quando language = en e escapa caracteres XML", () => {
  const buf = buildResumeDocx({ ...sample, language: "en", summary: "APIs & Cloud <AWS>" });
  const files = unzipEntries(buf);
  assert.match(files["word/document.xml"], /PROFESSIONAL SUMMARY/);
  assert.match(files["word/document.xml"], /PROFESSIONAL EXPERIENCE/);
  assert.match(files["word/document.xml"], /APIs &amp; Cloud &lt;AWS&gt;/);
});
