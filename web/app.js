// App State
let currentResume = null;
let activeTab = 'tab-optimize';

// DOM Elements
const tabs = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const customApiKeyInput = document.getElementById('customApiKey');
const saveBaseCvBtn = document.getElementById('saveBaseCv');
const jobDescriptionInput = document.getElementById('jobDescription');
const languageModeSelect = document.getElementById('languageMode');
const btnOptimize = document.getElementById('btnOptimize');
const btnCopyHtml = document.getElementById('btnCopyHtml');
const btnExportPdf = document.getElementById('btnExportPdf');
const cvPreview = document.getElementById('cvPreview');
const previewLoader = document.getElementById('previewLoader');
const loaderMessage = document.getElementById('loaderMessage');
const jsonEditor = document.getElementById('jsonEditor');

// Form Fields
const formFields = {
  name: document.getElementById('f-name'),
  title: document.getElementById('f-title'),
  email: document.getElementById('f-email'),
  phoneDisplay: document.getElementById('f-phone-display'),
  phoneE164: document.getElementById('f-phone-e164'),
  location: document.getElementById('f-location'),
  linkedin: document.getElementById('f-linkedin'),
  github: document.getElementById('f-github'),
  website: document.getElementById('f-website'),
  summary: document.getElementById('f-summary')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Load saved custom API key from localStorage if any
  const savedKey = localStorage.getItem('gemini_api_key');
  if (savedKey) {
    customApiKeyInput.value = savedKey;
  }

  // Load Base CV
  loadBaseCv();

  // Tab switcher
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Save base CV action
  saveBaseCvBtn.addEventListener('click', saveBaseCv);

  // Sync portfolio action
  const btnSyncPortfolio = document.getElementById('btnSyncPortfolio');
  if (btnSyncPortfolio) {
    btnSyncPortfolio.addEventListener('click', syncPortfolioCv);
  }

  // Sync edits from Visual Form
  setupFormListeners();

  // Sync edits from JSON Editor
  jsonEditor.addEventListener('change', syncJsonEditorToState);

  // Optimize action
  btnOptimize.addEventListener('click', optimizeCv);

  // Copy HTML action
  btnCopyHtml.addEventListener('click', copyHtmlToClipboard);

  // Print / Save PDF action
  const btnPrint = document.getElementById('btnPrint');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      if (cvPreview && cvPreview.contentWindow) {
        cvPreview.contentWindow.focus();
        cvPreview.contentWindow.print();
      }
    });
  }

  // Export PDF action
  btnExportPdf.addEventListener('click', exportPdf);

  // Custom API Key save
  customApiKeyInput.addEventListener('change', () => {
    localStorage.setItem('gemini_api_key', customApiKeyInput.value);
  });

  // Setup Job Search Listeners
  setupJobSearchListeners();

  // Ideias de projetos
  const btnIdeas = document.getElementById('btnGenerateIdeas');
  if (btnIdeas) btnIdeas.addEventListener('click', generateProjectIdeas);

  // Cadastros: carrega já na abertura para mostrar o contador de desatualizados na aba
  loadTalentTracker();
});

let jobsLoadedOnce = false;

// Switch Tabs
function switchTab(tabId) {
  tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tabId));
  tabPanes.forEach(p => p.classList.toggle('active', p.id === tabId));
  activeTab = tabId;

  if (tabId === 'tab-json') {
    jsonEditor.value = JSON.stringify(currentResume, null, 2);
  } else if (tabId === 'tab-form') {
    populateForm();
  } else if (tabId === 'tab-jobs') {
    if (!jobsLoadedOnce) {
      fetchAndRenderJobs();
      jobsLoadedOnce = true;
    }
  }
}

// Na versão online (Vercel) o servidor não grava arquivos: o currículo base fica no navegador.
const LOCAL_RESUME_KEY = 'base_resume';

function readLocalResume() {
  try {
    const raw = localStorage.getItem(LOCAL_RESUME_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalResume(resume) {
  try {
    if (resume) localStorage.setItem(LOCAL_RESUME_KEY, JSON.stringify(resume));
    else localStorage.removeItem(LOCAL_RESUME_KEY);
    return true;
  } catch {
    return false;
  }
}

// Load CV from API (ou do navegador, se houver uma versão salva localmente)
async function loadBaseCv() {
  showLoader('Carregando currículo base...', true);
  try {
    const localResume = readLocalResume();
    if (localResume) {
      currentResume = localResume;
    } else {
      const res = await fetch('/api/resume');
      if (!res.ok) throw new Error('Não foi possível carregar o currículo.');
      currentResume = await res.json();
    }

    // Sync UI
    jsonEditor.value = JSON.stringify(currentResume, null, 2);
    populateForm();
    await renderPreview();
  } catch (err) {
    alert('Erro ao carregar currículo: ' + err.message);
  } finally {
    hideLoader();
  }
}

// Save current CV to server as base
async function saveBaseCv() {
  if (!currentResume) return;
  showLoader('Salvando currículo base...', true);
  try {
    const res = await fetch('/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentResume)
    });
    const data = await res.json();
    if (res.status === 501 && data.storage === 'browser') {
      if (!writeLocalResume(currentResume)) throw new Error('Não foi possível salvar no navegador.');
      alert('Currículo base salvo neste navegador (a versão online não grava no servidor).');
      return;
    }
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar.');
    writeLocalResume(null); // o servidor passa a ser a fonte da verdade
    alert('Currículo base salvo com sucesso!');
  } catch (err) {
    alert('Erro ao salvar currículo base: ' + err.message);
  } finally {
    hideLoader();
  }
}

// Sync directly from candidate's online portfolio (GitHub Aanastc/ana_leticia.ac__portifolio)
async function syncPortfolioCv() {
  showLoader('Sincronizando dados em tempo real com seu Portfólio no GitHub...', true);
  try {
    const res = await fetch('/api/sync-portfolio', {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Erro na resposta do servidor.');
    }
    // Dados novos do portfólio substituem qualquer versão antiga guardada no navegador
    writeLocalResume(null);

    currentResume = data.resume;
    jsonEditor.value = JSON.stringify(currentResume, null, 2);
    populateForm();
    await renderPreview();
    alert(`✨ Portfólio sincronizado com sucesso!\n• ${data.experiences_count} experiências carregadas (Lingopass, UNIFOR, etc.)\n• ${data.projects_count} projetos integrados (incluindo Connect Care & Design System)\n• Fonte oficial: Aanastc/ana_leticia.ac__portifolio`);
  } catch (err) {
    alert('Erro ao sincronizar com portfólio: ' + err.message);
  } finally {
    hideLoader();
  }
}

// Render Preview inside Iframe
async function renderPreview() {
  if (!currentResume) return;
  try {
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentResume)
    });
    
    if (!res.ok) throw new Error('Erro ao compilar currículo.');
    const html = await res.text();
    
    const doc = cvPreview.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
  } catch (err) {
    console.error('Erro de renderização:', err);
  }
}

// Copy HTML source
async function copyHtmlToClipboard() {
  if (!currentResume) return;
  try {
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentResume)
    });
    if (!res.ok) throw new Error('Erro ao obter HTML.');
    const html = await res.text();
    
    await navigator.clipboard.writeText(html);
    alert('HTML copiado para a área de transferência!');
  } catch (err) {
    alert('Erro ao copiar HTML: ' + err.message);
  }
}

// Export and Download PDF
async function exportPdf() {
  if (!currentResume) return;
  showLoader('Gerando arquivo PDF A4 (isso pode levar alguns segundos)...');
  try {
    const res = await fetch('/api/export-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentResume)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro de exportação.');
    
    // Trigger download
    window.location.href = '/api/download-pdf';
  } catch (err) {
    alert('Erro ao exportar PDF: ' + err.message);
  } finally {
    hideLoader();
  }
}

// Tailor resume using Gemini AI
async function optimizeCv() {
  if (!currentResume) return;
  const desc = jobDescriptionInput.value;
  if (!desc || !desc.trim()) {
    alert('Por favor, insira a descrição da vaga antes de continuar.');
    return;
  }

  showLoader('IA analisando descrição da vaga e reescrevendo o currículo...');
  try {
    const res = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resume: currentResume,
        jobDescription: desc,
        customApiKey: customApiKeyInput.value || null
      })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro desconhecido na otimização.');

    currentResume = data;
    
    // Sync all views
    jsonEditor.value = JSON.stringify(currentResume, null, 2);
    populateForm();
    await renderPreview();
    
    // Switch to visual form or keep here
    alert('Currículo otimizado com sucesso! Veja as alterações no painel e na visualização.');
  } catch (err) {
    alert('Erro ao otimizar currículo: ' + err.message);
  } finally {
    hideLoader();
  }
}

// Populate the visual form from currentResume state
function populateForm() {
  if (!currentResume) return;
  
  formFields.name.value = currentResume.name || '';
  formFields.title.value = currentResume.title || '';
  formFields.email.value = currentResume.email || '';
  formFields.phoneDisplay.value = currentResume.phone_display || '';
  formFields.phoneE164.value = currentResume.phone_e164 || '';
  formFields.location.value = currentResume.location || '';
  formFields.linkedin.value = currentResume.linkedin_url || '';
  formFields.github.value = currentResume.github_url || '';
  formFields.website.value = currentResume.website_url || '';
  formFields.summary.value = currentResume.summary || '';

  renderSkillsList();
  renderExperienceList();
  renderProjectsList();
  renderEducationList();
  renderLanguagesList();
}

// Set up listeners for form text inputs
function setupFormListeners() {
  const inputs = [
    { el: formFields.name, key: 'name' },
    { el: formFields.title, key: 'title' },
    { el: formFields.email, key: 'email' },
    { el: formFields.phoneDisplay, key: 'phone_display' },
    { el: formFields.phoneE164, key: 'phone_e164' },
    { el: formFields.location, key: 'location' },
    { el: formFields.linkedin, key: 'linkedin_url' },
    { el: formFields.github, key: 'github_url' },
    { el: formFields.website, key: 'website_url' },
    { el: formFields.summary, key: 'summary' }
  ];

  inputs.forEach(item => {
    item.el.addEventListener('input', () => {
      if (!currentResume) return;
      currentResume[item.key] = item.el.value;
      renderPreview();
    });
  });

  // Buttons for adding items
  document.getElementById('add-skill-group').onclick = addSkillGroup;
  document.getElementById('add-experience').onclick = addExperience;
  document.getElementById('add-project').onclick = addProject;
  document.getElementById('add-education').onclick = addEducation;
  document.getElementById('add-language').onclick = addLanguage;
}

// Sync JSON raw edits back to state
function syncJsonEditorToState() {
  try {
    const val = jsonEditor.value;
    const parsed = JSON.parse(val);
    currentResume = parsed;
    renderPreview();
  } catch (err) {
    alert('Erro de sintaxe no JSON. Verifique o formato antes de prosseguir.');
  }
}

// Helper: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// --- Dynamic Form Lists Builders ---

// 1. Skills
function renderSkillsList() {
  const container = document.getElementById('skills-list');
  container.innerHTML = '';
  
  const skills = currentResume.skills || [];
  skills.forEach((s, idx) => {
    const item = document.createElement('div');
    item.className = 'visual-item';
    item.innerHTML = `
      <div class="visual-item-header">
        <span class="visual-item-title">Grupo de Habilidades ${idx + 1}</span>
        <button class="btn-remove-item" data-idx="${idx}">&times;</button>
      </div>
      <div class="form-group">
        <label>Nome do Grupo (ex: Frontend, DevOps)</label>
        <input type="text" class="s-group" data-idx="${idx}" value="${escapeHtml(s.group)}">
      </div>
      <div class="form-group">
        <label>Habilidades (separadas por vírgula)</label>
        <input type="text" class="s-items" data-idx="${idx}" value="${escapeHtml((s.items || []).join(', '))}">
      </div>
    `;
    
    // Remove group
    item.querySelector('.btn-remove-item').onclick = () => {
      currentResume.skills.splice(idx, 1);
      populateForm();
      renderPreview();
    };

    // Update group name
    item.querySelector('.s-group').oninput = (e) => {
      currentResume.skills[idx].group = e.target.value;
      renderPreview();
    };

    // Update items
    item.querySelector('.s-items').oninput = (e) => {
      currentResume.skills[idx].items = e.target.value.split(',').map(x => x.trim()).filter(Boolean);
      renderPreview();
    };

    container.appendChild(item);
  });
}

function addSkillGroup() {
  if (!currentResume) return;
  if (!currentResume.skills) currentResume.skills = [];
  currentResume.skills.push({ group: 'Nova Seção', items: ['Habilidade 1'] });
  populateForm();
  renderPreview();
}

// 2. Experience
function renderExperienceList() {
  const container = document.getElementById('experience-list');
  container.innerHTML = '';
  
  const exps = currentResume.experience || [];
  exps.forEach((e, idx) => {
    const item = document.createElement('div');
    item.className = 'visual-item';
    
    const bulletsHtml = (e.bullets || []).map((b, bIdx) => `
      <div class="bullet-input-row" data-bidx="${bIdx}">
        <input type="text" class="e-bullet-text" value="${escapeHtml(b)}">
        <button type="button" class="btn-remove-item remove-bullet">&times;</button>
      </div>
    `).join('');

    item.innerHTML = `
      <div class="visual-item-header">
        <span class="visual-item-title">Experiência ${idx + 1}</span>
        <button class="btn-remove-item remove-exp">&times;</button>
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
          <button type="button" class="btn btn-secondary add-bullet-btn">+ Adicionar Linha</button>
        </div>
      </div>
    `;

    // Remove Experience
    item.querySelector('.remove-exp').onclick = () => {
      currentResume.experience.splice(idx, 1);
      populateForm();
      renderPreview();
    };

    // Text listeners
    item.querySelector('.e-role').oninput = (evt) => {
      currentResume.experience[idx].role = evt.target.value;
      renderPreview();
    };
    item.querySelector('.e-company').oninput = (evt) => {
      currentResume.experience[idx].company = evt.target.value;
      renderPreview();
    };
    item.querySelector('.e-date').oninput = (evt) => {
      currentResume.experience[idx].date = evt.target.value;
      renderPreview();
    };

    // Bullets listeners
    const bulletRows = item.querySelectorAll('.bullet-input-row');
    bulletRows.forEach((row, bIdx) => {
      row.querySelector('.e-bullet-text').oninput = (evt) => {
        currentResume.experience[idx].bullets[bIdx] = evt.target.value;
        renderPreview();
      };
      row.querySelector('.remove-bullet').onclick = () => {
        currentResume.experience[idx].bullets.splice(bIdx, 1);
        populateForm();
        renderPreview();
      };
    });

    item.querySelector('.add-bullet-btn').onclick = () => {
      if (!currentResume.experience[idx].bullets) currentResume.experience[idx].bullets = [];
      currentResume.experience[idx].bullets.push('Nova realização...');
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
    role: 'Novo Cargo',
    company: 'Nova Empresa',
    date: 'Período',
    bullets: ['Destaque da experiência']
  });
  populateForm();
  renderPreview();
}

// 3. Projects
function renderProjectsList() {
  const container = document.getElementById('projects-list');
  container.innerHTML = '';
  
  const projects = currentResume.projects || [];
  projects.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'visual-item';

    const bulletsHtml = (p.bullets || []).map((b, bIdx) => `
      <div class="bullet-input-row" data-bidx="${bIdx}">
        <input type="text" class="p-bullet-text" value="${escapeHtml(b)}">
        <button type="button" class="btn-remove-item remove-p-bullet">&times;</button>
      </div>
    `).join('');

    const linksHtml = (p.links || []).map((l, lIdx) => `
      <div class="grid-2 bullet-input-row" style="margin-bottom: 6px;">
        <input type="text" class="p-link-label" placeholder="Rótulo (ex: GitHub)" value="${escapeHtml(l.label)}">
        <div class="flex-center">
          <input type="text" class="p-link-url" placeholder="URL" value="${escapeHtml(l.url)}">
          <button type="button" class="btn-remove-item remove-p-link">&times;</button>
        </div>
      </div>
    `).join('');

    item.innerHTML = `
      <div class="visual-item-header">
        <span class="visual-item-title">Projeto ${idx + 1}</span>
        <button class="btn-remove-item remove-proj">&times;</button>
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
          <button type="button" class="btn btn-secondary add-p-bullet-btn">+ Adicionar Bullet</button>
        </div>
      </div>
      <div class="form-group">
        <label>Links do Projeto</label>
        <div class="bullet-list-builder">
          ${linksHtml}
          <button type="button" class="btn btn-secondary add-p-link-btn">+ Adicionar Link</button>
        </div>
      </div>
    `;

    // Remove Project
    item.querySelector('.remove-proj').onclick = () => {
      currentResume.projects.splice(idx, 1);
      populateForm();
      renderPreview();
    };

    // Text fields
    item.querySelector('.p-title').oninput = (evt) => {
      currentResume.projects[idx].title = evt.target.value;
      renderPreview();
    };
    item.querySelector('.p-stack').oninput = (evt) => {
      currentResume.projects[idx].stack = evt.target.value;
      renderPreview();
    };

    // Bullets listeners
    const bulletRows = item.querySelectorAll('.remove-p-bullet');
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

    item.querySelector('.add-p-bullet-btn').onclick = () => {
      if (!currentResume.projects[idx].bullets) currentResume.projects[idx].bullets = [];
      currentResume.projects[idx].bullets.push('Descreva uma feature ou realização no projeto...');
      populateForm();
      renderPreview();
    };

    // Links listeners
    const linkRows = item.querySelectorAll('.remove-p-link');
    linkRows.forEach((btn, lIdx) => {
      const row = btn.closest('.grid-2');
      const labelInput = row.querySelector('.p-link-label');
      const urlInput = row.querySelector('.p-link-url');

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

    item.querySelector('.add-p-link-btn').onclick = () => {
      if (!currentResume.projects[idx].links) currentResume.projects[idx].links = [];
      currentResume.projects[idx].links.push({ label: 'Repositório', url: 'https://github.com/...' });
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
    title: 'Novo Projeto',
    stack: 'React, Node.js',
    bullets: ['Implementei as principais funcionalidades...'],
    links: []
  });
  populateForm();
  renderPreview();
}

// 4. Education
function renderEducationList() {
  const container = document.getElementById('education-list');
  container.innerHTML = '';
  
  const eds = currentResume.education || [];
  eds.forEach((e, idx) => {
    const item = document.createElement('div');
    item.className = 'visual-item';
    item.innerHTML = `
      <div class="visual-item-header">
        <span class="visual-item-title">Educação ${idx + 1}</span>
        <button class="btn-remove-item remove-edu">&times;</button>
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

    item.querySelector('.remove-edu').onclick = () => {
      currentResume.education.splice(idx, 1);
      populateForm();
      renderPreview();
    };

    item.querySelector('.e-title').oninput = (evt) => {
      currentResume.education[idx].title = evt.target.value;
      renderPreview();
    };
    item.querySelector('.e-sub').oninput = (evt) => {
      currentResume.education[idx].subtitle = evt.target.value;
      renderPreview();
    };
    item.querySelector('.e-date').oninput = (evt) => {
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
    title: 'Nova Formação',
    subtitle: 'Universidade',
    date: 'Período'
  });
  populateForm();
  renderPreview();
}

// 5. Languages
function renderLanguagesList() {
  const container = document.getElementById('languages-list');
  container.innerHTML = '';
  
  const langs = currentResume.languages || [];
  langs.forEach((l, idx) => {
    const item = document.createElement('div');
    item.className = 'visual-item';
    item.innerHTML = `
      <div class="visual-item-header">
        <span class="visual-item-title">Idioma ${idx + 1}</span>
        <button class="btn-remove-item remove-lang">&times;</button>
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

    item.querySelector('.remove-lang').onclick = () => {
      currentResume.languages.splice(idx, 1);
      populateForm();
      renderPreview();
    };

    item.querySelector('.l-name').oninput = (evt) => {
      currentResume.languages[idx].name = evt.target.value;
      renderPreview();
    };
    item.querySelector('.l-level').oninput = (evt) => {
      currentResume.languages[idx].level = evt.target.value;
      renderPreview();
    };
    item.querySelector('.l-note').oninput = (evt) => {
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
    name: 'Novo Idioma',
    level: 'Fluência',
    note: 'Nota adicional'
  });
  populateForm();
  renderPreview();
}

// --- UI Loaders ---
function showLoader(message, isSoft = false) {
  loaderMessage.innerText = message;
  previewLoader.classList.remove('hidden');
}

function hideLoader() {
  previewLoader.classList.add('hidden');
}

// --- Job Search & Matching System ---
let currentJobsList = [];

function setupJobSearchListeners() {
  const btnSearch = document.getElementById('btnSearchJobs');
  const inputSearch = document.getElementById('jobSearchQuery');
  const filterPills = document.querySelectorAll('.filter-pill');

  if (btnSearch && inputSearch) {
    btnSearch.addEventListener('click', () => {
      fetchAndRenderJobs(inputSearch.value.trim());
    });

    inputSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        fetchAndRenderJobs(inputSearch.value.trim());
      }
    });
  }

  const btnRefresh = document.getElementById('btnRefreshJobs');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      const q = inputSearch ? inputSearch.value.trim() : 'hospitalar';
      fetchAndRenderJobs(q, true);
    });
  }

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const q = pill.getAttribute('data-query');
      if (inputSearch) inputSearch.value = q;
      fetchAndRenderJobs(q);
    });
  });
}

function getCandidateSkillsList() {
  const skills = [];
  if (currentResume && currentResume.skills) {
    currentResume.skills.forEach(group => {
      if (Array.isArray(group.items)) {
        group.items.forEach(item => {
          // Extract core tech keywords from string like "Next.js & React.js"
          const tokens = item.split(/[\&,/\(\)]+/).map(s => s.trim()).filter(Boolean);
          skills.push(...tokens);
        });
      }
    });
  }
  // Default fallback tech skills if empty
  if (skills.length === 0) {
    skills.push('React', 'TypeScript', 'Node.js', 'Python', 'AWS', 'Docker', 'DevOps', 'PostgreSQL', 'CI/CD');
  }
  return [...new Set(skills)];
}

function evaluateJobMatch(job, candidateSkills) {
  const textToSearch = `${job.title} ${(job.tags || []).join(' ')} ${job.description || ''} ${job.location || ''} ${job.category || ''}`.toLowerCase();
  const matched = [];

  candidateSkills.forEach(skill => {
    const cleanSkill = skill.toLowerCase();
    if (cleanSkill.length < 2) return;
    const regex = new RegExp(`\\b${cleanSkill.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (regex.test(textToSearch) || textToSearch.includes(cleanSkill)) {
      matched.push(skill);
    }
  });

  const uniqueMatches = [...new Set(matched)];
  let score = 55 + Math.min(35, uniqueMatches.length * 5);
  
  // Sector bonuses (Healthcare & EdTechs are primary target sectors).
  // O setor vem classificado da coleta; o texto só é usado em vagas antigas sem esse campo.
  const isHealthcare = job.sector ? job.sector === 'saude' : /\b(hospital\w*|sa[uú]de|healthcare|cl[ií]nic\w*|patients?)\b/i.test(textToSearch);
  const isEdTech = job.sector ? job.sector === 'edtech' : /\b(edtech|educa\w*|moodle|ensino|ead|universidade|escola|alunos?)\b/i.test(textToSearch);
  const isTechGeneral = /full stack|fullstack|devops|cloud|react|node|python/i.test(textToSearch);

  if (isHealthcare) score += 10;
  if (isEdTech) score += 10;
  if (isTechGeneral) score += 5;

  // International remote check (English B2-C1 compatible & remote from Brazil)
  const isInternational = /internacional|aceita brasil|usd|worldwide|global/i.test(`${job.location || ''} ${job.salary || ''}`);
  if (isInternational && job.location_type === 'remote') {
    score += 8; // High match for Remote English B2-C1 opportunities
  }

  // Location logic (Candidate is based in BH: must be BH if on-site, or Remote)
  if (job.location_type === 'bh') {
    score += 12; // High match for Belo Horizonte local opportunity!
  } else if (job.location_type === 'remote') {
    score += 8; // High match for Remote work
  } else if (job.location_type === 'onsite_outside_bh') {
    score = Math.max(35, score - 28); // Strongly penalize on-site jobs in other cities
  }

  // Ensure score is within realistic 35-99% range
  score = Math.max(35, Math.min(99, score));

  return {
    score,
    matchedSkills: uniqueMatches,
    isHealthcare,
    isEdTech,
    isInternational
  };
}

async function fetchAndRenderJobs(searchQuery = 'Hospitalar', forceRefresh = false) {
  const container = document.getElementById('jobsList');
  const countEl = document.getElementById('jobsCount');
  const syncBanner = document.getElementById('jobsLastUpdated');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 40px; color: var(--text-muted);">
      <div class="spinner" style="margin: 0 auto 16px;"></div>
      <p>Buscando vagas reais e verificadas para <strong>${escapeHtml(searchQuery || 'Sua Área')}</strong>...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/jobs?search=${encodeURIComponent(searchQuery || 'hospitalar')}&refresh=${forceRefresh}`);
    const data = await res.json();

    if (syncBanner && data.last_updated) {
      const discardedTotal = Object.values(data.discarded || {}).reduce((a, b) => a + b, 0);
      const discardedInfo = discardedTotal
        ? ` • 🧹 <span title="${escapeHtml(Object.entries(data.discarded).map(([k, v]) => `${v}: ${k}`).join('\n'))}">${discardedTotal} vagas antigas, duplicadas ou de banco de talentos descartadas</span>`
        : '';
      syncBanner.innerHTML = `🕒 Atualizado diariamente às <strong>08:00 (BRT)</strong> • Última coleta: <strong>${escapeHtml(data.last_updated)}</strong>${discardedInfo}`;
    }

    if (!data.success || !data.jobs || data.jobs.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <p>Nenhuma oportunidade encontrada para essa busca no momento.</p>
          <button class="btn btn-secondary btn-sm" style="margin-top: 10px;" onclick="fetchAndRenderJobs('Hospitalar')">Ver Vagas em Saúde / Hospitalar</button>
        </div>
      `;
      if (countEl) countEl.innerText = '0 vagas encontradas';
      return;
    }

    currentJobsList = data.jobs;
    const candidateSkills = getCandidateSkillsList();

    // Attach match evaluation to each job
    const evaluatedJobs = currentJobsList.map(job => {
      const match = evaluateJobMatch(job, candidateSkills);
      return { ...job, ...match };
    });

    // Maior match primeiro; em empate, a vaga mais recente
    evaluatedJobs.sort((a, b) => b.score - a.score || (a.days_ago ?? 99) - (b.days_ago ?? 99));

    if (countEl) {
      const fromCompanies = evaluatedJobs.filter(j => j.source_type === 'empresa').length;
      const maxAge = data.max_age_days ? ` • publicadas nos últimos ${data.max_age_days} dias` : '';
      countEl.innerHTML = `<strong>${evaluatedJobs.length} vagas ativas</strong> para "<em>${escapeHtml(searchQuery)}</em>" • ${fromCompanies} direto do site da empresa${maxAge} (total no banco: ${data.total_in_cache || evaluatedJobs.length})`;
    }

    container.innerHTML = '';
    evaluatedJobs.forEach(job => {
      const isHigh = job.score >= 80;
      const matchClass = isHigh ? 'match-high' : 'match-medium';
      const matchIcon = isHigh ? '⚡' : '✓';

      const card = document.createElement('div');
      card.className = 'job-card';

      // Build matched and remaining tags
      const tagsHtml = (job.tags || []).slice(0, 6).map(tag => {
        const isMatched = job.matchedSkills.some(s => s.toLowerCase() === tag.toLowerCase());
        return `<span class="job-tag ${isMatched ? 'tag-matched' : ''}">${escapeHtml(tag)}</span>`;
      }).join('');

      // Build location badge
      let locBadge = `<span class="badge-tag badge-remote">🌐 100% Remoto</span>`;
      if (job.location_type === 'bh') {
        locBadge = `<span class="badge-tag badge-bh">📍 Belo Horizonte (Match Presencial/Híbrido)</span>`;
      } else if (job.location_type === 'onsite_outside_bh') {
        locBadge = `<span class="badge-tag badge-warning">⚠️ Presencial fora de BH</span>`;
      }

      // Modality badges
      const modalities = job.modalities || ['PJ ou CLT'];
      const modBadges = modalities.map(m => `<span class="badge-tag badge-modality">💼 ${escapeHtml(m)}</span>`).join(' ');

      // Sector badge
      let sectorBadge = `<span class="badge-tag badge-sector">🏢 Tech</span>`;
      if (job.isHealthcare) {
        sectorBadge = `<span class="badge-tag badge-sector">🏥 Saúde / Hospitalar</span>`;
      } else if (job.isEdTech) {
        sectorBadge = `<span class="badge-tag badge-sector">🎓 EdTech / Educação</span>`;
      }

      // International remote badge
      let intlBadge = '';
      if (job.isInternational) {
        intlBadge = `<span class="badge-tag badge-intl">🗣️ Inglês B2-C1 (OK) • 🇧🇷 Sem Visto</span>`;
      }

      card.innerHTML = `
        <div class="job-header-row">
          <div class="job-title-company">
            <h4>${escapeHtml(job.title)}</h4>
            <div class="job-company">
              <strong>${escapeHtml(job.company)}</strong> •
              <span class="job-location-tag">${escapeHtml(job.location)}</span>
            </div>
            <div class="job-trust-row">${jobTrustHtml(job)}</div>
            <div class="job-meta-badges">
              ${locBadge}
              ${modBadges}
              ${sectorBadge}
              ${intlBadge}
            </div>
          </div>
          <div class="job-match-badge ${matchClass}" title="Compatibilidade calculada com seu perfil e preferências">
            ${matchIcon} ${job.score}% Match
          </div>
        </div>

        <p class="job-description-excerpt">${escapeHtml(job.description || '')}</p>

        <div class="job-tags-row">
          ${tagsHtml}
        </div>

        <div class="job-footer-actions">
          <div class="job-salary-text">
            ${job.salary && job.salary !== 'Não especificado' ? `💰 ${escapeHtml(job.salary)}` : 'Negociável (PJ/CLT)'}
          </div>
          <div class="job-buttons-group">
            <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm flex-center">
              <span>Ver Vaga</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
            <button type="button" class="btn btn-primary btn-sm flex-center btn-adapt-cv">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              <span>Adaptar Meu CV</span>
            </button>
          </div>
        </div>
      `;

      // Handle "Adaptar Meu CV" button
      const adaptBtn = card.querySelector('.btn-adapt-cv');
      adaptBtn.addEventListener('click', () => {
        transferJobToOptimizer(job);
      });

      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--danger);">
        <p>Erro ao carregar vagas remotas: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary btn-sm" style="margin-top: 10px;" onclick="fetchAndRenderJobs('full stack')">Tentar Novamente</button>
      </div>
    `;
  }
}

// ===========================================================================
// Ideias de projetos (lacunas entre vagas e currículo)
// ===========================================================================
async function generateProjectIdeas() {
  const container = document.getElementById('ideasResult');
  const btn = document.getElementById('btnGenerateIdeas');
  const useAi = document.getElementById('ideasUseAi')?.checked;
  if (!container || !currentResume) return;

  btn.disabled = true;
  container.innerHTML = `<div class="muted-center"><div class="spinner" style="margin: 0 auto 12px;"></div>Analisando as vagas ativas${useAi ? ' e gerando ideias com IA' : ''}...</div>`;

  try {
    const res = await fetch('/api/project-ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume: currentResume, customApiKey: customApiKeyInput.value || null, useAi })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao gerar ideias.');
    renderProjectIdeas(container, data);
  } catch (err) {
    container.innerHTML = `<p class="muted-center" style="color: var(--danger);">${escapeHtml(err.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
}

function renderProjectIdeas(container, data) {
  const a = data.analysis;
  const maxJobs = Math.max(1, ...a.top_demand.map(s => s.jobs));
  const statusOf = (s) => s.proven_by_project
    ? ['proven', '✅ comprovado por projeto']
    : s.in_resume ? ['unproven', '🟡 no currículo, sem projeto'] : ['missing', '❌ falta no currículo'];

  const bars = a.top_demand.slice(0, 15).map(s => {
    const [cls, label] = statusOf(s);
    return `
      <div class="demand-row" title="${escapeHtml(s.sample_jobs.join('\n'))}">
        <span class="demand-tech">${escapeHtml(s.tech)}</span>
        <span class="demand-bar"><span class="demand-fill ${cls}" style="width:${Math.round((s.jobs / maxJobs) * 100)}%"></span></span>
        <span class="demand-count">${s.jobs} vagas</span>
        <span class="demand-status ${cls}">${label}</span>
      </div>`;
  }).join('');

  const ideas = (data.ideas || []).map((idea, idx) => `
    <div class="idea-card">
      <div class="idea-header">
        <h4>${escapeHtml(idea.title)}</h4>
        <span class="badge-tag badge-sector">${escapeHtml(idea.sector || '')}</span>
      </div>
      <p class="idea-problem"><strong>Problema real:</strong> ${escapeHtml(idea.problem || '')}</p>
      <div class="idea-covers">Comprova: ${(idea.covers || []).map(c => `<span class="job-tag tag-matched">${escapeHtml(c)}</span>`).join(' ')}</div>
      <div class="idea-stack">Stack: ${escapeHtml((idea.stack || []).join(', '))}</div>
      <ul class="idea-features">${(idea.features || []).map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
      <div class="idea-footer">
        <span>⏱️ ~${escapeHtml(String(idea.weeks || '?'))} semanas • ${escapeHtml(idea.difficulty || '')}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-copy-idea="${idx}" title="Copia um bullet pronto para o currículo (use quando o projeto estiver publicado)">📋 Copiar bullet para o CV</button>
      </div>
    </div>`).join('');

  const source = data.generated_by === 'ia'
    ? '🤖 Ideias geradas pela IA com base nas suas lacunas'
    : '📚 Ideias do catálogo curado, ranqueadas pelas suas lacunas' + (data.warning ? ` — ${escapeHtml(data.warning)}` : '');

  container.innerHTML = `
    <div class="ideas-summary">
      <strong>${a.jobs_analyzed} vagas analisadas</strong> (coleta de ${escapeHtml(data.jobs_updated_at || '—')}) •
      ${a.missing.length} tecnologias faltando • ${a.unproven.length} sem projeto que comprove
    </div>
    <h4 class="ideas-subtitle">Tecnologias mais pedidas x seu currículo</h4>
    <div class="demand-chart">${bars || '<p class="muted-center">Poucas vagas para analisar.</p>'}</div>
    <h4 class="ideas-subtitle">Projetos sugeridos <small>${source}</small></h4>
    <div class="ideas-grid">${ideas || '<p class="muted-center">Nenhuma lacuna relevante encontrada — seu currículo já cobre o que as vagas pedem.</p>'}</div>`;

  container.querySelectorAll('[data-copy-idea]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idea = data.ideas[Number(btn.dataset.copyIdea)];
      try {
        await navigator.clipboard.writeText(idea.resume_bullet || idea.title);
        btn.textContent = '✅ Copiado';
        setTimeout(() => (btn.textContent = '📋 Copiar bullet para o CV'), 1800);
      } catch {
        prompt('Copie o texto:', idea.resume_bullet || idea.title);
      }
    });
  });
}

// ===========================================================================
// Cadastros em sites de talentos
// ===========================================================================
const TALENT_LOCAL_KEY = 'talent_status';
let talentState = { platforms: [], categories: {}, status: {}, portfolio: null, persist: false };

function readLocalTalent() {
  try { return JSON.parse(localStorage.getItem(TALENT_LOCAL_KEY) || '{}'); } catch { return {}; }
}

// Junta o estado do servidor com o do navegador, ficando com a marcação mais recente de cada site.
function mergeTalentStatus(server = {}, local = {}) {
  const stamp = (s) => new Date(s?.changed_at || s?.updated_at || s?.registered_at || 0).getTime();
  const out = { ...server };
  Object.entries(local).forEach(([id, s]) => {
    if (!out[id] || stamp(s) > stamp(out[id])) out[id] = s;
  });
  return out;
}

function isTalentOutdated(entry) {
  const changed = talentState.portfolio?.last_change_at;
  if (!entry?.registered || !changed) return false;
  return new Date(entry.updated_at || entry.registered_at || 0) < new Date(changed);
}

async function loadTalentTracker() {
  try {
    const res = await fetch('/api/talent');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar sites.');
    talentState = { ...data, status: mergeTalentStatus(data.status, readLocalTalent()) };
    renderTalentTracker();
  } catch (err) {
    const list = document.getElementById('talentList');
    if (list) list.innerHTML = `<p class="muted-center" style="color: var(--danger);">${escapeHtml(err.message)}</p>`;
  }
}

async function saveTalentStatus() {
  try { localStorage.setItem(TALENT_LOCAL_KEY, JSON.stringify(talentState.status)); } catch { /* sem storage */ }
  if (!talentState.persist) return; // versão online: fica no navegador
  try {
    await fetch('/api/talent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: talentState.status })
    });
  } catch (err) {
    console.warn('Não foi possível salvar no servidor:', err.message);
  }
}

function updateTalentEntry(id, changes) {
  const now = new Date().toISOString();
  const prev = talentState.status[id] || {};
  const next = { ...prev, ...changes, changed_at: now };
  if (changes.registered === true && !prev.registered) { next.registered_at = now; next.updated_at = now; }
  if (changes.registered === false) { next.registered_at = null; next.updated_at = null; }
  if (changes.touch) { delete next.touch; next.updated_at = now; }
  talentState.status[id] = next;
  saveTalentStatus();
  renderTalentTracker();
}

function formatDateBR(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

function renderTalentTracker() {
  const list = document.getElementById('talentList');
  const summary = document.getElementById('talentSummary');
  const counter = document.getElementById('talentOutdatedCount');
  if (!list) return;

  const { platforms, categories, status, portfolio } = talentState;
  const registered = platforms.filter(p => status[p.id]?.registered);
  const outdated = registered.filter(p => isTalentOutdated(status[p.id]));

  if (counter) {
    counter.textContent = outdated.length;
    counter.classList.toggle('hidden', outdated.length === 0);
  }

  if (summary) {
    const portfolioInfo = portfolio?.last_change_at
      ? `Última alteração do portfólio: <a href="${escapeHtml(portfolio.url)}" target="_blank" rel="noopener noreferrer"><strong>${formatDateBR(portfolio.last_change_at)}</strong></a> <span class="muted">(“${escapeHtml(portfolio.message)}”)</span>`
      : `Não foi possível consultar o portfólio agora${talentState.portfolio_error ? ` (${escapeHtml(talentState.portfolio_error)})` : ''}.`;
    const storage = talentState.persist
      ? 'Salvo em <code>data/talent-status.json</code> (versionado no git).'
      : 'Salvo neste navegador.';
    summary.innerHTML = `
      <div><strong>${registered.length}/${platforms.length}</strong> cadastros feitos •
        ${outdated.length ? `<span class="legend-outdated">${outdated.length} desatualizado(s)</span>` : '<span class="legend-ok">todos em dia</span>'}</div>
      <div>${portfolioInfo}</div>
      <div class="muted">${storage}</div>`;
  }

  const byCat = {};
  platforms.forEach(p => (byCat[p.category] = byCat[p.category] || []).push(p));

  list.innerHTML = Object.entries(byCat).map(([cat, items]) => `
    <h4 class="talent-category">${escapeHtml(categories[cat] || cat)}</h4>
    ${items.map(p => {
      const s = status[p.id] || {};
      const isOut = isTalentOutdated(s);
      const stateCls = !s.registered ? '' : isOut ? 'is-outdated' : 'is-ok';
      const stateText = !s.registered ? 'Não cadastrado'
        : isOut ? `⚠️ Desatualizado — perfil atualizado em ${formatDateBR(s.updated_at || s.registered_at)}, portfólio mudou depois`
        : `✅ Em dia — atualizado em ${formatDateBR(s.updated_at || s.registered_at)}`;
      return `
        <div class="talent-item ${stateCls}">
          <label class="talent-check">
            <input type="checkbox" data-talent-check="${escapeHtml(p.id)}" ${s.registered ? 'checked' : ''}>
          </label>
          <div class="talent-body">
            <div class="talent-title">
              <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.name)}</a>
              <span class="talent-state">${stateText}</span>
            </div>
            <div class="talent-why">${escapeHtml(p.why)}</div>
            <div class="talent-tip">💡 ${escapeHtml(p.tip)}</div>
          </div>
          <div class="talent-actions">
            ${s.registered
              ? `<button type="button" class="btn btn-sm ${isOut ? 'btn-primary' : 'btn-secondary'}" data-talent-touch="${escapeHtml(p.id)}" title="Marque depois de atualizar este perfil com as novidades do portfólio">🔄 Atualizei</button>`
              : `<a class="btn btn-primary btn-sm" href="${escapeHtml(p.signup_url || p.url)}" target="_blank" rel="noopener noreferrer">Cadastrar ↗</a>`}
          </div>
        </div>`;
    }).join('')}`).join('');

  list.querySelectorAll('[data-talent-check]').forEach(cb => {
    cb.addEventListener('change', () => updateTalentEntry(cb.dataset.talentCheck, { registered: cb.checked }));
  });
  list.querySelectorAll('[data-talent-touch]').forEach(btn => {
    btn.addEventListener('click', () => updateTalentEntry(btn.dataset.talentTouch, { touch: true }));
  });
}

// Selos de confiança: de onde veio a vaga, quando foi publicada e se o link foi conferido.
function jobTrustHtml(job) {
  const parts = [];
  if (job.source_type === 'empresa') {
    parts.push(`<span class="trust-badge trust-company" title="Lida direto da página de carreiras oficial da empresa">✅ Site oficial da empresa</span>`);
  } else if (job.source_type === 'comunidade') {
    parts.push(`<span class="trust-badge trust-community" title="${escapeHtml(job.source || '')}">👥 Comunidade (issue aberta)</span>`);
  } else {
    parts.push(`<span class="trust-badge trust-aggregator" title="Vaga de agregador; link conferido na coleta">🔗 ${escapeHtml(job.source || 'Agregador')}${job.verified ? ' • link verificado' : ''}</span>`);
  }
  if (job.days_ago !== null && job.days_ago !== undefined) {
    const fresh = job.days_ago <= 7;
    const label = job.days_ago === 0 ? 'Publicada hoje' : job.days_ago === 1 ? 'Publicada ontem' : `Publicada há ${job.days_ago} dias`;
    parts.push(`<span class="trust-badge ${fresh ? 'trust-fresh' : 'trust-age'}">🕒 ${label}</span>`);
  }
  if (job.expires_at) {
    const d = new Date(job.expires_at);
    if (!Number.isNaN(d.getTime())) parts.push(`<span class="trust-badge trust-age">⏳ Inscrições até ${d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>`);
  }
  return parts.join(' ');
}

function transferJobToOptimizer(job) {
  const jobDescriptionInput = document.getElementById('jobDescription');
  if (!jobDescriptionInput) return;

  // Format job description with title and company context
  const fullContent = `VAGA: ${job.title} na empresa ${job.company}\nLOCALIZAÇÃO: ${job.location}\nREQUISITOS / DESCRIÇÃO:\n${job.raw_description || job.description}`;
  jobDescriptionInput.value = fullContent;

  // Switch to AI optimize tab
  switchTab('tab-optimize');

  // Flash highlight the optimize button
  const optBtn = document.getElementById('btnOptimize');
  if (optBtn) {
    optBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    optBtn.style.boxShadow = '0 0 20px rgba(99, 102, 241, 0.9)';
    setTimeout(() => {
      optBtn.style.boxShadow = '';
    }, 2000);
  }
}

