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
});

// Switch Tabs
function switchTab(tabId) {
  tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tabId));
  tabPanes.forEach(p => p.classList.toggle('active', p.id === tabId));
  activeTab = tabId;

  if (tabId === 'tab-json') {
    jsonEditor.value = JSON.stringify(currentResume, null, 2);
  } else if (tabId === 'tab-form') {
    populateForm();
  }
}

// Load CV from API
async function loadBaseCv() {
  showLoader('Carregando currículo base...', true);
  try {
    const res = await fetch('/api/resume');
    if (!res.ok) throw new Error('Não foi possível carregar o currículo.');
    currentResume = await res.json();
    
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
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar.');
    alert('Currículo base salvo com sucesso!');
  } catch (err) {
    alert('Erro ao salvar currículo base: ' + err.message);
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
