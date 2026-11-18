// =============================================================================
// Learning Hub — módulo front-end desacoplado do Career Studio
// Gerencia cursos, certificações oficiais, badges, skill gaps (4 níveis),
// recomendações baseadas nas vagas, metas/dependências, exportação CV/LinkedIn
// e contrato de API (/api/study-plan) para integração com o StudyFlow.
// =============================================================================
(function initLearningHubModule() {
	const LOCAL_KEY = "learning_hub_state_v1";
	let ctx = null; // ponte mínima fornecida pelo app.js
	let activeView = "overview"; // overview | items | gaps | roadmap | export
	let filters = { q: "", type: "all", credential: "all", status: "all" };
	let editingId = null;
	let loaded = false;
	let serverData = null; // { metrics, skill_analysis, recommendations, roadmap, exports, available_skills, ... }
	let state = {
		items: [],
		deleted_ids: [],
		target_track: "fullstack",
		weekly_hours_goal: 8,
		updated_at: new Date().toISOString(),
	};

	const TYPE_LABEL = {
		course: "Curso",
		official_certification: "Certificação oficial",
		workshop: "Workshop",
		track: "Trilha",
		degree: "Formação / Pós",
	};

	const CRED_LABEL = {
		official_certification: "Certificação oficial",
		completion_certificate: "Certificado de conclusão",
		badge: "Badge digital",
		none: "Sem credencial",
	};

	const STATUS_LABEL = {
		planned: "Planejado",
		in_progress: "Em andamento",
		completed: "Concluído",
		paused: "Pausado",
		expired: "Expirado",
	};

	const LEVEL_LABEL = {
		beginner: "Introdutório",
		intermediate: "Intermediário",
		advanced: "Avançado",
	};

	const EVIDENCE_LABEL = {
		certified: "Validada por certificação",
		demonstrated: "Demonstrada em projeto",
		declared: "Declarada no CV",
		missing: "Ausente",
	};

	function esc(s) {
		return ctx ? ctx.escapeHtml(s) : String(s ?? "");
	}

	function safeUrl(url) {
		const v = String(url ?? "").trim();
		return /^https?:\/\//i.test(v) ? v : "";
	}

	function ic(name, cls = "") {
		return `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
	}

	function slugify(text) {
		return String(text || "")
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 64);
	}

	function readLocal() {
		return ctx?.store.get(LOCAL_KEY, null) || null;
	}

	function writeLocal(next) {
		state = next;
		ctx?.store.set(LOCAL_KEY, state);
		updateNavBadge();
	}

	function mergeStates(localRaw, remoteRaw) {
		const local = localRaw || { items: [], deleted_ids: [] };
		const remote = remoteRaw || { items: [], deleted_ids: [] };
		const deleted = new Set([
			...(local.deleted_ids || []),
			...(remote.deleted_ids || []),
		]);
		const byId = new Map();
		for (const item of [...(remote.items || []), ...(local.items || [])]) {
			if (!item?.id || deleted.has(item.id)) continue;
			const prev = byId.get(item.id);
			if (!prev || String(item.updated_at || "") > String(prev.updated_at || "")) {
				byId.set(item.id, item);
			}
		}
		const newer =
			String(local.updated_at || "") >= String(remote.updated_at || "")
				? local
				: remote;
		return {
			items: [...byId.values()].sort((a, b) =>
				String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
			),
			deleted_ids: [...deleted].slice(-200),
			target_track: newer.target_track || "fullstack",
			weekly_hours_goal: Number(newer.weekly_hours_goal) || 8,
			updated_at: newer.updated_at || new Date().toISOString(),
		};
	}

	function updateNavBadge() {
		const badge = document.getElementById("learningNavCount");
		if (!badge) return;
		const active = (state.items || []).filter(
			(i) => i.status === "in_progress" || i.status === "planned",
		).length;
		badge.textContent = active ? String(active) : "";
	}

	function formatCurrencyMap(investments = {}) {
		const entries = Object.entries(investments).filter(([, v]) => Number(v) > 0);
		if (!entries.length) return "R$ 0";
		return entries
			.map(([cur, val]) => {
				const sym = cur === "BRL" ? "R$" : cur === "USD" ? "US$" : "€";
				return `${sym} ${Number(val).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
			})
			.join(" + ");
	}

	function formatPrice(item) {
		if (item.price_amount === 0) return "Gratuito";
		if (item.price_amount > 0 && item.currency) {
			const sym =
				item.currency === "BRL" ? "R$" : item.currency === "USD" ? "US$" : "€";
			return `${sym} ${Number(item.price_amount).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
		}
		return "Consultar página oficial";
	}

	function formatDateShort(iso) {
		if (!iso) return "—";
		const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (m) return `${m[3]}/${m[2]}/${m[1]}`;
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
	}

	function isExpiringSoon(item) {
		if (!item?.expires_at || item.status !== "completed") return false;
		const exp = new Date(item.expires_at).getTime();
		const now = Date.now();
		return exp >= now && exp <= now + 90 * 24 * 60 * 60 * 1000;
	}

	async function callLearningApi(method, payload = null) {
		const opts =
			method === "GET"
				? { method: "GET" }
				: {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload || {}),
					};
		const res = await fetch("/api/learning", opts);
		const ct = res.headers.get("content-type") || "";
		if (!ct.includes("application/json")) {
			throw new Error(
				"Servidor local desatualizado para /api/learning. Reinicie o `npm run server`.",
			);
		}
		const data = await res.json();
		return { res, data };
	}

	async function syncAndAnalyze({ saveToServer = false } = {}) {
		const resume = ctx?.getResume?.() || null;
		try {
			if (saveToServer) {
				// Salva na nuvem (Firebase) se logado; se local Express, também grava data/learning-records.json
				const user = ctx?.getCloudUser?.();
				if (user && window.cloud?.save) {
					await window.cloud.save("learning", { state });
				}
				const { res, data } = await callLearningApi("POST", {
					state,
					resume,
				});
				if (res.ok && data.success) {
					serverData = data;
					if (data.state) writeLocal(data.state);
					render();
					return;
				}
				if (res.status === 501) {
					// Vercel somente leitura: recalcula métricas e recomendações via action="analyze"
					const analyzed = await callLearningApi("POST", {
						action: "analyze",
						state,
						resume,
					});
					if (analyzed.res.ok && analyzed.data.success) {
						serverData = analyzed.data;
						render();
					}
					return;
				}
			}

			if (!loaded) {
				const local = readLocal();
				const { res, data } = await callLearningApi("GET");
				if (!res.ok || !data.success) {
					throw new Error(data.error || "Não foi possível carregar o Learning Hub.");
				}
				loaded = true;
				const merged = local ? mergeStates(local, data.state) : data.state;
				writeLocal(merged);
				// Recalcula com o estado mesclado + currículo atual do navegador
				const analyzed = await callLearningApi("POST", {
					action: "analyze",
					state: merged,
					resume,
				});
				serverData = analyzed.res.ok && analyzed.data.success ? analyzed.data : data;
				render();
			} else {
				const analyzed = await callLearningApi("POST", {
					action: "analyze",
					state,
					resume,
				});
				if (analyzed.res.ok && analyzed.data.success) {
					serverData = analyzed.data;
					render();
				}
			}
		} catch (err) {
			const box = document.getElementById("learningContent");
			if (box && !serverData) {
				box.innerHTML = `<div class="empty-state">${ic("alert")}<h3>Não foi possível carregar o Learning Hub</h3><p>${esc(err.message)}</p></div>`;
			} else if (saveToServer) {
				ctx?.notify?.(`Erro ao sincronizar Learning Hub: ${err.message}`, "error");
			}
		}
	}

	async function persistChange(nextState, toastMsg = "") {
		writeLocal(nextState);
		await syncAndAnalyze({ saveToServer: true });
		if (toastMsg) ctx?.notify?.(toastMsg, "success", { timeout: 2800 });
	}

	function openItemModal(item = null, presetCatalog = null) {
		const modal = document.getElementById("learningModal");
		if (!modal) return;
		editingId = item ? item.id : null;
		const src = item || presetCatalog || {};

		document.getElementById("learningModalTitle").textContent = item
			? "Editar registro de estudo"
			: presetCatalog
				? "Adicionar recomendação ao meu plano"
				: "Novo curso, certificação ou meta";

		const setVal = (id, val) => {
			const el = document.getElementById(id);
			if (el) el.value = val ?? "";
		};

		setVal("lhTitle", src.title || "");
		setVal("lhInstitution", src.institution || "");
		setVal("lhType", src.type || "course");
		setVal(
			"lhCredentialKind",
			src.credential_kind ||
				(src.type === "official_certification"
					? "official_certification"
					: "completion_certificate"),
		);
		setVal("lhStatus", item ? src.status || "planned" : "planned");
		setVal("lhLevel", src.level || "intermediate");
		setVal("lhLanguage", src.language || "pt");
		setVal("lhOfficialUrl", src.official_url || "");
		setVal(
			"lhPriceAmount",
			src.price_amount !== null && src.price_amount !== undefined
				? String(src.price_amount)
				: "",
		);
		setVal("lhCurrency", src.currency || "BRL");
		setVal("lhPricingNote", src.pricing_note || "");
		setVal(
			"lhDurationHours",
			src.duration_hours !== null && src.duration_hours !== undefined
				? String(src.duration_hours)
				: "",
		);
		setVal("lhStudiedHours", String(src.studied_hours ?? 0));
		setVal("lhProgressPct", String(src.progress_pct ?? 0));
		setVal("lhDueDate", src.due_date ? String(src.due_date).slice(0, 10) : "");
		setVal("lhIssuedAt", src.issued_at ? String(src.issued_at).slice(0, 10) : "");
		setVal("lhExpiresAt", src.expires_at ? String(src.expires_at).slice(0, 10) : "");
		setVal("lhCredentialId", src.credential_id || "");
		setVal("lhProofUrl", src.proof_url || "");
		setVal("lhRating", src.rating ? String(src.rating) : "");
		setVal(
			"lhVerifiedAt",
			src.verified_at
				? String(src.verified_at).slice(0, 10)
				: new Date().toISOString().slice(0, 10),
		);
		setVal("lhSkills", Array.isArray(src.skills) ? src.skills.join(", ") : "");
		setVal("lhNotes", src.notes || src.summary || "");
		modal.dataset.catalogId = src.catalog_id || presetCatalog?.id || "";

		// Lista de pré-requisitos (outros itens já cadastrados)
		const depSelect = document.getElementById("lhDependsOn");
		if (depSelect) {
			const selectedDeps = new Set(src.depends_on || []);
			const others = (state.items || []).filter((i) => i.id !== editingId);
			depSelect.innerHTML = others.length
				? others
						.map(
							(o) =>
								`<option value="${esc(o.id)}" ${selectedDeps.has(o.id) ? "selected" : ""}>${esc(o.title)} (${esc(STATUS_LABEL[o.status] || o.status)})</option>`,
						)
						.join("")
				: `<option value="" disabled>Nenhum outro item cadastrado ainda</option>`;
		}

		const delBtn = document.getElementById("btnDeleteLearning");
		if (delBtn) delBtn.hidden = !item;
		const err = document.getElementById("learningFormError");
		if (err) err.hidden = true;

		modal.classList.remove("hidden");
		setTimeout(() => document.getElementById("lhTitle")?.focus(), 40);
	}

	function closeModal() {
		document.getElementById("learningModal")?.classList.add("hidden");
	}

	async function saveItemFromModal() {
		const modal = document.getElementById("learningModal");
		const val = (id) => document.getElementById(id)?.value?.trim() || "";
		const title = val("lhTitle");
		const err = document.getElementById("learningFormError");

		if (!title) {
			err.textContent = "Informe o título do curso, certificação ou trilha.";
			err.hidden = false;
			return;
		}
		const officialUrl = val("lhOfficialUrl");
		if (officialUrl && !/^https?:\/\//i.test(officialUrl)) {
			err.textContent = "A URL oficial deve começar com http:// ou https://.";
			err.hidden = false;
			return;
		}
		const proofUrl = val("lhProofUrl");
		if (proofUrl && !/^https?:\/\//i.test(proofUrl)) {
			err.textContent = "A URL do comprovante deve começar com http:// ou https://.";
			err.hidden = false;
			return;
		}

		const depSelect = document.getElementById("lhDependsOn");
		const depends_on = depSelect
			? [...depSelect.selectedOptions].map((o) => o.value).filter(Boolean)
			: [];

		const nowIso = new Date().toISOString();
		const existing = editingId
			? (state.items || []).find((i) => i.id === editingId)
			: null;
		const id = editingId || `${slugify(title) || "estudo"}-${Date.now().toString(36)}`;
		const status = val("lhStatus") || "planned";
		const rawPrice = val("lhPriceAmount");
		const rawDuration = val("lhDurationHours");
		const rawRating = val("lhRating");
		const studied = Math.max(0, Number(val("lhStudiedHours")) || 0);
		let progress = Math.min(100, Math.max(0, Number(val("lhProgressPct")) || 0));
		if (status === "completed" || status === "expired") progress = 100;

		const item = {
			id,
			title,
			institution: val("lhInstitution"),
			type: val("lhType") || "course",
			credential_kind: val("lhCredentialKind") || "completion_certificate",
			official_url: officialUrl,
			price_amount: rawPrice === "" ? null : Math.max(0, Number(rawPrice)),
			currency: rawPrice === "" ? null : val("lhCurrency") || "BRL",
			pricing_note: val("lhPricingNote"),
			duration_hours: rawDuration === "" ? null : Math.max(0, Number(rawDuration)),
			studied_hours: studied,
			progress_pct: Math.round(progress),
			language: val("lhLanguage") || "pt",
			level: val("lhLevel") || "intermediate",
			rating: rawRating === "" ? null : Math.min(5, Math.max(1, Number(rawRating))),
			status,
			started_at:
				existing?.started_at ||
				(status === "in_progress" ? nowIso.slice(0, 10) : null),
			completed_at:
				status === "completed"
					? existing?.completed_at || nowIso.slice(0, 10)
					: existing?.completed_at || null,
			due_date: val("lhDueDate") || null,
			issued_at: val("lhIssuedAt") || null,
			expires_at: val("lhExpiresAt") || null,
			credential_id: val("lhCredentialId"),
			proof_url: proofUrl,
			verified_at: val("lhVerifiedAt") || nowIso.slice(0, 10),
			skills: val("lhSkills")
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean),
			depends_on,
			catalog_id: modal?.dataset.catalogId || existing?.catalog_id || null,
			notes: document.getElementById("lhNotes")?.value?.trim() || "",
			created_at: existing?.created_at || nowIso,
			updated_at: nowIso,
		};

		const nextItems = existing
			? state.items.map((i) => (i.id === id ? item : i))
			: [item, ...(state.items || [])];

		closeModal();
		await persistChange(
			{
				...state,
				items: nextItems,
				deleted_ids: (state.deleted_ids || []).filter((d) => d !== id),
				updated_at: nowIso,
			},
			existing ? "Registro de estudo atualizado." : "Registro adicionado ao Learning Hub.",
		);
	}

	async function deleteEditingItem() {
		if (!editingId) return;
		const id = editingId;
		const nowIso = new Date().toISOString();
		closeModal();
		await persistChange(
			{
				...state,
				items: (state.items || []).filter((i) => i.id !== id),
				deleted_ids: [...new Set([...(state.deleted_ids || []), id])].slice(-200),
				updated_at: nowIso,
			},
			"Registro removido do Learning Hub.",
		);
	}

	async function quickUpdateItem(id, patch, msg) {
		const target = (state.items || []).find((i) => i.id === id);
		if (!target) return;
		const nowIso = new Date().toISOString();
		const studied =
			patch.add_hours !== undefined
				? Number(((target.studied_hours || 0) + patch.add_hours).toFixed(1))
				: target.studied_hours || 0;
		let progress =
			patch.progress_pct !== undefined
				? patch.progress_pct
				: patch.add_hours !== undefined && target.duration_hours > 0
					? Math.min(100, Math.round((studied / target.duration_hours) * 100))
					: target.progress_pct || 0;
		let status = patch.status || target.status;
		if (status === "completed") progress = 100;
		if (progress >= 100 && status === "in_progress") status = "completed";
		if (patch.add_hours > 0 && status === "planned") status = "in_progress";

		const updated = {
			...target,
			studied_hours: studied,
			progress_pct: progress,
			status,
			started_at:
				target.started_at || (status === "in_progress" ? nowIso.slice(0, 10) : null),
			completed_at:
				status === "completed"
					? target.completed_at || nowIso.slice(0, 10)
					: target.completed_at,
			updated_at: nowIso,
		};

		await persistChange(
			{
				...state,
				items: state.items.map((i) => (i.id === id ? updated : i)),
				updated_at: nowIso,
			},
			msg,
		);
	}

	async function copyStudyFlowPayload() {
		try {
			const res = await fetch("/api/study-plan", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					resume: ctx?.getResume?.() || null,
					state,
				}),
			});
			if (!res.ok) throw new Error("Endpoint /api/study-plan indisponível.");
			const payload = await res.json();
			await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
			ctx?.notify?.(
				`Payload StudyFlow v${payload.schema_version} copiado (${payload.priority_skills.length} competências + ${payload.learning_items.length} estudos + ${payload.recommended_projects.length} projetos).`,
				"success",
				{ timeout: 4500 },
			);
		} catch (err) {
			ctx?.notify?.(`Erro ao exportar para StudyFlow: ${err.message}`, "error");
		}
	}

	async function copyBudgetPayload() {
		try {
			const res = await fetch("/api/learning-budget", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					resume: ctx?.getResume?.() || null,
					state,
				}),
			});
			if (!res.ok) throw new Error("Endpoint /api/learning-budget indisponível.");
			const payload = await res.json();
			await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
			ctx?.notify?.(
				`Orçamento Finance App copiado (${payload.goals.length} metas de reserva em moeda oficial).`,
				"success",
				{ timeout: 4500 },
			);
		} catch (err) {
			ctx?.notify?.(`Erro ao exportar orçamento: ${err.message}`, "error");
		}
	}

	function renderOverview(data) {
		const m = data.metrics || {};
		const recs = (data.recommendations || []).slice(0, 3);
		const road = (data.roadmap || []).filter((i) => i.status !== "completed").slice(0, 4);
		const studyApiUrl = `${window.location.origin}/api/study-plan`;
		const financeApiUrl = `${window.location.origin}/api/learning-budget`;

		return `
      <div class="stats-row">
        <div class="stat"><span class="stat-value">${m.total_items || 0}</span><span class="stat-label">estudos cadastrados (${m.in_progress || 0} em andamento)</span></div>
        <div class="stat"><span class="stat-value text-ok">${m.official_certifications_active || 0}</span><span class="stat-label">certificações oficiais ativas</span></div>
        <div class="stat"><span class="stat-value">${m.hours_studied || 0}h</span><span class="stat-label">horas estudadas${m.hours_planned ? ` / ${m.hours_planned}h` : ""}</span></div>
        <div class="stat"><span class="stat-value">${esc(formatCurrencyMap(m.investments))}</span><span class="stat-label">investimento registrado</span></div>
      </div>

      <div class="lh-cred-strip">
        <span class="meta-chip">Certificações oficiais: <strong>${m.official_certifications_active || 0}</strong></span>
        <span class="meta-chip">Certificados de conclusão: <strong>${m.completion_certificates || 0}</strong></span>
        <span class="meta-chip">Badges digitais: <strong>${m.badges || 0}</strong></span>
        ${m.expiring_soon ? `<span class="meta-chip text-warn">${ic("alert")} ${m.expiring_soon} expirando em ≤ 90 dias</span>` : ""}
        ${m.expired_count ? `<span class="meta-chip text-danger">${m.expired_count} expirada(s)</span>` : ""}
      </div>

      <div class="lh-two-col">
        <section class="card">
          <div class="cv-versions-head">
            <div>
              <h2 class="card-title">Competências prioritárias nas vagas</h2>
              <p class="card-sub">Baseado em ${data.skill_analysis?.jobs_analyzed || 0} vagas reais (${esc(data.jobs_updated_at || "—")}).</p>
            </div>
            <button type="button" class="link-btn" data-lh-goto="gaps">Ver matriz completa</button>
          </div>
          <div class="lh-priority-list">
            ${
							(m.priority_skills || []).length
								? m.priority_skills
										.map(
											(s) => `
                <div class="lh-priority-row">
                  <div>
                    <strong>${esc(s.tech)}</strong>
                    ${s.core ? `<span class="lh-mini-tag">Stack central</span>` : ""}
                  </div>
                  <div class="lh-priority-meta">
                    <span>${s.jobs} vagas (${s.pct}%)</span>
                    <span class="lh-ev-pill ${esc(s.evidence_level)}">${esc(EVIDENCE_LABEL[s.evidence_level] || s.evidence_level)}</span>
                  </div>
                </div>`,
										)
										.join("")
								: `<p class="muted">Nenhuma lacuna crítica aberta no momento.</p>`
						}
          </div>
        </section>

        <section class="card">
          <div class="cv-versions-head">
            <div>
              <h2 class="card-title">Integrações via API (StudyFlow &amp; Finance App)</h2>
              <p class="card-sub">Cronograma diário no StudyFlow e caixinha de reserva de certificações no Finance App.</p>
            </div>
          </div>
          <div class="lh-api-box">
            <label class="idea-label" for="lhStudyFlowEndpoint">StudyFlow — Plano de estudos (GET / POST)</label>
            <div class="lh-api-row">
              <input type="text" id="lhStudyFlowEndpoint" value="${esc(studyApiUrl)}" readonly>
              <button type="button" class="btn btn-secondary btn-sm" id="btnCopyStudyFlowUrl">${ic("copy")}URL</button>
              <button type="button" class="btn btn-primary btn-sm" id="btnCopyStudyFlowJson">${ic("code")}JSON</button>
            </div>
            <label class="idea-label" for="lhFinanceEndpoint" style="display:block;margin-top:10px">Finance App — Caixinha de certificações (GET / POST)</label>
            <div class="lh-api-row">
              <input type="text" id="lhFinanceEndpoint" value="${esc(financeApiUrl)}" readonly>
              <button type="button" class="btn btn-secondary btn-sm" id="btnCopyFinanceUrl">${ic("copy")}URL</button>
              <button type="button" class="btn btn-primary btn-sm" id="btnCopyFinanceJson">${ic("code")}JSON</button>
            </div>
          </div>
          <div class="lh-track-prefs">
            <div class="form-group">
              <label for="lhTargetTrack">Trilha alvo de carreira</label>
              <select id="lhTargetTrack">
                <option value="fullstack" ${state.target_track === "fullstack" ? "selected" : ""}>Software Engineer (Full Stack &amp; Backend)</option>
                <option value="backend_ai" ${state.target_track === "backend_ai" ? "selected" : ""}>Backend &amp; AI Application Engineer</option>
                <option value="cloud" ${state.target_track === "cloud" ? "selected" : ""}>Cloud Software Engineer</option>
              </select>
            </div>
            <div class="form-group">
              <label for="lhWeeklyGoal">Meta semanal (horas)</label>
              <input type="number" id="lhWeeklyGoal" min="1" max="60" value="${esc(String(state.weekly_hours_goal || 8))}">
            </div>
          </div>
        </section>
      </div>

      <section class="card" style="margin-top:16px">
        <div class="cv-versions-head">
          <div>
            <h2 class="card-title">Próximas recomendações oficiais</h2>
            <p class="card-sub">Filtradas para evitar cursos introdutórios de tecnologias já demonstradas ou certificadas.</p>
          </div>
          <button type="button" class="link-btn" data-lh-goto="gaps">Ver todas (${(data.recommendations || []).length})</button>
        </div>
        <div class="lh-rec-grid">
          ${recs.length ? recs.map(renderRecCard).join("") : `<p class="muted">Nenhuma nova recomendação pendente para a trilha selecionada.</p>`}
        </div>
      </section>

      ${
				road.length
					? `<section class="card" style="margin-top:16px">
        <div class="cv-versions-head">
          <div>
            <h2 class="card-title">Em foco agora (Roadmap)</h2>
            <p class="card-sub">Itens prontos para estudo e próximos prazos.</p>
          </div>
          <button type="button" class="link-btn" data-lh-goto="roadmap">Abrir roadmap</button>
        </div>
        <div class="lh-mini-road">
          ${road
						.map(
							(r) => `
            <div class="lh-mini-road-item">
              <div>
                <strong>${esc(r.title)}</strong>
                <span class="muted">${esc(r.institution || TYPE_LABEL[r.type])} · ${r.due_date ? `Prazo ${formatDateShort(r.due_date)}` : "Sem prazo"}</span>
              </div>
              <div class="lh-mini-road-right">
                <span class="meta-chip">${r.progress_pct}%</span>
                <button type="button" class="btn btn-secondary btn-sm" data-lh-add-hour="${esc(r.id)}" title="Registrar +1 hora estudada">+1h</button>
              </div>
            </div>`,
						)
						.join("")}
        </div>
      </section>`
					: ""
			}`;
	}

	function renderItemsView() {
		const q = filters.q.toLowerCase();
		const filtered = (state.items || []).filter((item) => {
			if (filters.type !== "all" && item.type !== filters.type) return false;
			if (filters.credential !== "all" && item.credential_kind !== filters.credential)
				return false;
			if (filters.status !== "all" && item.status !== filters.status) return false;
			if (q) {
				const blob =
					`${item.title} ${item.institution} ${(item.skills || []).join(" ")} ${item.notes || ""}`.toLowerCase();
				if (!blob.includes(q)) return false;
			}
			return true;
		});

		const cards = filtered
			.map((item) => {
				const expSoon = isExpiringSoon(item);
				const url = safeUrl(item.official_url);
				const proof = safeUrl(item.proof_url);
				return `
      <article class="idea-card lh-item-card">
        <header class="idea-header">
          <div>
            <h3>${esc(item.title)}</h3>
            <p class="muted" style="font-size:12.5px;margin-top:2px">${esc(item.institution || "Instituição não informada")} · ${esc(TYPE_LABEL[item.type] || item.type)} · ${esc(LEVEL_LABEL[item.level] || item.level)} · ${esc((item.language || "pt").toUpperCase())}</p>
          </div>
          <div class="idea-badges">
            <span class="lh-cred-badge ${esc(item.credential_kind)}">${esc(CRED_LABEL[item.credential_kind] || item.credential_kind)}</span>
            <span class="meta-chip">${esc(STATUS_LABEL[item.status] || item.status)}</span>
          </div>
        </header>

        <div class="lh-progress-wrap">
          <div class="lh-progress-meta">
            <span>Progresso: <strong>${item.progress_pct || 0}%</strong></span>
            <span>${item.studied_hours || 0}h${item.duration_hours ? ` / ${item.duration_hours}h` : " estudadas"}</span>
          </div>
          <div class="checklist-bar" style="margin:4px 0 0"><span style="width:${item.progress_pct || 0}%"></span></div>
        </div>

        <div class="lh-meta-grid">
          <span><strong>Investimento:</strong> ${esc(formatPrice(item))}</span>
          <span><strong>Prazo:</strong> ${esc(formatDateShort(item.due_date))}</span>
          ${item.expires_at ? `<span class="${expSoon ? "text-warn" : item.status === "expired" ? "text-danger" : ""}"><strong>Validade:</strong> ${esc(formatDateShort(item.expires_at))}${expSoon ? " (renovar em breve)" : ""}</span>` : ""}
          ${item.rating ? `<span><strong>Avaliação:</strong> ${"★".repeat(item.rating)}${"☆".repeat(5 - item.rating)}</span>` : ""}
          ${item.verified_at ? `<span><strong>Verificado em:</strong> ${esc(formatDateShort(item.verified_at))}</span>` : ""}
        </div>

        ${(item.skills || []).length ? `<div class="tag-row">${item.skills.map((s) => `<span class="skill-tag">${esc(s)}</span>`).join("")}</div>` : ""}
        ${item.notes ? `<p class="idea-problem">${esc(item.notes)}</p>` : ""}

        <footer class="idea-footer">
          <div class="idea-footer-actions">
            ${url ? `<a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${ic("external")}Página oficial</a>` : ""}
            ${proof ? `<a class="btn btn-ghost btn-sm" href="${esc(proof)}" target="_blank" rel="noopener noreferrer">${ic("shield")}Comprovante</a>` : ""}
          </div>
          <div class="idea-footer-actions">
            ${item.status !== "completed" && item.status !== "expired" ? `<button type="button" class="btn btn-secondary btn-sm" data-lh-add-hour="${esc(item.id)}">+1h</button>` : ""}
            ${item.status !== "completed" ? `<button type="button" class="btn btn-secondary btn-sm" data-lh-complete="${esc(item.id)}">${ic("check")}Concluir</button>` : ""}
            <button type="button" class="btn btn-secondary btn-sm" data-lh-edit="${esc(item.id)}">${ic("edit")}Editar</button>
          </div>
        </footer>
      </article>`;
			})
			.join("");

		return `
      <div class="jobs-toolbar lh-filters">
        <div class="search-field">
          ${ic("search")}
          <input type="search" id="lhSearch" aria-label="Buscar cursos, certificações ou competências" placeholder="Buscar por curso, instituição ou competência" value="${esc(filters.q)}">
        </div>
        <select id="lhFilterType" aria-label="Filtrar por tipo">
          <option value="all" ${filters.type === "all" ? "selected" : ""}>Todos os tipos</option>
          ${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${filters.type === k ? "selected" : ""}>${esc(v)}</option>`).join("")}
        </select>
        <select id="lhFilterCred" aria-label="Filtrar por tipo de credencial">
          <option value="all" ${filters.credential === "all" ? "selected" : ""}>Todas as credenciais</option>
          ${Object.entries(CRED_LABEL).map(([k, v]) => `<option value="${k}" ${filters.credential === k ? "selected" : ""}>${esc(v)}</option>`).join("")}
        </select>
        <select id="lhFilterStatus" aria-label="Filtrar por status">
          <option value="all" ${filters.status === "all" ? "selected" : ""}>Todos os status</option>
          ${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${filters.status === k ? "selected" : ""}>${esc(v)}</option>`).join("")}
        </select>
      </div>
      <div class="ideas-grid">
        ${
					cards ||
					`<div class="empty-state small">${ic("graduation")}<h3>Nenhum registro encontrado</h3><p>Clique em “+ Novo registro” para cadastrar manualmente um curso, certificação oficial ou formação, ou adicione uma recomendação na aba <strong>Skill Gaps &amp; Recomendações</strong>.</p></div>`
				}
      </div>`;
	}

	function renderRecCard(rec) {
		const url = safeUrl(rec.official_url);
		const prioLabel =
			rec.priority === "high"
				? "Alta prioridade"
				: rec.priority === "medium"
					? "Prioridade média"
					: "Complementar";
		return `
      <article class="idea-card lh-rec-card">
        <header class="idea-header">
          <div>
            <h3>${esc(rec.title)}</h3>
            <p class="muted" style="font-size:12.5px;margin-top:2px">${esc(rec.institution)} · ${esc(LEVEL_LABEL[rec.level] || rec.level)} · ${esc((rec.language || "en").toUpperCase())}</p>
          </div>
          <div class="idea-badges">
            <span class="lh-cred-badge ${esc(rec.credential_kind)}">${esc(CRED_LABEL[rec.credential_kind] || rec.credential_kind)}</span>
            <span class="meta-chip ${rec.priority === "high" ? "text-warn" : ""}">${esc(prioLabel)}</span>
          </div>
        </header>
        <p class="idea-problem">${esc(rec.summary || "")}</p>
        <div class="idea-improved">${ic("target")}<span><strong>Por que recomendamos:</strong> ${esc(rec.justification)} ${esc(rec.evidence_note)}</span></div>
        <div class="tag-row">${(rec.skills || []).map((s) => `<span class="skill-tag">${esc(s)}</span>`).join("")}</div>
        <p class="muted" style="font-size:12px"><strong>Preço:</strong> ${esc(formatPrice(rec))}${rec.pricing_note ? ` — ${esc(rec.pricing_note)}` : ""} · <strong>Verificado em:</strong> ${esc(formatDateShort(rec.verified_at))}</p>
        <footer class="idea-footer">
          ${url ? `<a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${ic("external")}Página oficial</a>` : "<span></span>"}
          <button type="button" class="btn btn-primary btn-sm" data-lh-adopt="${esc(rec.id)}">${ic("plus")}Adicionar ao plano</button>
        </footer>
      </article>`;
	}

	function renderGapsView(data) {
		const a = data.skill_analysis || { top_demand: [] };
		const maxJobs = Math.max(1, ...(a.top_demand || []).map((s) => s.jobs));
		const rows = (a.top_demand || [])
			.slice(0, 20)
			.map(
				(s) => `
      <div class="demand-row" title="${esc((s.sample_jobs || []).join("\n"))}">
        <span class="demand-tech">${esc(s.tech)}</span>
        <span class="demand-bar"><span class="demand-fill ${s.evidence_level === "certified" || s.evidence_level === "demonstrated" ? "proven" : s.evidence_level === "declared" ? "unproven" : "missing"}" style="width:${Math.round((s.jobs / maxJobs) * 100)}%"></span></span>
        <span class="demand-count">${s.jobs}</span>
        <span class="lh-ev-pill ${esc(s.evidence_level)}">${esc(EVIDENCE_LABEL[s.evidence_level] || s.evidence_level)}</span>
      </div>`,
			)
			.join("");

		const recs = data.recommendations || [];
		return `
      <section class="card">
        <div class="cv-versions-head">
          <div>
            <h2 class="card-title">Matriz de Evidências (4 níveis) × Vagas Monitoradas</h2>
            <p class="card-sub">Diferencia conhecimento declarado no currículo, demonstrado em projeto e validado por certificação oficial. Coleta: ${esc(data.jobs_updated_at || "—")}.</p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btnGotoIdeasFromLearning">${ic("bulb")}Ver ideias de projetos</button>
        </div>
        <div class="demand-chart">${rows || `<p class="muted">Sem dados de vagas para cruzar.</p>`}</div>
      </section>

      <div class="ideas-toolbar-row">
        <h2 class="section-title">Cursos e certificações recomendados (${recs.length})</h2>
        <span class="muted" style="font-size:12.5px">Apenas links oficiais · Catálogo verificado em ${esc(formatDateShort(data.catalog_verified_at))}</span>
      </div>
      <div class="ideas-grid">
        ${recs.length ? recs.map(renderRecCard).join("") : `<div class="empty-state small"><p>Todas as recomendações aplicáveis já foram adicionadas ou cobertas pelo seu perfil.</p></div>`}
      </div>`;
	}

	function renderRoadmapView(data) {
		const road = data.roadmap || [];
		if (!road.length) {
			return `<div class="empty-state">${ic("calendar")}<h3>Roadmap de estudos vazio</h3><p>Adicione cursos, certificações ou metas com prazos e dependências (pré-requisitos). Depois, o <strong>StudyFlow</strong> consome este plano via <code>/api/study-plan</code> para montar seu cronograma diário.</p><button type="button" class="btn btn-primary" data-lh-new="1">${ic("plus")}Cadastrar primeira meta</button></div>`;
		}

		return `
      <div class="notice">${ic("cloud")}<span><strong>Integração StudyFlow:</strong> os itens abaixo, prazos, dependências e competências prioritárias ficam disponíveis em <code>/api/study-plan</code> para montar sua agenda diária no StudyFlow.</span></div>
      <div class="lh-roadmap-list">
        ${road
					.map(
						(item) => `
          <article class="card lh-road-item ${item.status === "completed" ? "done" : item.ready ? "ready" : "blocked"}">
            <div class="cv-versions-head" style="margin-bottom:6px">
              <div>
                <h3 style="font-size:15px">${esc(item.title)}</h3>
                <p class="muted" style="font-size:12.5px">${esc(item.institution || TYPE_LABEL[item.type])} · ${esc(CRED_LABEL[item.credential_kind])}</p>
              </div>
              <div class="idea-badges">
                ${item.status === "completed" ? `<span class="meta-chip text-ok">Concluído</span>` : item.ready ? `<span class="meta-chip sector">Pronto para estudar</span>` : `<span class="meta-chip text-warn">Aguardando pré-requisito</span>`}
                <span class="meta-chip">${item.due_date ? `Prazo: ${formatDateShort(item.due_date)}` : "Sem prazo"}</span>
              </div>
            </div>
            ${
							(item.blocked_by || []).length
								? `<p class="text-warn" style="font-size:12.5px;margin-bottom:8px">${ic("alert")} Depende de: ${item.blocked_by.map((b) => esc(b.title)).join(", ")}</p>`
								: ""
						}
            <div class="lh-progress-wrap">
              <div class="lh-progress-meta">
                <span>${item.progress_pct || 0}% concluído</span>
                <span>${item.studied_hours || 0}h estudadas${item.remaining_hours !== null ? ` · faltam ~${item.remaining_hours}h` : ""}</span>
              </div>
              <div class="checklist-bar" style="margin:4px 0 8px"><span style="width:${item.progress_pct || 0}%"></span></div>
            </div>
            <div class="idea-footer" style="padding-top:8px">
              <div class="tag-row">${(item.skills || []).map((s) => `<span class="skill-tag">${esc(s)}</span>`).join("")}</div>
              <div class="idea-footer-actions">
                ${item.status !== "completed" ? `<button type="button" class="btn btn-secondary btn-sm" data-lh-add-hour="${esc(item.id)}">+1h</button>` : ""}
                <button type="button" class="btn btn-secondary btn-sm" data-lh-edit="${esc(item.id)}">${ic("edit")}Editar prazo / dependências</button>
              </div>
            </div>
          </article>`,
					)
					.join("")}
      </div>`;
	}

	function renderExportView(data) {
		const exp = data.exports || { resume_text: "", linkedin_text: "", counts: {} };
		return `
      <div class="notice">${ic("shield")}<span><strong>Currículo-base protegido:</strong> esta exportação é somente leitura e nunca altera automaticamente o seu currículo principal. Copie apenas o que desejar incluir.</span></div>
      <div class="kit-grid" style="margin-top:14px">
        <section class="card kit-item">
          <div class="kit-item-head">
            <h2 class="card-title">Bloco pronto para Currículo</h2>
            <button type="button" class="btn btn-secondary btn-sm" data-lh-copy="lhExportResume">${ic("copy")}Copiar</button>
          </div>
          <p class="card-sub">Separa automaticamente Certificações Oficiais, Formação Complementar e Badges (${exp.counts?.official_certifications || 0} cert., ${exp.counts?.courses || 0} cursos, ${exp.counts?.badges || 0} badges concluídos).</p>
          <textarea id="lhExportResume" rows="10" class="code-font" readonly aria-label="Texto de formação e certificações para currículo">${esc(exp.resume_text || "Conclua ou cadastre cursos/certificações com status 'Concluído' para gerar o resumo exportável.")}</textarea>
        </section>

        <section class="card kit-item">
          <div class="kit-item-head">
            <h2 class="card-title">Formato para LinkedIn (Licenças e Certificados)</h2>
            <button type="button" class="btn btn-secondary btn-sm" data-lh-copy="lhExportLinkedin">${ic("copy")}Copiar</button>
          </div>
          <p class="card-sub">Campos prontos para preencher em “Licenças e certificados” no LinkedIn com organização, validade e credencial.</p>
          <textarea id="lhExportLinkedin" rows="10" class="code-font" readonly aria-label="Dados de certificações formatados para LinkedIn">${esc(exp.linkedin_text || "Nenhuma credencial concluída registrada ainda.")}</textarea>
        </section>
      </div>`;
	}

	function render() {
		const content = document.getElementById("learningContent");
		if (!content || !serverData) return;

		// Atualiza chips de sub-navegação
		document.querySelectorAll("[data-lh-view]").forEach((btn) => {
			const isActive = btn.dataset.lhView === activeView;
			btn.classList.toggle("active", isActive);
			btn.setAttribute("aria-pressed", String(isActive));
		});

		if (activeView === "overview") content.innerHTML = renderOverview(serverData);
		else if (activeView === "items") content.innerHTML = renderItemsView();
		else if (activeView === "gaps") content.innerHTML = renderGapsView(serverData);
		else if (activeView === "roadmap") content.innerHTML = renderRoadmapView(serverData);
		else if (activeView === "export") content.innerHTML = renderExportView(serverData);

		bindRenderedEvents(content);
	}

	function bindRenderedEvents(rootEl) {
		rootEl.querySelectorAll("[data-lh-goto]").forEach((btn) => {
			btn.addEventListener("click", () => {
				activeView = btn.dataset.lhGoto;
				render();
			});
		});

		rootEl.querySelectorAll("[data-lh-new]").forEach((btn) => {
			btn.addEventListener("click", () => openItemModal(null));
		});

		rootEl.querySelectorAll("[data-lh-edit]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const item = (state.items || []).find((i) => i.id === btn.dataset.lhEdit);
				if (item) openItemModal(item);
			});
		});

		rootEl.querySelectorAll("[data-lh-add-hour]").forEach((btn) => {
			btn.addEventListener("click", () =>
				quickUpdateItem(btn.dataset.lhAddHour, { add_hours: 1 }, "+1h registrada no progresso."),
			);
		});

		rootEl.querySelectorAll("[data-lh-complete]").forEach((btn) => {
			btn.addEventListener("click", () =>
				quickUpdateItem(
					btn.dataset.lhComplete,
					{ status: "completed", progress_pct: 100 },
					"Marcado como concluído!",
				),
			);
		});

		rootEl.querySelectorAll("[data-lh-adopt]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const rec = (serverData?.recommendations || []).find(
					(r) => r.id === btn.dataset.lhAdopt,
				);
				if (rec) openItemModal(null, rec);
			});
		});

		rootEl.querySelectorAll("[data-lh-copy]").forEach((btn) => {
			btn.addEventListener("click", async () => {
				const el = document.getElementById(btn.dataset.lhCopy);
				if (!el) return;
				try {
					await navigator.clipboard.writeText(el.value || "");
					ctx?.notify?.("Texto copiado.", "success", { timeout: 2500 });
				} catch {
					ctx?.notify?.("Não foi possível copiar automaticamente.", "error");
				}
			});
		});

		document.getElementById("btnCopyStudyFlowUrl")?.addEventListener("click", async () => {
			const el = document.getElementById("lhStudyFlowEndpoint");
			if (!el) return;
			try {
				await navigator.clipboard.writeText(el.value);
				ctx?.notify?.("URL da API StudyFlow copiada.", "success", { timeout: 2500 });
			} catch {
				ctx?.notify?.("Não foi possível copiar.", "error");
			}
		});

		document
			.getElementById("btnCopyStudyFlowJson")
			?.addEventListener("click", copyStudyFlowPayload);

		document.getElementById("btnCopyFinanceUrl")?.addEventListener("click", async () => {
			const el = document.getElementById("lhFinanceEndpoint");
			if (!el) return;
			try {
				await navigator.clipboard.writeText(el.value);
				ctx?.notify?.("URL da API Finance App copiada.", "success", { timeout: 2500 });
			} catch {
				ctx?.notify?.("Não foi possível copiar.", "error");
			}
		});

		document
			.getElementById("btnCopyFinanceJson")
			?.addEventListener("click", copyBudgetPayload);

		document.getElementById("lhTargetTrack")?.addEventListener("change", (e) => {
			persistChange(
				{ ...state, target_track: e.target.value, updated_at: new Date().toISOString() },
				"Trilha alvo atualizada.",
			);
		});

		document.getElementById("lhWeeklyGoal")?.addEventListener("change", (e) => {
			const hours = Math.min(60, Math.max(1, Number(e.target.value) || 8));
			persistChange(
				{ ...state, weekly_hours_goal: hours, updated_at: new Date().toISOString() },
				"Meta semanal atualizada.",
			);
		});

		document.getElementById("btnGotoIdeasFromLearning")?.addEventListener("click", () => {
			ctx?.switchTab?.("tab-ideas");
		});

		// Filtros da aba "Meus estudos"
		const search = document.getElementById("lhSearch");
		if (search) {
			let t = null;
			search.addEventListener("input", () => {
				clearTimeout(t);
				t = setTimeout(() => {
					filters.q = search.value.trim();
					render();
				}, 150);
			});
		}
		document.getElementById("lhFilterType")?.addEventListener("change", (e) => {
			filters.type = e.target.value;
			render();
		});
		document.getElementById("lhFilterCred")?.addEventListener("change", (e) => {
			filters.credential = e.target.value;
			render();
		});
		document.getElementById("lhFilterStatus")?.addEventListener("change", (e) => {
			filters.status = e.target.value;
			render();
		});
	}

	function setupDomListeners() {
		document.querySelectorAll("[data-lh-view]").forEach((btn) => {
			btn.addEventListener("click", () => {
				activeView = btn.dataset.lhView;
				render();
			});
		});

		document
			.getElementById("btnAddLearningItem")
			?.addEventListener("click", () => openItemModal(null));
		document
			.getElementById("btnExportStudyFlowTop")
			?.addEventListener("click", copyStudyFlowPayload);

		const modal = document.getElementById("learningModal");
		modal?.addEventListener("click", (e) => {
			if (e.target === modal || e.target.closest("[data-close-learning]")) closeModal();
		});
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) closeModal();
		});
		document.getElementById("learningForm")?.addEventListener("submit", (e) => {
			e.preventDefault();
			saveItemFromModal();
		});
		document
			.getElementById("btnDeleteLearning")
			?.addEventListener("click", deleteEditingItem);
	}

	window.learningHub = {
		init(bridge) {
			ctx = bridge;
			const local = readLocal();
			if (local) state = mergeStates(local, state);
			updateNavBadge();
			setupDomListeners();
			syncAndAnalyze();
		},
		onResumeChange() {
			if (loaded) syncAndAnalyze();
		},
		onCloudSnapshot(remoteData) {
			if (!remoteData?.state) return;
			const merged = mergeStates(state, remoteData.state);
			writeLocal(merged);
			syncAndAnalyze();
		},
		getState() {
			return state;
		},
	};
})();
