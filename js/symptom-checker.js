/**
 * VitaNova — symptom-checker.js
 * Differential diagnosis engine based on symptom matching
 */

class SymptomChecker {
  constructor() {
    this.symptoms = [];
    this.ageGroup = 'adult';
    this.sex = 'any';
    this.pregnant = false;
    this.symptomMap = {};  // keyword → [disease_ids]
    this.allDiseases = [];

    // Common symptom suggestions
    this.commonSymptoms = [
      'Fever', 'Headache', 'Cough', 'Vomiting', 'Diarrhoea',
      'Abdominal pain', 'Chest pain', 'Breathlessness', 'Fatigue',
      'Rash', 'Jaundice', 'Pallor', 'Weight loss', 'Night sweats',
      'Swelling', 'Convulsions', 'Confusion', 'Bleeding', 'Discharge',
      'Joint pain', 'Back pain', 'Sore throat', 'Ear pain', 'Eye redness',
      'Difficulty swallowing', 'Burning urination', 'Anaemia', 'Oedema',
      'Loss of consciousness', 'Neck stiffness', 'Photophobia', 'Shock'
    ];
  }

  loadData(symptomMap, diseases) {
    this.symptomMap = symptomMap;
    this.allDiseases = diseases;
    console.log('Symptom checker loaded:', Object.keys(symptomMap).length, 'symptom keywords');
  }

  addSymptom(symptom) {
    const s = symptom.trim();
    if (!s || this.symptoms.includes(s)) return false;
    this.symptoms.push(s);
    return true;
  }

  removeSymptom(symptom) {
    this.symptoms = this.symptoms.filter(s => s !== symptom);
  }

  reset() {
    this.symptoms = [];
    this.ageGroup = 'adult';
    this.sex = 'any';
    this.pregnant = false;
  }

  /**
   * Main analysis — returns ranked differential diagnoses
   */
  analyze() {
    if (this.symptoms.length === 0) return [];

    const diseaseScores = {};  // disease_id → { score, matchedSymptoms }

    // For each entered symptom, find matching diseases
    for (const enteredSymptom of this.symptoms) {
      const sympWords = this._extractKeywords(enteredSymptom);

      for (const kw of sympWords) {
        // Direct key lookup
        const directMatch = this.symptomMap[kw] || [];
        for (const id of directMatch) {
          this._addScore(diseaseScores, id, 3, enteredSymptom);
        }

        // Partial key matching
        for (const [mapKey, ids] of Object.entries(this.symptomMap)) {
          if (mapKey !== kw && (mapKey.includes(kw) || kw.includes(mapKey))) {
            for (const id of ids) {
              this._addScore(diseaseScores, id, 2, enteredSymptom);
            }
          }
        }
      }

      // Also do a direct symptom text search against all disease symptoms
      const sympLower = enteredSymptom.toLowerCase();
      for (const disease of this.allDiseases) {
        const allSymptoms = [...(disease.symptoms || []), ...(disease.signs || [])];
        for (const ds of allSymptoms) {
          if (ds.toLowerCase().includes(sympLower) || sympLower.includes(ds.toLowerCase().substring(0, 5))) {
            this._addScore(diseaseScores, disease.id, 4, enteredSymptom);
          }
        }
        // Check definition and full_content
        const fullText = ((disease.definition || '') + ' ' + (disease.full_content || '')).toLowerCase();
        if (fullText.includes(sympLower)) {
          this._addScore(diseaseScores, disease.id, 1, enteredSymptom);
        }
      }
    }

    // Convert to array and apply demographic filters
    let results = Object.entries(diseaseScores).map(([id, data]) => {
      const disease = this.allDiseases.find(d => d.id === id);
      if (!disease) return null;
      return {
        disease,
        score: data.score,
        matchedSymptoms: [...new Set(data.matchedSymptoms)],
        matchPercent: Math.min(100, Math.round((data.score / (this.symptoms.length * 5)) * 100)),
      };
    }).filter(Boolean);

    // Demographic boosting
    results = results.map(r => {
      let boostScore = r.score;

      // If children selected, boost paediatrics/neonatology
      if (this.ageGroup === 'infant' || this.ageGroup === 'child' || this.ageGroup === 'neonate') {
        if (r.disease.chapter_num === '18' || r.disease.chapter_num === '19' || r.disease.priority === 'children') {
          boostScore *= 1.5;
        }
        // Deprioritize chapters not relevant to children
        if (['16'].includes(r.disease.chapter_num)) boostScore *= 0.5;
      }

      // If female / pregnant
      if (this.sex === 'female' || this.pregnant) {
        if (r.disease.chapter_num === '16' || r.disease.priority === 'women') boostScore *= 1.4;
        if (r.disease.pregnancy_notes && this.pregnant) boostScore *= 1.2;
      }

      return { ...r, score: boostScore };
    });

    // Sort and return top 10
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 10);
  }

  _addScore(scores, id, points, symptom) {
    if (!scores[id]) scores[id] = { score: 0, matchedSymptoms: [] };
    scores[id].score += points;
    if (!scores[id].matchedSymptoms.includes(symptom)) {
      scores[id].matchedSymptoms.push(symptom);
    }
  }

  _extractKeywords(text) {
    const words = text.toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !this._isStopWord(w));
    // Also add bigrams
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(words[i] + ' ' + words[i + 1]);
    }
    return [...words, ...bigrams];
  }

  _isStopWord(w) {
    return ['with', 'that', 'this', 'from', 'have', 'been', 'will', 'more', 'less',
            'than', 'when', 'which', 'some', 'such', 'upon', 'after', 'about'].includes(w);
  }
}

window.symptomChecker = new SymptomChecker();
