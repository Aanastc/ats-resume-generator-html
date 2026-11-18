import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectArticleLanguage,
  detectArticleTopics,
  filterArticles,
  isEngineeringArticle,
  parseRssOrAtom
} from "../lib/articles.mjs";

test("detectArticleTopics identifica pilares de engenharia 2027", () => {
  const t1 = detectArticleTopics("Building AI Agents with MCP and RAG on AWS Lambda");
  assert.ok(t1.includes("ia"));
  assert.ok(t1.includes("cloud"));

  const t2 = detectArticleTopics("Clean Architecture, Redis Caching and System Design Tradeoffs");
  assert.ok(t2.includes("arquitetura"));

  const t3 = detectArticleTopics("End-to-End Testing React Apps with Playwright and Vitest");
  assert.ok(t3.includes("fullstack"));
  assert.ok(t3.includes("qualidade"));
});

test("isEngineeringArticle aceita artigos técnicos e descarta off-topic", () => {
  assert.equal(isEngineeringArticle("Seu LLM acerta? Meça por amostra"), true);
  assert.equal(isEngineeringArticle("Receita de bolo de cenoura simples"), false);
  assert.equal(isEngineeringArticle("Observability with OpenTelemetry", "", [], true), true);
});

test("detectArticleLanguage distingue português e inglês", () => {
  assert.equal(detectArticleLanguage("Como escalar sistemas distribuídos em produção", ""), "pt");
  assert.equal(detectArticleLanguage("Scaling distributed systems on Amazon EKS", ""), "en");
});

test("parseRssOrAtom lê feeds RSS 2.0 e Atom corretamente", () => {
  const rss = `
    <rss><channel>
      <item>
        <title><![CDATA[Centralized Observability on AWS]]></title>
        <link>https://aws.amazon.com/blogs/architecture/obs</link>
        <description><![CDATA[<p>Using OpenTelemetry and Grafana.</p>]]></description>
        <pubDate>Tue, 17 Nov 2026 10:00:00 GMT</pubDate>
      </item>
    </channel></rss>`;
  const rItems = parseRssOrAtom(rss, { source: "AWS Architecture Blog" });
  assert.equal(rItems.length, 1);
  assert.equal(rItems[0].title, "Centralized Observability on AWS");
  assert.equal(rItems[0].url, "https://aws.amazon.com/blogs/architecture/obs");

  const atom = `
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Context Engineering for Coding Agents</title>
        <link href="https://martinfowler.com/articles/context-engineering.html" />
        <updated>2026-11-16T12:00:00Z</updated>
        <summary>Practical patterns for LLM coding workflows.</summary>
      </entry>
    </feed>`;
  const aItems = parseRssOrAtom(atom, { source: "Martin Fowler" });
  assert.equal(aItems.length, 1);
  assert.equal(aItems[0].url, "https://martinfowler.com/articles/context-engineering.html");
});

test("filterArticles filtra por idioma, tema, busca e ordena por relevância", () => {
  const articles = [
    { id: "1", title: "RAG em Produção", lang: "pt", topics: ["ia"], source: "TabNews", published_at: "2026-11-18T10:00:00Z", relevance: 85 },
    { id: "2", title: "AWS EKS Observability", lang: "en", topics: ["cloud"], source: "AWS", published_at: "2026-11-17T10:00:00Z", relevance: 95 }
  ];

  assert.equal(filterArticles(articles, { lang: "pt" }).length, 1);
  assert.equal(filterArticles(articles, { topic: "cloud" }).length, 1);
  assert.equal(filterArticles(articles, { search: "eks" }).length, 1);
  const byRel = filterArticles(articles, { sort: "relevance" });
  assert.equal(byRel[0].id, "2");
});
