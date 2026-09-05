"""
Uganda Clinical Guidelines 2023 - Full Disease Database Builder
Creates structured JSON from the PDF content for VitaNova app.
"""
import pymupdf
import json
import re
import os

doc = pymupdf.open('Uganda Clinical Guidelines 2023 (2).pdf')
all_pages_text = [page.get_text() for page in doc]
print(f"Loaded {len(all_pages_text)} pages")

# ─── Load sections index ───────────────────────────────────────────────────────
with open('sections_found.json', 'r', encoding='utf-8') as f:
    sections = json.load(f)
print(f"Loaded {len(sections)} sections")

# ─── Chapter metadata ──────────────────────────────────────────────────────────
CHAPTERS = {
    '1': {'name': 'General Principles & Emergencies', 'icon': '🚨', 'color': '#ef4444'},
    '2': {'name': 'Communicable Diseases', 'icon': '🦠', 'color': '#f97316'},
    '3': {'name': 'HIV/AIDS & STIs', 'icon': '🔬', 'color': '#a855f7'},
    '4': {'name': 'Cardiovascular Diseases', 'icon': '❤️', 'color': '#ec4899'},
    '5': {'name': 'Respiratory Diseases', 'icon': '🫁', 'color': '#06b6d4'},
    '6': {'name': 'Gastrointestinal Diseases', 'icon': '🫃', 'color': '#84cc16'},
    '7': {'name': 'Renal & Urinary Diseases', 'icon': '🫘', 'color': '#3b82f6'},
    '8': {'name': 'Endocrine & Metabolic Diseases', 'icon': '⚗️', 'color': '#f59e0b'},
    '9': {'name': 'Mental, Neurological & Substance Use', 'icon': '🧠', 'color': '#8b5cf6'},
    '10': {'name': 'Musculoskeletal & Connective Tissue', 'icon': '🦴', 'color': '#64748b'},
    '11': {'name': 'Eye Diseases', 'icon': '👁️', 'color': '#0ea5e9'},
    '12': {'name': 'Ear, Nose & Throat', 'icon': '👂', 'color': '#10b981'},
    '13': {'name': 'Skin & Soft Tissue Disorders', 'icon': '🩹', 'color': '#f97316'},
    '14': {'name': 'Blood & Lymph Node Disorders', 'icon': '🩸', 'color': '#ef4444'},
    '15': {'name': 'Cancers', 'icon': '🎗️', 'color': '#7c3aed'},
    '16': {'name': "Reproductive Health (Women's)", 'icon': '🤰', 'color': '#ec4899', 'priority': 'women'},
    '17': {'name': 'Emergency & Trauma', 'icon': '🚑', 'color': '#ef4444'},
    '18': {'name': "Paediatrics (Children's Health)", 'icon': '👶', 'color': '#38bdf8', 'priority': 'children'},
    '19': {'name': 'Neonatology', 'icon': '🍼', 'color': '#6ee7b7', 'priority': 'children'},
    '20': {'name': 'Nutrition', 'icon': '🥗', 'color': '#84cc16'},
    '21': {'name': 'Surgical Conditions', 'icon': '🔪', 'color': '#94a3b8'},
    '22': {'name': 'Anaesthesia & Pain Management', 'icon': '💊', 'color': '#64748b'},
    '23': {'name': 'Oral & Dental Health', 'icon': '🦷', 'color': '#e2e8f0'},
    '24': {'name': 'Palliative Care', 'icon': '🕊️', 'color': '#a78bfa'},
}

def get_chapter_num(section_num):
    return section_num.split('.')[0]

def clean_text(text):
    """Clean extracted text."""
    text = re.sub(r'\r\n', '\n', text)
    text = re.sub(r'\r', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'Uganda Clinical Guidelines 2023', '', text)
    text = re.sub(r'^\s*\d+\s*$', '', text, flags=re.MULTILINE)  # Remove lone page numbers
    return text.strip()

def extract_list_items(text, keywords):
    """Extract bullet/numbered list items after a keyword."""
    items = []
    for kw in keywords:
        pattern = rf'(?:{kw})[:\s]*\n((?:[\s]*[-•●▪*\d+\.]\s*.+\n?)+)'
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            raw = m.group(1)
            for line in raw.split('\n'):
                cleaned = re.sub(r'^[\s\-•●▪*\d+\.]+', '', line).strip()
                if cleaned and len(cleaned) > 3:
                    items.append(cleaned)
            break
    return items[:30]  # cap at 30 items

def extract_section_block(text, keywords, end_keywords=None):
    """Extract a block of text after a keyword heading."""
    end_pat = r'(?=' + '|'.join(end_keywords) + r')' if end_keywords else r'(?=\n[A-Z][A-Z\s]{5,}\n|\n\d+\.\d+)'
    for kw in keywords:
        pattern = rf'(?:^|\n)(?:{kw})[:\s]*\n(.*?){end_pat}'
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if m:
            return clean_text(m.group(1))[:3000]
    return ''

def parse_disease_content(raw_text, section_num, section_name):
    """Parse a disease's raw text into structured data."""
    text = clean_text(raw_text)
    
    # Symptom/sign keywords
    symp_kws = ['Symptoms?', 'Clinical [Ff]eatures?', 'Clinical [Pp]resentation', 
                 'Signs? [Aa]nd [Ss]ymptoms?', 'Presenting [Cc]omplaints?', 'History',
                 'Complaints?']
    sign_kws = ['Signs?', 'Physical [Ee]xamination', 'Examination [Ff]indings?', 'On [Ee]xamination']
    diag_kws = ['Diagnosis', 'Diagnostic [Cc]riteria', 'Diagnostic [Aa]pproach', 'How to [Dd]iagnose']
    inv_kws = ['Investigations?', 'Laboratory', 'Lab [Tt]ests?', 'Work[ -]?up', 'Investigations? [Aa]nd [Dd]iagnosis']
    treat_kws = ['Treatment', 'Management', 'Therapeutic [Mm]easures', 'Pharmacological', 'Non-?[Pp]harmacological']
    ref_kws = ['Referral', 'When [Tt]o [Rr]efer', '[Cc]riteria [Ff]or [Rr]eferral']
    prev_kws = ['Prevention', 'Prophylaxis', '[Cc]ontrol [Mm]easures', '[Hh]ealth [Ee]ducation']
    
    symptoms = extract_list_items(text, symp_kws)
    signs = extract_list_items(text, sign_kws)
    
    # If no structured symptoms found, try inline extraction
    if not symptoms:
        # Look for comma/semicolon separated list after symptom keyword
        for kw in ['symptoms', 'presents with', 'characterised by', 'may present']:
            m = re.search(rf'{kw}[:\s]+([^.\n]+[,;][^.\n]+)', text, re.IGNORECASE)
            if m:
                raw = m.group(1)
                symptoms = [s.strip() for s in re.split(r'[,;]', raw) if s.strip() and len(s.strip()) > 3]
                if symptoms:
                    break
    
    # Extract definition - first substantial paragraph
    definition = ''
    paras = [p.strip() for p in text.split('\n\n') if len(p.strip()) > 50]
    if paras:
        first = paras[0]
        # Skip if it looks like a heading
        if not re.match(r'^[A-Z\s]{10,}$', first[:50]):
            definition = first[:800]
    
    # Get treatment block  
    treatment_raw = extract_section_block(text, treat_kws)
    
    # Get medications (look for drug names and dosages)
    medications = []
    drug_patterns = [
        r'(?:Give|Prescribe|Administer|Start|Use)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml|units?|IU)(?:/(?:kg|dose|day|m2))?)',
        r'([A-Za-z]+(?:mycin|cillin|oxacin|azole|vir|ide|ine|ate|ol|en|um|ium)(?:\s+[A-Za-z]+)?)\s+(\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml|units?|IU)(?:[/ ](?:kg|dose|day|m2|\d+hrs?))?)',
    ]
    seen_drugs = set()
    for pat in drug_patterns:
        for m in re.finditer(pat, text, re.IGNORECASE):
            drug_name = m.group(1).strip()
            dose = m.group(2).strip() if m.lastindex >= 2 else ''
            key = drug_name.lower()
            if key not in seen_drugs and len(drug_name) > 3:
                seen_drugs.add(key)
                medications.append({'drug': drug_name, 'dose': dose})
            if len(medications) >= 20:
                break
    
    referral = extract_section_block(text, ref_kws)
    prevention = extract_section_block(text, prev_kws)
    
    # Special populations
    preg_match = re.search(r'(?:Pregnant|Pregnancy|Antenatal|Postnatal|In [Pp]regnancy)[:\s\n](.{50,1000}?)(?=\n\n|\n[A-Z])', text, re.DOTALL | re.IGNORECASE)
    preg_content = preg_match.group(1).strip()[:500] if preg_match else ''
    
    child_match = re.search(r'(?:Children|Paediatric|Infant|Neonate|Child[:\s\n])(.{50,1000}?)(?=\n\n|\n[A-Z])', text, re.DOTALL | re.IGNORECASE)
    child_content = child_match.group(1).strip()[:500] if child_match else ''
    
    hiv_match = re.search(r'(?:HIV|AIDS|Immunocompromised)[:\s\n](.{50,800}?)(?=\n\n|\n[A-Z])', text, re.DOTALL | re.IGNORECASE)
    hiv_content = hiv_match.group(1).strip()[:400] if hiv_match else ''
    
    chapter_num = get_chapter_num(section_num)
    chapter_info = CHAPTERS.get(chapter_num, {'name': 'Other', 'icon': '📋', 'color': '#64748b'})
    
    return {
        'id': f'dis_{section_num.replace(".", "_")}',
        'section': section_num,
        'name': section_name,
        'chapter_num': chapter_num,
        'chapter': chapter_info.get('name', 'Other'),
        'chapter_icon': chapter_info.get('icon', '📋'),
        'chapter_color': chapter_info.get('color', '#64748b'),
        'priority': chapter_info.get('priority', ''),
        'definition': definition,
        'symptoms': symptoms,
        'signs': signs,
        'investigations': extract_section_block(text, inv_kws),
        'treatment': treatment_raw,
        'medications': medications,
        'referral': referral,
        'prevention': prevention,
        'pregnancy_notes': preg_content,
        'children_notes': child_content,
        'hiv_notes': hiv_content,
        'full_content': text[:8000],
    }

# ─── Main extraction loop ──────────────────────────────────────────────────────
print("\nExtracting full disease database...")
diseases_db = []

for idx, section in enumerate(sections):
    sec_num = section['section']
    sec_name = section['name']
    start_page = section['page'] - 1  # 0-indexed
    
    # Find end page (next section's page or +15 pages max)
    end_page = start_page + 15
    if idx + 1 < len(sections):
        end_page = min(sections[idx + 1]['page'] - 1, start_page + 20)
    end_page = min(end_page, len(all_pages_text))
    
    # Collect text for this section
    section_text = '\n'.join(all_pages_text[start_page:end_page])
    
    # Find the section heading in the text and extract from there
    heading_search = re.search(
        rf'{re.escape(sec_num)}\s+{re.escape(sec_name[:20])}',
        section_text, re.IGNORECASE
    )
    if heading_search:
        section_text = section_text[heading_search.start():]
    
    disease_data = parse_disease_content(section_text, sec_num, sec_name)
    diseases_db.append(disease_data)
    
    if (idx + 1) % 50 == 0:
        print(f"  Processed {idx + 1}/{len(sections)} sections...")

print(f"\nTotal diseases/conditions: {len(diseases_db)}")

# ─── Build symptom → disease mapping ──────────────────────────────────────────
print("Building symptom -> disease map...")
symptom_map = {}  # symptom_keyword → [disease_ids]

for disease in diseases_db:
    all_symptoms = disease['symptoms'] + disease['signs']
    
    # Also extract symptom keywords from definition/full_content
    symp_keywords_raw = ' '.join(all_symptoms) + ' ' + disease.get('definition', '')[:500]
    
    # Extract individual symptom words/phrases
    keyword_patterns = [
        r'\b(fever|pain|swelling|headache|vomiting|diarrhoea|cough|breathlessness|dyspnoea|chest pain|abdominal pain|nausea|rash|jaundice|anaemia|fatigue|weakness|confusion|seizure|convulsion|bleeding|discharge|burning|itching|oedema|weight loss|night sweats|pallor|cyanosis|shock|unconscious|collapse)\b'
    ]
    
    for pat in keyword_patterns:
        for m in re.finditer(pat, symp_keywords_raw, re.IGNORECASE):
            kw = m.group(1).lower()
            if kw not in symptom_map:
                symptom_map[kw] = []
            if disease['id'] not in symptom_map[kw]:
                symptom_map[kw].append(disease['id'])
    
    # Add from explicit symptoms list
    for sym in all_symptoms[:15]:
        # Extract key words from each symptom
        words = re.findall(r'\b[a-z]{4,}\b', sym.lower())
        for word in words:
            if word not in {'with', 'that', 'this', 'from', 'have', 'been', 'will', 'more', 'less', 'than', 'when'}:
                if word not in symptom_map:
                    symptom_map[word] = []
                if disease['id'] not in symptom_map[word]:
                    symptom_map[word].append(disease['id'])

print(f"Symptom map entries: {len(symptom_map)}")

# ─── Save all data ─────────────────────────────────────────────────────────────
os.makedirs('vitanova-app/data', exist_ok=True)

with open('vitanova-app/data/diseases.json', 'w', encoding='utf-8') as f:
    json.dump(diseases_db, f, ensure_ascii=False, separators=(',', ':'))
print(f"diseases.json: {os.path.getsize('vitanova-app/data/diseases.json'):,} bytes")

with open('vitanova-app/data/symptom_map.json', 'w', encoding='utf-8') as f:
    json.dump(symptom_map, f, ensure_ascii=False, separators=(',', ':'))
print(f"symptom_map.json: {os.path.getsize('vitanova-app/data/symptom_map.json'):,} bytes")

with open('vitanova-app/data/chapters.json', 'w', encoding='utf-8') as f:
    json.dump(CHAPTERS, f, ensure_ascii=False, indent=2)
print(f"chapters.json written")

# ─── Summary ───────────────────────────────────────────────────────────────────
print("\n=== SUMMARY ===")
for chapter_num, chapter_info in CHAPTERS.items():
    count = sum(1 for d in diseases_db if d['chapter_num'] == chapter_num)
    if count > 0:
        print(f"  Chapter {chapter_num}: {chapter_info['name']} — {count} conditions")

print("\nAll data files saved to vitanova-app/data/")
