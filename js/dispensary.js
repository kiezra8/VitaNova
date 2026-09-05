/**
 * VitaNova — dispensary.js
 * Dispensary module: search disease → get specific drug regimens
 * Based on Uganda Clinical Guidelines 2023
 */

class Dispensary {
  constructor() {
    this.data = {};        // disease_id → { disease_name, regimens[] }
    this.diseases = [];    // all diseases for search
    this.ready = false;
    this.currentResults = [];
    this.currentTabIdx = 0;
  }

  load(dispensaryData, diseases) {
    this.data = dispensaryData;
    this.diseases = diseases;
    this.ready = true;
    console.log('Dispensary loaded:', Object.keys(dispensaryData).length, 'entries');
  }

  // ── Search ──────────────────────────────────────────────────────
  search(query) {
    if (!query || query.trim().length < 2) return [];
    const results = searchEngine.search(query, { maxResults: 10 });

    // Find dispensary data for each result
    return results.map(disease => {
      const dispEntry = this.data[disease.id];
      return {
        disease,
        regimens: dispEntry ? dispEntry.regimens : [],
        hasData: !!dispEntry && dispEntry.regimens.length > 0,
      };
    }).sort((a, b) => {
      // Prioritize results with drug data
      if (a.hasData && !b.hasData) return -1;
      if (!a.hasData && b.hasData) return 1;
      return 0;
    });
  }

  quickSearch(term) {
    const input = document.getElementById('dispensary-search-input');
    if (input) {
      input.value = term;
      input.dispatchEvent(new Event('input'));
      this.renderForTerm(term);
    }
  }

  // ── Render full dispensary for a disease ─────────────────────────
  renderForDisease(diseaseId, tabIdx = 0) {
    const disease = this.diseases.find(d => d.id === diseaseId);
    const dispEntry = this.data[diseaseId];

    const resultsEl = document.getElementById('disp-results');
    const landingEl = document.getElementById('disp-landing');
    if (landingEl) landingEl.style.display = 'none';

    if (!disease) return;

    const regimens = dispEntry ? dispEntry.regimens : [];

    // Group by line type
    const groups = this.groupRegimens(regimens);

    // Full content fallback if no structured drug data
    const hasDrugs = regimens.length > 0;

    resultsEl.innerHTML = `
      ${this.currentResults.length > 1 ? this.renderTabs() : ''}
      <div class="disp-disease-card">
        <div class="disp-disease-header">
          <div class="disp-disease-icon">${disease.chapter_icon || '💊'}</div>
          <div class="disp-disease-title">
            <div class="disp-disease-name">${this.escape(disease.name)}</div>
            <div class="disp-disease-meta">
              Section ${this.escape(disease.section)} · ${this.escape(disease.chapter)}
              ${disease.priority === 'women' ? ' · 👩 Women\'s Health' : ''}
              ${disease.priority === 'children' ? ' · 👶 Children\'s' : ''}
              · ${regimens.length} drug${regimens.length !== 1 ? 's' : ''} listed
            </div>
          </div>
          <button class="disp-full-btn" onclick="app.showDisease('${disease.id}')">
            📋 Full Guidelines
          </button>
        </div>

        ${hasDrugs ? `
          <div class="disp-regimen-groups">
            ${Object.entries(groups).map(([lineType, drugs]) => {
              if (drugs.length === 0) return '';
              return this.renderRegimenGroup(lineType, drugs);
            }).join('')}
          </div>

          <div style="padding: 0 var(--space-6) var(--space-6)">
            <button class="disp-prescription-btn" onclick="dispensary.printPrescription('${disease.id}')">
              🖨️ Print / Export Drug List
            </button>
          </div>
        ` : `
          <div class="disp-no-drugs">
            <div class="disp-no-drugs-icon">📋</div>
            <p>No structured drug data extracted for this condition.</p>
            <p style="margin-top:8px; font-size:0.8rem">
              <a onclick="app.showDisease('${disease.id}')" style="color:var(--teal-400);cursor:pointer">
                View full clinical guidelines → 
              </a>
            </p>
          </div>
        `}
      </div>

      <!-- Disclaimer -->
      <div style="margin-top:12px; padding:12px 16px; background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.15); border-radius:12px; font-size:0.78rem; color:#fca5a5; line-height:1.6">
        ⚠️ <strong>Prescribing Disclaimer:</strong> Drug information is extracted from Uganda Clinical Guidelines 2023 (Ministry of Health). Always verify dosages against the current guidelines, apply clinical judgement, and check patient-specific contraindications before prescribing. This is a decision-support tool only.
      </div>
    `;
  }

  renderTabs() {
    return `
      <div class="disp-multiple-results">
        <h3>${this.currentResults.length} matching conditions found:</h3>
        <div class="disp-result-tabs">
          ${this.currentResults.map((r, i) => `
            <button class="disp-result-tab ${i === this.currentTabIdx ? 'active' : ''}"
                    onclick="dispensary.switchTab(${i})">
              ${r.disease.chapter_icon || ''} ${this.escape(r.disease.name.substring(0, 35))}${r.disease.name.length > 35 ? '…' : ''}
              ${r.hasData ? `<span style="color:#22c55e; margin-left:4px">●</span>` : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  switchTab(idx) {
    this.currentTabIdx = idx;
    const result = this.currentResults[idx];
    if (result) this.renderForDisease(result.disease.id, idx);
  }

  // ── Regimen groups ───────────────────────────────────────────────
  groupRegimens(regimens) {
    const LINE_ORDER = ['first_line', 'severe', 'second_line', 'third_line', 'paediatric', 'pregnancy', 'prophylaxis', 'mild', 'general'];
    const LINE_LABELS = {
      first_line:  '🔵 First-Line Treatment',
      second_line: '🟡 Second-Line / Alternative',
      third_line:  '🔴 Third-Line / Last Resort',
      prophylaxis: '🟢 Prophylaxis / Prevention',
      paediatric:  '👶 Paediatric Regimen',
      pregnancy:   '🤰 Pregnancy / Lactation',
      severe:      '🚨 Severe / IV Regimen',
      mild:        '✅ Mild / Outpatient',
      general:     '💊 Drug Treatment',
    };

    const groups = {};
    LINE_ORDER.forEach(lt => {
      groups[lt] = { label: LINE_LABELS[lt], drugs: [] };
    });

    for (const drug of regimens) {
      const lt = drug.line || 'general';
      if (groups[lt]) {
        groups[lt].drugs.push(drug);
      } else {
        groups['general'].drugs.push(drug);
      }
    }

    // Filter empty groups and return
    return Object.fromEntries(
      LINE_ORDER
        .filter(lt => groups[lt].drugs.length > 0)
        .map(lt => [lt, groups[lt]])
    );
  }

  renderRegimenGroup(lineType, groupData) {
    const { label, drugs } = groupData;
    return `
      <div class="regimen-group line-${lineType}">
        <div class="regimen-group-title">
          <div class="regimen-group-dot"></div>
          <div class="regimen-group-label">${label}</div>
          <div class="regimen-group-count">${drugs.length} drug${drugs.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="drug-rows">
          ${drugs.map(drug => this.renderDrugRow(drug)).join('')}
        </div>
      </div>
    `;
  }

  renderDrugRow(drug) {
    const doseStr = drug.dose ? `${drug.dose} ${drug.unit || ''}`.trim() : '';
    const doseDisplay = doseStr ? `<span class="drug-dose-badge">💊 ${this.escape(doseStr)}</span>` : '';

    const metaPills = [];
    if (drug.route && drug.route !== 'oral') {
      metaPills.push(`<span class="drug-meta-pill pill-route">🔹 ${this.escape(drug.route)}</span>`);
    } else if (drug.route === 'oral') {
      metaPills.push(`<span class="drug-meta-pill pill-route">💊 oral</span>`);
    }
    if (drug.frequency) {
      metaPills.push(`<span class="drug-meta-pill pill-freq">🕐 ${this.escape(drug.frequency)}</span>`);
    }
    if (drug.duration) {
      metaPills.push(`<span class="drug-meta-pill pill-dur">📅 ${this.escape(drug.duration)}</span>`);
    }

    const copyText = `${drug.drug} ${doseStr} ${drug.route || ''} ${drug.frequency || ''} ${drug.duration || ''}`.trim();

    return `
      <div class="drug-row">
        <div class="drug-row-icon">💊</div>
        <div class="drug-row-main">
          <div class="drug-name-text">${this.escape(drug.drug)}</div>
          <div>
            ${doseDisplay}
          </div>
          ${metaPills.length ? `<div class="drug-meta-row">${metaPills.join('')}</div>` : ''}
          ${drug.context ? `<div class="drug-row-context">${this.escape(drug.context.substring(0, 150))}</div>` : ''}
        </div>
        <div class="drug-row-actions">
          <button class="drug-copy-btn" onclick="dispensary.copyDrug('${this.escape(copyText).replace(/'/g, "\\'")}')">📋 Copy</button>
        </div>
      </div>
    `;
  }

  // ── Render for search term (multiple results) ─────────────────────
  renderForTerm(query) {
    const results = this.search(query);
    if (!results || results.length === 0) {
      this.showNoResults(query);
      return;
    }

    this.currentResults = results;
    this.currentTabIdx = 0;

    // Show first result (or first with drug data)
    const bestIdx = results.findIndex(r => r.hasData);
    this.currentTabIdx = bestIdx >= 0 ? bestIdx : 0;

    this.renderForDisease(results[this.currentTabIdx].disease.id, this.currentTabIdx);
  }

  showNoResults(query) {
    const resultsEl = document.getElementById('disp-results');
    const landingEl = document.getElementById('disp-landing');
    if (landingEl) landingEl.style.display = 'none';
    resultsEl.innerHTML = `
      <div class="disp-no-drugs" style="padding: 60px 20px">
        <div class="disp-no-drugs-icon">🔍</div>
        <p style="font-size:1rem; font-weight:600; color:var(--text-primary)">No results for "${this.escape(query)}"</p>
        <p style="margin-top:8px">Try a different disease name, or use Disease Search for broader results.</p>
        <button onclick="app.navigate('search')" style="margin-top:20px; padding:10px 24px; background:var(--grad-brand); border-radius:50px; color:white; font-weight:600; cursor:pointer">
          Go to Disease Search →
        </button>
      </div>
    `;
  }

  // ── Copy to clipboard ────────────────────────────────────────────
  copyDrug(text) {
    navigator.clipboard.writeText(text).then(() => {
      app.showToast('✅ Copied: ' + text.substring(0, 50));
    }).catch(() => {
      app.showToast('Copy failed — please copy manually');
    });
  }

  // ── Print prescription ───────────────────────────────────────────
  printPrescription(diseaseId) {
    const disease = this.diseases.find(d => d.id === diseaseId);
    const entry = this.data[diseaseId];
    if (!disease || !entry) return;

    const groups = this.groupRegimens(entry.regimens);

    const printWindow = window.open('', '_blank', 'width=800,height=700');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Drug Treatment — ${disease.name}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a202c; padding: 30px; }
          .header { border-bottom: 3px solid #0d9488; padding-bottom: 16px; margin-bottom: 24px; }
          .logo { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
          .logo-title { font-size: 1.4rem; font-weight: 800; color: #0d9488; }
          .logo-sub { font-size: 0.75rem; color: #64748b; }
          .disease-title { font-size: 1.5rem; font-weight: 800; color: #1a202c; margin-bottom: 4px; }
          .disease-meta { font-size: 0.8rem; color: #64748b; }
          .group { margin-bottom: 24px; break-inside: avoid; }
          .group-title { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 0; border-bottom: 2px solid #e2e8f0; margin-bottom: 12px; color: #475569; }
          .drug-item { display: flex; gap: 16px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; align-items: flex-start; }
          .drug-num { font-weight: 800; color: #0d9488; min-width: 24px; }
          .drug-name { font-size: 0.95rem; font-weight: 700; color: #1a202c; font-family: 'Courier New', monospace; }
          .drug-dose { display: inline-block; padding: 2px 8px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 4px; font-size: 0.82rem; font-weight: 700; margin: 4px 0; color: #92400e; font-family: 'Courier New', monospace; }
          .drug-details { font-size: 0.78rem; color: #475569; margin-top: 4px; }
          .drug-context { font-size: 0.72rem; color: #94a3b8; font-style: italic; margin-top: 4px; }
          .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 0.7rem; color: #94a3b8; }
          @media print { body { padding: 15px; } button { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">
            <div>
              <div class="logo-title">VitaNova</div>
              <div class="logo-sub">Uganda Clinical Guidelines 2023 · Ministry of Health</div>
            </div>
          </div>
          <div class="disease-title">${disease.name}</div>
          <div class="disease-meta">Section ${disease.section} · ${disease.chapter} · Printed: ${new Date().toLocaleDateString('en-UG')}</div>
        </div>

        ${Object.entries(groups).map(([lt, groupData]) => {
          if (!groupData.drugs || groupData.drugs.length === 0) return '';
          return `
            <div class="group">
              <div class="group-title">${groupData.label}</div>
              ${groupData.drugs.map((drug, i) => `
                <div class="drug-item">
                  <div class="drug-num">${i + 1}</div>
                  <div>
                    <div class="drug-name">${drug.drug}</div>
                    ${drug.dose ? `<div class="drug-dose">${drug.dose} ${drug.unit || ''}</div>` : ''}
                    <div class="drug-details">
                      ${drug.route ? `Route: ${drug.route} ` : ''}
                      ${drug.frequency ? `| ${drug.frequency} ` : ''}
                      ${drug.duration ? `| ${drug.duration}` : ''}
                    </div>
                    ${drug.context ? `<div class="drug-context">${drug.context.substring(0, 150)}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        }).join('')}

        <div class="footer">
          ⚠️ Clinical Disclaimer: Always verify dosages, apply clinical judgement, and check patient-specific contraindications. Source: Uganda Clinical Guidelines 2023, Ministry of Health.
        </div>
        <script>window.onload = function() { window.print(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  // ── Bind events ──────────────────────────────────────────────────
  bindEvents() {
    const input = document.getElementById('dispensary-search-input');
    const suggestionsEl = document.getElementById('disp-suggestions');
    const clearBtn = document.getElementById('dispensary-search-clear');

    if (!input) return;

    let debounceTimer;

    input.addEventListener('input', (e) => {
      const q = e.target.value.trim();

      if (clearBtn) {
        clearBtn.classList.toggle('hidden', q.length === 0);
      }

      // Show suggestions as-you-type
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (q.length < 2) {
          suggestionsEl.classList.add('hidden');
          return;
        }
        const suggestions = searchEngine.search(q, { maxResults: 6 });
        if (suggestions.length === 0) {
          suggestionsEl.classList.add('hidden');
          return;
        }
        suggestionsEl.classList.remove('hidden');
        suggestionsEl.innerHTML = suggestions.map(d => {
          const hasData = !!this.data[d.id];
          return `
            <div class="disp-suggestion-item" onclick="dispensary.selectSuggestion('${d.id}', '${this.escape(d.name).replace(/'/g, "\\'")}')">
              <span class="disp-sugg-icon">${d.chapter_icon || '💊'}</span>
              <div>
                <div class="disp-sugg-name">${this.escape(d.name)}</div>
                <div class="disp-sugg-chapter">${this.escape(d.chapter)}${hasData ? ' · ✅ Drug data available' : ''}</div>
              </div>
              <span class="disp-sugg-arrow">→</span>
            </div>
          `;
        }).join('');
      }, 200);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        suggestionsEl.classList.add('hidden');
        this.renderForTerm(input.value.trim());
      }
      if (e.key === 'Escape') {
        suggestionsEl.classList.add('hidden');
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.add('hidden');
        suggestionsEl.classList.add('hidden');
        const landingEl = document.getElementById('disp-landing');
        const resultsEl = document.getElementById('disp-results');
        if (landingEl) landingEl.style.display = '';
        if (resultsEl) resultsEl.innerHTML = `<div class="disp-landing" id="disp-landing">
          <div class="disp-landing-icon">💊</div>
          <h3>Search a Disease to View Drug Treatment</h3>
          <p>Get specific drugs, dosages, routes, frequency &amp; regimens as per Uganda Clinical Guidelines 2023</p>
        </div>`;
        input.focus();
      });
    }

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#dispensary-search-input') && !e.target.closest('#disp-suggestions')) {
        suggestionsEl.classList.add('hidden');
      }
    });
  }

  selectSuggestion(diseaseId, name) {
    const input = document.getElementById('dispensary-search-input');
    const suggestionsEl = document.getElementById('disp-suggestions');
    if (input) input.value = name;
    if (suggestionsEl) suggestionsEl.classList.add('hidden');

    const disease = this.diseases.find(d => d.id === diseaseId);
    if (disease) {
      this.currentResults = [{ disease, regimens: [], hasData: !!this.data[diseaseId] }];
      this.currentTabIdx = 0;
      this.renderForDisease(diseaseId, 0);
    }
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.dispensary = new Dispensary();
