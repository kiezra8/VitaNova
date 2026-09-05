/**
 * VitaNova — app.js
 * Main application controller
 * Uganda Clinical Guidelines 2023
 */

// ─────────────────────────────────────────────────────────────────
// App State
// ─────────────────────────────────────────────────────────────────
const AppState = {
  currentView: 'home',
  previousView: 'home',
  diseases: [],
  chapters: {},
  symptomMap: {},
  dispensaryData: {},
  searchHistory: JSON.parse(localStorage.getItem('vn_search_history') || '[]'),
  isOnline: navigator.onLine,
  currentFilter: 'all',
  currentDetail: null,
};

// ─────────────────────────────────────────────────────────────────
// App Controller
// ─────────────────────────────────────────────────────────────────
const app = {
  // ── Init ──────────────────────────────────────────────────────
  async init() {
    this.setLoadingStatus('Opening database…', 10);
    await vitaDB.open();

    const dataLoaded = await vitaDB.isDataLoaded();
    if (!dataLoaded) {
      this.setLoadingStatus('Loading clinical guidelines…', 20);
      await this.loadDataFromJSON();
    } else {
      this.setLoadingStatus('Reading disease database…', 30);
      AppState.diseases = await vitaDB.getAllDiseases();
      AppState.chapters = await this.loadChaptersFromDB();

      this.setLoadingStatus('Loading dispensary from cache…', 55);
      const dispRows = await vitaDB.getAllDispensary();
      AppState.dispensaryData = {};
      dispRows.forEach(r => { AppState.dispensaryData[r.disease_id] = r; });
    }

    this.setLoadingStatus('Building search index…', 70);
    searchEngine.load(AppState.diseases);

    this.setLoadingStatus('Loading symptom checker…', 82);
    symptomChecker.loadData(AppState.symptomMap, AppState.diseases);

    this.setLoadingStatus('Loading dispensary…', 90);
    dispensary.load(AppState.dispensaryData, AppState.diseases);

    this.setLoadingStatus('Rendering interface…', 95);
    this.renderHome();
    this.bindEvents();
    this.checkConnectivity();
    this.registerServiceWorker();

    // Fade out loading screen
    setTimeout(() => {
      const ls = document.getElementById('loading-screen');
      ls.classList.add('fade-out');
      setTimeout(() => { ls.style.display = 'none'; }, 600);
    }, 400);

    this.setLoadingStatus('Ready', 100);
    console.log('VitaNova initialised —', AppState.diseases.length, 'conditions loaded');
  },

  async loadDataFromJSON() {
    // Load diseases
    this.setLoadingStatus('Downloading diseases database…', 25);
    const disResp = await fetch('data/diseases.json');
    const diseases = await disResp.json();
    AppState.diseases = diseases;

    this.setLoadingStatus('Downloading symptom map…', 40);
    const smResp = await fetch('data/symptom_map.json');
    AppState.symptomMap = await smResp.json();

    this.setLoadingStatus('Downloading chapters…', 50);
    const chResp = await fetch('data/chapters.json');
    AppState.chapters = await chResp.json();

    this.setLoadingStatus('Loading dispensary data…', 58);
    try {
      const dispResp = await fetch('data/dispensary.json');
      AppState.dispensaryData = await dispResp.json();
    } catch(e) {
      console.warn('Dispensary data not available:', e);
      AppState.dispensaryData = {};
    }

    this.setLoadingStatus('Saving to offline storage…', 65);
    await vitaDB.bulkPutDiseases(diseases);
    await vitaDB.bulkPutSymptomMap(AppState.symptomMap);
    await vitaDB.bulkPutChapters(AppState.chapters);
    if (Object.keys(AppState.dispensaryData).length > 0) {
      await vitaDB.bulkPutDispensary(AppState.dispensaryData);
    }
    await vitaDB.setMeta('data_loaded', true);
    await vitaDB.setMeta('data_version', '2023');
  },

  async loadChaptersFromDB() {
    const rows = await vitaDB.getAllChapters();
    const chapters = {};
    rows.forEach(r => { chapters[r.num] = r; });
    return chapters;
  },

  setLoadingStatus(msg, pct) {
    const status = document.getElementById('loading-status');
    const bar = document.getElementById('loading-bar');
    if (status) status.textContent = msg;
    if (bar) bar.style.width = pct + '%';
  },

  // ── Navigation ─────────────────────────────────────────────────
  navigate(viewName, data = null) {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('active');
      v.style.display = '';
    });

    // Special views need explicit show/hide
    const specialViews = ['disease-detail', 'chapter-diseases'];
    specialViews.forEach(sv => {
      const el = document.getElementById(`view-${sv}`);
      if (el) el.style.display = 'none';
    });

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.getElementById(`nav-${viewName}`);
    if (navEl) navEl.classList.add('active');

    // Update topbar title
    const titles = {
      'home': 'Dashboard',
      'search': 'Disease Search',
      'symptom-checker': 'Symptom Checker',
      'womens-health': "Women's Health",
      'childrens-health': "Children's Health",
      'chapters': 'All Chapters',
      'drug-reference': 'Drug Reference',
      'dispensary': '🏥 Dispensary',
      'disease-detail': 'Disease Detail',
      'chapter-diseases': 'Chapter Diseases',
    };
    document.getElementById('topbar-title').textContent = titles[viewName] || viewName;

    AppState.previousView = AppState.currentView;
    AppState.currentView = viewName;

    // Show target view
    if (specialViews.includes(viewName)) {
      const el = document.getElementById(`view-${viewName}`);
      if (el) { el.style.display = 'block'; el.classList.add('active'); }
    } else {
      const el = document.getElementById(`view-${viewName}`);
      if (el) el.classList.add('active');
    }

    // Render view-specific content
    if (viewName === 'disease-detail' && data) {
      this.renderDiseaseDetail(data);
    } else if (viewName === 'chapter-diseases' && data) {
      this.renderChapterDiseases(data);
    } else if (viewName === 'womens-health') {
      this.renderWomensHealth();
    } else if (viewName === 'childrens-health') {
      this.renderChildrensHealth();
    } else if (viewName === 'chapters') {
      this.renderAllChapters();
    } else if (viewName === 'drug-reference') {
      this.renderDrugReference();
    } else if (viewName === 'dispensary') {
      // Dispensary binds its own events on first load
      if (!this._dispensaryBound) {
        dispensary.bindEvents();
        this._dispensaryBound = true;
      }
    }

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.add('hidden');
    }

    // Scroll to top
    document.getElementById('view-container').scrollTop = 0;
  },

  goBack() {
    this.navigate(AppState.previousView || 'home');
  },

  // ── Home Render ────────────────────────────────────────────────
  renderHome() {
    this.renderChaptersGrid();
    this.renderRecentSearches();
    // Update stat count
    const el = document.getElementById('stat-total');
    if (el) el.textContent = AppState.diseases.length;
  },

  renderChaptersGrid() {
    const grid = document.getElementById('chapters-grid');
    if (!grid) return;
    const chapters = AppState.chapters;
    const counts = this.getChapterCounts();

    grid.innerHTML = Object.entries(chapters).map(([num, ch]) => {
      const count = counts[num] || 0;
      return `
        <div class="chapter-card" onclick="app.navigate('chapter-diseases', '${num}')" role="button" tabindex="0">
          <div class="chapter-card-icon">${ch.icon || '📋'}</div>
          <div class="chapter-card-name">${ch.name}</div>
          <div class="chapter-card-count">${count} condition${count !== 1 ? 's' : ''}</div>
          <div class="chapter-card-bar" style="background:${ch.color || '#64748b'}33; background:linear-gradient(90deg,${ch.color || '#14b8a6'},transparent)"></div>
        </div>
      `;
    }).join('');
  },

  getChapterCounts() {
    const counts = {};
    for (const d of AppState.diseases) {
      counts[d.chapter_num] = (counts[d.chapter_num] || 0) + 1;
    }
    return counts;
  },

  renderRecentSearches() {
    const container = document.getElementById('recent-searches');
    if (!container || AppState.searchHistory.length === 0) return;
    container.innerHTML = `
      <div class="recent-title">Recent Searches</div>
      <div class="recent-chips">
        ${AppState.searchHistory.slice(0, 8).map(term =>
          `<span class="recent-chip" onclick="app.quickSearchFromHistory('${this.escapeHtml(term)}')">${this.escapeHtml(term)}</span>`
        ).join('')}
      </div>
    `;
  },

  quickSearchFromHistory(term) {
    const input = document.getElementById('disease-search-input');
    if (input) {
      input.value = term;
      this.navigate('search');
      this.performSearch(term);
    }
  },

  // ── Search ─────────────────────────────────────────────────────
  performSearch(query, filter = AppState.currentFilter) {
    const resultsEl = document.getElementById('search-results');
    const emptyEl = document.getElementById('search-empty');
    const initialEl = document.getElementById('search-initial');
    const clearBtn = document.getElementById('search-clear');

    if (!query || query.trim().length < 2) {
      resultsEl.innerHTML = '';
      emptyEl.classList.add('hidden');
      initialEl.classList.remove('hidden');
      if (clearBtn) clearBtn.classList.add('hidden');
      return;
    }

    if (clearBtn) clearBtn.classList.remove('hidden');
    initialEl.classList.add('hidden');

    const results = searchEngine.search(query, { filter, maxResults: 40 });

    if (results.length === 0) {
      resultsEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
    } else {
      emptyEl.classList.add('hidden');
      resultsEl.innerHTML = results.map(d => this.renderDiseaseCard(d)).join('');

      // Save to history
      this.addToSearchHistory(query);
    }
  },

  renderDiseaseCard(disease) {
    const priorityTags = [];
    if (disease.priority === 'women') priorityTags.push(`<span class="drc-tag tag-women">👩 Women's Health</span>`);
    if (disease.priority === 'children') priorityTags.push(`<span class="drc-tag tag-children">👶 Children's</span>`);
    if (disease.chapter_num === '1' || disease.chapter_num === '17') priorityTags.push(`<span class="drc-tag tag-emergency">🚨 Emergency</span>`);
    if (disease.pregnancy_notes) priorityTags.push(`<span class="drc-tag tag-women">🤰 Pregnancy Notes</span>`);

    return `
      <div class="disease-result-card" onclick="app.showDisease('${disease.id}')" role="button" tabindex="0"
           style="--card-color:${disease.chapter_color || '#14b8a6'}">
        <div class="drc-icon">${disease.chapter_icon || '📋'}</div>
        <div class="drc-content">
          <div class="drc-name">${this.escapeHtml(disease.name)}</div>
          <div class="drc-chapter">${this.escapeHtml(disease.chapter)}</div>
          <div class="drc-section">Section ${disease.section}</div>
          ${priorityTags.length ? `<div class="drc-tags">${priorityTags.join('')}</div>` : ''}
        </div>
        <div class="drc-arrow">→</div>
      </div>
    `;
  },

  addToSearchHistory(term) {
    const clean = term.trim();
    AppState.searchHistory = [clean, ...AppState.searchHistory.filter(h => h !== clean)].slice(0, 20);
    localStorage.setItem('vn_search_history', JSON.stringify(AppState.searchHistory));
  },

  // ── Disease Detail ─────────────────────────────────────────────
  showDisease(id) {
    const disease = AppState.diseases.find(d => d.id === id);
    if (!disease) return;
    AppState.currentDetail = disease;
    this.navigate('disease-detail', disease);
  },

  renderDiseaseDetail(disease) {
    const container = document.getElementById('disease-detail-content');
    if (!container) return;

    // Chapter tag
    const tagEl = document.getElementById('detail-chapter-tag');
    if (tagEl) {
      tagEl.style.background = (disease.chapter_color || '#14b8a6') + '22';
      tagEl.style.color = disease.chapter_color || '#14b8a6';
      tagEl.style.border = `1px solid ${disease.chapter_color || '#14b8a6'}44`;
      tagEl.textContent = `${disease.chapter_icon} ${disease.chapter}`;
    }

    const priorityBadges = [];
    if (disease.priority === 'women') {
      priorityBadges.push(`<span class="priority-badge-large badge-women">👩 Women's Health Priority</span>`);
    }
    if (disease.priority === 'children') {
      priorityBadges.push(`<span class="priority-badge-large badge-children">👶 Children's Health Priority</span>`);
    }

    const hasSymptoms = disease.symptoms && disease.symptoms.length > 0;
    const hasSigns = disease.signs && disease.signs.length > 0;
    const hasMeds = disease.medications && disease.medications.length > 0;
    const hasTreatment = disease.treatment && disease.treatment.length > 10;
    const hasInvestigations = disease.investigations && disease.investigations.length > 10;
    const hasReferral = disease.referral && disease.referral.length > 5;
    const hasPrevention = disease.prevention && disease.prevention.length > 5;
    const hasPregnancy = disease.pregnancy_notes && disease.pregnancy_notes.length > 10;
    const hasChildren = disease.children_notes && disease.children_notes.length > 10;
    const hasHIV = disease.hiv_notes && disease.hiv_notes.length > 10;

    container.innerHTML = `
      <!-- Hero -->
      <div class="disease-detail-hero">
        <div class="detail-section-num">Section ${this.escapeHtml(disease.section)} · Uganda Clinical Guidelines 2023</div>
        <h1 class="detail-name">${this.escapeHtml(disease.name)}</h1>
        <div class="detail-chapter">${disease.chapter_icon} ${this.escapeHtml(disease.chapter)}</div>
        ${priorityBadges.length ? `<div class="detail-priority-badges">${priorityBadges.join('')}</div>` : ''}
      </div>

      <!-- Tabs -->
      <div class="detail-tabs">
        <button class="tab-btn active" onclick="app.switchTab('overview', this)">Overview</button>
        <button class="tab-btn" onclick="app.switchTab('diagnosis', this)">Diagnosis</button>
        <button class="tab-btn" onclick="app.switchTab('treatment', this)">Treatment</button>
        ${hasMeds ? `<button class="tab-btn" onclick="app.switchTab('medications', this)">Medications</button>` : ''}
        ${(hasReferral || hasPrevention) ? `<button class="tab-btn" onclick="app.switchTab('referral', this)">Referral & Prevention</button>` : ''}
        ${(hasPregnancy || hasChildren || hasHIV) ? `<button class="tab-btn" onclick="app.switchTab('special', this)">Special Populations</button>` : ''}
        <button class="tab-btn" onclick="app.switchTab('full', this)">Full Guidelines</button>
      </div>

      <!-- Tab: Overview -->
      <div id="tab-overview" class="tab-panel active">
        ${disease.definition ? `
          <div class="clinical-card">
            <div class="clinical-card-header">
              <div class="clinical-card-icon">📖</div>
              <div class="clinical-card-title">Definition & Overview</div>
            </div>
            <p class="clinical-text">${this.escapeHtml(disease.definition)}</p>
          </div>
        ` : ''}

        ${hasSymptoms ? `
          <div class="clinical-card">
            <div class="clinical-card-header">
              <div class="clinical-card-icon">🤒</div>
              <div class="clinical-card-title">Signs & Symptoms</div>
            </div>
            <ul class="symptom-list">
              ${disease.symptoms.map(s => `<li>${this.escapeHtml(s)}</li>`).join('')}
              ${hasSigns ? disease.signs.map(s => `<li>${this.escapeHtml(s)}</li>`).join('') : ''}
            </ul>
          </div>
        ` : ''}

        ${!disease.definition && !hasSymptoms ? `
          <div class="clinical-card">
            <div class="clinical-card-header">
              <div class="clinical-card-icon">📋</div>
              <div class="clinical-card-title">Clinical Information</div>
            </div>
            <p class="clinical-text">${this.escapeHtml((disease.full_content || '').substring(0, 1500))}...</p>
          </div>
        ` : ''}
      </div>

      <!-- Tab: Diagnosis -->
      <div id="tab-diagnosis" class="tab-panel">
        ${hasInvestigations ? `
          <div class="clinical-card">
            <div class="clinical-card-header">
              <div class="clinical-card-icon">🔬</div>
              <div class="clinical-card-title">Investigations & Diagnosis</div>
            </div>
            <p class="clinical-text">${this.escapeHtml(disease.investigations)}</p>
          </div>
        ` : `
          <div class="clinical-card">
            <div class="clinical-card-header">
              <div class="clinical-card-icon">🔬</div>
              <div class="clinical-card-title">Diagnostic Approach</div>
            </div>
            <p class="clinical-text">${this.escapeHtml(this.extractSection(disease.full_content, ['diagnos', 'investigat', 'workup', 'laboratory']))}</p>
          </div>
        `}
      </div>

      <!-- Tab: Treatment -->
      <div id="tab-treatment" class="tab-panel">
        ${hasTreatment ? `
          <div class="clinical-card">
            <div class="clinical-card-header">
              <div class="clinical-card-icon">💊</div>
              <div class="clinical-card-title">Treatment & Management</div>
            </div>
            <p class="clinical-text">${this.escapeHtml(disease.treatment)}</p>
          </div>
        ` : `
          <div class="clinical-card">
            <div class="clinical-card-header">
              <div class="clinical-card-icon">💊</div>
              <div class="clinical-card-title">Treatment & Management</div>
            </div>
            <p class="clinical-text">${this.escapeHtml(this.extractSection(disease.full_content, ['treatment', 'management', 'therapeu']))}</p>
          </div>
        `}
      </div>

      <!-- Tab: Medications -->
      ${hasMeds ? `
        <div id="tab-medications" class="tab-panel">
          <div class="clinical-card">
            <div class="clinical-card-header">
              <div class="clinical-card-icon">💉</div>
              <div class="clinical-card-title">Drug Treatment</div>
            </div>
            <table class="medicine-table">
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>Dose / Regimen</th>
                </tr>
              </thead>
              <tbody>
                ${disease.medications.map(m => `
                  <tr>
                    <td>${this.escapeHtml(m.drug)}</td>
                    <td>${this.escapeHtml(m.dose || '—')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- Tab: Referral & Prevention -->
      ${(hasReferral || hasPrevention) ? `
        <div id="tab-referral" class="tab-panel">
          ${hasReferral ? `
            <div class="clinical-card">
              <div class="clinical-card-header">
                <div class="clinical-card-icon">🚑</div>
                <div class="clinical-card-title">Referral Criteria</div>
              </div>
              <div class="alert-box alert-warning">
                <span class="alert-icon">⚠️</span>
                <div class="alert-content-text">${this.escapeHtml(disease.referral)}</div>
              </div>
            </div>
          ` : ''}
          ${hasPrevention ? `
            <div class="clinical-card">
              <div class="clinical-card-header">
                <div class="clinical-card-icon">🛡️</div>
                <div class="clinical-card-title">Prevention & Prophylaxis</div>
              </div>
              <p class="clinical-text">${this.escapeHtml(disease.prevention)}</p>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Tab: Special Populations -->
      ${(hasPregnancy || hasChildren || hasHIV) ? `
        <div id="tab-special" class="tab-panel">
          ${hasPregnancy ? `
            <div class="clinical-card">
              <div class="clinical-card-header">
                <div class="clinical-card-icon">🤰</div>
                <div class="clinical-card-title">Management in Pregnancy</div>
              </div>
              <div class="alert-box alert-info">
                <span class="alert-icon">ℹ️</span>
                <div class="alert-content-text">${this.escapeHtml(disease.pregnancy_notes)}</div>
              </div>
            </div>
          ` : ''}
          ${hasChildren ? `
            <div class="clinical-card">
              <div class="clinical-card-header">
                <div class="clinical-card-icon">👶</div>
                <div class="clinical-card-title">Management in Children</div>
              </div>
              <p class="clinical-text">${this.escapeHtml(disease.children_notes)}</p>
            </div>
          ` : ''}
          ${hasHIV ? `
            <div class="clinical-card">
              <div class="clinical-card-header">
                <div class="clinical-card-icon">🔴</div>
                <div class="clinical-card-title">HIV/Immunocompromised Patients</div>
              </div>
              <p class="clinical-text">${this.escapeHtml(disease.hiv_notes)}</p>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Tab: Full Guidelines -->
      <div id="tab-full" class="tab-panel">
        <div class="clinical-card">
          <div class="clinical-card-header">
            <div class="clinical-card-icon">📄</div>
            <div class="clinical-card-title">Full Clinical Guidelines — Section ${this.escapeHtml(disease.section)}</div>
          </div>
          <pre class="full-content-text">${this.escapeHtml(disease.full_content || 'Full content not available for this section.')}</pre>
        </div>
      </div>
    `;
  },

  switchTab(tabName, btn) {
    // Deactivate all tab buttons and panels
    btn.closest('.detail-tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#view-disease-detail .tab-panel').forEach(p => p.classList.remove('active'));

    // Activate selected
    btn.classList.add('active');
    const panel = document.getElementById(`tab-${tabName}`);
    if (panel) panel.classList.add('active');
  },

  extractSection(fullContent, keywords) {
    if (!fullContent) return 'See full guidelines tab for details.';
    const text = fullContent;
    for (const kw of keywords) {
      const idx = text.toLowerCase().indexOf(kw);
      if (idx !== -1) {
        return text.substring(idx, idx + 2000);
      }
    }
    return text.substring(0, 2000);
  },

  // ── Women's Health ─────────────────────────────────────────────
  renderWomensHealth() {
    const container = document.getElementById('womens-content');
    if (!container) return;

    const womensDiseases = AppState.diseases.filter(d =>
      d.chapter_num === '16' || d.priority === 'women'
    );

    // Categorize
    const categories = {
      'Antenatal & Obstetric Care': womensDiseases.filter(d =>
        /antenat|preg|obstet|labour|deliver|maternal|eclampsia|haemorrhage|pph|placenta/i.test(d.name + ' ' + d.full_content)
      ),
      'Gynaecological Conditions': womensDiseases.filter(d =>
        /gynae|uter|ovari|cervix|vagina|vulva|fibroid|menstrual|endometr/i.test(d.name + ' ' + d.full_content)
      ),
      'Family Planning': womensDiseases.filter(d =>
        /family planning|contracepti|birth control|LARC|steriliz/i.test(d.name + ' ' + d.full_content)
      ),
      'Sexually Transmitted Infections': womensDiseases.filter(d =>
        /STI|vaginal discharge|PID|syphilis|gonorrh|chlamydia/i.test(d.name + ' ' + d.full_content)
      ),
      'Other Women\'s Health': []
    };

    // Add remaining to "Other"
    const categorized = new Set();
    Object.values(categories).forEach(arr => arr.forEach(d => categorized.add(d.id)));
    womensDiseases.filter(d => !categorized.has(d.id)).forEach(d => categories['Other Women\'s Health'].push(d));

    container.innerHTML = Object.entries(categories).map(([cat, diseases]) => {
      if (diseases.length === 0) return '';
      return `
        <div class="special-section-card" style="border-color: rgba(236,72,153,0.2); background: linear-gradient(135deg, rgba(236,72,153,0.05), var(--bg-card))">
          <div class="ssc-title" style="color: var(--women-color)">👩 ${cat}</div>
          <div class="ssc-desc">${diseases.length} condition${diseases.length !== 1 ? 's' : ''} covered in Uganda Clinical Guidelines</div>
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px">
            ${diseases.slice(0, 6).map(d => `
              <div onclick="app.showDisease('${d.id}')" style="cursor:pointer; padding:8px 12px; background:rgba(255,255,255,0.03); border-radius:8px; font-size:0.82rem; color:var(--text-secondary); transition:all 0.15s ease"
                   onmouseover="this.style.background='rgba(236,72,153,0.1)'; this.style.color='#ec4899'"
                   onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.color='var(--text-secondary)'">
                ${this.escapeHtml(d.name)} <span style="float:right">→</span>
              </div>
            `).join('')}
            ${diseases.length > 6 ? `
              <div onclick="app.showChapterWithFilter('16')" style="cursor:pointer; text-align:center; font-size:0.78rem; color:var(--women-color); padding:4px">
                View all ${diseases.length} conditions →
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  // ── Children's Health ──────────────────────────────────────────
  renderChildrensHealth() {
    const container = document.getElementById('childrens-content');
    if (!container) return;

    const childDiseases = AppState.diseases.filter(d =>
      d.chapter_num === '18' || d.chapter_num === '19' || d.priority === 'children'
    );

    const categories = {
      'Neonatology (Newborn Care)': childDiseases.filter(d => d.chapter_num === '19'),
      'IMCI & General Paediatrics': childDiseases.filter(d =>
        d.chapter_num === '18' || /IMCI|paediat|child|infant/i.test(d.name)
      ),
      'Nutrition & Malnutrition': childDiseases.filter(d =>
        /nutrit|malnutrit|SAM|MAM|kwashiorkor|marasmus|breastfeed/i.test(d.name + ' ' + d.full_content)
      ),
      'Childhood Infections': childDiseases.filter(d =>
        /meningit|neonatal|measles|chicken|rabies|tetanus|pneumo/i.test(d.name)
      ),
    };

    container.innerHTML = Object.entries(categories).map(([cat, diseases]) => {
      if (diseases.length === 0) return '';
      return `
        <div class="special-section-card" style="border-color: rgba(56,189,248,0.2); background: linear-gradient(135deg, rgba(56,189,248,0.05), var(--bg-card))">
          <div class="ssc-title" style="color: var(--children-color)">👶 ${cat}</div>
          <div class="ssc-desc">${diseases.length} condition${diseases.length !== 1 ? 's' : ''} covered</div>
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px">
            ${diseases.slice(0, 6).map(d => `
              <div onclick="app.showDisease('${d.id}')" style="cursor:pointer; padding:8px 12px; background:rgba(255,255,255,0.03); border-radius:8px; font-size:0.82rem; color:var(--text-secondary); transition:all 0.15s ease"
                   onmouseover="this.style.background='rgba(56,189,248,0.1)'; this.style.color='#38bdf8'"
                   onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.color='var(--text-secondary)'">
                ${this.escapeHtml(d.name)} <span style="float:right">→</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  },

  // ── All Chapters ───────────────────────────────────────────────
  renderAllChapters() {
    const container = document.getElementById('all-chapters-list');
    if (!container) return;
    const counts = this.getChapterCounts();

    container.innerHTML = Object.entries(AppState.chapters).map(([num, ch]) => {
      const count = counts[num] || 0;
      return `
        <div class="chapter-row" onclick="app.navigate('chapter-diseases', '${num}')" role="button" tabindex="0">
          <div class="chapter-row-num">${num}</div>
          <div class="chapter-row-icon">${ch.icon || '📋'}</div>
          <div class="chapter-row-content">
            <div class="chapter-row-name">${ch.name}</div>
            <div class="chapter-row-count">${count} condition${count !== 1 ? 's' : ''}</div>
          </div>
          <div class="chapter-row-arrow">→</div>
        </div>
      `;
    }).join('');
  },

  // ── Chapter Diseases ───────────────────────────────────────────
  renderChapterDiseases(chapterNum) {
    const header = document.getElementById('chapter-view-header');
    const list = document.getElementById('chapter-diseases-list');
    if (!list) return;

    const chapter = AppState.chapters[chapterNum] || { name: 'Chapter ' + chapterNum, icon: '📋' };
    const diseases = AppState.diseases.filter(d => d.chapter_num === String(chapterNum));

    if (header) {
      header.innerHTML = `
        <h2>${chapter.icon} ${chapter.name}</h2>
        <p class="view-sub">${diseases.length} conditions from Uganda Clinical Guidelines 2023</p>
      `;
    }

    list.innerHTML = diseases.map(d => this.renderDiseaseCard(d)).join('');
  },

  // ── Drug Reference ─────────────────────────────────────────────
  renderDrugReference(query = '') {
    const container = document.getElementById('drug-results');
    if (!container) return;

    const drugs = searchEngine.searchDrugs(query);
    if (drugs.length === 0) {
      container.innerHTML = `<div class="no-results">No drugs found matching "${query}"</div>`;
      return;
    }

    container.innerHTML = drugs.map(drug => `
      <div class="drug-card">
        <div class="drug-name">💊 ${this.escapeHtml(drug.name)}</div>
        ${drug.dose ? `<div class="drug-uses" style="margin-top:4px">Dose: ${this.escapeHtml(drug.dose)}</div>` : ''}
        <div class="drug-uses" style="margin-top:8px; font-size:0.78rem">
          Used in: ${drug.diseases.slice(0, 4).map(d =>
            `<span onclick="app.showDisease('${d.id}')" style="cursor:pointer; color:var(--teal-400); text-decoration:underline">${this.escapeHtml(d.name)}</span>`
          ).join(', ')}${drug.diseases.length > 4 ? ` +${drug.diseases.length - 4} more` : ''}
        </div>
      </div>
    `).join('');
  },

  // ── Symptom Checker UI ─────────────────────────────────────────
  renderSymptomCheckerUI() {
    // Populate common symptom chips
    const chipsContainer = document.getElementById('common-symptom-chips');
    if (chipsContainer) {
      chipsContainer.innerHTML = symptomChecker.commonSymptoms.map(s =>
        `<span class="cs-chip" onclick="symptomCheckerUI.addSymptom('${s}')">${s}</span>`
      ).join('');
    }
  },

  // ── Connectivity ───────────────────────────────────────────────
  checkConnectivity() {
    const update = (online) => {
      AppState.isOnline = online;
      const dot = document.getElementById('connectivity-dot');
      const status = document.getElementById('offline-status');
      const banner = document.getElementById('connectivity-banner');

      if (dot) {
        dot.className = `connectivity-dot ${online ? 'online' : 'offline'}`;
        dot.title = online ? 'Online' : 'Offline (cached data)';
      }
      if (status) {
        status.textContent = online ? '✅ Online — synced with latest' : '📴 Offline mode — using cached data';
      }
      if (banner) {
        banner.className = `connectivity-banner ${online ? 'online' : 'offline'}`;
        banner.textContent = online ? '✅ Back online' : '📴 Offline — all clinical data available locally';
        banner.classList.remove('hidden');
        banner.classList.add('show');
        setTimeout(() => banner.classList.remove('show'), 3500);
      }
    };

    window.addEventListener('online', () => update(true));
    window.addEventListener('offline', () => update(false));
    update(navigator.onLine);
  },

  // ── Service Worker ─────────────────────────────────────────────
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.warn('SW registration failed:', err));
    }
  },

  // ── Event Bindings ─────────────────────────────────────────────
  bindEvents() {
    // ─ Menu toggle (mobile) ─
    document.getElementById('menu-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebar-overlay').classList.toggle('hidden');
    });
    document.getElementById('sidebar-close').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.add('hidden');
    });
    document.getElementById('sidebar-overlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.add('hidden');
    });

    // ─ Nav items ─
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        if (view) this.navigate(view);
      });
    });

    // ─ Hero search ─
    const heroSearch = document.getElementById('hero-search');
    const quickResults = document.getElementById('quick-results');
    if (heroSearch) {
      heroSearch.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        if (q.length < 2) {
          quickResults.classList.add('hidden');
          quickResults.innerHTML = '';
          return;
        }
        const results = searchEngine.search(q, { maxResults: 6 });
        if (results.length === 0) {
          quickResults.classList.add('hidden');
          return;
        }
        quickResults.classList.remove('hidden');
        quickResults.innerHTML = results.map(d => this.renderDiseaseCard(d)).join('');
      });
      heroSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && heroSearch.value.trim()) {
          const input = document.getElementById('disease-search-input');
          if (input) input.value = heroSearch.value;
          this.navigate('search');
          this.performSearch(heroSearch.value.trim());
        }
      });
    }

    // ─ Sidebar search ─
    const mainSearch = document.getElementById('main-search');
    if (mainSearch) {
      mainSearch.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        if (q.length >= 2) {
          const input = document.getElementById('disease-search-input');
          if (input) input.value = q;
          this.navigate('search');
          this.performSearch(q);
        }
      });
    }

    // ─ Disease search view ─
    const diseaseSearchInput = document.getElementById('disease-search-input');
    if (diseaseSearchInput) {
      diseaseSearchInput.addEventListener('input', (e) => {
        this.performSearch(e.target.value.trim(), AppState.currentFilter);
      });
      diseaseSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.target.value = '';
          this.performSearch('');
        }
      });
    }

    const searchClear = document.getElementById('search-clear');
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        diseaseSearchInput.value = '';
        this.performSearch('');
        diseaseSearchInput.focus();
      });
    }

    // ─ Filter buttons ─
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        AppState.currentFilter = btn.dataset.filter;
        const q = document.getElementById('disease-search-input').value.trim();
        this.performSearch(q, AppState.currentFilter);
      });
    });

    // ─ Drug search ─
    const drugInput = document.getElementById('drug-search-input');
    if (drugInput) {
      drugInput.addEventListener('input', (e) => {
        this.renderDrugReference(e.target.value.trim());
      });
    }

    // ─ Dispensary ─ bind when nav clicked ─
    document.getElementById('nav-dispensary')?.addEventListener('click', () => {
      setTimeout(() => {
        if (!this._dispensaryBound) {
          dispensary.bindEvents();
          this._dispensaryBound = true;
        }
      }, 100);
    });

    // ─ Symptom checker events ─
    this.bindSymptomCheckerEvents();

    // ─ Keyboard shortcuts ─
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.navigate('search');
        setTimeout(() => document.getElementById('disease-search-input').focus(), 100);
      }
    });
  },

  bindSymptomCheckerEvents() {
    // Age group buttons
    document.querySelectorAll('.age-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.age-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        symptomChecker.ageGroup = btn.dataset.age;
      });
    });

    // Sex buttons
    document.querySelectorAll('.sex-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sex-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        symptomChecker.sex = btn.dataset.sex;
        const pregGroup = document.getElementById('pregnancy-group');
        if (pregGroup) {
          if (btn.dataset.sex === 'female') pregGroup.classList.remove('hidden');
          else pregGroup.classList.add('hidden');
        }
      });
    });

    // Pregnancy buttons
    document.querySelectorAll('.preg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        symptomChecker.pregnant = btn.dataset.preg === 'yes';
      });
    });

    // Add symptom input
    const sympInput = document.getElementById('symptom-input');
    const addBtn = document.getElementById('add-symptom-btn');

    if (sympInput) {
      sympInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); symptomCheckerUI.addSymptom(sympInput.value); }
      });
    }
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (sympInput) symptomCheckerUI.addSymptom(sympInput.value);
      });
    }

    // Render common symptoms
    this.renderSymptomCheckerUI();
  },

  // ── Helpers ────────────────────────────────────────────────────
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  showToast(msg, duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
  },
};

// ─────────────────────────────────────────────────────────────────
// Symptom Checker UI Controller
// ─────────────────────────────────────────────────────────────────
const symptomCheckerUI = {
  addSymptom(symptomText) {
    const s = (symptomText || '').trim();
    if (!s) return;
    const added = symptomChecker.addSymptom(s);
    if (added) this.renderChips();
    const input = document.getElementById('symptom-input');
    if (input) input.value = '';
  },

  removeSymptom(symptom) {
    symptomChecker.removeSymptom(symptom);
    this.renderChips();
  },

  renderChips() {
    const chipsEl = document.getElementById('symptoms-chips');
    const labelEl = document.getElementById('selected-label');
    if (!chipsEl) return;

    if (symptomChecker.symptoms.length === 0) {
      chipsEl.innerHTML = '';
      if (labelEl) labelEl.textContent = 'No symptoms selected yet';
      return;
    }

    if (labelEl) labelEl.textContent = `${symptomChecker.symptoms.length} symptom(s) selected:`;

    chipsEl.innerHTML = symptomChecker.symptoms.map(s => `
      <span class="symptom-chip">
        ${app.escapeHtml(s)}
        <span class="symptom-chip-remove" onclick="symptomCheckerUI.removeSymptom('${app.escapeHtml(s)}')">✕</span>
      </span>
    `).join('');
  },

  analyze() {
    if (symptomChecker.symptoms.length === 0) {
      app.showToast('Please add at least one symptom first');
      return;
    }

    const placeholder = document.getElementById('sc-placeholder');
    const resultsEl = document.getElementById('sc-results');
    if (placeholder) placeholder.style.display = 'none';
    if (resultsEl) {
      resultsEl.classList.remove('hidden');
      resultsEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">Analyzing…</div>`;
    }

    // Small delay for UX feel
    setTimeout(() => {
      const results = symptomChecker.analyze();
      this.renderResults(results);
    }, 500);
  },

  renderResults(results) {
    const el = document.getElementById('sc-results');
    if (!el) return;

    if (results.length === 0) {
      el.innerHTML = `
        <div style="text-align:center; padding:40px">
          <div style="font-size:2rem">🔍</div>
          <h3 style="margin:12px 0 8px; color:var(--text-primary)">No matches found</h3>
          <p style="color:var(--text-secondary); font-size:0.9rem">Try adding more specific symptoms or use the disease search directly.</p>
        </div>
      `;
      return;
    }

    const symptomsList = symptomChecker.symptoms.join(', ');

    el.innerHTML = `
      <div class="sc-result-header">
        <h3>Differential Diagnoses (${results.length} found)</h3>
        <p>Based on: <strong style="color:var(--teal-400)">${app.escapeHtml(symptomsList)}</strong></p>
      </div>
      ${results.map((r, idx) => this.renderDifferentialCard(r, idx + 1)).join('')}
      <div style="margin-top:16px; padding:12px 16px; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.2); border-radius:12px; font-size:0.8rem; color:#fbbf24">
        ⚠️ <strong>Clinical Disclaimer:</strong> These suggestions are based on the Uganda Clinical Guidelines 2023. Always apply clinical judgement — these are decision support tools, not a substitute for clinical assessment.
      </div>
    `;

    // Add click handlers for expand
    el.querySelectorAll('.differential-card').forEach(card => {
      card.querySelector('.diff-header').addEventListener('click', () => {
        card.classList.toggle('expanded');
      });
    });
  },

  renderDifferentialCard(result, rank) {
    const { disease, matchedSymptoms, matchPercent } = result;
    const scoreClass = matchPercent >= 60 ? 'score-high' : matchPercent >= 35 ? 'score-med' : 'score-low';
    const rankClass = rank <= 3 ? `diff-rank-${rank}` : 'diff-rank-n';

    return `
      <div class="differential-card" id="diff-${disease.id}">
        <div class="diff-header">
          <div class="diff-rank ${rankClass}">${rank}</div>
          <div class="diff-info">
            <div class="diff-name">${app.escapeHtml(disease.name)}</div>
            <div class="diff-chapter">${disease.chapter_icon} ${app.escapeHtml(disease.chapter)}</div>
          </div>
          <div class="diff-match-score ${scoreClass}">${matchPercent}% match</div>
          <div class="diff-expand-icon">▼</div>
        </div>
        <div class="diff-body">
          ${matchedSymptoms.length > 0 ? `
            <div class="diff-matched-symptoms">
              <div class="diff-matched-label">Matched Symptoms</div>
              <div class="matched-symp-chips">
                ${matchedSymptoms.map(s => `<span class="matched-symp">✓ ${app.escapeHtml(s)}</span>`).join('')}
              </div>
            </div>
          ` : ''}
          ${disease.definition ? `
            <p style="font-size:0.83rem; color:var(--text-secondary); margin:12px 0; line-height:1.7">
              ${app.escapeHtml(disease.definition.substring(0, 300))}${disease.definition.length > 300 ? '…' : ''}
            </p>
          ` : ''}
          <div class="diff-actions">
            <button class="diff-btn diff-btn-primary" onclick="app.showDisease('${disease.id}')">📋 View Full Management</button>
            ${disease.priority === 'women' ? `<span style="font-size:0.75rem; color:var(--women-color); align-self:center">👩 Women's Health</span>` : ''}
            ${disease.priority === 'children' ? `<span style="font-size:0.75rem; color:var(--children-color); align-self:center">👶 Children's</span>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  reset() {
    symptomChecker.reset();
    this.renderChips();
    const placeholder = document.getElementById('sc-placeholder');
    const resultsEl = document.getElementById('sc-results');
    if (placeholder) placeholder.style.display = '';
    if (resultsEl) { resultsEl.classList.add('hidden'); resultsEl.innerHTML = ''; }
    document.querySelectorAll('.age-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.age-btn[data-age="adult"]')?.classList.add('active');
    document.querySelectorAll('.sex-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.sex-btn[data-sex="any"]')?.classList.add('active');
    document.getElementById('pregnancy-group')?.classList.add('hidden');
  }
};

// ─────────────────────────────────────────────────────────────────
// Expose to HTML
// ─────────────────────────────────────────────────────────────────
window.app = app;
window.symptomCheckerUI = symptomCheckerUI;

// Override the analyze button to use UI controller
window.symptomChecker.analyze = symptomCheckerUI.analyze.bind(symptomCheckerUI);
window.symptomChecker.reset = symptomCheckerUI.reset.bind(symptomCheckerUI);

// ─────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  app.init().catch(err => {
    console.error('App init error:', err);
    document.getElementById('loading-status').textContent = 'Error loading. Please refresh.';
  });
});
