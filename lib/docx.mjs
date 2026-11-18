// Gerador de currículo em formato Word (.docx / OOXML) 100% compatível com ATS
// (Gupy, Greenhouse, Lever, Workday): uma coluna, fonte Arial, sem imagens/caixas de texto,
// datas junto aos cargos, links clicáveis e zero dependências externas (usa apenas node:zlib).
import zlib from "node:zlib";

const L10N = {
  pt: {
    summary: "RESUMO",
    skills: "HABILIDADES",
    projects: "PROJETOS",
    experience: "EXPERIÊNCIA PROFISSIONAL",
    education: "FORMAÇÃO ACADÊMICA",
    languages: "IDIOMAS",
    stack: "Stack",
    website: "Portfólio"
  },
  en: {
    summary: "PROFESSIONAL SUMMARY",
    skills: "TECHNICAL SKILLS",
    projects: "PROJECTS",
    experience: "PROFESSIONAL EXPERIENCE",
    education: "EDUCATION",
    languages: "LANGUAGES",
    stack: "Tech Stack",
    website: "Portfolio"
  }
};

function xmlEscape(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeHref(url) {
  const value = String(url ?? "").trim();
  return /^(https?:|mailto:|tel:)/i.test(value) ? value : "";
}

function shortLink(url) {
  return String(url ?? "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

// Empacotador ZIP padrão (DEFLATE) em memória usando apenas node:zlib
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, content } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const compressed = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 flag
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, eocd]);
}

function runXml(text, { bold = false, italic = false, size = 20, color = "111111", underline = false } = {}) {
  const props = [
    `<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>`,
    bold ? "<w:b/>" : "",
    italic ? "<w:i/>" : "",
    underline ? `<w:u w:val="single"/>` : "",
    `<w:color w:val="${color}"/>`,
    `<w:sz w:val="${size}"/>`,
    `<w:szCs w:val="${size}"/>`
  ]
    .filter(Boolean)
    .join("");
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function paraXml(runs, { align = "left", before = 0, after = 60, line = 260, borderBottom = null, indentLeft = 0 } = {}) {
  const pPr = [
    align !== "left" ? `<w:jc w:val="${align}"/>` : "",
    borderBottom
      ? `<w:pBdr><w:bottom w:val="single" w:sz="${borderBottom.sz}" w:space="2" w:color="${borderBottom.color}"/></w:pBdr>`
      : "",
    `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>`,
    indentLeft ? `<w:ind w:left="${indentLeft}" w:hanging="180"/>` : ""
  ]
    .filter(Boolean)
    .join("");
  return `<w:p><w:pPr>${pPr}</w:pPr>${runs}</w:p>`;
}

export function buildResumeDocx(data = {}) {
  const lang = data.language === "en" ? "en" : "pt";
  const t = L10N[lang];
  const rels = [];
  const addLink = (url) => {
    const clean = safeHref(url);
    if (!clean) return null;
    const id = `rId${rels.length + 1}`;
    rels.push({ id, target: clean });
    return id;
  };
  const linkRun = (label, url, opts = {}) => {
    const rId = addLink(url);
    const inner = runXml(label, { size: 18, color: "111111", ...opts });
    return rId ? `<w:hyperlink r:id="${rId}" w:history="1">${inner}</w:hyperlink>` : inner;
  };

  const parts = [];
  const sectionHeading = (title) =>
    paraXml(runXml(title, { bold: true, size: 20, color: "111111" }), {
      before: 140,
      after: 60,
      borderBottom: { sz: 6, color: "888888" }
    });

  // Cabeçalho (1 coluna, centralizado, sem tabelas/imagens)
  parts.push(
    paraXml(runXml(data.name || "", { bold: true, size: 34 }), { align: "center", before: 0, after: 40, line: 240 })
  );
  if (data.title) {
    parts.push(paraXml(runXml(data.title, { size: 20, color: "222222" }), { align: "center", after: 50, line: 240 }));
  }

  const line1 = [];
  if (data.email) line1.push(linkRun(data.email, `mailto:${data.email}`));
  if (data.phone_display) line1.push(linkRun(data.phone_display, `tel:${data.phone_e164 || data.phone_display}`));
  if (data.location) line1.push(runXml(data.location, { size: 18 }));
  if (line1.length) {
    parts.push(
      paraXml(line1.join(runXml("  |  ", { size: 18, color: "555555" })), { align: "center", after: 30, line: 240 })
    );
  }

  const line2 = [];
  if (data.linkedin_url) line2.push(linkRun(shortLink(data.linkedin_url), data.linkedin_url));
  if (data.github_url) line2.push(linkRun(shortLink(data.github_url), data.github_url));
  if (data.website_url) line2.push(linkRun(t.website, data.website_url));
  if (line2.length) {
    parts.push(
      paraXml(line2.join(runXml("  |  ", { size: 18, color: "555555" })), {
        align: "center",
        after: 100,
        line: 240,
        borderBottom: { sz: 12, color: "000000" }
      })
    );
  }

  // Resumo
  if (data.summary) {
    parts.push(sectionHeading(t.summary));
    parts.push(paraXml(runXml(data.summary, { size: 19 }), { after: 80 }));
  }

  // Habilidades
  if (Array.isArray(data.skills) && data.skills.length) {
    parts.push(sectionHeading(t.skills));
    for (const g of data.skills) {
      const label = g.group ? `${g.group}: ` : "";
      const items = (g.items || []).join(", ");
      parts.push(
        paraXml(runXml(label, { bold: true, size: 19 }) + runXml(items, { size: 19 }), { after: 45 })
      );
    }
  }

  // Projetos (somente quando presentes no JSON)
  if (Array.isArray(data.projects) && data.projects.length) {
    parts.push(sectionHeading(t.projects));
    for (const p of data.projects) {
      parts.push(paraXml(runXml(p.title || "", { bold: true, size: 19 }), { before: 60, after: 20 }));
      if (p.stack) {
        parts.push(paraXml(runXml(`${t.stack}: ${p.stack}`, { italic: true, size: 18, color: "333333" }), { after: 30 }));
      }
      for (const b of p.bullets || []) {
        parts.push(paraXml(runXml(`•  ${b}`, { size: 19 }), { after: 30, indentLeft: 260 }));
      }
    }
  }

  // Experiência Profissional (cargo, empresa e datas juntos no bloco — padrão Gupy/ATS)
  if (Array.isArray(data.experience) && data.experience.length) {
    parts.push(sectionHeading(t.experience));
    for (const e of data.experience) {
      const headerRuns = [
        runXml(e.role || "", { bold: true, size: 20 }),
        e.company ? runXml(` — ${e.company}`, { size: 19, color: "222222" }) : "",
        e.date ? runXml(`  (${e.date})`, { italic: true, size: 18, color: "444444" }) : ""
      ].join("");
      parts.push(paraXml(headerRuns, { before: 80, after: 35 }));
      for (const b of e.bullets || []) {
        // Remove eventual sintaxe markdown [texto](url) para texto limpo no DOCX
        const cleanBullet = String(b || "").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");
        parts.push(paraXml(runXml(`•  ${cleanBullet}`, { size: 19 }), { after: 30, indentLeft: 260 }));
      }
    }
  }

  // Formação Acadêmica
  if (Array.isArray(data.education) && data.education.length) {
    parts.push(sectionHeading(t.education));
    for (const ed of data.education) {
      const runs = [
        runXml(ed.title || "", { bold: true, size: 19 }),
        ed.subtitle ? runXml(` — ${ed.subtitle}`, { size: 19, color: "222222" }) : "",
        ed.date ? runXml(`  (${ed.date})`, { italic: true, size: 18, color: "444444" }) : ""
      ].join("");
      parts.push(paraXml(runs, { after: 45 }));
    }
  }

  // Idiomas
  if (Array.isArray(data.languages) && data.languages.length) {
    parts.push(sectionHeading(t.languages));
    for (const l of data.languages) {
      const runs = [
        runXml(`${l.name || ""} — ${l.level || ""}`, { bold: true, size: 19 }),
        l.note ? runXml(` (${l.note})`, { italic: true, size: 18, color: "444444" }) : ""
      ].join("");
      parts.push(paraXml(runs, { after: 40 }));
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${parts.join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="720" w:right="860" w:bottom="720" w:left="860" w:header="450" w:footer="450" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels
    .map(
      (r) =>
        `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(r.target)}" TargetMode="External"/>`
    )
    .join("\n  ")}
</Relationships>`;

  return createZip([
    { name: "[Content_Types].xml", content: contentTypesXml },
    { name: "_rels/.rels", content: rootRelsXml },
    { name: "word/_rels/document.xml.rels", content: docRelsXml },
    { name: "word/document.xml", content: documentXml }
  ]);
}

export function exportDocxHandler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  try {
    const data = req.body || {};
    const buf = buildResumeDocx(data);
    const slug = String(data.name || "curriculo")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    const lang = data.language === "en" ? "en" : "pt";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${slug || "curriculo"}-${lang}-ats.docx"`);
    return res.status(200).send(buf);
  } catch (err) {
    return res.status(500).json({ error: `Erro ao gerar DOCX: ${err.message}` });
  }
}
