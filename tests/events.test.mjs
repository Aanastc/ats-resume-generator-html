import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGoogleCalendarUrl,
  classifyEventLocation,
  detectEventTopics,
  filterEvents,
  isTechEvent,
  parseDevEventsRss,
  parseSymplaDate,
  parseSymplaEvents
} from "../lib/events.mjs";

test("isTechEvent aceita eventos de tecnologia e rejeita não-tech", () => {
  assert.equal(isTechEvent("Workshop WebTech: Programação Agêntica e IA"), true);
  assert.equal(isTechEvent("O último GDGolo do ano!", "", ["GDG"]), true);
  assert.equal(isTechEvent("Clean Architecture Masterclass"), true);
  assert.equal(isTechEvent("Curso de Pais e Padrinhos para Batizado"), false);
  assert.equal(isTechEvent("História da Arte Contemporânea"), false);
});

test("classifyEventLocation aceita Grande BH e online, e bloqueia presencial fora de BH", () => {
  const bh = classifyEventLocation({ city: "Belo Horizonte", state: "MG", country: "BR" });
  assert.equal(bh.eligible, true);
  assert.equal(bh.mode, "bh");

  const novaLima = classifyEventLocation({ city: "Nova Lima", state: "MG", country: "BR", isHybrid: true });
  assert.equal(novaLima.eligible, true);
  assert.equal(novaLima.mode, "bh");

  const onlineBr = classifyEventLocation({ country: "BR", isOnline: true, rawText: "Programação Online Brasil" });
  assert.equal(onlineBr.eligible, true);
  assert.equal(onlineBr.mode, "online_br");

  const onlineGlobal = classifyEventLocation({ country: "Global", isOnline: true, rawText: "React Day Berlin Online" });
  assert.equal(onlineGlobal.eligible, true);
  assert.equal(onlineGlobal.mode, "online_global");

  const spOnsite = classifyEventLocation({ city: "São Paulo", state: "SP", country: "BR", isOnline: false });
  assert.equal(spOnsite.eligible, false);
  assert.equal(spOnsite.mode, "outside");
});

test("parseSymplaDate converte formato brasileiro para ISO", () => {
  assert.equal(parseSymplaDate("Qua, 18 Nov - 2026 · 18:30"), "2026-11-18T18:30:00-03:00");
  assert.equal(parseSymplaDate("05 Dez 2026"), "2026-12-05T09:00:00-03:00");
});

test("parseSymplaEvents extrai título, data, organizador e link do payload RSC", () => {
  const sampleHtml = String.raw`{"url":"https://www.sympla.com.br/evento/workshop-webtech-sdd/3644354","start_date_formats":{"pt":"Qua, 18 Nov - 2026 · 18:30"},"organizer":{"name":"WebTech - PUC Minas"},"end_date_formats":{"pt":"Qua, 18 Nov - 2026 · 21:00"},"name":"Workshop WebTech: SDD e Agentes de IA","city":"Belo Horizonte","state":"MG"}`;
  const list = parseSymplaEvents(sampleHtml, { defaultCity: "Belo Horizonte", defaultState: "MG" });
  assert.equal(list.length, 1);
  assert.equal(list[0].title, "Workshop WebTech: SDD e Agentes de IA");
  assert.equal(list[0].organizer, "WebTech - PUC Minas");
  assert.equal(list[0].start_date, "2026-11-18T18:30:00-03:00");
});

test("parseDevEventsRss extrai eventos online futuros e ignora presenciais no exterior", () => {
  const xml = `
    <rss><channel>
      <item>
        <title><![CDATA[Clean Architecture Masterclass]]></title>
        <link>https://dev.events/conferences/clean-arch-online</link>
        <description><![CDATA[Clean Architecture Masterclass is happening on December 10, 2026, Online.]]></description>
        <category>Architecture</category>
      </item>
      <item>
        <title><![CDATA[Berlin Only Conf]]></title>
        <link>https://dev.events/conferences/berlin-only</link>
        <description><![CDATA[Berlin Only Conf is happening on December 12, 2026, Berlin, Germany.]]></description>
      </item>
    </channel></rss>`;
  const items = parseDevEventsRss(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Clean Architecture Masterclass");
  assert.equal(items[0].start_date, "2026-12-10T12:00:00Z");
});

test("filterEvents filtra por modalidade, tema, janela de tempo e descarta passados", () => {
  const now = new Date("2026-11-18T12:00:00-03:00");
  const events = [
    { id: "1", title: "GDG BH Meetup", mode: "bh", topics: ["comunidade"], start_date: "2026-11-19T18:30:00-03:00", location: "BH", organizer: "GDG" },
    { id: "2", title: "KubeCon Online", mode: "online_global", topics: ["cloud"], start_date: "2026-12-20T12:00:00Z", location: "Online", organizer: "CNCF" },
    { id: "3", title: "Evento Passado", mode: "bh", topics: ["ia"], start_date: "2026-10-01T18:00:00-03:00", location: "BH", organizer: "X" }
  ];

  assert.equal(filterEvents(events, { now }).length, 2);
  assert.equal(filterEvents(events, { mode: "bh", now }).length, 1);
  assert.equal(filterEvents(events, { mode: "online", now }).length, 1);
  assert.equal(filterEvents(events, { window: "week", now }).length, 1);
  assert.equal(filterEvents(events, { topic: "cloud", now }).length, 1);
  assert.equal(filterEvents(events, { search: "gdg", now }).length, 1);
});

test("detectEventTopics e buildGoogleCalendarUrl funcionam corretamente", () => {
  const topics = detectEventTopics("Workshop de Kubernetes e Agentes de IA com RAG");
  assert.ok(topics.includes("cloud"));
  assert.ok(topics.includes("ia"));

  const url = buildGoogleCalendarUrl({
    title: "GDG BH",
    start_date: "2026-11-19T18:30:00-03:00",
    url: "https://gdg.community.dev/example",
    venue: "Belo Horizonte, MG"
  });
  assert.match(url, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.match(url, /text=GDG\+BH/);
});
