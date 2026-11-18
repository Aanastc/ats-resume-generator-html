// =============================================================================
// Career Studio — front-end (sem framework)
// =============================================================================

// Estado
let currentResume = null;
let activeTab = "tab-optimize";
let cloudUser = null; // usuária logada (Firebase) ou null
let jobTracking = {}; // id da vaga -> { saved, applied_at, adapted_at, ... } (sincronizado na nuvem)

// Elementos
const tabs = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");
const workspace = document.getElementById("workspace");
const customApiKeyInput = document.getElementById("customApiKey");
const saveBaseCvBtn = document.getElementById("saveBaseCv");
const jobDescriptionInput = document.getElementById("jobDescription");
const languageModeSelect = document.getElementById("languageMode");
const btnOptimize = document.getElementById("btnOptimize");
const btnCopyHtml = document.getElementById("btnCopyHtml");
const btnExportPdf = document.getElementById("btnExportPdf");
const cvPreview = document.getElementById("cvPreview");
const previewLoader = document.getElementById("previewLoader");
const loaderMessage = document.getElementById("loaderMessage");
const jsonEditor = document.getElementById("jsonEditor");

const formFields = {
	name: document.getElementById("f-name"),
	title: document.getElementById("f-title"),
	email: document.getElementById("f-email"),
	phoneDisplay: document.getElementById("f-phone-display"),
	phoneE164: document.getElementById("f-phone-e164"),
	location: document.getElementById("f-location"),
	linkedin: document.getElementById("f-linkedin"),
	github: document.getElementById("f-github"),
	website: document.getElementById("f-website"),
	summary: document.getElementById("f-summary"),
};

// Telas de currículo mostram a prévia ao lado; telas de carreira usam a largura toda.
const RESUME_TABS = new Set(["tab-optimize", "tab-form", "tab-json"]);

// Armazenamento local seguro (pode falhar em navegação privada)
const store = {
	get(key, fallback = null) {
		try {
			const v = localStorage.getItem(key);
			return v === null ? fallback : JSON.parse(v);
		} catch {
			return fallback;
		}
	},
	set(key, value) {
		try {
			localStorage.setItem(key, JSON.stringify(value));
			return true;
		} catch {
			return false;
		}
	},
	remove(key) {
		try {
			localStorage.removeItem(key);
		} catch {
			/* ignore */
		}
	},
};

function icon(name, cls = "") {
	return `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

// -----------------------------------------------------------------------------
// Inicialização
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
	const savedKey = store.get("gemini_api_key", "");
	if (savedKey) customApiKeyInput.value = savedKey;
	customApiKeyInput.addEventListener("change", () =>
		store.set("gemini_api_key", customApiKeyInput.value.trim()),
	);

	tabs.forEach((tab) =>
		tab.addEventListener("click", () => switchTab(tab.dataset.tab)),
	);
	switchTab(store.get("active_tab", "tab-optimize"));

	saveBaseCvBtn.addEventListener("click", saveBaseCv);
	document
		.getElementById("btnSyncPortfolio")
		.addEventListener("click", syncPortfolioCv);

	setupFormListeners();
	jsonEditor.addEventListener("change", syncJsonEditorToState);

	btnOptimize.addEventListener("click", optimizeCv);
	btnCopyHtml.addEventListener("click", copyHtmlToClipboard);
	document.getElementById("btnExportDocx")?.addEventListener("click", exportDocx);
	btnExportPdf.addEventListener("click", exportPdf);
	document.getElementById("btnPrint").addEventListener("click", printResume);
	setupAtsToolkit();
	document
		.getElementById("btnExpandPreview")
		?.addEventListener("click", togglePreviewExpand);
	document
		.getElementById("atsScoreBtn")
		.addEventListener("click", toggleAtsPanel);
	// A nota de palavras-chave muda conforme a vaga colada
	jobDescriptionInput.addEventListener("input", updateResumeMetrics);

	const iframeBox = document.getElementById("iframeContainer");
	if (iframeBox && typeof ResizeObserver !== "undefined") {
		new ResizeObserver(() => fitPreviewSheet()).observe(iframeBox);
	}

	setupJobSearchListeners();
	setupEvents();
	setupArticles();
	document
		.getElementById("btnGenerateIdeas")
		?.addEventListener("click", generateNewProjectIdeas);
	document
		.getElementById("btnImproveNextIdea")
		?.addEventListener("click", improveNextProjectIdea);

	setupAccount();
	setupApplications();
	loadBaseCv();
	loadTalentTracker(); // carrega cedo para mostrar o contador de desatualizados no menu
	loadJobs(); // idem: contador de vagas no menu
	loadEvents(); // idem: contador de eventos no menu
	loadArticles(); // idem: contador de artigos no menu
});

function safeHttpUrl(url) {
	const value = String(url ?? "").trim();
	return /^https?:\/\//i.test(value) ? value : "#";
}

function togglePreviewExpand() {
	const expanded = workspace.classList.toggle("preview-expanded");
	const btn = document.getElementById("btnExpandPreview");
	if (btn) {
		const label = expanded
			? "Voltar para visualização dividida"
			: "Expandir prévia do currículo";
		btn.setAttribute("aria-pressed", String(expanded));
		btn.setAttribute("aria-label", label);
		btn.title = label;
		btn.innerHTML = icon(expanded ? "minimize" : "maximize");
	}
	requestAnimationFrame(fitPreviewSheet);
}

function switchTab(tabId) {
	if (!document.getElementById(tabId)) tabId = "tab-optimize";
	tabs.forEach((t) => {
		const active = t.dataset.tab === tabId;
		t.classList.toggle("active", active);
		if (active) t.setAttribute("aria-current", "page");
		else t.removeAttribute("aria-current");
	});
	tabPanes.forEach((p) => p.classList.toggle("active", p.id === tabId));
	const isResume = RESUME_TABS.has(tabId);
	workspace.classList.toggle("with-preview", isResume);
	if (!isResume && workspace.classList.contains("preview-expanded"))
		togglePreviewExpand();
	activeTab = tabId;
	store.set("active_tab", tabId);

	if (tabId === "tab-json" && currentResume)
		jsonEditor.value = JSON.stringify(currentResume, null, 2);
	if (tabId === "tab-form") populateForm();
	if (tabId === "tab-ideas" && !ideasLoaded && currentResume) loadProjectIdeas();
	if (isResume) requestAnimationFrame(fitPreviewSheet);
}

// -----------------------------------------------------------------------------
// Notificações e carregamento
// -----------------------------------------------------------------------------
function notify(message, type, { timeout } = {}) {
	const kind =
		type || (/^(erro|não foi|falha)/i.test(message) ? "error" : "success");
	const box = document.getElementById("toasts");
	const el = document.createElement("div");
	el.className = `toast toast-${kind}`;
	el.setAttribute("role", kind === "error" ? "alert" : "status");
	const ic =
		kind === "error"
			? "alert"
			: kind === "loading"
				? null
				: kind === "info"
					? "clock"
					: "check";
	el.innerHTML = `${ic ? icon(ic) : '<span class="spinner spinner-xs"></span>'}<div class="toast-msg">${escapeHtml(message).replace(/\n/g, "<br>")}</div>
    ${kind === "loading" ? "" : `<button class="toast-close" aria-label="Fechar">${icon("x")}</button>`}`;
	el.querySelector(".toast-close")?.addEventListener("click", () =>
		el.remove(),
	);
	box.appendChild(el);
	const ms =
		timeout ?? (kind === "error" ? 8000 : kind === "loading" ? 0 : 4500);
	if (ms) setTimeout(() => el.remove(), ms);
	return el;
}

let softLoaderToast = null;
function showLoader(message, isSoft = false) {
	if (isSoft) {
		softLoaderToast?.remove();
		softLoaderToast = notify(message, "loading");
		return;
	}
	loaderMessage.textContent = message;
	previewLoader.classList.remove("hidden");
}

function hideLoader() {
	previewLoader.classList.add("hidden");
	softLoaderToast?.remove();
	softLoaderToast = null;
}

// -----------------------------------------------------------------------------
// Currículo: carregar, salvar, sincronizar, prévia, exportar, adaptar
// -----------------------------------------------------------------------------
// Na versão online (Vercel) o servidor não grava arquivos: o currículo base fica no navegador.
const LOCAL_RESUME_KEY = "base_resume";
const readLocalResume = () => store.get(LOCAL_RESUME_KEY, null);
function writeLocalResume(resume) {
	if (!resume) {
		store.remove(LOCAL_RESUME_KEY);
		return true;
	}
	return store.set(LOCAL_RESUME_KEY, resume);
}

async function loadBaseCv() {
	try {
		const localResume = readLocalResume();
		if (localResume) {
			currentResume = localResume;
		} else {
			const res = await fetch("/api/resume");
			if (!res.ok) throw new Error("Não foi possível carregar o currículo.");
			currentResume = await res.json();
		}
		jsonEditor.value = JSON.stringify(currentResume, null, 2);
		populateForm();
		await renderPreviewNow();
		if (allJobs.length) applyJobFilters(); // recalcula o match com o currículo carregado
		updateApplyKit();
		updatePreApplyAnalysis();
		loadProjectIdeas(); // carrega backlog automático de ideias + lacunas do currículo atual
		window.learningHub?.init({
			store,
			escapeHtml,
			notify,
			switchTab,
			getResume: () => currentResume,
			getCloudUser: () => cloudUser,
		});
	} catch (err) {
		notify("Erro ao carregar currículo: " + err.message, "error");
	}
}

async function saveBaseCv() {
	if (!currentResume) return;
	showLoader("Salvando currículo base…", true);
	try {
		if (cloudUser) {
			// Com login, a nuvem é a fonte da verdade (vale para todos os dispositivos)
			await window.cloud.save("resume", { resume: currentResume });
			writeLocalResume(null);
			notify("Currículo salvo na sua conta.", "success");
			return;
		}
		const res = await fetch("/api/resume", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(currentResume),
		});
		const data = await res.json();
		if (res.status === 501 && data.storage === "browser") {
			if (!writeLocalResume(currentResume))
				throw new Error("Não foi possível salvar no navegador.");
			notify("Currículo base salvo neste navegador.", "success");
			return;
		}
		if (!res.ok) throw new Error(data.error || "Erro ao salvar.");
		writeLocalResume(null); // o servidor passa a ser a fonte da verdade
		notify("Currículo base salvo.", "success");
	} catch (err) {
		notify("Erro ao salvar currículo base: " + err.message, "error");
	} finally {
		hideLoader();
	}
}

async function syncPortfolioCv() {
	showLoader("Buscando dados do portfólio no GitHub…", true);
	try {
		const res = await fetch("/api/sync-portfolio", { method: "POST" });
		const data = await res.json();
		if (!res.ok || !data.success)
			throw new Error(data.error || "Erro na resposta do servidor.");
		writeLocalResume(null); // dados novos do portfólio substituem a versão antiga do navegador
		currentResume = data.resume;
		jsonEditor.value = JSON.stringify(currentResume, null, 2);
		populateForm();
		await renderPreviewNow();
		if (cloudUser) await window.cloud.save("resume", { resume: currentResume });
		const portfolioCount = data.portfolio_projects_count ?? data.projects_count ?? 0;
		notify(
			`Portfólio sincronizado: ${data.experiences_count} experiências no currículo (${portfolioCount} projetos mantidos no portfólio).`,
			"success",
		);
	} catch (err) {
		notify("Erro ao sincronizar com o portfólio: " + err.message, "error");
	} finally {
		hideLoader();
	}
}

// A prévia é renderizada no servidor; o debounce evita uma requisição por tecla digitada.
let previewTimer = null;
function renderPreview() {
	clearTimeout(previewTimer);
	return new Promise((resolve) => {
		previewTimer = setTimeout(() => renderPreviewNow().then(resolve), 300);
	});
}

async function renderPreviewNow() {
	if (!currentResume) return;
	try {
		const res = await fetch("/api/render", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(currentResume),
		});
		if (!res.ok) throw new Error("Erro ao montar o currículo.");
		const html = await res.text();
		const doc = cvPreview.contentWindow.document;
		doc.open();
		doc.write(html);
		doc.close();
		await new Promise((r) => setTimeout(r, 50)); // aguarda o layout para medir
		lastPageCount = measurePages(doc);

		// Exibe a folha em proporção real A4 (794px) sem borda cinza duplicada; @media print fica intacto.
		const screenStyle = doc.createElement("style");
		screenStyle.id = "preview-screen-style";
		screenStyle.textContent = `
      @media screen {
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; width: 794px !important; overflow: hidden !important; }
        .container { width: 794px !important; max-width: 794px !important; margin: 0 !important; padding: 28px 36px !important; }
      }
    `;
		doc.head.appendChild(screenStyle);
		fitPreviewSheet();
		updateResumeMetrics();
	} catch (err) {
		console.error("Erro de renderização:", err);
	}
}

function fitPreviewSheet() {
	const container = document.getElementById("iframeContainer");
	const wrap = document.getElementById("previewSheetWrap");
	if (!container || !wrap || !cvPreview) return;
	const doc = cvPreview.contentWindow?.document;
	if (!doc || !doc.body) return;

	const SHEET_W = 794; // A4 (210mm a 96dpi)
	const cs = getComputedStyle(container);
	const availW =
		container.clientWidth -
		parseFloat(cs.paddingLeft) -
		parseFloat(cs.paddingRight);
	if (availW <= 0) return;

	const scale = Math.min(1, availW / SHEET_W);
	cvPreview.style.width = `${SHEET_W}px`;
	// Mede a altura real do documento em 794px antes de aplicar a altura final
	cvPreview.style.height = "1px";
	const naturalH = Math.max(
		1123,
		doc.documentElement.scrollHeight || doc.body.scrollHeight || 1123,
	);

	cvPreview.style.height = `${naturalH}px`;
	cvPreview.style.transform = `scale(${scale})`;
	wrap.style.width = `${Math.round(SHEET_W * scale)}px`;
	wrap.style.height = `${Math.round(naturalH * scale)}px`;
}

// -----------------------------------------------------------------------------
// Métricas da prévia: páginas e nota ATS
// -----------------------------------------------------------------------------
let lastPageCount = null;
let lastAts = null;

// Estima as páginas do PDF A4 aplicando, por um instante, as mesmas medidas da impressão
// (A4 = 8,27 × 11,69 pol; margens do template: 0,28 pol vertical e 0,35 pol horizontal).
function measurePages(doc) {
	const container = doc.querySelector(".container") || doc.body;
	if (!container) return null;
	const style = doc.createElement("style");
	style.textContent =
		"body{padding:0!important;background:#fff!important}.container{padding:0!important;margin:0!important;max-width:none!important;width:726px!important}";
	doc.head.appendChild(style);
	const height = container.scrollHeight;
	style.remove();
	const pageHeight = (11.69 - 0.56) * 96;
	return Math.max(1, Math.ceil((height - 8) / pageHeight));
}

let metricsTimer = null;
function updateResumeMetrics() {
	const pc = document.getElementById("pageCount");
	if (pc && lastPageCount) {
		pc.querySelector("span").textContent =
			`${lastPageCount} ${lastPageCount === 1 ? "página" : "páginas"}`;
		pc.classList.toggle("warn", lastPageCount > 2);
	}
	clearTimeout(metricsTimer);
	metricsTimer = setTimeout(fetchAtsScore, 250);
}

async function fetchAtsScore() {
	if (!currentResume) return;
	try {
		const res = await fetch("/api/ats-score", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				resume: currentResume,
				pages: lastPageCount,
				jobDescription: jobDescriptionInput.value,
			}),
		});
		if (!res.ok) return;
		lastAts = await res.json();
		const btn = document.getElementById("atsScoreBtn");
		const level =
			lastAts.score >= 85 ? "ok" : lastAts.score >= 70 ? "mid" : "warn";
		btn.className = `metric metric-btn ${level}`;
		btn.querySelector("span").textContent = `ATS ${lastAts.score}`;
		if (!document.getElementById("atsPanel").classList.contains("hidden"))
			renderAtsPanel();
	} catch (err) {
		console.warn("Nota ATS indisponível:", err.message);
	}
}

function renderAtsPanel() {
	const panel = document.getElementById("atsPanel");
	if (!lastAts) {
		panel.innerHTML =
			'<div class="empty-state small"><div class="spinner"></div></div>';
		return;
	}
	const groups = {};
	lastAts.checks.forEach((c) =>
		(groups[c.group] = groups[c.group] || []).push(c),
	);
	const statusIcon = { ok: "check", warn: "alert", fail: "x" };
	panel.innerHTML = `
    <header class="ats-head">
      <div class="ats-score ${lastAts.score >= 85 ? "ok" : lastAts.score >= 70 ? "mid" : "warn"}"><strong>${lastAts.score}</strong><span>/100</span></div>
      <div>
        <div class="ats-grade">${escapeHtml(lastAts.grade)}</div>
        <p class="muted">Estimativa baseada em critérios que sistemas ATS e recrutadores avaliam.
        ${lastAts.mode === "vaga" ? "Palavras-chave medidas contra a vaga colada em “Adaptar com IA”." : "Palavras-chave medidas contra as tecnologias mais pedidas nas vagas ativas — cole uma vaga para medir a aderência a ela."}</p>
      </div>
      <button type="button" class="toast-close" id="atsClose" aria-label="Fechar">${icon("x")}</button>
    </header>
    ${Object.entries(groups)
			.map(
				([g, items]) => `
      <div class="ats-group">
        <div class="idea-label">${escapeHtml(g)}</div>
        ${items
					.map(
						(c) => `
          <div class="ats-check ${c.status}">
            <span class="ats-icon">${icon(statusIcon[c.status])}</span>
            <div class="ats-text">
              <div class="ats-label">${escapeHtml(c.label)}<span class="ats-pts">${c.points}/${c.max}</span></div>
              <div class="ats-detail">${escapeHtml(c.detail)}</div>
              ${c.tip && c.status !== "ok" ? `<div class="ats-tip">${escapeHtml(c.tip)}</div>` : ""}
            </div>
          </div>`,
					)
					.join("")}
      </div>`,
			)
			.join("")}`;
	panel.querySelector("#atsClose").addEventListener("click", toggleAtsPanel);
}

function toggleAtsPanel() {
	const panel = document.getElementById("atsPanel");
	const btn = document.getElementById("atsScoreBtn");
	const open = panel.classList.toggle("hidden") === false;
	btn.setAttribute("aria-expanded", String(open));
	if (open) renderAtsPanel();
}

async function copyHtmlToClipboard() {
	try {
		await renderPreviewNow();
		const html = cvPreview.contentWindow.document.documentElement.outerHTML;
		await navigator.clipboard.writeText(html);
		notify("HTML copiado para a área de transferência.", "success");
	} catch (err) {
		notify("Erro ao copiar HTML: " + err.message, "error");
	}
}

function printResume() {
	cvPreview.contentWindow?.focus();
	cvPreview.contentWindow?.print();
}

// PDF A4 gerado no servidor local; na versão online (sem gerador de PDF) usa a impressão do navegador.
async function exportPdf() {
	if (!currentResume) return;
	showLoader("Gerando PDF em formato A4…");
	try {
		const res = await fetch("/api/export-pdf", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(currentResume),
		});
		if (res.status === 404 || res.status === 405) {
			hideLoader();
			notify(
				"Na versão online, escolha “Salvar como PDF” na janela de impressão.",
				"info",
			);
			await renderPreviewNow();
			printResume();
			return;
		}
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || "Erro de exportação.");
		window.location.href = "/api/download-pdf";
		notify("PDF gerado.", "success");
	} catch (err) {
		notify("Erro ao exportar PDF: " + err.message, "error");
	} finally {
		hideLoader();
	}
}

async function optimizeCv() {
	if (!currentResume) return;
	const desc = jobDescriptionInput.value;
	if (!desc.trim()) {
		notify("Cole a descrição da vaga antes de continuar.", "error");
		jobDescriptionInput.focus();
		return;
	}

	showLoader("A IA está analisando a vaga e reescrevendo o currículo…");
	try {
		const res = await fetch("/api/optimize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				resume: currentResume,
				jobDescription: desc,
				language: languageModeSelect.value,
				customApiKey: customApiKeyInput.value || null,
			}),
		});
		const data = await res.json();
		if (!res.ok)
			throw new Error(data.error || "Erro desconhecido na otimização.");

		currentResume = data;
		jsonEditor.value = JSON.stringify(currentResume, null, 2);
		populateForm();
		await renderPreviewNow();
		activeCvVersionLabel = "Adaptado com IA";
		const badge = document.getElementById("activeCvVersionBadge");
		if (badge) badge.textContent = activeCvVersionLabel;
		updateApplyKit();
		updatePreApplyAnalysis();
		notify(
			"Currículo adaptado. Revise na prévia e use “Salvar como base” se quiser manter.",
			"success",
			{ timeout: 7000 },
		);
	} catch (err) {
		notify("Erro ao adaptar currículo: " + err.message, "error");
	} finally {
		hideLoader();
	}
}

async function exportDocx() {
	if (!currentResume) return;
	showLoader("Gerando currículo Word (.docx) compatível com ATS…", true);
	try {
		const res = await fetch("/api/export-docx", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(currentResume),
		});
		const ct = res.headers.get("content-type") || "";
		if (!res.ok || ct.includes("text/html")) {
			throw new Error(
				ct.includes("text/html")
					? "Servidor local desatualizado para /api/export-docx. Reinicie o `npm run server`."
					: "Não foi possível gerar o arquivo DOCX.",
			);
		}
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		const lang = currentResume.language === "en" ? "en" : "pt";
		a.href = url;
		a.download = `curriculo-${lang}-ats.docx`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		notify("Currículo Word (.docx) baixado — pronto para Gupy, Greenhouse e Workday.", "success");
	} catch (err) {
		notify("Erro ao exportar DOCX: " + err.message, "error");
	} finally {
		hideLoader();
	}
}

// =============================================================================
// Estratégia ATS: 3 versões de CV, Pré-Análise, Kit Gupy/LinkedIn e Checklist
// =============================================================================
let activeCvVersionKey = store.get("active_cv_version", "fullstack");
let activeCvVersionLabel = "CV 01 — Full Stack & Backend";

const CV_VERSIONS = {
	fullstack: {
		label: "CV 01 — Full Stack & Backend",
		title: "Software Engineer | Full Stack Developer",
		summary:
			"Engenheira de Software Full Stack com foco em Backend, arquitetura de sistemas, integrações corporativas e aplicações web em produção. Atuação prática com TypeScript, Node.js, React.js, PHP (Moodle LMS), Python, APIs REST, PostgreSQL, Redis e Continuous Integration and Continuous Delivery (CI/CD) com AWS e Docker. Aberta a PJ ou CLT (presencial/híbrido em Belo Horizonte, MG ou 100% remoto Brasil/Global, inglês B2–C1).",
		skillOrder: [
			"Full Stack",
			"Arquitetura",
			"Cloud",
			"Qualidade",
		],
		headline:
			"Software Engineer | Full Stack & Backend | TypeScript | Node.js | React | Python | AWS & Cloud",
		gupyIntro:
			"Sou Engenheira de Software Full Stack com foco em Backend, integrações e sistemas em produção utilizando TypeScript, Node.js, React.js, PHP (Moodle LMS), APIs REST e PostgreSQL. Atuei na integração de sistemas corporativos (HubSpot, Stripe, Intercom e BigQuery), no Design System institucional via NPM com CI/CD e em automações com Node.js, Selenium e GitHub Actions.",
	},
	backend_ai: {
		label: "CV 02 — Backend & AI Application",
		title: "Software Engineer | Backend & AI Applications",
		summary:
			"Engenheira de Software com foco em Backend, integração de sistemas, automação de workflows e aplicações práticas com APIs de IA/LLMs. Experiência com Node.js, TypeScript, Python, Representational State Transfer (REST APIs), webhooks, PostgreSQL, Redis, qualidade de software (testes automatizados e code review) e evolução de plataformas digitais em produção. Aberta a PJ ou CLT (BH ou 100% remoto Brasil/Global, inglês B2–C1).",
		skillOrder: [
			"Arquitetura",
			"Qualidade",
			"Full Stack",
			"Cloud",
		],
		headline:
			"Backend & AI Application Software Engineer | Node.js | TypeScript | Python | REST APIs | LLMs & AWS",
		gupyIntro:
			"Sou Engenheira de Software com foco em Backend, integrações via APIs REST e Webhooks, automação de processos e construção de funcionalidades práticas com APIs de IA/LLMs. Trabalho com Node.js, TypeScript, Python, PostgreSQL, Redis e esteiras de qualidade e CI/CD para colocar sistemas confiáveis em produção.",
	},
	cloud: {
		label: "CV 03 — Cloud Software Engineer",
		title: "Software Engineer | Full Stack & Cloud",
		summary:
			"Engenheira de Software Full Stack combinando experiência prática em sistemas web em produção com especialização complementar em Cloud e Platform Engineering (Pós Tech DevOps & Arquitetura Cloud na FIAP). Atuação com TypeScript, Node.js, React, Python, Infrastructure as Code (IaC) com Terraform, AWS (EC2, S3, EKS, RDS, Lambda, SQS, IAM), Docker, Kubernetes, Continuous Integration and Continuous Delivery (CI/CD) e observabilidade. Aberta a PJ ou CLT (BH ou 100% remoto Brasil/Global, inglês B2–C1).",
		skillOrder: [
			"Cloud",
			"Arquitetura",
			"Full Stack",
			"Qualidade",
		],
		headline:
			"Cloud Software Engineer | Full Stack | TypeScript | Node.js | AWS | Docker | Kubernetes | Terraform",
		gupyIntro:
			"Sou Engenheira de Software Full Stack com especialização complementar em Cloud e DevOps (Pós Tech FIAP), unindo experiência real em desenvolvimento e integrações em produção (TypeScript, Node.js, React, Python) com automação de CI/CD (GitHub Actions), Docker, Kubernetes, Terraform e serviços AWS (EC2, S3, EKS, RDS, Lambda e SQS).",
	},
};

const PRE_APPLY_TECHS = [
	["React", /\breact(\.js|js)?\b(?! native)/i],
	["TypeScript", /\btypescript\b/i],
	["JavaScript", /\bjavascript\b/i],
	["Next.js", /\bnext\.?js\b/i],
	["Node.js", /\bnode(\.js|js)?\b/i],
	["Python", /\bpython\b/i],
	["PHP", /\bphp\b/i],
	["Moodle", /\bmoodle\b|\blms\b/i],
	["Java", /\bjava\b(?!script)/i],
	["C#/.NET", /\bc#|\.net\b|\bdotnet\b/i],
	["Go", /\bgolang\b|\bgo developer\b|\bgo engineer\b/i],
	["Ruby/Rails", /\bruby\b|\brails\b/i],
	["Angular", /\bangular\b/i],
	["Vue.js", /\bvue(\.js|js)?\b/i],
	["PostgreSQL", /\bpostgres(ql)?\b/i],
	["MySQL", /\bmysql\b/i],
	["MongoDB", /\bmongo(db)?\b/i],
	["Redis", /\bredis\b/i],
	["REST APIs", /\brest(ful)?\b|\bapis? rest/i],
	["GraphQL", /\bgraphql\b/i],
	["Kafka", /\bkafka\b/i],
	["RabbitMQ", /\brabbit ?mq\b/i],
	["AWS", /\baws\b|amazon web services/i],
	["GCP", /\bgcp\b|google cloud/i],
	["Azure", /\bazure\b/i],
	["Docker", /\bdocker\b/i],
	["Kubernetes", /\bkubernetes\b|\bk8s\b|\beks\b/i],
	["Terraform", /\bterraform\b|\biac\b/i],
	["CI/CD", /\bci\s*\/\s*cd\b|github actions|gitlab ci/i],
	["Observabilidade", /observabil|prometheus|grafana|opentelemetry|datadog/i],
	["Testes automatizados", /\b(jest|vitest|playwright|cypress|pytest|tdd)\b|testes? (unit|automatiz|e2e)/i],
	["System Design", /system design|clean architecture|\bsolid\b|micros?servi[cç]|microservices?/i],
	["IA / LLMs", /\bllms?\b|\brag\b|\bmcp\b|generative ai|ia generativa|ai agents?/i],
];

const APPLY_CHECKLIST_ITEMS = [
	"Li a descrição completa da vaga.",
	"Atendo aos requisitos técnicos essenciais.",
	"Verifiquei se a empresa aceita candidatos do Brasil.",
	"Adaptei o resumo profissional à oportunidade.",
	"Incluí as palavras-chave relevantes que realmente domino.",
	"Revisei as descrições das experiências.",
	"Conferi se o ATS consegue ler o documento (DOCX ou PDF textual em 1 coluna).",
	"Atualizei e revisei os campos da plataforma de recrutamento (ex.: Gupy).",
	"Revisei LinkedIn, GitHub e portfólio.",
	"Registrei a candidatura na aba Candidaturas para acompanhar o processo.",
];

const CHECKLIST_LOCAL_KEY = "apply_checklist_v1";

function setupAtsToolkit() {
	// 3 versões de currículo
	document.querySelectorAll("[data-cv-version]").forEach((btn) => {
		btn.addEventListener("click", () => applyCvVersion(btn.dataset.cvVersion));
	});

	// Botões de copiar do Kit Gupy/LinkedIn
	document.querySelectorAll("[data-copy-target]").forEach((btn) => {
		btn.addEventListener("click", async () => {
			const el = document.getElementById(btn.dataset.copyTarget);
			if (!el) return;
			try {
				await navigator.clipboard.writeText(el.value || "");
				notify("Texto copiado para a área de transferência.", "success", { timeout: 2500 });
			} catch {
				notify("Não foi possível copiar automaticamente.", "error");
			}
		});
	});

	// Atualiza análise pré-candidatura e kit ao colar/editar a descrição da vaga
	let preTimer = null;
	jobDescriptionInput.addEventListener("input", () => {
		clearTimeout(preTimer);
		preTimer = setTimeout(() => {
			updatePreApplyAnalysis();
			updateApplyKit();
		}, 220);
	});

	// Checklist 0/10
	document.getElementById("btnResetChecklist")?.addEventListener("click", () => {
		store.set(CHECKLIST_LOCAL_KEY, {});
		renderApplyChecklist();
		notify("Checklist limpo para a próxima candidatura.", "info", { timeout: 2500 });
	});
	renderApplyChecklist();
	syncCvVersionButtons();
}

function syncCvVersionButtons() {
	const preset = CV_VERSIONS[activeCvVersionKey] || CV_VERSIONS.fullstack;
	activeCvVersionLabel = preset.label;
	const badge = document.getElementById("activeCvVersionBadge");
	if (badge) badge.textContent = activeCvVersionLabel;
	document.querySelectorAll("[data-cv-version]").forEach((btn) => {
		const isActive = btn.dataset.cvVersion === activeCvVersionKey;
		btn.classList.toggle("active", isActive);
		btn.setAttribute("aria-pressed", String(isActive));
	});
}

function applyCvVersion(key) {
	const preset = CV_VERSIONS[key];
	if (!preset || !currentResume) return;
	activeCvVersionKey = key;
	store.set("active_cv_version", key);
	syncCvVersionButtons();

	currentResume.title = preset.title;
	currentResume.summary = preset.summary;
	if (Array.isArray(currentResume.skills) && currentResume.skills.length) {
		const rankOf = (group = "") => {
			const idx = preset.skillOrder.findIndex((prefix) =>
				group.toLowerCase().startsWith(prefix.toLowerCase()),
			);
			return idx === -1 ? 99 : idx;
		};
		currentResume.skills = [...currentResume.skills].sort(
			(a, b) => rankOf(a.group) - rankOf(b.group),
		);
	}

	jsonEditor.value = JSON.stringify(currentResume, null, 2);
	populateForm();
	renderPreview();
	updateApplyKit();
	updatePreApplyAnalysis();
	notify(`Versão aplicada: ${preset.label} (prévia atualizada).`, "success", { timeout: 2800 });
}

function resumeSearchBlob(resume = {}) {
	const parts = [resume.title, resume.summary];
	(resume.skills || []).forEach((g) => parts.push(g.group, ...(g.items || [])));
	(resume.experience || []).forEach((e) => parts.push(e.role, ...(e.bullets || []), ...(e.stacks || [])));
	(resume.projects || []).forEach((p) => parts.push(p.title, p.stack, ...(p.bullets || [])));
	return parts.filter(Boolean).join(" \n ");
}

function analyzeJobMatchLocal(jobText, resume) {
	const text = String(jobText || "").trim();
	if (text.length < 30 || !resume) return null;
	const cvBlob = resumeSearchBlob(resume);
	const matched = [];
	const missing = [];
	for (const [name, re] of PRE_APPLY_TECHS) {
		if (re.test(text)) {
			if (re.test(cvBlob)) matched.push(name);
			else missing.push(name);
		}
	}
	const total = matched.length + missing.length;
	const pct = total ? Math.round((matched.length / total) * 100) : null;
	const isEnglish =
		/\b(requirements|responsibilities|experience with|we are looking|qualifications|software engineer)\b/i.test(
			text,
		);
	return { matched, missing, total, pct, isEnglish };
}

function updatePreApplyAnalysis() {
	const box = document.getElementById("preApplyAnalysis");
	if (!box) return;
	const res = analyzeJobMatchLocal(jobDescriptionInput?.value, currentResume);
	if (!res || !res.total) {
		box.classList.add("hidden");
		box.innerHTML = "";
		return;
	}
	const tone = res.pct >= 70 ? "text-ok" : res.pct >= 45 ? "text-warn" : "text-danger";
	const warning =
		res.pct < 45
			? `<div class="pre-apply-alert">${icon("alert")} <strong>Atenção à aderência (${res.pct}%):</strong> a vaga pede requisitos centrais ausentes no seu currículo (${escapeHtml(res.missing.slice(0, 4).join(", "))}). Avalie se vale investir tempo nela ou priorizar vagas mais alinhadas ao seu stack.</div>`
			: "";
	box.classList.remove("hidden");
	box.innerHTML = `
    <div class="pre-apply-head">
      <strong>Análise pré-candidatura (${res.isEnglish ? "vaga em Inglês" : "vaga em Português"})</strong>
      <span class="meta-chip ${tone}">Aderência real: ${res.pct}% (${res.matched.length}/${res.total} requisitos)</span>
    </div>
    ${res.matched.length ? `<div><span class="idea-label">Você já domina (destaque na vaga)</span><div class="tag-row" style="margin-top:4px">${res.matched.map((t) => `<span class="skill-tag strong">${escapeHtml(t)}</span>`).join("")}</div></div>` : ""}
    ${res.missing.length ? `<div><span class="idea-label">Lacunas desta vaga (não inventar)</span><div class="tag-row" style="margin-top:4px">${res.missing.map((t) => `<span class="skill-tag">${escapeHtml(t)}</span>`).join("")}</div></div>` : ""}
    ${warning}`;
}

function updateApplyKit() {
	const gupyEl = document.getElementById("kitGupyIntro");
	const msgEl = document.getElementById("kitRecruiterMsg");
	const headEl = document.getElementById("kitLinkedinHeadline");
	if (!gupyEl || !msgEl || !headEl) return;

	const preset = CV_VERSIONS[activeCvVersionKey] || CV_VERSIONS.fullstack;
	const match = analyzeJobMatchLocal(jobDescriptionInput?.value, currentResume);
	const matchedTerms = match?.matched?.slice(0, 6) || [];

	const gupySuffix = matchedTerms.length
		? ` Para esta oportunidade, destaco minha vivência direta com ${matchedTerms.join(", ")}.`
		: " Busco atuar construindo e evoluindo sistemas confiáveis em produção (remoto Brasil/Global ou híbrido em Belo Horizonte).";
	gupyEl.value = `${preset.gupyIntro}${gupySuffix}`;

	const stackSummary = matchedTerms.length
		? matchedTerms.slice(0, 4).join(", ")
		: activeCvVersionKey === "cloud"
			? "AWS, Docker, Kubernetes and CI/CD"
			: "React, TypeScript, Node.js and AWS";

	if (match?.isEnglish) {
		msgEl.value = `Hi [Name], I just applied for the [Role] position at [Company]. I'm a Software Engineer based in Brazil (remote worldwide, no visa required) with hands-on production experience in ${stackSummary}. I'd love to connect and share more about how my background aligns with the team's goals. Portfolio: ${currentResume?.website_url || ""}`;
	} else {
		msgEl.value = `Olá [Nome], tudo bem? Acabei de me candidatar para a vaga de [Cargo] na [Empresa]. Atuo como Engenheira de Software com experiência prática em produção com ${stackSummary}, integrações corporativas e automação de entregas. Fico à disposição para conversar sobre como posso contribuir com o time! Portfólio: ${currentResume?.website_url || ""}`;
	}

	headEl.value = preset.headline;
}

function renderApplyChecklist() {
	const ul = document.getElementById("applyChecklist");
	const progress = document.getElementById("checklistProgress");
	const fill = document.getElementById("checklistBarFill");
	if (!ul) return;

	const state = store.get(CHECKLIST_LOCAL_KEY, {});
	const checkedCount = APPLY_CHECKLIST_ITEMS.filter((_, idx) => Boolean(state[idx])).length;
	const total = APPLY_CHECKLIST_ITEMS.length;
	if (progress) progress.textContent = `${checkedCount}/${total}`;
	if (fill) fill.style.width = `${Math.round((checkedCount / total) * 100)}%`;

	ul.innerHTML = APPLY_CHECKLIST_ITEMS.map((text, idx) => {
		const checked = Boolean(state[idx]);
		return `<li>
      <label class="${checked ? "checked" : ""}">
        <input type="checkbox" data-check-idx="${idx}" ${checked ? "checked" : ""}>
        <span>${escapeHtml(text)}</span>
      </label>
    </li>`;
	}).join("");

	ul.querySelectorAll("[data-check-idx]").forEach((cb) => {
		cb.addEventListener("change", () => {
			const next = { ...store.get(CHECKLIST_LOCAL_KEY, {}), [cb.dataset.checkIdx]: cb.checked };
			store.set(CHECKLIST_LOCAL_KEY, next);
			renderApplyChecklist();
		});
	});
}

// =============================================================================
// Formulário do currículo
// =============================================================================
// Populate the visual form from currentResume state
function populateForm() {
	if (!currentResume) return;

	formFields.name.value = currentResume.name || "";
	formFields.title.value = currentResume.title || "";
	formFields.email.value = currentResume.email || "";
	formFields.phoneDisplay.value = currentResume.phone_display || "";
	formFields.phoneE164.value = currentResume.phone_e164 || "";
	formFields.location.value = currentResume.location || "";
	formFields.linkedin.value = currentResume.linkedin_url || "";
	formFields.github.value = currentResume.github_url || "";
	formFields.website.value = currentResume.website_url || "";
	formFields.summary.value = currentResume.summary || "";

	renderSkillsList();
	renderExperienceList();
	renderProjectsList();
	renderEducationList();
	renderLanguagesList();
}

// Set up listeners for form text inputs
function setupFormListeners() {
	const inputs = [
		{ el: formFields.name, key: "name" },
		{ el: formFields.title, key: "title" },
		{ el: formFields.email, key: "email" },
		{ el: formFields.phoneDisplay, key: "phone_display" },
		{ el: formFields.phoneE164, key: "phone_e164" },
		{ el: formFields.location, key: "location" },
		{ el: formFields.linkedin, key: "linkedin_url" },
		{ el: formFields.github, key: "github_url" },
		{ el: formFields.website, key: "website_url" },
		{ el: formFields.summary, key: "summary" },
	];

	inputs.forEach((item) => {
		item.el.addEventListener("input", () => {
			if (!currentResume) return;
			currentResume[item.key] = item.el.value;
			renderPreview();
		});
	});

	// Buttons for adding items
	document.getElementById("add-skill-group").onclick = addSkillGroup;
	document.getElementById("add-experience").onclick = addExperience;
	document.getElementById("add-project").onclick = addProject;
	document.getElementById("add-education").onclick = addEducation;
	document.getElementById("add-language").onclick = addLanguage;
}

// Sync JSON raw edits back to state
function syncJsonEditorToState() {
	try {
		const val = jsonEditor.value;
		const parsed = JSON.parse(val);
		currentResume = parsed;
		renderPreview();
	} catch (err) {
		notify(
			"Erro de sintaxe no JSON. Verifique o formato antes de prosseguir.",
			"error",
		);
	}
}

// Helper: Escape HTML
function escapeHtml(str) {
	if (!str) return "";
	return String(str)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

// --- Dynamic Form Lists Builders ---

// 1. Skills
function renderSkillsList() {
	const container = document.getElementById("skills-list");
	container.innerHTML = "";

	const skills = currentResume.skills || [];
	skills.forEach((s, idx) => {
		const item = document.createElement("div");
		item.className = "visual-item";
		item.innerHTML = `
      <div class="visual-item-header">
        <span class="visual-item-title">Grupo de Habilidades ${idx + 1}</span>
        <button type="button" class="btn-remove-item" data-idx="${idx}" title="Remover" aria-label="Remover"><svg class="ic"><use href="#i-x"/></svg></button>
      </div>
      <div class="form-group">
        <label>Nome do Grupo (ex: Frontend, DevOps)</label>
        <input type="text" class="s-group" data-idx="${idx}" value="${escapeHtml(s.group)}">
      </div>
      <div class="form-group">
        <label>Habilidades (separadas por vírgula)</label>
        <input type="text" class="s-items" data-idx="${idx}" value="${escapeHtml((s.items || []).join(", "))}">
      </div>
    `;

		// Remove group
		item.querySelector(".btn-remove-item").onclick = () => {
			currentResume.skills.splice(idx, 1);
			populateForm();
			renderPreview();
		};

		// Update group name
		item.querySelector(".s-group").oninput = (e) => {
			currentResume.skills[idx].group = e.target.value;
			renderPreview();
		};

		// Update items
		item.querySelector(".s-items").oninput = (e) => {
			currentResume.skills[idx].items = e.target.value
				.split(",")
				.map((x) => x.trim())
				.filter(Boolean);
			renderPreview();
		};

		container.appendChild(item);
	});
}

function addSkillGroup() {
	if (!currentResume) return;
	if (!currentResume.skills) currentResume.skills = [];
	currentResume.skills.push({ group: "Nova Seção", items: ["Habilidade 1"] });
	populateForm();
	renderPreview();
}

// 2. Experience
function renderExperienceList() {
	const container = document.getElementById("experience-list");
	container.innerHTML = "";

	const exps = currentResume.experience || [];
	exps.forEach((e, idx) => {
		const item = document.createElement("div");
		item.className = "visual-item";

		const bulletsHtml = (e.bullets || [])
			.map(
				(b, bIdx) => `
      <div class="bullet-input-row" data-bidx="${bIdx}">
        <input type="text" class="e-bullet-text" value="${escapeHtml(b)}">
        <button type="button" class="btn-remove-item remove-bullet" title="Remover" aria-label="Remover"><svg class="ic"><use href="#i-x"/></svg></button>
      </div>
    `,
			)
			.join("");

		item.innerHTML = `
      <div class="visual-item-header">
        <span class="visual-item-title">Experiência ${idx + 1}</span>
        <button type="button" class="btn-remove-item remove-exp" title="Remover" aria-label="Remover"><svg class="ic"><use href="#i-x"/></svg></button>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>Cargo</label>
          <input type="text" class="e-role" value="${escapeHtml(e.role)}">
        </div>
        <div class="form-group">
          <label>Empresa</label>
          <input type="text" class="e-company" value="${escapeHtml(e.company)}">
        </div>
      </div>
      <div class="form-group">
        <label>Período (ex: Abr 2023 — Presente)</label>
        <input type="text" class="e-date" value="${escapeHtml(e.date)}">
      </div>
      <div class="form-group">
        <label>Destaques / Atribuições (Bullets)</label>
        <div class="bullet-list-builder">
          ${bulletsHtml}
          <button type="button" class="btn btn-ghost btn-sm add-bullet-btn"><svg class="ic"><use href="#i-plus"/></svg>Adicionar Linha</button>
        </div>
      </div>
    `;

		// Remove Experience
		item.querySelector(".remove-exp").onclick = () => {
			currentResume.experience.splice(idx, 1);
			populateForm();
			renderPreview();
		};

		// Text listeners
		item.querySelector(".e-role").oninput = (evt) => {
			currentResume.experience[idx].role = evt.target.value;
			renderPreview();
		};
		item.querySelector(".e-company").oninput = (evt) => {
			currentResume.experience[idx].company = evt.target.value;
			renderPreview();
		};
		item.querySelector(".e-date").oninput = (evt) => {
			currentResume.experience[idx].date = evt.target.value;
			renderPreview();
		};

		// Bullets listeners
		const bulletRows = item.querySelectorAll(".bullet-input-row");
		bulletRows.forEach((row, bIdx) => {
			row.querySelector(".e-bullet-text").oninput = (evt) => {
				currentResume.experience[idx].bullets[bIdx] = evt.target.value;
				renderPreview();
			};
			row.querySelector(".remove-bullet").onclick = () => {
				currentResume.experience[idx].bullets.splice(bIdx, 1);
				populateForm();
				renderPreview();
			};
		});

		item.querySelector(".add-bullet-btn").onclick = () => {
			if (!currentResume.experience[idx].bullets)
				currentResume.experience[idx].bullets = [];
			currentResume.experience[idx].bullets.push("Nova realização...");
			populateForm();
			renderPreview();
		};

		container.appendChild(item);
	});
}

function addExperience() {
	if (!currentResume) return;
	if (!currentResume.experience) currentResume.experience = [];
	currentResume.experience.push({
		role: "Novo Cargo",
		company: "Nova Empresa",
		date: "Período",
		bullets: ["Destaque da experiência"],
	});
	populateForm();
	renderPreview();
}

// 3. Projects
function renderProjectsList() {
	const container = document.getElementById("projects-list");
	container.innerHTML = "";

	const projects = currentResume.projects || [];
	projects.forEach((p, idx) => {
		const item = document.createElement("div");
		item.className = "visual-item";

		const bulletsHtml = (p.bullets || [])
			.map(
				(b, bIdx) => `
      <div class="bullet-input-row" data-bidx="${bIdx}">
        <input type="text" class="p-bullet-text" value="${escapeHtml(b)}">
        <button type="button" class="btn-remove-item remove-p-bullet" title="Remover" aria-label="Remover"><svg class="ic"><use href="#i-x"/></svg></button>
      </div>
    `,
			)
			.join("");

		const linksHtml = (p.links || [])
			.map(
				(l, lIdx) => `
      <div class="grid-2 bullet-input-row" style="margin-bottom: 6px;">
        <input type="text" class="p-link-label" placeholder="Rótulo (ex: GitHub)" value="${escapeHtml(l.label)}">
        <div class="flex-center">
          <input type="text" class="p-link-url" placeholder="URL" value="${escapeHtml(l.url)}">
          <button type="button" class="btn-remove-item remove-p-link" title="Remover" aria-label="Remover"><svg class="ic"><use href="#i-x"/></svg></button>
        </div>
      </div>
    `,
			)
			.join("");

		item.innerHTML = `
      <div class="visual-item-header">
        <span class="visual-item-title">Projeto ${idx + 1}</span>
        <button type="button" class="btn-remove-item remove-proj" title="Remover" aria-label="Remover"><svg class="ic"><use href="#i-x"/></svg></button>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>Nome do Projeto</label>
          <input type="text" class="p-title" value="${escapeHtml(p.title)}">
        </div>
        <div class="form-group">
          <label>Stack Tecnológica (separada por vírgula)</label>
          <input type="text" class="p-stack" value="${escapeHtml(p.stack)}">
        </div>
      </div>
      <div class="form-group">
        <label>Bullets / Descrição do Projeto</label>
        <div class="bullet-list-builder" style="margin-bottom:12px;">
          ${bulletsHtml}
          <button type="button" class="btn btn-ghost btn-sm add-p-bullet-btn"><svg class="ic"><use href="#i-plus"/></svg>Adicionar Bullet</button>
        </div>
      </div>
      <div class="form-group">
        <label>Links do Projeto</label>
        <div class="bullet-list-builder">
          ${linksHtml}
          <button type="button" class="btn btn-ghost btn-sm add-p-link-btn"><svg class="ic"><use href="#i-plus"/></svg>Adicionar Link</button>
        </div>
      </div>
    `;

		// Remove Project
		item.querySelector(".remove-proj").onclick = () => {
			currentResume.projects.splice(idx, 1);
			populateForm();
			renderPreview();
		};

		// Text fields
		item.querySelector(".p-title").oninput = (evt) => {
			currentResume.projects[idx].title = evt.target.value;
			renderPreview();
		};
		item.querySelector(".p-stack").oninput = (evt) => {
			currentResume.projects[idx].stack = evt.target.value;
			renderPreview();
		};

		// Bullets listeners
		const bulletRows = item.querySelectorAll(".remove-p-bullet");
		bulletRows.forEach((btn, bIdx) => {
			const input = btn.previousElementSibling;
			input.oninput = (evt) => {
				currentResume.projects[idx].bullets[bIdx] = evt.target.value;
				renderPreview();
			};
			btn.onclick = () => {
				currentResume.projects[idx].bullets.splice(bIdx, 1);
				populateForm();
				renderPreview();
			};
		});

		item.querySelector(".add-p-bullet-btn").onclick = () => {
			if (!currentResume.projects[idx].bullets)
				currentResume.projects[idx].bullets = [];
			currentResume.projects[idx].bullets.push(
				"Descreva uma feature ou realização no projeto...",
			);
			populateForm();
			renderPreview();
		};

		// Links listeners
		const linkRows = item.querySelectorAll(".remove-p-link");
		linkRows.forEach((btn, lIdx) => {
			const row = btn.closest(".grid-2");
			const labelInput = row.querySelector(".p-link-label");
			const urlInput = row.querySelector(".p-link-url");

			labelInput.oninput = () => {
				currentResume.projects[idx].links[lIdx].label = labelInput.value;
				renderPreview();
			};
			urlInput.oninput = () => {
				currentResume.projects[idx].links[lIdx].url = urlInput.value;
				renderPreview();
			};
			btn.onclick = () => {
				currentResume.projects[idx].links.splice(lIdx, 1);
				populateForm();
				renderPreview();
			};
		});

		item.querySelector(".add-p-link-btn").onclick = () => {
			if (!currentResume.projects[idx].links)
				currentResume.projects[idx].links = [];
			currentResume.projects[idx].links.push({
				label: "Repositório",
				url: "https://github.com/...",
			});
			populateForm();
			renderPreview();
		};

		container.appendChild(item);
	});
}

function addProject() {
	if (!currentResume) return;
	if (!currentResume.projects) currentResume.projects = [];
	currentResume.projects.push({
		title: "Novo Projeto",
		stack: "React, Node.js",
		bullets: ["Implementei as principais funcionalidades..."],
		links: [],
	});
	populateForm();
	renderPreview();
}

// 4. Education
function renderEducationList() {
	const container = document.getElementById("education-list");
	container.innerHTML = "";

	const eds = currentResume.education || [];
	eds.forEach((e, idx) => {
		const item = document.createElement("div");
		item.className = "visual-item";
		item.innerHTML = `
      <div class="visual-item-header">
        <span class="visual-item-title">Educação ${idx + 1}</span>
        <button type="button" class="btn-remove-item remove-edu" title="Remover" aria-label="Remover"><svg class="ic"><use href="#i-x"/></svg></button>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>Curso/Título</label>
          <input type="text" class="e-title" value="${escapeHtml(e.title)}">
        </div>
        <div class="form-group">
          <label>Instituição</label>
          <input type="text" class="e-sub" value="${escapeHtml(e.subtitle)}">
        </div>
      </div>
      <div class="form-group">
        <label>Período (ex: 2022 — 2025)</label>
        <input type="text" class="e-date" value="${escapeHtml(e.date)}">
      </div>
    `;

		item.querySelector(".remove-edu").onclick = () => {
			currentResume.education.splice(idx, 1);
			populateForm();
			renderPreview();
		};

		item.querySelector(".e-title").oninput = (evt) => {
			currentResume.education[idx].title = evt.target.value;
			renderPreview();
		};
		item.querySelector(".e-sub").oninput = (evt) => {
			currentResume.education[idx].subtitle = evt.target.value;
			renderPreview();
		};
		item.querySelector(".e-date").oninput = (evt) => {
			currentResume.education[idx].date = evt.target.value;
			renderPreview();
		};

		container.appendChild(item);
	});
}

function addEducation() {
	if (!currentResume) return;
	if (!currentResume.education) currentResume.education = [];
	currentResume.education.push({
		title: "Nova Formação",
		subtitle: "Universidade",
		date: "Período",
	});
	populateForm();
	renderPreview();
}

// 5. Languages
function renderLanguagesList() {
	const container = document.getElementById("languages-list");
	container.innerHTML = "";

	const langs = currentResume.languages || [];
	langs.forEach((l, idx) => {
		const item = document.createElement("div");
		item.className = "visual-item";
		item.innerHTML = `
      <div class="visual-item-header">
        <span class="visual-item-title">Idioma ${idx + 1}</span>
        <button type="button" class="btn-remove-item remove-lang" title="Remover" aria-label="Remover"><svg class="ic"><use href="#i-x"/></svg></button>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>Idioma</label>
          <input type="text" class="l-name" value="${escapeHtml(l.name)}">
        </div>
        <div class="form-group">
          <label>Nível</label>
          <input type="text" class="l-level" value="${escapeHtml(l.level)}">
        </div>
      </div>
      <div class="form-group">
        <label>Observação/Nota</label>
        <input type="text" class="l-note" value="${escapeHtml(l.note)}">
      </div>
    `;

		item.querySelector(".remove-lang").onclick = () => {
			currentResume.languages.splice(idx, 1);
			populateForm();
			renderPreview();
		};

		item.querySelector(".l-name").oninput = (evt) => {
			currentResume.languages[idx].name = evt.target.value;
			renderPreview();
		};
		item.querySelector(".l-level").oninput = (evt) => {
			currentResume.languages[idx].level = evt.target.value;
			renderPreview();
		};
		item.querySelector(".l-note").oninput = (evt) => {
			currentResume.languages[idx].note = evt.target.value;
			renderPreview();
		};

		container.appendChild(item);
	});
}

function addLanguage() {
	if (!currentResume) return;
	if (!currentResume.languages) currentResume.languages = [];
	currentResume.languages.push({
		name: "Novo Idioma",
		level: "Fluência",
		note: "Nota adicional",
	});
	populateForm();
	renderPreview();
}

// =============================================================================
// Vagas: carregadas uma vez e filtradas no navegador (filtros combináveis)
// =============================================================================
let allJobs = [];
let jobsMeta = {};
let jobsShown = 40;
const JOBS_PAGE = 40;

const norm = (s) =>
	String(s || "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
const stripEmoji = (s) =>
	String(s || "")
		.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F]/gu, "")
		.replace(/\s+/g, " ")
		.trim();
const jobText = (j) =>
	norm(
		`${j.title} ${j.company} ${(j.tags || []).join(" ")} ${j.description || ""}`,
	);

function jobPlace(j) {
	if (j.location_type === "bh") return "bh";
	return /internacional|aceita brasil|pais nao informado|confirme o pais/.test(
		norm(j.location),
	)
		? "intl"
		: "remote_br";
}

const TECH_RE = {
	php: /\b(php|laravel|moodle|wordpress|symfony|lms)\b/,
	fullstack: /full[ -]?stack/,
	frontend: /front[ -]?end|\breact\b|angular|\bvue\b|next\.?js/,
	backend:
		/back[ -]?end|\bnode|\bjava\b|python|golang|\bgo\b|\.net|\bc#|kotlin|ruby/,
	devops:
		/devops|\bsre\b|site reliability|cloud|platform engineer|kubernetes|\baws\b|\bgcp\b|azure|infra/,
	data: /\bdata\b|dados|machine learning|\bml\b|\bai\b|\bia\b|\bllm|databricks|analytics/,
	mobile: /mobile|android|\bios\b|react native|flutter|kotlin|swift/,
};

const JOB_FACETS = [
	{
		key: "sector",
		label: "Setor",
		options: [
			["all", "Todos"],
			["saude", "Saúde"],
			["edtech", "Educação"],
			["tech", "Tecnologia"],
		],
		test: (j, v) => (j.sector || "tech") === v,
	},
	{
		key: "place",
		label: "Local",
		options: [
			["all", "Todos"],
			["remote_br", "Remoto no Brasil"],
			["intl", "Remoto internacional"],
			["bh", "Grande BH"],
		],
		test: (j, v) => jobPlace(j) === v,
	},
	{
		key: "tech",
		label: "Tecnologia",
		options: [
			["all", "Todas"],
			["php", "PHP & Moodle"],
			["fullstack", "Full Stack"],
			["frontend", "Front-end"],
			["backend", "Back-end"],
			["devops", "DevOps & Cloud"],
			["data", "Dados & IA"],
			["mobile", "Mobile"],
		],
		test: (j, v) => TECH_RE[v].test(jobText(j)),
	},
	{
		key: "source",
		label: "Origem",
		options: [
			["all", "Todas"],
			["empresa", "Site da empresa"],
			["agregador", "Agregadores"],
			["comunidade", "Comunidades"],
		],
		test: (j, v) => j.source_type === v,
	},
	// Vagas salvas, candidaturas e currículos adaptados (no navegador ou, com login, na nuvem)
	{
		key: "track",
		label: "Minhas vagas",
		options: [
			["all", "Todas"],
			["saved", "Salvas"],
			["applied", "Apliquei"],
			["adapted", "Adaptei o currículo"],
		],
		test: (j, v) => {
			const t = jobTracking[j.id] || {};
			return v === "saved"
				? !!t.saved
				: v === "applied"
					? !!t.applied_at
					: !!t.adapted_at;
		},
	},
];
const activeFacets = () =>
	JOB_FACETS.filter((f) => !f.requiresLogin || cloudUser);

const DEFAULT_JOB_FILTERS = {
	sector: "all",
	place: "all",
	tech: "all",
	source: "all",
	track: "all",
	q: "",
	sort: "match",
};
let jobFilters = { ...DEFAULT_JOB_FILTERS, ...store.get("job_filters", {}) };

function setupJobSearchListeners() {
	const input = document.getElementById("jobSearchQuery");
	const sort = document.getElementById("jobSort");
	input.value = jobFilters.q;
	sort.value = jobFilters.sort;

	let t = null;
	input.addEventListener("input", () => {
		clearTimeout(t);
		t = setTimeout(() => {
			jobFilters.q = input.value.trim();
			jobsShown = JOBS_PAGE;
			applyJobFilters();
		}, 200);
	});
	sort.addEventListener("change", () => {
		jobFilters.sort = sort.value;
		applyJobFilters();
	});

	document.getElementById("jobFacets").addEventListener("click", (e) => {
		const chip = e.target.closest("[data-facet]");
		if (!chip || chip.disabled) return;
		jobFilters[chip.dataset.facet] = chip.dataset.value;
		jobsShown = JOBS_PAGE;
		applyJobFilters();
	});

	document.getElementById("btnClearFilters").addEventListener("click", () => {
		jobFilters = { ...DEFAULT_JOB_FILTERS, sort: jobFilters.sort };
		input.value = "";
		applyJobFilters();
	});

	document
		.getElementById("btnRefreshJobs")
		.addEventListener("click", () => loadJobs(true));
}

async function loadJobs(forceRefresh = false) {
	const list = document.getElementById("jobsList");
	if (forceRefresh)
		showLoader(
			"Coletando vagas de todas as fontes… pode levar alguns minutos.",
			true,
		);
	else if (!allJobs.length) list.innerHTML = skeletonCards(3);
	try {
		const res = await fetch(
			`/api/jobs?search=todas&limit=1000&refresh=${forceRefresh}`,
		);
		const data = await res.json();
		if (!res.ok || !data.success)
			throw new Error(data.error || "Erro ao carregar vagas.");
		allJobs = data.jobs || [];
		jobsMeta = data;
		const navCount = document.getElementById("jobsNavCount");
		if (navCount) navCount.textContent = allJobs.length || "";
		const discarded = Object.values(data.discarded || {}).reduce(
			(a, b) => a + b,
			0,
		);
		const updated = document.getElementById("jobsLastUpdated");
		if (updated && data.last_updated) {
			updated.innerHTML =
				`Vagas reais e ativas, coletadas diariamente às 07:00. Última coleta: <strong>${escapeHtml(data.last_updated)}</strong>` +
				(discarded
					? ` · <span class="has-tip" title="${escapeHtml(
							Object.entries(data.discarded)
								.map(([k, v]) => `${v}: ${k}`)
								.join("\n"),
						)}">${discarded} vagas fantasmas, antigas ou duplicadas descartadas</span>`
					: "");
		}
		if (forceRefresh)
			notify(`${allJobs.length} vagas ativas carregadas.`, "success");
		applyJobFilters();
	} catch (err) {
		list.innerHTML = `<div class="empty-state">${icon("alert")}<h3>Não foi possível carregar as vagas</h3><p>${escapeHtml(err.message)}</p></div>`;
	} finally {
		if (forceRefresh) hideLoader();
	}
}

function skeletonCards(n) {
	return Array.from(
		{ length: n },
		() =>
			'<div class="job-card skeleton"><div class="sk sk-title"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>',
	).join("");
}

// Vagas acompanhadas que saíram da coleta (encerradas) continuam visíveis em "Minhas vagas".
function jobsUniverse(includeClosed = (jobFilters.track || "all") !== "all") {
	if (!includeClosed) return allJobs;
	const ids = new Set(allJobs.map((j) => j.id));
	const closed = Object.entries(jobTracking)
		.filter(([id]) => !ids.has(id))
		.map(([id, t]) => ({
			id,
			title: t.title || "Vaga",
			company: t.company || "",
			url: t.url || "#",
			location: t.location || "",
			source: t.source,
			source_type: t.source_type,
			sector: t.sector,
			modalities: [],
			tags: [],
			description: "",
			days_ago: null,
			closed: true,
		}));
	return allJobs.concat(closed);
}

function jobMatchesFilters(j, except = null) {
	for (const f of activeFacets()) {
		if (f.key === except) continue;
		const v = jobFilters[f.key];
		if (v && v !== "all" && !f.test(j, v)) return false;
	}
	if (jobFilters.q) {
		const text = jobText(j) + " " + norm(j.location);
		if (
			!norm(jobFilters.q)
				.split(/\s+/)
				.every((tok) => text.includes(tok))
		)
			return false;
	}
	return true;
}

function renderFacets() {
	const box = document.getElementById("jobFacets");
	box.innerHTML = activeFacets()
		.map((f) => {
			// Contagem de cada opção considerando os demais filtros ativos.
			// Em "Minhas vagas", as contagens incluem vagas acompanhadas que já foram encerradas.
			const base = jobsUniverse(f.key === "track" ? true : undefined).filter(
				(j) => jobMatchesFilters(j, f.key),
			);
			const chips = f.options
				.map(([value, label]) => {
					const count =
						value === "all"
							? base.filter((j) => !j.closed).length
							: base.filter((j) => f.test(j, value)).length;
					const active = (jobFilters[f.key] || "all") === value;
					const disabled = !active && value !== "all" && count === 0;
					return `<button type="button" class="chip${active ? " active" : ""}" data-facet="${f.key}" data-value="${value}" ${disabled ? "disabled" : ""}>
        ${escapeHtml(label)}<span class="chip-count">${count}</span></button>`;
				})
				.join("");
			return `<div class="facet-row"><span class="facet-label">${f.label}</span><div class="facet-chips">${chips}</div></div>`;
		})
		.join("");
}

function applyJobFilters() {
	store.set("job_filters", jobFilters);
	renderFacets();

	const candidateSkills = getCandidateSkillsList();
	const visible = jobsUniverse()
		.filter((j) => jobMatchesFilters(j))
		.map((j) => ({ ...j, ...evaluateJobMatch(j, candidateSkills) }));

	visible.sort(
		jobFilters.sort === "recent"
			? (a, b) => (a.days_ago ?? 99) - (b.days_ago ?? 99) || b.score - a.score
			: (a, b) => b.score - a.score || (a.days_ago ?? 99) - (b.days_ago ?? 99),
	);

	const isFiltered =
		JSON.stringify({ ...jobFilters, sort: "" }) !==
		JSON.stringify({ ...DEFAULT_JOB_FILTERS, sort: "" });
	document
		.getElementById("btnClearFilters")
		.classList.toggle("hidden", !isFiltered);
	const fromCompanies = visible.filter(
		(j) => j.source_type === "empresa",
	).length;
	document.getElementById("jobsCount").innerHTML = allJobs.length
		? `<strong>${visible.length}</strong> de ${allJobs.length} vagas · ${fromCompanies} direto do site da empresa`
		: "Nenhuma vaga no banco ainda.";

	const list = document.getElementById("jobsList");
	if (!visible.length) {
		list.innerHTML = `<div class="empty-state">${icon("search")}<h3>Nenhuma vaga com esses filtros</h3>
      <p>${jobFilters.tech === "php" ? "Vagas de PHP/Moodle são raras: as fontes específicas (Moodle.org, ProgramaThor, phpdevbr) são verificadas todo dia." : "Tente remover algum filtro ou buscar outro termo."}</p></div>`;
		return;
	}

	list.innerHTML =
		visible
			.slice(0, jobsShown)
			.map((j, idx) => jobCardHtml(j, idx))
			.join("") +
		(visible.length > jobsShown
			? `<button type="button" class="btn btn-secondary btn-block" id="btnMoreJobs">Mostrar mais ${Math.min(JOBS_PAGE, visible.length - jobsShown)} vagas</button>`
			: "");

	list.querySelectorAll("[data-adapt]").forEach((btn) => {
		btn.addEventListener("click", () =>
			transferJobToOptimizer(visible[Number(btn.dataset.adapt)]),
		);
	});
	list.querySelectorAll("[data-track]").forEach((btn) => {
		btn.addEventListener("click", () =>
			toggleJobTrack(visible[Number(btn.dataset.job)], btn.dataset.track),
		);
	});
	document.getElementById("btnMoreJobs")?.addEventListener("click", () => {
		jobsShown += JOBS_PAGE;
		applyJobFilters();
	});
}

function getCandidateSkillsList() {
	const skills = [];
	(currentResume?.skills || []).forEach((group) => {
		(group.items || []).forEach((item) =>
			skills.push(
				...item
					.split(/[&,/()]+|\be\b|\band\b/)
					.map((s) => s.trim())
					.filter((s) => s.length > 1),
			),
		);
	});
	if (!skills.length)
		skills.push(
			"React",
			"TypeScript",
			"Node.js",
			"Python",
			"AWS",
			"Docker",
			"DevOps",
			"PostgreSQL",
			"CI/CD",
		);
	return [...new Set(skills)];
}

function evaluateJobMatch(job, candidateSkills) {
	const text = ` ${norm(`${job.title} ${(job.tags || []).join(" ")} ${job.description || ""}`)} `;
	const matched = candidateSkills.filter((skill) => {
		const s = norm(skill);
		if (s.length < 2 || s.split(" ").length > 3) return false;
		const re = new RegExp(
			`(^|[^a-z0-9])${s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}([^a-z0-9]|$)`,
		);
		return re.test(text);
	});
	const uniqueMatches = [...new Set(matched)];

	let score = 50 + Math.min(30, uniqueMatches.length * 5);
	const isHealthcare = job.sector === "saude";
	const isEdTech = job.sector === "edtech";
	if (isHealthcare || isEdTech) score += 10; // setores-alvo
	if (job.location_type === "bh") score += 8;
	else if (job.location_type === "remote") score += 6;
	if (job.source_type === "empresa") score += 2;
	score = Math.max(35, Math.min(99, score));
	return {
		score,
		matchedSkills: uniqueMatches.slice(0, 6),
		isHealthcare,
		isEdTech,
		isInternational: jobPlace(job) === "intl",
	};
}

function relativeDays(d) {
	if (d === null || d === undefined) return null;
	return d === 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`;
}

function jobCardHtml(job, idx) {
	const place = jobPlace(job);
	const loc = stripEmoji(job.location);
	const chips = [];
	if (job.source_type === "empresa")
		chips.push(
			`<span class="meta-chip verified" title="Lida direto da página de carreiras oficial da empresa">${icon("shield")}Site da empresa</span>`,
		);
	else if (job.source_type === "comunidade")
		chips.push(
			`<span class="meta-chip" title="${escapeHtml(job.source || "")}">${icon("users")}${escapeHtml(job.source?.replace(/^Comunidade /, "") || "Comunidade")}</span>`,
		);
	else
		chips.push(
			`<span class="meta-chip" title="${job.verified ? "Link conferido na coleta" : "Agregador de vagas"}">${icon("link")}${escapeHtml(job.source || "Agregador")}</span>`,
		);
	const rel = relativeDays(job.days_ago);
	if (rel)
		chips.push(
			`<span class="meta-chip ${job.days_ago <= 7 ? "fresh" : ""}">${icon("clock")}Publicada ${rel}</span>`,
		);
	(job.modalities || [])
		.slice(0, 2)
		.forEach((m) =>
			chips.push(
				`<span class="meta-chip">${icon("briefcase")}${escapeHtml(m)}</span>`,
			),
		);
	if (job.expires_at) {
		const d = new Date(job.expires_at);
		if (!Number.isNaN(d.getTime()))
			chips.push(
				`<span class="meta-chip">${icon("calendar")}Inscrições até ${d.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</span>`,
			);
	}
	if (job.isHealthcare)
		chips.push(`<span class="meta-chip sector">Saúde</span>`);
	if (job.isEdTech)
		chips.push(`<span class="meta-chip sector">Educação</span>`);
	if (job.niche)
		chips.push(
			`<span class="meta-chip niche" title="Fonte de nicho: anúncios ficam até 60 dias — confirme se ainda está aberta">${icon("target")}Nicho ${escapeHtml(job.niche)}</span>`,
		);

	// Acompanhamento (com login)
	const track = jobTracking[job.id] || {};
	const trackChips = [];
	if (job.closed)
		trackChips.push(
			`<span class="meta-chip niche" title="A vaga saiu da coleta diária (encerrada ou expirada)">${icon("alert")}Não está mais ativa</span>`,
		);
	if (track.applied_at)
		trackChips.push(
			`<span class="meta-chip verified" title="Etapa atual do processo">${icon("send")}${escapeHtml(stageLabel(track.stage))} · inscrição em ${formatDateBR(track.applied_at)}</span>`,
		);
	if (track.adapted_at)
		trackChips.push(
			`<span class="meta-chip sector">${icon("sparkles")}Currículo adaptado em ${formatDateBR(track.adapted_at)}</span>`,
		);
	chips.unshift(...trackChips);

	const salary =
		job.salary && !/^(PJ|CLT|Freelance|Contrato)/.test(job.salary)
			? `<span class="job-salary">${escapeHtml(job.salary)}</span>`
			: "";
	const scoreCls = job.score >= 85 ? "high" : job.score >= 70 ? "mid" : "low";

	return `
    <article class="job-card">
      <div class="job-head">
        <div class="job-heading">
          <h3 class="job-title">${escapeHtml(job.title)}</h3>
          <div class="job-sub">
            <span class="job-company">${icon("building")}${escapeHtml(job.company)}</span>
            <span class="job-loc">${icon(place === "bh" ? "pin" : place === "intl" ? "globe" : "home")}${escapeHtml(loc)}</span>
          </div>
        </div>
        <div class="match ${scoreCls}" title="Compatibilidade com seu currículo, setores e localidade">
          <span class="match-value">${job.score}%</span><span class="match-label">match</span>
        </div>
      </div>
      <div class="job-meta">${chips.join("")}</div>
      ${job.description ? `<p class="job-excerpt">${escapeHtml(job.description)}</p>` : ""}
      <div class="job-foot">
        <div class="job-skills">${job.matchedSkills.length ? `<span class="skills-label">Você tem:</span>${job.matchedSkills.map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`).join("")}` : ""}${salary}</div>
        <div class="job-actions">
          <button type="button" class="btn btn-icon-only toggle${track.saved ? " on" : ""}" data-track="saved" data-job="${idx}" aria-pressed="${!!track.saved}" title="${track.saved ? "Remover das vagas salvas" : "Salvar vaga"}">${icon("bookmark")}</button>
          <button type="button" class="btn btn-secondary btn-sm toggle${track.applied_at ? " on" : ""}" data-track="applied" data-job="${idx}" title="${track.applied_at ? "Abrir o acompanhamento desta candidatura" : "Marque quando enviar sua candidatura: ela entra na planilha de acompanhamento"}">${icon(track.applied_at ? "table" : "send")}${track.applied_at ? "Ver candidatura" : "Apliquei"}</button>
          <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">Ver vaga ${icon("external")}</a>
          ${job.closed ? "" : `<button type="button" class="btn btn-primary btn-sm" data-adapt="${idx}">${icon("sparkles")}Adaptar currículo</button>`}
        </div>
      </div>
    </article>`;
}

function transferJobToOptimizer(job) {
	trackJob(job, { adapted_at: new Date().toISOString() }).catch((err) =>
		console.warn("[tracking] adaptar:", err.message),
	);
	jobDescriptionInput.value = `VAGA: ${job.title} — ${job.company}\nLOCAL: ${stripEmoji(job.location)}\nLINK: ${job.url}\n\nDESCRIÇÃO:\n${job.description || ""}`;
	switchTab("tab-optimize");
	jobDescriptionInput.focus();
	notify(
		"Descrição da vaga preenchida. Abra o link para colar o texto completo, se quiser mais precisão.",
		"info",
		{ timeout: 6000 },
	);
}

// =============================================================================
// Ideias de projetos (backlog automático, persistente e evolutivo)
// =============================================================================
const IDEAS_LOCAL_KEY = "project_ideas_state";
let ideasLoaded = false;
let ideasStatusFilter = "all";
let ideasState = store.get(IDEAS_LOCAL_KEY, {
	ideas: [],
	statuses: {}, // id -> "planned" | "in_progress" | "done"
	dismissed: [], // lista de { id, title } descartados pelo usuário
	analysis: null,
	jobs_updated_at: "",
	updated_at: "",
	generated_by: "catalogo",
});

function saveIdeasState() {
	store.set(IDEAS_LOCAL_KEY, ideasState);
	updateIdeasBadge();
}

function updateIdeasBadge() {
	const badge = document.getElementById("ideasNavCount");
	if (!badge) return;
	const activeCount = (ideasState.ideas || []).filter(
		(i) => ideasState.statuses?.[i.id] !== "done",
	).length;
	badge.textContent = activeCount ? String(activeCount) : "";
}

function ideaSlug(title = "") {
	return String(title || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 72);
}

function mergeIdeasLists(localList = [], serverList = [], dismissed = []) {
	const dismissedIds = new Set(
		(dismissed || []).map((d) => (typeof d === "string" ? d : d.id)),
	);
	const byId = new Map();
	for (const raw of [...serverList, ...localList]) {
		if (!raw || !raw.title) continue;
		const id = raw.id || ideaSlug(raw.title);
		if (dismissedIds.has(id)) continue;
		const item = { ...raw, id, version: Math.max(1, Number(raw.version) || 1) };
		const prev = byId.get(id);
		if (!prev) {
			byId.set(id, item);
		} else {
			const pickNew =
				item.version > prev.version ||
				(item.version === prev.version &&
					String(item.updated_at || "") > String(prev.updated_at || ""));
			if (pickNew) byId.set(id, item);
		}
	}
	return [...byId.values()];
}

async function fetchIdeasApi(payload) {
	const res = await fetch("/api/project-ideas", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	const contentType = res.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		throw new Error(
			"Servidor local desatualizado para /api/project-ideas. Reinicie o `npm run server`.",
		);
	}
	const data = await res.json();
	if (!res.ok || !data.success) {
		throw new Error(data.error || "Erro ao processar ideias de projetos.");
	}
	return data;
}

async function loadProjectIdeas() {
	const container = document.getElementById("ideasResult");
	if (!container) return;

	// Exibe imediatamente o que já existe salvo no navegador enquanto sincroniza lacunas
	if (ideasState.ideas?.length && ideasState.analysis) {
		updateIdeasBadge();
		renderProjectIdeas(container);
	}

	try {
		const data = await fetchIdeasApi({
			action: "sync",
			resume: currentResume,
		});
		ideasLoaded = true;
		ideasState.ideas = mergeIdeasLists(
			ideasState.ideas,
			data.ideas || [],
			ideasState.dismissed,
		);
		ideasState.analysis = data.analysis;
		ideasState.jobs_updated_at = data.jobs_updated_at || ideasState.jobs_updated_at;
		ideasState.updated_at = data.updated_at || ideasState.updated_at;
		if (!ideasState.generated_by) ideasState.generated_by = data.generated_by || "catalogo";
		saveIdeasState();
		renderProjectIdeas(container);
	} catch (err) {
		if (!ideasState.ideas?.length) {
			container.innerHTML = `<div class="empty-state">${icon("alert")}<h3>Não foi possível carregar as ideias</h3><p>${escapeHtml(err.message)}</p></div>`;
		}
	}
}

async function generateNewProjectIdeas() {
	const container = document.getElementById("ideasResult");
	const btn = document.getElementById("btnGenerateIdeas");
	const useAi = document.getElementById("ideasUseAi")?.checked ?? true;
	if (!currentResume) return;

	const existingTitles = [
		...(ideasState.ideas || []).map((i) => i.title),
		...(ideasState.dismissed || []).map((d) => (typeof d === "string" ? d : d.title)),
	].filter(Boolean);

	btn.disabled = true;
	showLoader(
		useAi
			? "Gerando novas ideias inéditas com IA…"
			: "Buscando novas ideias diferentes no catálogo…",
		true,
	);
	try {
		const data = await fetchIdeasApi({
			action: "new",
			resume: currentResume,
			customApiKey: customApiKeyInput.value || null,
			useAi,
			count: 3,
			existingTitles,
		});
		const existingIds = new Set((ideasState.ideas || []).map((i) => i.id));
		const fresh = (data.ideas || []).filter((i) => !existingIds.has(i.id));
		ideasState.analysis = data.analysis || ideasState.analysis;
		ideasState.jobs_updated_at = data.jobs_updated_at || ideasState.jobs_updated_at;
		ideasState.updated_at = data.updated_at || new Date().toISOString();
		ideasState.generated_by = data.generated_by || ideasState.generated_by;
		ideasState.warning = data.warning || "";
		if (fresh.length) {
			ideasState.ideas = [...fresh, ...(ideasState.ideas || [])];
			saveIdeasState();
			renderProjectIdeas(container);
			notify(
				`${fresh.length} ${fresh.length === 1 ? "nova ideia adicionada" : "novas ideias adicionadas"} à sua lista.`,
				"success",
			);
		} else {
			saveIdeasState();
			renderProjectIdeas(container);
			notify(
				"Todas as ideias do catálogo já estão na sua lista. Ative a IA ou clique em “Melhorar” em uma ideia existente.",
				"info",
			);
		}
	} catch (err) {
		notify(err.message, "error");
	} finally {
		btn.disabled = false;
		hideLoader();
	}
}

async function improveProjectIdeaById(id) {
	const container = document.getElementById("ideasResult");
	const idx = (ideasState.ideas || []).findIndex((i) => i.id === id);
	if (idx < 0 || !currentResume) return;
	const target = ideasState.ideas[idx];
	const useAi = document.getElementById("ideasUseAi")?.checked ?? true;

	const cardBtn = container.querySelector(`[data-improve-idea="${CSS.escape(id)}"]`);
	const headerBtn = document.getElementById("btnImproveNextIdea");
	if (cardBtn) cardBtn.disabled = true;
	if (headerBtn) headerBtn.disabled = true;

	showLoader(`Evoluindo "${target.title}" para v${(target.version || 1) + 1}…`, true);
	try {
		const data = await fetchIdeasApi({
			action: "improve",
			idea: target,
			resume: currentResume,
			customApiKey: customApiKeyInput.value || null,
			useAi,
		});
		if (data.idea) {
			ideasState.ideas[idx] = data.idea;
			ideasState.analysis = data.analysis || ideasState.analysis;
			ideasState.updated_at = data.updated_at || new Date().toISOString();
			ideasState.warning = data.warning || "";
			saveIdeasState();
			renderProjectIdeas(container);
			notify(
				`Ideia evoluída para v${data.idea.version}: ${data.idea.improved_note || "escopo técnico aprofundado."}`,
				"success",
			);
		}
	} catch (err) {
		notify(err.message, "error");
	} finally {
		if (cardBtn) cardBtn.disabled = false;
		if (headerBtn) headerBtn.disabled = false;
		hideLoader();
	}
}

function improveNextProjectIdea() {
	const candidates = (ideasState.ideas || []).filter(
		(i) => ideasState.statuses?.[i.id] !== "done",
	);
	if (!candidates.length) {
		return generateNewProjectIdeas();
	}
	candidates.sort((a, b) => {
		const dv = (a.version || 1) - (b.version || 1);
		if (dv !== 0) return dv;
		return String(a.updated_at || "").localeCompare(String(b.updated_at || ""));
	});
	return improveProjectIdeaById(candidates[0].id);
}

const ROADMAP_12M_KEY = "career_roadmap_12m_v1";
const CORE_STACK_12 = [
	"TypeScript",
	"Node.js",
	"React",
	"Python",
	"PostgreSQL",
	"Redis",
	"AWS",
	"Docker",
	"Kubernetes",
	"Terraform",
	"LLMs / IA generativa",
	"RAG / Vector DB",
];
const ROADMAP_12M = [
	{ id: "m12", period: "Meses 1–2", focus: "Backend e System Design", delivery: "API robusta, autenticação, filas e testes automatizados" },
	{ id: "m34", period: "Meses 3–4", focus: "AI Engineering", delivery: "Plataforma RAG com citações e avaliação de respostas (evals)" },
	{ id: "m56", period: "Meses 5–6", focus: "Cloud e DevOps", delivery: "Deploy AWS, Docker, Terraform e CI/CD automatizado" },
	{ id: "m78", period: "Meses 7–8", focus: "Segurança e Observabilidade", delivery: "Logs, tracing (OpenTelemetry), métricas e controle de acesso" },
	{ id: "m910", period: "Meses 9–10", focus: "Produto e Arquitetura", delivery: "Evoluir um projeto flagship para SaaS multi-tenant" },
	{ id: "m1112", period: "Meses 11–12", focus: "Mercado Internacional", delivery: "Portfólio em inglês, entrevistas técnicas e candidaturas globais" },
];

function renderProjectIdeas(container) {
	const a = ideasState.analysis;
	if (!a) return;

	const maxJobs = Math.max(1, ...(a.top_demand || []).map((s) => s.jobs));
	const STATUS_GAP = {
		proven: "Comprovado por projeto",
		unproven: "No currículo, sem projeto",
		missing: "Falta no currículo",
	};
	const statusOf = (s) =>
		s.proven_by_project ? "proven" : s.in_resume ? "unproven" : "missing";

	const rows = (a.top_demand || [])
		.slice(0, 15)
		.map((s) => {
			const st = statusOf(s);
			return `<div class="demand-row" title="${escapeHtml((s.sample_jobs || []).join("\n"))}">
      <span class="demand-tech">${escapeHtml(s.tech)}</span>
      <span class="demand-bar"><span class="demand-fill ${st}" style="width:${Math.round((s.jobs / maxJobs) * 100)}%"></span></span>
      <span class="demand-count">${s.jobs}</span>
      <span class="status-pill ${st}"><span class="dot"></span>${STATUS_GAP[st]}</span>
    </div>`;
		})
		.join("");

	const allIdeas = ideasState.ideas || [];
	const getStatus = (id) => ideasState.statuses?.[id] || "planned";
	const filteredIdeas =
		ideasStatusFilter === "all"
			? allIdeas
			: allIdeas.filter((i) => getStatus(i.id) === ideasStatusFilter);

	const counts = {
		all: allIdeas.length,
		planned: allIdeas.filter((i) => getStatus(i.id) === "planned").length,
		in_progress: allIdeas.filter((i) => getStatus(i.id) === "in_progress").length,
		done: allIdeas.filter((i) => getStatus(i.id) === "done").length,
	};

	const filterChips = [
		["all", `Todas (${counts.all})`],
		["planned", `Planejadas (${counts.planned})`],
		["in_progress", `Construindo (${counts.in_progress})`],
		["done", `Concluídas (${counts.done})`],
	]
		.map(
			([key, label]) =>
				`<button type="button" class="chip ${ideasStatusFilter === key ? "active" : ""}" data-ideas-filter="${key}" aria-pressed="${ideasStatusFilter === key}">${escapeHtml(label)}</button>`,
		)
		.join("");

	const ideasHtml = filteredIdeas
		.map((idea) => {
			const st = getStatus(idea.id);
			const ver = Math.max(1, Number(idea.version) || 1);
			return `
    <article class="idea-card" data-idea-id="${escapeHtml(idea.id)}">
      <header class="idea-header">
        <h3>${escapeHtml(idea.title)}</h3>
        <div class="idea-badges">
          <span class="idea-version" title="Versão desta ideia">v${ver}</span>
          <span class="meta-chip sector">${escapeHtml(idea.sector || "")}</span>
        </div>
      </header>
      <p class="idea-problem">${escapeHtml(idea.problem || "")}</p>
      ${idea.improved_note ? `<div class="idea-improved">${icon("sparkles")}<span><strong>Evolução v${ver}:</strong> ${escapeHtml(idea.improved_note)}</span></div>` : ""}
      <div class="idea-block"><span class="idea-label">Comprova</span><div class="tag-row">${(idea.covers || []).map((c) => `<span class="skill-tag strong">${escapeHtml(c)}</span>`).join("")}</div></div>
      <div class="idea-block"><span class="idea-label">Stack</span><span class="idea-stack">${escapeHtml((idea.stack || []).join(" · "))}</span></div>
      <ul class="idea-features">${(idea.features || []).map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
      <footer class="idea-footer">
        <span class="idea-effort">${icon("clock")}~${escapeHtml(String(idea.weeks || "?"))} semanas · ${escapeHtml(idea.difficulty || "")}</span>
        <div class="idea-footer-actions">
          <select class="idea-status-select" data-idea-status="${escapeHtml(idea.id)}" aria-label="Status do projeto ${escapeHtml(idea.title)}">
            <option value="planned" ${st === "planned" ? "selected" : ""}>Planejada</option>
            <option value="in_progress" ${st === "in_progress" ? "selected" : ""}>Construindo</option>
            <option value="done" ${st === "done" ? "selected" : ""}>Concluída</option>
          </select>
          <button type="button" class="btn btn-secondary btn-sm" data-improve-idea="${escapeHtml(idea.id)}" title="Evolui esta ideia com mais profundidade arquitetural e lacunas atuais">${icon("sparkles")}Melhorar</button>
          <button type="button" class="btn btn-secondary btn-sm" data-copy-idea="${escapeHtml(idea.id)}" title="Copia um bullet pronto para o currículo (use quando o projeto estiver publicado)">${icon("copy")}Bullet</button>
          <button type="button" class="btn btn-ghost btn-sm" data-dismiss-idea="${escapeHtml(idea.id)}" aria-label="Remover ideia ${escapeHtml(idea.title)}" title="Remover da lista (não será sugerida novamente)">${icon("x")}</button>
        </div>
      </footer>
    </article>`;
		})
		.join("");

	const roadmapState = store.get(ROADMAP_12M_KEY, {});
	const roadmapDone = ROADMAP_12M.filter((s) => Boolean(roadmapState[s.id])).length;
	const byTech = new Map((a.top_demand || []).map((s) => [s.tech, s]));
	const provenSet = new Set(a.proven || []);
	const cvBlob = resumeSearchBlob(currentResume || {});
	const corePills = CORE_STACK_12.map((tech) => {
		const info = byTech.get(tech);
		const st = info
			? statusOf(info)
			: provenSet.has(tech)
				? "proven"
				: new RegExp(`\\b${tech.split(/[ /]/)[0].replace(/[.+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(cvBlob)
					? "unproven"
					: "missing";
		const shortName = tech.replace(" / IA generativa", "").replace(" / Vector DB", "");
		return `<span class="core-pill ${st}" title="${escapeHtml(STATUS_GAP[st])}"><span class="dot"></span>${escapeHtml(shortName)}</span>`;
	}).join("");

	const roadmapHtml = ROADMAP_12M.map((step) => {
		const done = Boolean(roadmapState[step.id]);
		return `<label class="roadmap-step ${done ? "done" : ""}">
      <input type="checkbox" data-roadmap-id="${step.id}" ${done ? "checked" : ""}>
      <div>
        <strong>${escapeHtml(step.period)} · ${escapeHtml(step.focus)}</strong>
        <span>${escapeHtml(step.delivery)}</span>
      </div>
    </label>`;
	}).join("");

	container.innerHTML = `
    <div class="stats-row">
      <div class="stat"><span class="stat-value">${a.jobs_analyzed}</span><span class="stat-label">vagas analisadas</span></div>
      <div class="stat"><span class="stat-value">${allIdeas.length}</span><span class="stat-label">ideias no backlog</span></div>
      <div class="stat"><span class="stat-value text-danger">${(a.missing || []).length}</span><span class="stat-label">tecnologias faltando</span></div>
      <div class="stat"><span class="stat-value text-warn">${(a.unproven || []).length}</span><span class="stat-label">sem projeto que comprove</span></div>
    </div>
    ${ideasState.warning ? `<div class="notice">${icon("alert")}<span>${escapeHtml(ideasState.warning)}</span></div>` : ""}
    <section class="card" style="margin-bottom:18px">
      <div class="cv-versions-head" style="margin-bottom:4px">
        <div>
          <h2 class="card-title">Foco de evolução: Full Stack + Backend + AI + Cloud</h2>
          <p class="card-sub">Stack central de 12 tecnologias (evita dispersar em 10 stacks paralelas). Verde = comprovada em projeto · Amarelo = no CV sem projeto · Vermelho = prioridade.</p>
        </div>
        <span class="meta-chip sector">${roadmapDone}/${ROADMAP_12M.length} marcos (12m)</span>
      </div>
      <div class="core-stack-row">${corePills}</div>
      <div class="roadmap-grid">${roadmapHtml}</div>
    </section>
    <div class="ideas-toolbar-row">
      <h2 class="section-title">Backlog de projetos sugeridos</h2>
      <div class="facet-chips" role="group" aria-label="Filtrar ideias por status">${filterChips}</div>
    </div>
    <div class="ideas-grid">${ideasHtml || '<div class="empty-state small"><p>Nenhuma ideia neste filtro. Clique em “+ Novas ideias” ou mude o filtro.</p></div>'}</div>
    <section class="card" style="margin-top:20px">
      <h2 class="card-title">Tecnologias mais pedidas × seu currículo</h2>
      <p class="card-sub">Coleta de ${escapeHtml(ideasState.jobs_updated_at || "—")}. Passe o mouse para ver vagas de exemplo.</p>
      <div class="demand-chart">${rows || '<p class="muted">Poucas vagas para analisar.</p>'}</div>
    </section>`;

	container.querySelectorAll("[data-roadmap-id]").forEach((cb) => {
		cb.addEventListener("change", () => {
			const next = { ...store.get(ROADMAP_12M_KEY, {}), [cb.dataset.roadmapId]: cb.checked };
			store.set(ROADMAP_12M_KEY, next);
			renderProjectIdeas(container);
		});
	});

	container.querySelectorAll("[data-ideas-filter]").forEach((btn) => {
		btn.addEventListener("click", () => {
			ideasStatusFilter = btn.dataset.ideasFilter;
			renderProjectIdeas(container);
		});
	});

	container.querySelectorAll("[data-idea-status]").forEach((sel) => {
		sel.addEventListener("change", () => {
			const id = sel.dataset.ideaStatus;
			ideasState.statuses = { ...(ideasState.statuses || {}), [id]: sel.value };
			saveIdeasState();
			renderProjectIdeas(container);
		});
	});

	container.querySelectorAll("[data-improve-idea]").forEach((btn) => {
		btn.addEventListener("click", () => improveProjectIdeaById(btn.dataset.improveIdea));
	});

	container.querySelectorAll("[data-copy-idea]").forEach((btn) => {
		btn.addEventListener("click", async () => {
			const idea = (ideasState.ideas || []).find((i) => i.id === btn.dataset.copyIdea);
			if (!idea) return;
			try {
				await navigator.clipboard.writeText(idea.resume_bullet || idea.title);
				notify("Bullet copiado.", "success", { timeout: 2500 });
			} catch {
				notify("Não foi possível copiar automaticamente.", "error");
			}
		});
	});

	container.querySelectorAll("[data-dismiss-idea]").forEach((btn) => {
		btn.addEventListener("click", () => {
			const id = btn.dataset.dismissIdea;
			const target = (ideasState.ideas || []).find((i) => i.id === id);
			ideasState.ideas = (ideasState.ideas || []).filter((i) => i.id !== id);
			if (target) {
				ideasState.dismissed = [
					...(ideasState.dismissed || []),
					{ id: target.id, title: target.title },
				];
			}
			saveIdeasState();
			renderProjectIdeas(container);
			notify("Ideia removida da lista.", "info", { timeout: 2500 });
		});
	});
}

// =============================================================================
// Cadastros em sites de talentos
// =============================================================================
const TALENT_LOCAL_KEY = "talent_status";
let talentState = {
	platforms: [],
	categories: {},
	status: {},
	portfolio: null,
	persist: false,
};

// Junta o estado do servidor com o do navegador, ficando com a marcação mais recente de cada site.
function mergeTalentStatus(server = {}, local = {}) {
	const stamp = (s) =>
		new Date(s?.changed_at || s?.updated_at || s?.registered_at || 0).getTime();
	const out = { ...server };
	Object.entries(local).forEach(([id, s]) => {
		if (!out[id] || stamp(s) > stamp(out[id])) out[id] = s;
	});
	return out;
}

function isTalentOutdated(entry) {
	const changed = talentState.portfolio?.last_change_at;
	if (!entry?.registered || !changed) return false;
	return (
		new Date(entry.updated_at || entry.registered_at || 0) < new Date(changed)
	);
}

async function loadTalentTracker() {
	try {
		const res = await fetch("/api/talent");
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || "Erro ao carregar sites.");
		// Junta servidor + navegador + o que já veio da nuvem (se o login terminou antes)
		const merged = mergeTalentStatus(
			mergeTalentStatus(data.status, store.get(TALENT_LOCAL_KEY, {})),
			talentState.status,
		);
		talentState = { ...data, status: merged };
		renderTalentTracker();
	} catch (err) {
		document.getElementById("talentList").innerHTML =
			`<div class="empty-state">${icon("alert")}<h3>Não foi possível carregar</h3><p>${escapeHtml(err.message)}</p></div>`;
	}
}

async function saveTalentStatus() {
	store.set(TALENT_LOCAL_KEY, talentState.status);
	if (cloudUser) {
		window.cloud
			.save("talent", { status: talentState.status })
			.catch((err) =>
				notify("Erro ao salvar cadastros na nuvem: " + err.message, "error"),
			);
	}
	if (!talentState.persist) return; // versão online: fica no navegador
	try {
		await fetch("/api/talent", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status: talentState.status }),
		});
	} catch (err) {
		console.warn("Não foi possível salvar no servidor:", err.message);
	}
}

function updateTalentEntry(id, changes) {
	const now = new Date().toISOString();
	const prev = talentState.status[id] || {};
	const next = { ...prev, ...changes, changed_at: now };
	if (changes.registered === true && !prev.registered) {
		next.registered_at = now;
		next.updated_at = now;
	}
	if (changes.registered === false) {
		next.registered_at = null;
		next.updated_at = null;
	}
	if (changes.touch) {
		delete next.touch;
		next.updated_at = now;
	}
	talentState.status[id] = next;
	saveTalentStatus();
	renderTalentTracker();
}

const formatDateBR = (iso) => {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

function renderTalentTracker() {
	const { platforms, categories, status, portfolio } = talentState;
	const registered = platforms.filter((p) => status[p.id]?.registered);
	const outdated = registered.filter((p) => isTalentOutdated(status[p.id]));

	const counter = document.getElementById("talentOutdatedCount");
	counter.textContent = outdated.length;
	counter.classList.toggle("hidden", outdated.length === 0);

	document.getElementById("talentSummary").innerHTML = `
    <div class="stat"><span class="stat-value">${registered.length}<small>/${platforms.length}</small></span><span class="stat-label">cadastros feitos</span>
      <span class="progress"><span style="width:${platforms.length ? Math.round((registered.length / platforms.length) * 100) : 0}%"></span></span></div>
    <div class="stat"><span class="stat-value ${outdated.length ? "text-warn" : "text-ok"}">${outdated.length}</span><span class="stat-label">${outdated.length ? "perfis desatualizados" : "tudo em dia"}</span></div>
    <div class="stat"><span class="stat-value">${portfolio?.last_change_at ? formatDateBR(portfolio.last_change_at) : "—"}</span>
      <span class="stat-label">${portfolio?.url ? `<a href="${escapeHtml(portfolio.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(portfolio.message || "")}">última alteração do portfólio</a>` : "portfólio indisponível agora"}</span></div>
    <div class="stat"><span class="stat-value small">${cloudUser ? "Sua conta (nuvem)" : talentState.persist ? "Arquivo no git" : "Este navegador"}</span><span class="stat-label">${cloudUser ? "sincronizado em todos os dispositivos" : "onde o progresso fica salvo — entre para sincronizar"}</span></div>`;

	const byCat = {};
	platforms.forEach((p) =>
		(byCat[p.category] = byCat[p.category] || []).push(p),
	);

	document.getElementById("talentList").innerHTML = Object.entries(byCat)
		.map(([cat, items]) => {
			const done = items.filter((p) => status[p.id]?.registered).length;
			return `<section class="card card-flush">
      <header class="list-header"><h2 class="card-title">${escapeHtml(categories[cat] || cat)}</h2><span class="muted">${done}/${items.length}</span></header>
      ${items
				.map((p) => {
					const s = status[p.id] || {};
					const isOut = isTalentOutdated(s);
					const state = !s.registered ? "todo" : isOut ? "outdated" : "ok";
					const pill =
						state === "todo"
							? '<span class="status-pill neutral"><span class="dot"></span>Não cadastrado</span>'
							: state === "outdated"
								? `<span class="status-pill warn"><span class="dot"></span>Desatualizado desde ${formatDateBR(s.updated_at || s.registered_at)}</span>`
								: `<span class="status-pill ok"><span class="dot"></span>Em dia · ${formatDateBR(s.updated_at || s.registered_at)}</span>`;
					return `<div class="talent-item ${state}">
          <label class="checkbox" title="${s.registered ? "Desmarcar" : "Marcar como cadastrado"}">
            <input type="checkbox" data-talent-check="${escapeHtml(p.id)}" ${s.registered ? "checked" : ""}><span class="checkmark">${icon("check")}</span>
          </label>
          <div class="talent-body">
            <div class="talent-title"><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.name)}</a>${pill}</div>
            <p class="talent-why">${escapeHtml(p.why)}</p>
            <p class="talent-tip">${icon("bulb")}${escapeHtml(p.tip)}</p>
          </div>
          <div class="talent-actions">
            ${
							s.registered
								? `<button type="button" class="btn btn-sm ${isOut ? "btn-warn" : "btn-secondary"}" data-talent-touch="${escapeHtml(p.id)}" title="Marque depois de atualizar este perfil com as novidades do portfólio">${icon("refresh")}Atualizei</button>`
								: `<a class="btn btn-secondary btn-sm" href="${escapeHtml(p.signup_url || p.url)}" target="_blank" rel="noopener noreferrer">Cadastrar ${icon("external")}</a>`
						}
          </div>
        </div>`;
				})
				.join("")}
    </section>`;
		})
		.join("");

	document.querySelectorAll("[data-talent-check]").forEach((cb) => {
		cb.addEventListener("change", () =>
			updateTalentEntry(cb.dataset.talentCheck, { registered: cb.checked }),
		);
	});
	document.querySelectorAll("[data-talent-touch]").forEach((btn) => {
		btn.addEventListener("click", () =>
			updateTalentEntry(btn.dataset.talentTouch, { touch: true }),
		);
	});
}

// =============================================================================
// Conta e sincronização na nuvem (Firebase — ver cloud.js)
// Sem login, tudo continua funcionando com o armazenamento local.
// =============================================================================
const EMPTY_RESUME = {
	name: "Seu nome",
	title: "Seu cargo",
	email: "",
	phone_display: "",
	phone_e164: "",
	location: "",
	linkedin_url: "",
	github_url: "",
	website_url: "",
	language: "pt",
	summary:
		"Resumo profissional: cargo-alvo, principais tecnologias e o tipo de problema que você resolve.",
	skills: [],
	projects: [],
	experience: [],
	education: [],
	languages: [],
};
let cloudUnsubs = [];
let authMode = "signin";

function onCloud(cb) {
	if (window.cloud) cb(window.cloud);
	else
		window.addEventListener("cloud-ready", () => cb(window.cloud), {
			once: true,
		});
}

function setupAccount() {
	onCloud((cloud) => {
		document.getElementById("accountBox").classList.remove("hidden");
		cloud.onAuthChange(handleAuthChange);
	});

	document
		.getElementById("btnSignIn")
		.addEventListener("click", () => openAuthModal("signin"));
	document.getElementById("btnSignOut").addEventListener("click", async () => {
		await window.cloud.signOut();
		notify("Você saiu da conta. Os dados continuam salvos nela.", "info");
	});

	// Modal de login/cadastro
	const modal = document.getElementById("authModal");
	modal.addEventListener("click", (e) => {
		if (e.target === modal || e.target.closest("[data-close-modal]"))
			closeModal(modal);
	});
	document
		.querySelectorAll("[data-auth-mode]")
		.forEach((b) =>
			b.addEventListener("click", () => setAuthMode(b.dataset.authMode)),
		);
	document
		.getElementById("btnGoogle")
		.addEventListener("click", () =>
			runAuth(() => window.cloud.signInWithGoogle()),
		);
	document.getElementById("authForm").addEventListener("submit", (e) => {
		e.preventDefault();
		const name = document.getElementById("authName").value;
		const email = document.getElementById("authEmail").value;
		const password = document.getElementById("authPassword").value;
		if (authMode === "reset") {
			return runAuth(
				() => window.cloud.resetPassword(email),
				() => {
					notify(
						"Enviamos um link para redefinir a senha. Confira seu e-mail (e a caixa de spam).",
						"success",
						{ timeout: 8000 },
					);
					setAuthMode("signin");
				},
			);
		}
		if (authMode === "signup" && password.length < 6)
			return showAuthError("A senha precisa ter pelo menos 6 caracteres.");
		runAuth(() =>
			authMode === "signup"
				? window.cloud.signUp(name, email, password)
				: window.cloud.signInWithEmail(email, password),
		);
	});
	document
		.getElementById("btnForgot")
		.addEventListener("click", () =>
			setAuthMode(authMode === "reset" ? "signin" : "reset"),
		);
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !modal.classList.contains("hidden"))
			closeModal(modal);
	});
}

function openAuthModal(mode) {
	setAuthMode(mode);
	document.getElementById("authModal").classList.remove("hidden");
	setTimeout(
		() =>
			document
				.getElementById(mode === "signup" ? "authName" : "authEmail")
				.focus(),
		50,
	);
}

function closeModal(modal) {
	modal.classList.add("hidden");
}

function setAuthMode(mode) {
	authMode = mode;
	const isSignup = mode === "signup";
	const isReset = mode === "reset";
	document.querySelectorAll("[data-auth-mode]").forEach((b) => {
		const on = b.dataset.authMode === mode;
		b.classList.toggle("active", on);
		b.setAttribute("aria-selected", String(on));
	});
	document.getElementById("authTitle").textContent = isSignup
		? "Criar sua conta"
		: isReset
			? "Recuperar senha"
			: "Entrar no Career Studio";
	document.getElementById("nameGroup").hidden = !isSignup;
	document.getElementById("passwordGroup").hidden = isReset;
	document.getElementById("passwordHint").hidden = !isSignup;
	document.getElementById("authPassword").autocomplete = isSignup
		? "new-password"
		: "current-password";
	document.getElementById("authSubmit").textContent = isSignup
		? "Criar conta"
		: isReset
			? "Enviar link de recuperação"
			: "Entrar";
	document.getElementById("btnForgot").textContent = isReset
		? "Voltar para o login"
		: "Esqueci minha senha";
	document.getElementById("btnForgot").hidden = isSignup;
	document.getElementById("btnGoogle").hidden = isReset;
	document.querySelector("#authModal .divider").hidden = isReset;
	document.querySelector("#authModal .segmented").hidden = isReset;
	showAuthError("");
}

function showAuthError(msg) {
	const el = document.getElementById("authError");
	el.textContent = msg;
	el.hidden = !msg;
}

async function runAuth(action, onSuccess) {
	const submit = document.getElementById("authSubmit");
	const google = document.getElementById("btnGoogle");
	submit.disabled = google.disabled = true;
	showAuthError("");
	try {
		const result = await action();
		if (result === null) return; // janela do Google fechada pela pessoa
		if (onSuccess) onSuccess();
		else closeModal(document.getElementById("authModal"));
	} catch (err) {
		showAuthError(err.message || "Não foi possível concluir. Tente novamente.");
	} finally {
		submit.disabled = google.disabled = false;
	}
}

function renderAccount() {
	const info = document.getElementById("accountInfo");
	document.getElementById("btnSignIn").classList.toggle("hidden", !!cloudUser);
	info.classList.toggle("hidden", !cloudUser);
	// "Sincronizar portfólio" puxa o portfólio da dona do app: oculto para outras contas
	document
		.getElementById("btnSyncPortfolio")
		.classList.toggle("hidden", !!cloudUser && !cloudUser.isOwner);
	if (!cloudUser) return;
	const avatar = document.getElementById("accountAvatar");
	const initials = (cloudUser.name || cloudUser.email || "?")
		.split(/[\s@.]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((s) => s[0].toUpperCase())
		.join("");
	avatar.innerHTML = cloudUser.photo
		? `<img src="${escapeHtml(cloudUser.photo)}" alt="" referrerpolicy="no-referrer">`
		: escapeHtml(initials);
	const nameEl = document.getElementById("accountName");
	nameEl.textContent = cloudUser.name || cloudUser.email;
	nameEl.title = cloudUser.email;
}

function setSyncStatus(text, state = "ok") {
	const el = document.getElementById("accountStatus");
	el.className = `account-status ${state}`;
	el.querySelector("span").textContent = text;
}

async function handleAuthChange() {
	cloudUnsubs.forEach((fn) => fn());
	cloudUnsubs = [];
	cloudUser = window.cloud.user;
	renderAccount();

	if (!cloudUser) {
		jobTracking = store.get(TRACK_LOCAL_KEY, {}); // volta para o acompanhamento salvo no navegador
		renderApplications();
		if (allJobs.length) applyJobFilters();
		if (talentState.platforms.length) renderTalentTracker();
		return;
	}

	setSyncStatus("Sincronizando…", "busy");
	try {
		// 1) Currículo: o da conta tem prioridade. Conta nova escolhe como começar.
		const saved = await window.cloud.load("resume");
		if (saved?.resume) {
			currentResume = saved.resume;
			refreshResumeViews();
		} else {
			const choice = await askFirstResume();
			if (choice === "blank") {
				currentResume = JSON.parse(JSON.stringify(EMPTY_RESUME));
				currentResume.name = cloudUser.name || currentResume.name;
				currentResume.email = cloudUser.email || "";
				refreshResumeViews();
			}
			await window.cloud.save("resume", { resume: currentResume });
		}

		// 2) Cadastros: junta navegador + nuvem e acompanha mudanças de outros dispositivos
		cloudUnsubs.push(
			window.cloud.watch("talent", (data, pending) => {
				if (pending) return;
				const remote = data?.status || {};
				const merged = mergeTalentStatus(remote, talentState.status);
				talentState.status = merged;
				store.set(TALENT_LOCAL_KEY, merged);
				if (talentState.platforms.length) renderTalentTracker();
				if (JSON.stringify(merged) !== JSON.stringify(remote)) {
					window.cloud
						.save("talent", { status: merged })
						.catch((e) => console.warn("[cloud] talent:", e.message));
				}
			}),
		);

		// 3) Learning Hub: sincroniza cursos, certificações e metas sob careerStudio/{uid}/data/learning
		cloudUnsubs.push(
			window.cloud.watch("learning", (data, pending) => {
				if (pending) return;
				if (data?.state) {
					window.learningHub?.onCloudSnapshot(data);
				} else {
					const localLearning = window.learningHub?.getState?.();
					if (localLearning?.items?.length) {
						window.cloud
							.save("learning", { state: localLearning })
							.catch((e) => console.warn("[cloud] learning:", e.message));
					}
				}
			}),
		);

		// 4) Vagas acompanhadas e candidaturas: o que estava só no navegador sobe para a conta
		await migrateLocalTracking();
		cloudUnsubs.push(
			window.cloud.watchJobs((map) => {
				jobTracking = map;
				renderApplications();
				if (allJobs.length) applyJobFilters();
			}),
		);

		setSyncStatus("Sincronizado", "ok");
		if (talentState.platforms.length) renderTalentTracker();
		if (allJobs.length) applyJobFilters();
	} catch (err) {
		setSyncStatus("Erro ao sincronizar", "error");
		const denied = /permission|insufficient/i.test(err.message);
		notify(
			denied
				? "Erro ao sincronizar: as regras do Firestore ainda não permitem o acesso. Publique o arquivo firestore.rules no console do Firebase."
				: "Erro ao sincronizar com a nuvem: " + err.message,
			"error",
			{ timeout: 12000 },
		);
	}
}

function refreshResumeViews() {
	jsonEditor.value = JSON.stringify(currentResume, null, 2);
	populateForm();
	renderPreviewNow();
	if (allJobs.length) applyJobFilters();
}

function askFirstResume() {
	return new Promise((resolve) => {
		const modal = document.getElementById("choiceModal");
		modal.classList.remove("hidden");
		modal.querySelectorAll("[data-choice]").forEach((btn) => {
			btn.onclick = () => {
				modal.classList.add("hidden");
				resolve(btn.dataset.choice);
			};
		});
	});
}

// =============================================================================
// Acompanhamento de vagas e candidaturas
// Sem login: salvo no navegador. Com login: Firestore (careerStudio/{uid}/jobs/{id}).
// Cada registro: { title, company, url, saved, adapted_at, applied_at, stage, history[], next_at, ... }
// =============================================================================
const TRACK_LOCAL_KEY = "job_tracking";

const STAGES = [
	{ id: "applied", label: "Inscrição enviada", group: "active" },
	{ id: "screening", label: "Em triagem", group: "active" },
	{ id: "hr_interview", label: "Entrevista RH", group: "interview" },
	{ id: "technical", label: "Teste / entrevista técnica", group: "interview" },
	{ id: "final", label: "Entrevista final", group: "interview" },
	{ id: "offer", label: "Proposta", group: "offer" },
	{ id: "hired", label: "Contratada", group: "won" },
	{ id: "rejected", label: "Não aprovada", group: "closed" },
	{ id: "withdrawn", label: "Desisti", group: "closed" },
	{ id: "ghosted", label: "Sem retorno", group: "closed" },
];
const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));
const stageLabel = (id) => STAGE_BY_ID[id]?.label || "Inscrição enviada";
const isActiveStage = (id) =>
	["active", "interview", "offer"].includes(
		STAGE_BY_ID[id || "applied"]?.group,
	);
const NO_RESPONSE_DAYS = 14;

let appsFilter = { stage: "all", q: "", sort: "recent" };
let editingAppId = null;

// Carrega o acompanhamento do navegador logo na abertura (antes do login, se houver)
jobTracking = store.get(TRACK_LOCAL_KEY, {});

const nowIso = () => new Date().toISOString();
const toDateInput = (iso) => (iso ? String(iso).slice(0, 10) : "");
const fromDateInput = (v) =>
	v ? new Date(`${v}T12:00:00`).toISOString() : null;
const daysSince = (iso) =>
	iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;

async function persistTrack(id, entry) {
	if (cloudUser) {
		if (entry) await window.cloud.setJob(id, entry);
		else await window.cloud.removeJob(id);
		return;
	}
	const local = store.get(TRACK_LOCAL_KEY, {});
	if (entry) local[id] = entry;
	else delete local[id];
	if (!store.set(TRACK_LOCAL_KEY, local))
		throw new Error("Não foi possível salvar no navegador.");
}

// Na primeira sincronização com a conta, envia o que estava só no navegador.
async function migrateLocalTracking() {
	const local = store.get(TRACK_LOCAL_KEY, {});
	const ids = Object.keys(local);
	if (!ids.length) return;
	await Promise.all(ids.map((id) => window.cloud.setJob(id, local[id])));
	store.remove(TRACK_LOCAL_KEY);
	notify(
		`${ids.length} vaga(s) acompanhada(s) enviada(s) para a sua conta.`,
		"success",
	);
}

function jobSnapshot(job) {
	return {
		title: job.title,
		company: job.company,
		url: job.url,
		location: stripEmoji(job.location || ""),
		source: job.source || "",
		source_type: job.source_type || "",
		sector: job.sector || "tech",
	};
}

async function saveTrackEntry(id, entry) {
	const next = { ...entry, last_update_at: nowIso() };
	jobTracking[id] = next; // atualização otimista
	renderApplications();
	if (allJobs.length) applyJobFilters();
	await persistTrack(id, next);
	return next;
}

async function trackJob(job, patch) {
	return saveTrackEntry(job.id, {
		...(jobTracking[job.id] || {}),
		...jobSnapshot(job),
		...patch,
	});
}

async function toggleJobTrack(job, kind) {
	const cur = jobTracking[job.id] || {};
	try {
		if (kind === "applied") {
			if (cur.applied_at) {
				// Já aplicou: abre o acompanhamento em vez de desfazer (evita perder o histórico)
				switchTab("tab-applications");
				openAppModal(job.id);
				return;
			}
			const at = nowIso();
			await trackJob(job, {
				applied_at: at,
				stage: "applied",
				cv_version: activeCvVersionLabel,
				history: [...(cur.history || []), { stage: "applied", at }],
			});
			notify(`“${job.title}” foi para a planilha de candidaturas.`, "success", {
				timeout: 3500,
			});
			return;
		}
		const next = { ...cur, ...jobSnapshot(job), saved: !cur.saved };
		if (!next.saved && !next.applied_at && !next.adapted_at) {
			delete jobTracking[job.id];
			if (allJobs.length) applyJobFilters();
			await persistTrack(job.id, null);
		} else {
			await saveTrackEntry(job.id, next);
		}
	} catch (err) {
		notify("Erro ao salvar acompanhamento: " + err.message, "error");
	}
}

// ---------------------------------------------------------------------------
// Página "Candidaturas" (planilha)
// ---------------------------------------------------------------------------
function applicationsList() {
	return Object.entries(jobTracking)
		.filter(([, t]) => t && t.applied_at)
		.map(([id, t]) => ({ id, ...t, stage: t.stage || "applied" }));
}

function appAlerts(a) {
	const alerts = [];
	if (a.next_at && isActiveStage(a.stage)) {
		const d = daysSince(a.next_at);
		if (d > 0)
			alerts.push({
				cls: "warn",
				text: `Próximo passo atrasado ${d} dia${d > 1 ? "s" : ""}`,
			});
		else if (d === 0)
			alerts.push({ cls: "info", text: "Próximo passo é hoje" });
	}
	const idle = daysSince(a.last_stage_at || a.applied_at);
	if (!a.next_at && isActiveStage(a.stage) && idle >= NO_RESPONSE_DAYS) {
		alerts.push({
			cls: "warn",
			text: `Sem retorno há ${idle} dias — vale um follow-up`,
		});
	}
	return alerts;
}

function setupApplications() {
	const search = document.getElementById("appsSearch");
	const sort = document.getElementById("appsSort");
	let t = null;
	search.addEventListener("input", () => {
		clearTimeout(t);
		t = setTimeout(() => {
			appsFilter.q = search.value.trim();
			renderApplications();
		}, 150);
	});
	sort.addEventListener("change", () => {
		appsFilter.sort = sort.value;
		renderApplications();
	});
	document.getElementById("appsStageFilter").addEventListener("click", (e) => {
		const chip = e.target.closest("[data-stage-filter]");
		if (!chip) return;
		appsFilter.stage = chip.dataset.stageFilter;
		renderApplications();
	});
	document
		.getElementById("btnAddApp")
		.addEventListener("click", () => openAppModal(null));
	document
		.getElementById("btnExportApps")
		.addEventListener("click", exportApplicationsCsv);

	// Tabela: mudar etapa direto na linha, abrir detalhes
	const table = document.getElementById("appsTable");
	table.addEventListener("change", (e) => {
		const sel = e.target.closest("[data-stage-select]");
		if (sel) changeStage(sel.dataset.stageSelect, sel.value);
	});
	table.addEventListener("click", (e) => {
		const open = e.target.closest("[data-open-app]");
		if (open) openAppModal(open.dataset.openApp);
	});

	// Modal
	const modal = document.getElementById("appModal");
	document.getElementById("appStage").innerHTML = STAGES.map(
		(s) => `<option value="${s.id}">${s.label}</option>`,
	).join("");
	modal.addEventListener("click", (e) => {
		if (e.target === modal || e.target.closest("[data-close-app]"))
			modal.classList.add("hidden");
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !modal.classList.contains("hidden"))
			modal.classList.add("hidden");
	});
	document.getElementById("appForm").addEventListener("submit", (e) => {
		e.preventDefault();
		saveAppFromModal();
	});
	document
		.getElementById("btnDeleteApp")
		.addEventListener("click", deleteAppFromModal);

	renderApplications();
}

async function changeStage(id, stage) {
	const cur = jobTracking[id];
	if (!cur || cur.stage === stage) return;
	const at = nowIso();
	try {
		await saveTrackEntry(id, {
			...cur,
			stage,
			last_stage_at: at,
			history: [...(cur.history || []), { stage, at }],
		});
		notify(`Etapa atualizada: ${stageLabel(stage)}.`, "success", {
			timeout: 2500,
		});
	} catch (err) {
		notify("Erro ao atualizar etapa: " + err.message, "error");
	}
}

function renderFunnelDiagnosis(all = [], interviews = 0) {
	const box = document.getElementById("appsFunnelDiagnosis");
	if (!box) return;

	const hadStage = (a, ids) =>
		ids.includes(a.stage) || (a.history || []).some((h) => ids.includes(h.stage));
	const closedNegative = (a) => a.stage === "rejected" || a.stage === "ghosted";

	const total = all.length;
	const interviewRate = total ? interviews / total : 0;
	const preTechRejected = all.filter(
		(a) => closedNegative(a) && !hadStage(a, ["technical", "final", "offer", "hired"]),
	).length;
	const techRejected = all.filter(
		(a) =>
			closedNegative(a) &&
			hadStage(a, ["hr_interview", "technical"]) &&
			!hadStage(a, ["final", "offer", "hired"]),
	).length;
	const finalRejected = all.filter(
		(a) => closedNegative(a) && hadStage(a, ["final"]) && !hadStage(a, ["offer", "hired"]),
	).length;
	const offerNotClosed = all.filter(
		(a) =>
			["rejected", "withdrawn", "ghosted"].includes(a.stage) &&
			hadStage(a, ["offer"]) &&
			a.stage !== "hired",
	).length;

	const rows = [
		{
			signal: "Muitas candidaturas, poucas entrevistas",
			hypothesis:
				"Currículo, posicionamento ou baixa compatibilidade com as vagas escolhidas — revise palavras-chave, formato DOCX/1 coluna e priorize vagas com maior aderência.",
			triggered: total >= 5 && interviewRate < 0.15,
			count: total >= 5 ? `${interviews}/${total} (${Math.round(interviewRate * 100)}%)` : "",
		},
		{
			signal: "Reprovação antes da entrevista técnica",
			hypothesis:
				"Requisitos eliminatórios, localização/fuso, idioma ou nível de experiência exigido na triagem inicial.",
			triggered: preTechRejected >= 3,
			count: preTechRejected ? `${preTechRejected} vaga(s)` : "",
		},
		{
			signal: "Passa no RH, reprova no técnico",
			hypothesis:
				"Preparação técnica (System Design, live coding, arquitetura) ou clareza ao defender decisões técnicas na entrevista.",
			triggered: techRejected >= 2,
			count: techRejected ? `${techRejected} vaga(s)` : "",
		},
		{
			signal: "Passa no técnico, reprova na entrevista final",
			hypothesis:
				"Comunicação executiva, demonstração de autonomia, storytelling de entregas ou alinhamento cultural com a equipe.",
			triggered: finalRejected >= 1,
			count: finalRejected ? `${finalRejected} vaga(s)` : "",
		},
		{
			signal: "Chega à negociação / proposta e não fecha",
			hypothesis:
				"Alinhamento de remuneração, modelo de contrato (PJ/EOR/CLT) ou expectativas de escopo e benefícios.",
			triggered: offerNotClosed >= 1,
			count: offerNotClosed ? `${offerNotClosed} vaga(s)` : "",
		},
	];

	const triggeredCount = rows.filter((r) => r.triggered).length;
	const subtitle = triggeredCount
		? `${triggeredCount} padrão(ões) identificado(s) no seu histórico — use como hipóteses (não diagnóstico definitivo) para ajustar sua estratégia.`
		: "Registre suas etapas (RH, técnica, final, proposta) para o sistema sinalizar onde o funil está travando. Use sempre como hipótese para ajustar a estratégia.";

	box.innerHTML = `
    <details class="card funnel-card" ${triggeredCount ? "open" : ""}>
      <summary class="ats-resources-summary">
        <span><strong>Diagnóstico do funil de candidaturas</strong> ${triggeredCount ? `<span class="meta-chip text-warn">${triggeredCount} alerta(s)</span>` : `<small class="muted">(como interpretar seus resultados)</small>`}</span>
        <svg class="chev" aria-hidden="true"><use href="#i-chevron"/></svg>
      </summary>
      <p class="card-sub" style="margin-top:8px">${escapeHtml(subtitle)}</p>
      <div class="funnel-list">
        ${rows
					.map(
						(r) => `
          <div class="funnel-row ${r.triggered ? "triggered" : ""}">
            <strong>${escapeHtml(r.signal)}${r.count ? ` <span class="muted">(${escapeHtml(r.count)})</span>` : ""}</strong>
            <span>${escapeHtml(r.hypothesis)}</span>
          </div>`,
					)
					.join("")}
      </div>
    </details>`;
}

function renderApplications() {
	const table = document.getElementById("appsTable");
	if (!table) return;
	const all = applicationsList();

	// Contador no menu: candidaturas em andamento
	const active = all.filter((a) => isActiveStage(a.stage));
	const navCount = document.getElementById("appsNavCount");
	if (navCount) navCount.textContent = all.length ? active.length || "" : "";

	// Indicadores
	const responded = all.filter(
		(a) => a.stage !== "applied" && a.stage !== "ghosted",
	).length;
	const interviews = all.filter((a) =>
		(a.history || []).some((h) =>
			["interview", "offer", "won"].includes(STAGE_BY_ID[h.stage]?.group),
		),
	).length;
	const offers = all.filter(
		(a) =>
			["offer", "hired"].includes(a.stage) ||
			(a.history || []).some((h) => h.stage === "offer"),
	).length;
	const needsAction = all.filter((a) =>
		appAlerts(a).some((x) => x.cls === "warn"),
	).length;
	document.getElementById("appsStats").innerHTML = `
    <div class="stat"><span class="stat-value">${all.length}</span><span class="stat-label">candidaturas</span></div>
    <div class="stat"><span class="stat-value">${active.length}</span><span class="stat-label">em andamento</span></div>
    <div class="stat"><span class="stat-value">${all.length ? Math.round((responded / all.length) * 100) : 0}%</span><span class="stat-label">taxa de resposta</span></div>
    <div class="stat"><span class="stat-value">${interviews}</span><span class="stat-label">chegaram a entrevista</span></div>
    <div class="stat"><span class="stat-value ${offers ? "text-ok" : ""}">${offers}</span><span class="stat-label">propostas</span></div>
    <div class="stat"><span class="stat-value ${needsAction ? "text-warn" : ""}">${needsAction}</span><span class="stat-label">pedem ação</span></div>`;

	renderFunnelDiagnosis(all, interviews);

	// Filtro por etapa (com contagem)
	const counts = all.reduce(
		(acc, a) => ((acc[a.stage] = (acc[a.stage] || 0) + 1), acc),
		{},
	);
	const chips = [
		["all", "Todas", all.length],
		["active", "Em andamento", active.length],
		...STAGES.filter((s) => counts[s.id]).map((s) => [
			s.id,
			s.label,
			counts[s.id],
		]),
	];
	document.getElementById("appsStageFilter").innerHTML = chips
		.map(
			([v, l, c]) =>
				`<button type="button" class="chip${appsFilter.stage === v ? " active" : ""}" data-stage-filter="${v}">${escapeHtml(l)}<span class="chip-count">${c}</span></button>`,
		)
		.join("");

	// Linhas
	const q = norm(appsFilter.q);
	let rows = all.filter(
		(a) =>
			(appsFilter.stage === "all" ||
				(appsFilter.stage === "active"
					? isActiveStage(a.stage)
					: a.stage === appsFilter.stage)) &&
			(!q ||
				norm(
					`${a.company} ${a.title} ${a.notes || ""} ${a.contact || ""}`,
				).includes(q)),
	);
	const by = {
		recent: (a, b) =>
			String(b.last_update_at || b.applied_at).localeCompare(
				String(a.last_update_at || a.applied_at),
			),
		applied: (a, b) => String(b.applied_at).localeCompare(String(a.applied_at)),
		next: (a, b) =>
			String(a.next_at || "9999").localeCompare(String(b.next_at || "9999")),
		company: (a, b) =>
			String(a.company).localeCompare(String(b.company), "pt-BR"),
	};
	rows.sort(by[appsFilter.sort] || by.recent);

	const storage = document.getElementById("appsStorageNote");
	if (storage)
		storage.textContent = cloudUser
			? "Salvo na sua conta e sincronizado entre dispositivos."
			: "Salvo neste navegador. Entre na sua conta para sincronizar entre dispositivos — ou use “Exportar planilha” como cópia de segurança.";

	if (!all.length) {
		table.innerHTML = `<div class="empty-state small">${icon("table")}<h3>Nenhuma candidatura ainda</h3>
      <p>Em <strong>Vagas</strong>, clique em “Apliquei” quando enviar uma candidatura — ou use “Adicionar candidatura” para registrar uma feita fora daqui (LinkedIn, indicação…).</p></div>`;
		return;
	}
	if (!rows.length) {
		table.innerHTML = `<div class="empty-state small"><p>Nenhuma candidatura com esse filtro.</p></div>`;
		return;
	}

	table.innerHTML = `
    <table class="apps-table">
      <thead><tr>
        <th>Vaga</th><th>Inscrição</th><th>Etapa</th><th>Próximo passo</th><th>Atualizada</th><th class="col-actions"><span class="sr-only">Ações</span></th>
      </tr></thead>
      <tbody>
        ${rows
					.map((a) => {
						const alerts = appAlerts(a);
						const group = STAGE_BY_ID[a.stage]?.group || "active";
						return `<tr class="${alerts.some((x) => x.cls === "warn") ? "row-warn" : ""} ${group === "closed" ? "row-closed" : ""}">
            <td class="col-job">
              <button type="button" class="link-cell" data-open-app="${escapeHtml(a.id)}">
                <span class="cell-title">${escapeHtml(a.title)}</span>
                <span class="cell-sub">${escapeHtml(a.company)}${a.source ? ` · ${escapeHtml(a.source.replace(/^Site da empresa \((.*)\)$/, "site da empresa"))}` : ""}${a.cv_version ? ` · ${escapeHtml(a.cv_version)}` : ""}</span>
              </button>
              ${alerts.map((x) => `<span class="row-alert ${x.cls}">${icon(x.cls === "warn" ? "alert" : "clock")}${escapeHtml(x.text)}</span>`).join("")}
            </td>
            <td class="col-date">${formatDateBR(a.applied_at)}<span class="cell-sub">há ${daysSince(a.applied_at)} dias</span></td>
            <td class="col-stage">
              <select class="stage-select stage-${group}" data-stage-select="${escapeHtml(a.id)}" aria-label="Etapa de ${escapeHtml(a.title)}">
                ${STAGES.map((s) => `<option value="${s.id}" ${s.id === a.stage ? "selected" : ""}>${s.label}</option>`).join("")}
              </select>
            </td>
            <td class="col-next">${a.next_at ? `${formatDateBR(a.next_at)}${a.next_note ? `<span class="cell-sub">${escapeHtml(a.next_note)}</span>` : ""}` : '<span class="muted">—</span>'}</td>
            <td class="col-date">${formatDateBR(a.last_update_at || a.applied_at)}</td>
            <td class="col-actions">
              ${a.url && a.url !== "#" ? `<a class="btn btn-icon-only" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer" title="Abrir a vaga">${icon("external")}</a>` : ""}
              <button type="button" class="btn btn-icon-only" data-open-app="${escapeHtml(a.id)}" title="Detalhes e anotações">${icon("edit")}</button>
            </td>
          </tr>`;
					})
					.join("")}
      </tbody>
    </table>`;
}

function openAppModal(id) {
	editingAppId = id;
	const a = id ? jobTracking[id] || {} : {};
	const isNew = !id;
	document.getElementById("appModalTitle").textContent = isNew
		? "Nova candidatura"
		: a.title || "Candidatura";
	document.getElementById("appModalSub").textContent = isNew
		? "Registre uma candidatura feita fora do sistema (LinkedIn, e-mail, indicação…)."
		: `${a.company || ""}${a.applied_at ? ` · inscrição em ${formatDateBR(a.applied_at)}` : ""}`;
	const set = (elId, v) => (document.getElementById(elId).value = v ?? "");
	set("appTitle", a.title);
	set("appCompany", a.company);
	set("appUrl", a.url === "#" ? "" : a.url);
	set("appAppliedAt", toDateInput(a.applied_at || nowIso()));
	set("appStage", a.stage || "applied");
	set("appSalary", a.salary);
	set("appNextAt", toDateInput(a.next_at));
	set("appNextNote", a.next_note);
	set("appContact", a.contact);
	set("appSource", a.source_label || a.source || "");
	set("appCvVersion", a.cv_version || activeCvVersionLabel || "CV 01 — Full Stack & Backend");
	set("appNotes", a.notes);
	document.getElementById("btnDeleteApp").hidden = isNew;
	document.getElementById("appFormError").hidden = true;

	const history = (a.history || []).slice().reverse();
	document.getElementById("appTimeline").innerHTML = history.length
		? `<div class="idea-label">Histórico</div><ol>${history.map((h) => `<li><span class="tl-dot stage-${STAGE_BY_ID[h.stage]?.group || "active"}"></span><strong>${escapeHtml(stageLabel(h.stage))}</strong><span class="muted"> · ${new Date(h.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span></li>`).join("")}</ol>`
		: "";
	document.getElementById("appModal").classList.remove("hidden");
	setTimeout(
		() => document.getElementById(isNew ? "appTitle" : "appStage").focus(),
		50,
	);
}

async function saveAppFromModal() {
	const val = (elId) => document.getElementById(elId).value.trim();
	const title = val("appTitle");
	const company = val("appCompany");
	const err = document.getElementById("appFormError");
	if (!title || !company) {
		err.textContent = "Informe a vaga e a empresa.";
		err.hidden = false;
		return;
	}
	const id = editingAppId || `manual-${Date.now()}`;
	const cur = jobTracking[id] || {};
	const stage = val("appStage") || "applied";
	const appliedAt =
		fromDateInput(val("appAppliedAt")) || cur.applied_at || nowIso();
	const history = [...(cur.history || [])];
	if (!history.length) history.push({ stage: "applied", at: appliedAt });
	if (stage !== (cur.stage || "applied") || (!cur.stage && stage !== "applied"))
		history.push({ stage, at: nowIso() });
	const url = val("appUrl");

	const entry = {
		...cur,
		title,
		company,
		url: url
			? /^https?:\/\//i.test(url)
				? url
				: `https://${url}`
			: cur.url || "",
		applied_at: appliedAt,
		stage,
		last_stage_at: stage !== cur.stage ? nowIso() : cur.last_stage_at || null,
		history,
		salary: val("appSalary"),
		next_at: fromDateInput(val("appNextAt")),
		next_note: val("appNextNote"),
		contact: val("appContact"),
		source_label: val("appSource"),
		source: cur.source || val("appSource"),
		cv_version: val("appCvVersion"),
		notes: document.getElementById("appNotes").value,
		manual: cur.manual ?? !editingAppId,
	};
	try {
		await saveTrackEntry(id, entry);
		document.getElementById("appModal").classList.add("hidden");
		notify(
			editingAppId
				? "Candidatura atualizada."
				: "Candidatura adicionada à planilha.",
			"success",
			{ timeout: 2500 },
		);
	} catch (e) {
		err.textContent = "Erro ao salvar: " + e.message;
		err.hidden = false;
	}
}

async function deleteAppFromModal() {
	const id = editingAppId;
	const cur = jobTracking[id];
	if (!id || !cur) return;
	const btn = document.getElementById("btnDeleteApp");
	// Confirmação em dois cliques (sem diálogo nativo do navegador)
	if (!btn.dataset.confirm) {
		btn.dataset.confirm = "1";
		btn.querySelector("span").textContent = "Clique de novo para excluir";
		setTimeout(() => {
			delete btn.dataset.confirm;
			btn.querySelector("span").textContent = "Excluir";
		}, 3500);
		return;
	}
	delete btn.dataset.confirm;
	btn.querySelector("span").textContent = "Excluir";
	try {
		// Mantém "salva"/"adaptei" da vaga; remove só os dados da candidatura
		const {
			applied_at,
			stage,
			history,
			last_stage_at,
			next_at,
			next_note,
			contact,
			salary,
			notes,
			source_label,
			...rest
		} = cur;
		const keep = rest.saved || rest.adapted_at;
		if (keep) await saveTrackEntry(id, rest);
		else {
			delete jobTracking[id];
			renderApplications();
			if (allJobs.length) applyJobFilters();
			await persistTrack(id, null);
		}
		document.getElementById("appModal").classList.add("hidden");
		notify("Candidatura excluída.", "success", { timeout: 2500 });
	} catch (e) {
		notify("Erro ao excluir: " + e.message, "error");
	}
}

// Planilha CSV (separador ";" e BOM UTF-8: abre corretamente no Excel em português)
function exportApplicationsCsv() {
	const rows = applicationsList().sort((a, b) =>
		String(b.applied_at).localeCompare(String(a.applied_at)),
	);
	if (!rows.length)
		return notify("Nenhuma candidatura para exportar ainda.", "info");
	const cols = [
		["Empresa", (a) => a.company],
		["Vaga", (a) => a.title],
		["Link", (a) => a.url],
		["Local", (a) => a.location],
		["Onde se candidatou", (a) => a.source_label || a.source],
		["Versão do currículo", (a) => a.cv_version || ""],
		["Data da inscrição", (a) => formatDateBR(a.applied_at)],
		["Etapa atual", (a) => stageLabel(a.stage)],
		["Em andamento", (a) => (isActiveStage(a.stage) ? "Sim" : "Não")],
		[
			"Última atualização",
			(a) => formatDateBR(a.last_update_at || a.applied_at),
		],
		["Próximo passo (data)", (a) => (a.next_at ? formatDateBR(a.next_at) : "")],
		["Próximo passo", (a) => a.next_note],
		["Contato", (a) => a.contact],
		["Pretensão / salário", (a) => a.salary],
		["Anotações", (a) => a.notes],
		[
			"Histórico",
			(a) =>
				(a.history || [])
					.map((h) => `${formatDateBR(h.at)} ${stageLabel(h.stage)}`)
					.join(" → "),
		],
	];
	const cell = (v) => {
		const s = String(v ?? "").replace(/\r?\n/g, " ");
		return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const csv = [
		cols.map((c) => c[0]).join(";"),
		...rows.map((a) => cols.map(([, f]) => cell(f(a))).join(";")),
	].join("\r\n");
	const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = `candidaturas-${new Date().toISOString().slice(0, 10)}.csv`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(link.href), 1000);
	notify(`Planilha exportada com ${rows.length} candidatura(s).`, "success");
}

// -----------------------------------------------------------------------------
// Eventos tech (Online Brasil/Global e Presencial/Híbrido em BH)
// -----------------------------------------------------------------------------
let allEvents = [];
let eventFilters = { search: "", mode: "all", topic: "all", window: "all" };
const SAVED_EVENTS_KEY = "saved_events";
const getSavedEvents = () => new Set(store.get(SAVED_EVENTS_KEY, []));
function toggleSavedEvent(id) {
	const saved = getSavedEvents();
	if (saved.has(id)) saved.delete(id);
	else saved.add(id);
	store.set(SAVED_EVENTS_KEY, [...saved]);
	renderEvents();
}

const EVENT_TOPIC_LABELS = {
	ia: "IA & Agentes",
	cloud: "Cloud & DevOps",
	fullstack: "Full Stack & Web",
	arquitetura: "Arquitetura & Dados",
	saude: "Saúde & HealthTech",
	edtech: "EdTech & Educação",
	comunidade: "Comunidade & Carreira",
};

function setupEvents() {
	const searchInput = document.getElementById("eventSearchQuery");
	const winSelect = document.getElementById("eventWindow");
	const btnRefresh = document.getElementById("btnRefreshEvents");
	const btnClear = document.getElementById("btnClearEventFilters");

	if (searchInput) {
		searchInput.addEventListener("input", () => {
			eventFilters.search = searchInput.value.trim();
			renderEvents();
		});
	}
	if (winSelect) {
		winSelect.addEventListener("change", () => {
			eventFilters.window = winSelect.value;
			renderEvents();
		});
	}
	if (btnRefresh) {
		btnRefresh.addEventListener("click", () => loadEvents(true));
	}
	if (btnClear) {
		btnClear.addEventListener("click", () => {
			eventFilters = { search: "", mode: "all", topic: "all", window: "all" };
			if (searchInput) searchInput.value = "";
			if (winSelect) winSelect.value = "all";
			renderEvents();
		});
	}
}

async function loadEvents(forceRefresh = false) {
	const listEl = document.getElementById("eventsList");
	const countEl = document.getElementById("eventsCount");
	const navBadge = document.getElementById("eventsNavCount");
	const updatedEl = document.getElementById("eventsLastUpdated");

	if (forceRefresh && listEl) {
		listEl.innerHTML = `<div class="empty-state small"><div class="spinner"></div><p>Coletando eventos de BH e online…</p></div>`;
	}

	try {
		const res = await fetch(`/api/events?limit=120&refresh=${forceRefresh}`);
		const ct = res.headers.get("content-type") || "";
		if (!ct.includes("application/json")) {
			throw new Error(
				"A rota /api/events ainda não está ativa no servidor atual. Se estiver rodando localmente, reinicie o servidor (Ctrl+C e npm run server); em produção, aguarde o novo deploy."
			);
		}
		const data = await res.json();
		if (!res.ok || !data.success) throw new Error(data.error || "Erro ao buscar eventos.");

		allEvents = data.events || [];
		if (navBadge) navBadge.textContent = allEvents.length ? String(allEvents.length) : "";
		if (updatedEl && data.last_updated) {
			updatedEl.textContent = `Atualizado: ${data.last_updated}`;
		}
		renderEvents();
		if (forceRefresh) notify(`${allEvents.length} eventos atualizados (BH e online).`, "success");
	} catch (err) {
		console.warn("Eventos indisponíveis:", err.message);
		if (countEl) countEl.textContent = "Não foi possível carregar eventos.";
		if (listEl) {
			listEl.innerHTML = `<div class="empty-state">${icon("calendar")}<h3>Erro ao carregar eventos</h3><p>${escapeHtml(err.message)}</p></div>`;
		}
	}
}

function buildEventCalendarUrl(ev) {
	const start = ev.start_date ? new Date(ev.start_date) : null;
	if (!start || Number.isNaN(start.getTime())) return "";
	const end =
		ev.end_date && !Number.isNaN(new Date(ev.end_date).getTime())
			? new Date(ev.end_date)
			: new Date(start.getTime() + 2 * 3600000);
	const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
	const params = new URLSearchParams({
		action: "TEMPLATE",
		text: ev.title || "Evento Tech",
		dates: `${fmt(start)}/${fmt(end)}`,
		details: [ev.description, ev.url ? `Link do evento: ${ev.url}` : ""].filter(Boolean).join("\n\n"),
		location: ev.venue || ev.location || "Online",
	});
	return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function formatEventDateParts(iso) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return { mon: "—", day: "—", sub: "", soonLabel: "", isSoon: false };
	const mon = d.toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
	const day = d.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "America/Sao_Paulo" });
	const wk = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
	const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

	const now = new Date();
	const todayKey = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
	const tomorrow = new Date(now.getTime() + 86400000);
	const tomKey = tomorrow.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
	const evKey = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

	let soonLabel = "";
	if (evKey === todayKey) soonLabel = "Hoje";
	else if (evKey === tomKey) soonLabel = "Amanhã";
	const diffDays = (d.getTime() - now.getTime()) / 86400000;
	const isSoon = diffDays <= 3 && diffDays >= -1;
	const showTime = hm !== "09:00" && hm !== "12:00" && hm !== "00:00";

	return { mon, day, sub: showTime ? `${wk} · ${hm}` : wk, soonLabel, isSoon };
}

function renderEventFacets() {
	const box = document.getElementById("eventFacets");
	if (!box) return;
	const saved = getSavedEvents();
	const bhCount = allEvents.filter((e) => e.mode === "bh").length;
	const onBrCount = allEvents.filter((e) => e.mode === "online_br").length;
	const onGlCount = allEvents.filter((e) => e.mode === "online_global").length;
	const savedCount = allEvents.filter((e) => saved.has(e.id)).length;

	const modes = [
		{ id: "all", label: `Todos (${allEvents.length})` },
		{ id: "bh", label: `Presencial / Híbrido BH (${bhCount})` },
		{ id: "online", label: `Todos Online (${onBrCount + onGlCount})` },
		{ id: "online_br", label: `Online Brasil (${onBrCount})` },
		{ id: "online_global", label: `Online Global (${onGlCount})` },
		...(savedCount ? [{ id: "saved", label: `Salvos (${savedCount})` }] : []),
	];

	const topicCounts = {};
	allEvents.forEach((e) => (e.topics || []).forEach((t) => (topicCounts[t] = (topicCounts[t] || 0) + 1)));
	const topics = [
		{ id: "all", label: "Todos" },
		...Object.entries(EVENT_TOPIC_LABELS)
			.filter(([k]) => topicCounts[k] > 0)
			.map(([k, label]) => ({ id: k, label: `${label} (${topicCounts[k]})` })),
	];

	box.innerHTML = `
		<div class="facet-row">
			<span class="facet-label">Modalidade</span>
			<div class="facet-chips" role="group" aria-label="Filtrar eventos por modalidade">
				${modes.map((m) => `<button type="button" class="chip ${eventFilters.mode === m.id ? "active" : ""}" aria-pressed="${eventFilters.mode === m.id}" data-ev-mode="${m.id}">${escapeHtml(m.label)}</button>`).join("")}
			</div>
		</div>
		<div class="facet-row">
			<span class="facet-label">Tema</span>
			<div class="facet-chips" role="group" aria-label="Filtrar eventos por tema">
				${topics.map((t) => `<button type="button" class="chip ${eventFilters.topic === t.id ? "active" : ""}" aria-pressed="${eventFilters.topic === t.id}" data-ev-topic="${t.id}">${escapeHtml(t.label)}</button>`).join("")}
			</div>
		</div>
	`;

	box.querySelectorAll("[data-ev-mode]").forEach((btn) => {
		btn.addEventListener("click", () => {
			eventFilters.mode = btn.dataset.evMode;
			renderEvents();
		});
	});
	box.querySelectorAll("[data-ev-topic]").forEach((btn) => {
		btn.addEventListener("click", () => {
			eventFilters.topic = btn.dataset.evTopic;
			renderEvents();
		});
	});
}

function renderEvents() {
	const listEl = document.getElementById("eventsList");
	const countEl = document.getElementById("eventsCount");
	const btnClear = document.getElementById("btnClearEventFilters");
	if (!listEl) return;

	renderEventFacets();
	const saved = getSavedEvents();
	const now = Date.now();
	const q = eventFilters.search.toLowerCase();

	const filtered = allEvents.filter((ev) => {
		if (eventFilters.mode === "saved" && !saved.has(ev.id)) return false;
		if (eventFilters.mode === "online" && ev.mode !== "online_br" && ev.mode !== "online_global") return false;
		if (["bh", "online_br", "online_global"].includes(eventFilters.mode) && ev.mode !== eventFilters.mode) return false;
		if (eventFilters.topic !== "all" && !(ev.topics || []).includes(eventFilters.topic)) return false;

		if (eventFilters.window === "week" && new Date(ev.start_date).getTime() > now + 8 * 86400000) return false;
		if (eventFilters.window === "month" && new Date(ev.start_date).getTime() > now + 32 * 86400000) return false;

		if (q) {
			const hay = `${ev.title} ${ev.organizer} ${ev.location} ${ev.venue || ""} ${ev.description || ""} ${(ev.tags || []).join(" ")} ${(ev.topics || []).map((t) => EVENT_TOPIC_LABELS[t] || t).join(" ")}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});

	const hasActiveFilter =
		eventFilters.search || eventFilters.mode !== "all" || eventFilters.topic !== "all" || eventFilters.window !== "all";
	if (btnClear) btnClear.classList.toggle("hidden", !hasActiveFilter);
	if (countEl) {
		countEl.textContent = `${filtered.length} ${filtered.length === 1 ? "evento encontrado" : "eventos encontrados"}`;
	}

	if (!filtered.length) {
		listEl.innerHTML = `<div class="empty-state">${icon("calendar")}<h3>Nenhum evento com esses filtros</h3><p>Tente limpar os filtros ou clique em “Atualizar” para buscar novas datas.</p></div>`;
		return;
	}

	listEl.innerHTML = "";
	filtered.forEach((ev) => {
		const dt = formatEventDateParts(ev.start_date);
		const isSaved = saved.has(ev.id);
		const modeClass = ev.mode === "bh" ? "mode-bh" : ev.mode === "online_br" ? "mode-online-br" : "mode-online-global";
		const calUrl = buildEventCalendarUrl(ev);

		const card = document.createElement("article");
		card.className = `event-card ${ev.mode === "bh" ? "event-bh" : ""}`;
		card.innerHTML = `
			<div class="event-date-box ${dt.isSoon ? "soon" : ""}">
				<span class="event-date-mon">${escapeHtml(dt.mon)}</span>
				<span class="event-date-day">${escapeHtml(dt.day)}</span>
				<span class="event-date-sub">${escapeHtml(dt.sub)}</span>
			</div>
			<div class="event-body">
				<div class="event-head">
					<div>
						<h3 class="event-title">${escapeHtml(ev.title)}</h3>
						<div class="event-org">${escapeHtml(ev.organizer)}${ev.venue && ev.mode === "bh" ? ` · ${escapeHtml(ev.venue)}` : ""}</div>
					</div>
				</div>
				<div class="event-badges">
					${dt.soonLabel ? `<span class="event-pill soon-tag">${escapeHtml(dt.soonLabel)}</span>` : ""}
					<span class="event-pill ${modeClass}">${escapeHtml(ev.location)}</span>
					${ev.price ? `<span class="event-pill free">${escapeHtml(ev.price)}</span>` : ""}
					${(ev.topics || []).slice(0, 3).map((t) => `<span class="event-pill">${escapeHtml(EVENT_TOPIC_LABELS[t] || t)}</span>`).join("")}
				</div>
				${ev.description ? `<p class="event-desc">${escapeHtml(ev.description)}</p>` : ""}
				<div class="event-foot">
					<span class="event-source">Fonte: ${escapeHtml(ev.source)}</span>
					<div class="event-actions">
						<button type="button" class="btn btn-secondary btn-sm toggle ${isSaved ? "on" : ""}" aria-pressed="${isSaved}" data-save-ev="${escapeHtml(ev.id)}" title="${isSaved ? "Remover dos salvos" : "Salvar evento"}">
							${icon("bookmark")}<span>${isSaved ? "Salvo" : "Salvar"}</span>
						</button>
						${calUrl ? `<a href="${escapeHtml(safeHttpUrl(calUrl))}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="Adicionar ao Google Agenda">${icon("calendar")}<span>Agenda</span></a>` : ""}
						<a href="${escapeHtml(safeHttpUrl(ev.url))}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">
							<span>Abrir evento</span>${icon("external")}
						</a>
					</div>
				</div>
			</div>
		`;

		card.querySelector("[data-save-ev]")?.addEventListener("click", () => toggleSavedEvent(ev.id));
		listEl.appendChild(card);
	});
}

// -----------------------------------------------------------------------------
// Artigos técnicos (curadoria diária 2027 — PT-BR e EN)
// -----------------------------------------------------------------------------
let allArticles = [];
let articleFilters = { search: "", view: "all", topic: "all", sort: "recent" };
const SAVED_ARTICLES_KEY = "saved_articles";
const READ_ARTICLES_KEY = "read_articles";
const getSavedArticles = () => new Set(store.get(SAVED_ARTICLES_KEY, []));
const getReadArticles = () => new Set(store.get(READ_ARTICLES_KEY, []));

function toggleSavedArticle(id) {
	const set = getSavedArticles();
	if (set.has(id)) set.delete(id);
	else set.add(id);
	store.set(SAVED_ARTICLES_KEY, [...set]);
	renderArticles();
}

function toggleReadArticle(id, forceRead = null) {
	const set = getReadArticles();
	const next = forceRead === null ? !set.has(id) : Boolean(forceRead);
	if (next) set.add(id);
	else set.delete(id);
	store.set(READ_ARTICLES_KEY, [...set]);
	renderArticles();
}

const ARTICLE_TOPIC_LABELS = {
	ia: "IA, LLMs & Agentes",
	arquitetura: "Arquitetura & System Design",
	cloud: "Cloud, DevOps & SRE",
	fullstack: "Full Stack & Web",
	qualidade: "Qualidade & Segurança",
	carreira: "Carreira & Global",
};

function setupArticles() {
	const searchInput = document.getElementById("articleSearchQuery");
	const sortSelect = document.getElementById("articleSort");
	const btnRefresh = document.getElementById("btnRefreshArticles");
	const btnClear = document.getElementById("btnClearArticleFilters");

	if (searchInput) {
		searchInput.addEventListener("input", () => {
			articleFilters.search = searchInput.value.trim();
			renderArticles();
		});
	}
	if (sortSelect) {
		sortSelect.addEventListener("change", () => {
			articleFilters.sort = sortSelect.value;
			renderArticles();
		});
	}
	if (btnRefresh) {
		btnRefresh.addEventListener("click", () => loadArticles(true));
	}
	if (btnClear) {
		btnClear.addEventListener("click", () => {
			articleFilters = { search: "", view: "all", topic: "all", sort: "recent" };
			if (searchInput) searchInput.value = "";
			if (sortSelect) sortSelect.value = "recent";
			renderArticles();
		});
	}
}

async function loadArticles(forceRefresh = false) {
	const listEl = document.getElementById("articlesList");
	const countEl = document.getElementById("articlesCount");
	const navBadge = document.getElementById("articlesNavCount");
	const updatedEl = document.getElementById("articlesLastUpdated");

	if (forceRefresh && listEl) {
		listEl.innerHTML = `<div class="empty-state small"><div class="spinner"></div><p>Buscando artigos técnicos atualizados…</p></div>`;
	}

	try {
		const res = await fetch(`/api/articles?limit=80&refresh=${forceRefresh}`);
		const ct = res.headers.get("content-type") || "";
		if (!ct.includes("application/json")) {
			throw new Error(
				"A rota /api/articles ainda não está ativa no servidor atual. Se estiver rodando localmente, reinicie o servidor (Ctrl+C e npm run server); em produção, aguarde o novo deploy."
			);
		}
		const data = await res.json();
		if (!res.ok || !data.success) throw new Error(data.error || "Erro ao buscar artigos.");

		allArticles = data.articles || [];
		if (navBadge) navBadge.textContent = allArticles.length ? String(allArticles.length) : "";
		if (updatedEl && data.last_updated) {
			updatedEl.textContent = `Atualizado: ${data.last_updated}`;
		}
		renderArticles();
		if (forceRefresh) notify(`${allArticles.length} artigos técnicos atualizados.`, "success");
	} catch (err) {
		console.warn("Artigos indisponíveis:", err.message);
		if (countEl) countEl.textContent = "Não foi possível carregar artigos.";
		if (listEl) {
			listEl.innerHTML = `<div class="empty-state">${icon("book")}<h3>Erro ao carregar artigos</h3><p>${escapeHtml(err.message)}</p></div>`;
		}
	}
}

function formatRelativeArticleDate(iso) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
	if (diffDays <= 0) return "Hoje";
	if (diffDays === 1) return "Ontem";
	if (diffDays < 7) return `Há ${diffDays} dias`;
	return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function renderArticleFacets() {
	const box = document.getElementById("articleFacets");
	if (!box) return;
	const saved = getSavedArticles();
	const read = getReadArticles();

	const ptCount = allArticles.filter((a) => a.lang === "pt").length;
	const enCount = allArticles.filter((a) => a.lang === "en").length;
	const savedCount = allArticles.filter((a) => saved.has(a.id)).length;
	const readCount = allArticles.filter((a) => read.has(a.id)).length;

	const views = [
		{ id: "all", label: `Todos (${allArticles.length})` },
		{ id: "pt", label: `Português (${ptCount})` },
		{ id: "en", label: `Inglês · prática técnica (${enCount})` },
		...(savedCount ? [{ id: "saved", label: `Salvos para ler (${savedCount})` }] : []),
		...(readCount ? [{ id: "unread", label: `Não lidos (${allArticles.length - readCount})` }] : []),
	];

	const topicCounts = {};
	allArticles.forEach((a) => (a.topics || []).forEach((t) => (topicCounts[t] = (topicCounts[t] || 0) + 1)));
	const topics = [
		{ id: "all", label: "Todos" },
		...Object.entries(ARTICLE_TOPIC_LABELS)
			.filter(([k]) => topicCounts[k] > 0)
			.map(([k, label]) => ({ id: k, label: `${label} (${topicCounts[k]})` })),
	];

	box.innerHTML = `
		<div class="facet-row">
			<span class="facet-label">Idioma / Lista</span>
			<div class="facet-chips" role="group" aria-label="Filtrar artigos por idioma ou lista">
				${views.map((v) => `<button type="button" class="chip ${articleFilters.view === v.id ? "active" : ""}" aria-pressed="${articleFilters.view === v.id}" data-art-view="${v.id}">${escapeHtml(v.label)}</button>`).join("")}
			</div>
		</div>
		<div class="facet-row">
			<span class="facet-label">Pilar 2027</span>
			<div class="facet-chips" role="group" aria-label="Filtrar artigos por pilar técnico">
				${topics.map((t) => `<button type="button" class="chip ${articleFilters.topic === t.id ? "active" : ""}" aria-pressed="${articleFilters.topic === t.id}" data-art-topic="${t.id}">${escapeHtml(t.label)}</button>`).join("")}
			</div>
		</div>
	`;

	box.querySelectorAll("[data-art-view]").forEach((btn) => {
		btn.addEventListener("click", () => {
			articleFilters.view = btn.dataset.artView;
			renderArticles();
		});
	});
	box.querySelectorAll("[data-art-topic]").forEach((btn) => {
		btn.addEventListener("click", () => {
			articleFilters.topic = btn.dataset.artTopic;
			renderArticles();
		});
	});
}

function renderArticles() {
	const listEl = document.getElementById("articlesList");
	const countEl = document.getElementById("articlesCount");
	const btnClear = document.getElementById("btnClearArticleFilters");
	if (!listEl) return;

	renderArticleFacets();
	const saved = getSavedArticles();
	const read = getReadArticles();
	const q = articleFilters.search.toLowerCase();

	let filtered = allArticles.filter((a) => {
		if (articleFilters.view === "pt" && a.lang !== "pt") return false;
		if (articleFilters.view === "en" && a.lang !== "en") return false;
		if (articleFilters.view === "saved" && !saved.has(a.id)) return false;
		if (articleFilters.view === "unread" && read.has(a.id)) return false;
		if (articleFilters.topic !== "all" && !(a.topics || []).includes(articleFilters.topic)) return false;

		if (q) {
			const hay = `${a.title} ${a.author || ""} ${a.source} ${a.description || ""} ${(a.tags || []).join(" ")} ${(a.topics || []).map((t) => ARTICLE_TOPIC_LABELS[t] || t).join(" ")}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});

	if (articleFilters.sort === "relevance") {
		filtered = [...filtered].sort((a, b) => (b.relevance || 0) - (a.relevance || 0) || new Date(b.published_at) - new Date(a.published_at));
	} else {
		filtered = [...filtered].sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
	}

	const hasActiveFilter = articleFilters.search || articleFilters.view !== "all" || articleFilters.topic !== "all";
	if (btnClear) btnClear.classList.toggle("hidden", !hasActiveFilter);
	if (countEl) {
		countEl.textContent = `${filtered.length} ${filtered.length === 1 ? "artigo encontrado" : "artigos encontrados"}`;
	}

	if (!filtered.length) {
		listEl.innerHTML = `<div class="empty-state">${icon("book")}<h3>Nenhum artigo com esses filtros</h3><p>Limpe os filtros ou clique em “Atualizar” para buscar novos conteúdos.</p></div>`;
		return;
	}

	listEl.innerHTML = "";
	filtered.forEach((a) => {
		const isSaved = saved.has(a.id);
		const isRead = read.has(a.id);
		const relDate = formatRelativeArticleDate(a.published_at);

		const card = document.createElement("article");
		card.className = `article-card ${isRead ? "is-read" : ""}`;
		card.innerHTML = `
			<div class="article-top">
				<div class="article-meta">
					<span class="article-lang ${a.lang === "pt" ? "lang-pt" : "lang-en"}">${a.lang === "pt" ? "PT" : "EN"}</span>
					<span class="article-source-badge">${escapeHtml(a.source)}</span>
					${a.author && a.author !== a.source ? `<span>· ${escapeHtml(a.author)}</span>` : ""}
					${relDate ? `<span>· ${escapeHtml(relDate)}</span>` : ""}
					${a.reading_time ? `<span>· ${a.reading_time} min de leitura</span>` : ""}
				</div>
				<div class="event-badges">
					${(a.topics || []).slice(0, 3).map((t) => `<span class="event-pill">${escapeHtml(ARTICLE_TOPIC_LABELS[t] || t)}</span>`).join("")}
				</div>
			</div>
			<h3 class="article-title">
				<a href="${escapeHtml(safeHttpUrl(a.url))}" target="_blank" rel="noopener noreferrer" data-open-art="${escapeHtml(a.id)}">${escapeHtml(a.title)}</a>
			</h3>
			${a.description ? `<p class="article-desc">${escapeHtml(a.description)}</p>` : ""}
			<div class="article-foot">
				<span class="event-source">${isRead ? "✓ Marcado como lido" : "Leitura recomendada"}</span>
				<div class="article-actions">
					<button type="button" class="btn btn-secondary btn-sm toggle ${isRead ? "on" : ""}" aria-pressed="${isRead}" data-read-art="${escapeHtml(a.id)}" title="${isRead ? "Marcar como não lido" : "Marcar como lido"}">
						${icon("check")}<span>${isRead ? "Lido" : "Marcar lido"}</span>
					</button>
					<button type="button" class="btn btn-secondary btn-sm toggle ${isSaved ? "on" : ""}" aria-pressed="${isSaved}" data-save-art="${escapeHtml(a.id)}" title="${isSaved ? "Remover da lista" : "Salvar para ler depois"}">
						${icon("bookmark")}<span>${isSaved ? "Salvo" : "Salvar"}</span>
					</button>
					<a href="${escapeHtml(safeHttpUrl(a.url))}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" data-open-art="${escapeHtml(a.id)}">
						<span>Ler artigo</span>${icon("external")}
					</a>
				</div>
			</div>
		`;

		card.querySelector("[data-save-art]")?.addEventListener("click", () => toggleSavedArticle(a.id));
		card.querySelector("[data-read-art]")?.addEventListener("click", () => toggleReadArticle(a.id));
		card.querySelectorAll("[data-open-art]").forEach((el) => {
			el.addEventListener("click", () => toggleReadArticle(a.id, true));
		});
		listEl.appendChild(card);
	});
}
