/**
 * VitaNova — search.js
 * Fast in-memory fuzzy search engine for diseases
 */

class DiseaseSearchEngine {
  constructor() {
    this.diseases = [];
    this.searchIndex = []; // lightweight index
    this.ready = false;
  }

  load(diseases) {
    this.diseases = diseases;
    // Build lightweight search index
    this.searchIndex = diseases.map(d => ({
      id: d.id,
      searchText: [
        d.name,
        d.section,
        d.chapter,
        ...(d.symptoms || []),
        ...(d.signs || []),
        d.definition || '',
      ].join(' ').toLowerCase(),
      name: d.name,
      section: d.section,
      chapter: d.chapter,
      chapter_num: d.chapter_num,
      chapter_icon: d.chapter_icon,
      chapter_color: d.chapter_color,
      priority: d.priority || '',
      symptoms_count: (d.symptoms || []).length,
    }));
    this.ready = true;
    console.log(`Search engine loaded: ${this.diseases.length} diseases`);
  }

  /**
   * Main search function — returns ranked results
   */
  search(query, options = {}) {
    if (!this.ready || !query || query.trim().length < 2) return [];

    const q = query.toLowerCase().trim();
    const words = q.split(/\s+/).filter(w => w.length > 1);
    const { filter = 'all', maxResults = 30 } = options;

    const scored = [];

    for (const item of this.searchIndex) {
      // Apply filter
      if (filter === 'women' && item.priority !== 'women') continue;
      if (filter === 'children' && item.priority !== 'children') continue;
      if (filter === 'emergency' && item.chapter_num !== '1' && item.chapter_num !== '17') continue;

      let score = 0;
      const nameLower = item.name.toLowerCase();
      const textLower = item.searchText;

      // Exact name match — highest priority
      if (nameLower === q) { score += 100; }
      // Name starts with query
      else if (nameLower.startsWith(q)) { score += 80; }
      // Name contains query as whole word
      else if (new RegExp(`\\b${this._escapeRegex(q)}\\b`).test(nameLower)) { score += 60; }
      // Name contains query
      else if (nameLower.includes(q)) { score += 40; }

      // Section number exact match
      if (item.section === q) score += 50;

      // All words present in name
      if (words.length > 1) {
        const allInName = words.every(w => nameLower.includes(w));
        if (allInName) score += 30;
      }

      // Words found in full text
      const wordsInText = words.filter(w => textLower.includes(w)).length;
      score += wordsInText * 5;

      // Chapter name match
      if (item.chapter.toLowerCase().includes(q)) score += 10;

      if (score > 0) {
        scored.push({ item, score });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return full disease objects for top results
    return scored.slice(0, maxResults).map(s => {
      const disease = this.diseases.find(d => d.id === s.item.id);
      return { ...disease, _score: s.score };
    });
  }

  /**
   * Get diseases by chapter
   */
  getByChapter(chapterNum) {
    return this.diseases.filter(d => d.chapter_num === String(chapterNum));
  }

  /**
   * Get diseases by priority tag
   */
  getByPriority(priority) {
    return this.diseases.filter(d => d.priority === priority);
  }

  /**
   * Get all unique drugs mentioned across diseases
   */
  getAllDrugs() {
    const drugMap = {};
    for (const d of this.diseases) {
      for (const med of (d.medications || [])) {
        const name = med.drug.trim();
        if (!drugMap[name]) {
          drugMap[name] = { name, dose: med.dose, diseases: [] };
        }
        drugMap[name].diseases.push({ id: d.id, name: d.name });
      }
    }
    return Object.values(drugMap).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Search drugs
   */
  searchDrugs(query) {
    const allDrugs = this.getAllDrugs();
    if (!query || query.trim().length < 2) return allDrugs.slice(0, 50);
    const q = query.toLowerCase();
    return allDrugs.filter(d => d.name.toLowerCase().includes(q)).slice(0, 50);
  }

  _escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

window.searchEngine = new DiseaseSearchEngine();
