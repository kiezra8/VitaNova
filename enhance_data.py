"""
Enhanced data processor - improves symptom extraction from full_content
and rebuilds symptom_map with richer data
"""
import json, re, os

with open('vitanova-app/data/diseases.json', 'r', encoding='utf-8') as f:
    diseases = json.load(f)

print('Processing {} diseases...'.format(len(diseases)))

def clean_bullet(text):
    """Remove bullet/list markers and clean text."""
    text = re.sub(r'^[\s\-•●▪*\u2022\u2023\u25cf\ufffd\x83\x84]+', '', text)
    text = text.strip()
    return text

def extract_symptoms_from_text(text):
    """More robust symptom extraction."""
    symptoms = []
    if not text:
        return symptoms

    # Pattern 1: Look for explicit symptom sections
    symp_section_patterns = [
        r'(?:Signs?\s+and\s+[Ss]ymptoms?|Clinical\s+[Ff]eatures?|Clinical\s+[Pp]resentation|Symptoms?|Presenting\s+[Cc]omplaints?|History)[:\s]*\n((?:[\s]*[\-•●▪*\u2022\ufffd\x83\x84]\s*.+\n?)+)',
        r'(?:The\s+patient\s+(?:may\s+)?(?:present|complain|experience)s?\s+with)[:\s]+([^\n]+(?:\n[\-•]\s*[^\n]+)*)',
    ]
    for pat in symp_section_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            raw = m.group(1)
            for line in raw.split('\n'):
                cleaned = clean_bullet(line)
                if cleaned and 4 < len(cleaned) < 200:
                    symptoms.append(cleaned)
            if symptoms:
                break

    # Pattern 2: Inline "may present with X, Y, Z"
    if not symptoms:
        for pat in [
            r'(?:presents?\s+with|characterised\s+by|including)[:\s]+([^.]{20,300})',
            r'(?:symptoms?\s+include|features?\s+include)[:\s]+([^.]{20,300})',
        ]:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                raw = m.group(1)
                parts = re.split(r'[,;]\s*', raw)
                for p in parts:
                    c = clean_bullet(p.strip())
                    if c and 3 < len(c) < 100:
                        symptoms.append(c)
                if symptoms:
                    break

    # Clean up
    clean = []
    seen = set()
    for s in symptoms:
        s = clean_bullet(s)
        s = re.sub(r'\s+', ' ', s).strip()
        key = s.lower()[:40]
        if key not in seen and len(s) > 3 and len(s) < 200:
            # Filter out garbage
            if not re.match(r'^[\d\.\-\s]+$', s):
                clean.append(s)
                seen.add(key)
    return clean[:25]

def extract_treatment_from_text(text):
    """Extract treatment/management section."""
    if not text:
        return ''
    patterns = [
        r'(?:Treatment|Management|Therapeutic\s+Approach)[:\s]*\n((?:.|\n){50,3000}?)(?=\n[A-Z][A-Z\s]{5,}\n|\nReferral|\nPrevention|\Z)',
        r'(?:Pharmacological\s+treatment|Drug\s+[Tt]reatment)[:\s]*\n((?:.|\n){50,2000}?)(?=\n[A-Z][A-Z\s]{5,}\n|\Z)',
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()[:3000]
    return ''

def extract_investigations_from_text(text):
    """Extract investigations/diagnosis section."""
    if not text:
        return ''
    m = re.search(
        r'(?:Investigations?|Laboratory\s+Tests?|Diagnosis|Work[- ]?up)[:\s]*\n((?:.|\n){30,2000}?)(?=\n[A-Z][A-Z\s]{5,}\n|\nTreatment|\nManagement|\Z)',
        text, re.IGNORECASE
    )
    if m:
        return m.group(1).strip()[:2000]
    return ''

def extract_referral_from_text(text):
    """Extract referral criteria."""
    if not text:
        return ''
    m = re.search(
        r'(?:Referral|When\s+to\s+[Rr]efer|Criteria\s+for\s+[Rr]eferral)[:\s]*\n((?:.|\n){20,1000}?)(?=\n[A-Z][A-Z\s]{5,}\n|\Z)',
        text, re.IGNORECASE
    )
    if m:
        return m.group(1).strip()[:1000]
    return ''

def extract_prevention_from_text(text):
    """Extract prevention section."""
    if not text:
        return ''
    m = re.search(
        r'(?:Prevention|Prophylaxis|Health\s+Education)[:\s]*\n((?:.|\n){20,1000}?)(?=\n[A-Z][A-Z\s]{5,}\n|\Z)',
        text, re.IGNORECASE
    )
    if m:
        return m.group(1).strip()[:1000]
    return ''

def extract_definition_from_text(text, name):
    """Better definition extraction."""
    if not text:
        return ''
    # Skip section heading
    # Try to find a paragraph that defines the disease
    # Pattern: text after heading that looks like a definition
    # Remove section number from start
    clean_text = re.sub(r'^\s*\d+\.\d+(?:\.\d+)?\s+\S.{0,100}\n', '', text, count=1)

    # Look for "X is a..." or "X refers to..." patterns
    for pat in [
        rf'(?:{re.escape(name[:15])}[^.]*?(?:is|refers|defined|characterized)[^.]+\.)',
        r'^([A-Z][^.]{30,300}\.)',
    ]:
        m = re.search(pat, clean_text, re.IGNORECASE | re.MULTILINE)
        if m:
            return m.group(0)[:600]

    # Just get first substantial paragraph
    paras = [p.strip() for p in clean_text.split('\n\n') if len(p.strip()) > 60]
    for p in paras:
        if not re.match(r'^[A-Z\s]{10,}$', p[:50]):  # Skip all-caps headings
            return p[:600]
    return ''

# ── Process each disease ───────────────────────────────────────────────────────
updated_count = 0
for d in diseases:
    full = d.get('full_content', '')
    changed = False

    # Re-extract symptoms if missing or poor quality
    current_syms = d.get('symptoms', [])
    if len(current_syms) < 2:
        new_syms = extract_symptoms_from_text(full)
        if new_syms:
            d['symptoms'] = new_syms
            changed = True

    # Re-extract definition if missing
    if len(d.get('definition', '')) < 30:
        new_def = extract_definition_from_text(full, d.get('name', ''))
        if new_def:
            d['definition'] = new_def
            changed = True

    # Re-extract treatment if missing
    if len(d.get('treatment', '')) < 20:
        new_treat = extract_treatment_from_text(full)
        if new_treat:
            d['treatment'] = new_treat
            changed = True

    # Re-extract investigations if missing
    if len(d.get('investigations', '')) < 10:
        new_inv = extract_investigations_from_text(full)
        if new_inv:
            d['investigations'] = new_inv
            changed = True

    # Re-extract referral if missing
    if len(d.get('referral', '')) < 5:
        new_ref = extract_referral_from_text(full)
        if new_ref:
            d['referral'] = new_ref
            changed = True

    # Re-extract prevention if missing
    if len(d.get('prevention', '')) < 5:
        new_prev = extract_prevention_from_text(full)
        if new_prev:
            d['prevention'] = new_prev
            changed = True

    if changed:
        updated_count += 1

print('Updated {} diseases'.format(updated_count))

# ── Rebuild symptom map ────────────────────────────────────────────────────────
print('Rebuilding symptom map...')
symptom_map = {}

# Common medical symptoms/signs
COMMON_SYMPTOM_KEYWORDS = [
    'fever', 'headache', 'vomiting', 'diarrhoea', 'diarrhea', 'cough', 'chest pain',
    'abdominal pain', 'nausea', 'rash', 'jaundice', 'pallor', 'anaemia', 'anemia',
    'fatigue', 'weakness', 'confusion', 'seizure', 'convulsion', 'bleeding',
    'discharge', 'swelling', 'oedema', 'edema', 'weight loss', 'night sweats',
    'breathlessness', 'dyspnoea', 'dyspnea', 'tachycardia', 'hypotension', 'shock',
    'cyanosis', 'unconscious', 'collapse', 'neck stiffness', 'photophobia',
    'back pain', 'joint pain', 'arthralgia', 'myalgia', 'muscle pain', 'skin lesion',
    'itching', 'pruritus', 'burning', 'dysuria', 'frequency', 'haematuria',
    'hematuria', 'constipation', 'malaise', 'anorexia', 'loss of appetite',
    'sore throat', 'ear pain', 'ear discharge', 'eye redness', 'vision loss',
    'blurred vision', 'dizziness', 'vertigo', 'syncope', 'palpitation',
    'polyuria', 'polydipsia', 'polyphagia', 'tremor', 'paralysis', 'diplopia',
    'haemoptysis', 'hemoptysis', 'haematemesis', 'hematemesis', 'melena',
    'rectal bleeding', 'vaginal discharge', 'vaginal bleeding', 'amenorrhea',
    'dysmenorrhoea', 'infertility', 'erectile dysfunction', 'scrotal swelling',
    'breast mass', 'lymphadenopathy', 'splenomegaly', 'hepatomegaly',
    'ascites', 'periorbital oedema', 'pedal oedema', 'facial swelling',
    'papilledema', 'retinal changes', 'stridor', 'wheeze', 'pleuritic pain',
    'productive cough', 'hemoglobinuria', 'dark urine', 'clay stool', 'dehydration',
    'rigidity', 'guarding', 'rebound tenderness', 'organomegaly', 'cachexia',
    'conjunctival pallor', 'icterus', 'purpura', 'petechiae', 'ecchymosis',
    'spider naevi', 'caput medusa', 'testicular swelling', 'urgency',
    'memory loss', 'dementia', 'psychosis', 'hallucination', 'delusion',
    'anxiety', 'depression', 'insomnia', 'mania', 'mood swings',
]

for disease in diseases:
    did = disease['id']
    all_text = ' '.join([
        disease.get('name', ''),
        disease.get('definition', ''),
        ' '.join(disease.get('symptoms', [])),
        ' '.join(disease.get('signs', [])),
        disease.get('full_content', '')[:3000],
    ]).lower()

    for kw in COMMON_SYMPTOM_KEYWORDS:
        if kw in all_text:
            if kw not in symptom_map:
                symptom_map[kw] = []
            if did not in symptom_map[kw]:
                symptom_map[kw].append(did)

    # Also index from explicit symptoms list
    for sym in disease.get('symptoms', []) + disease.get('signs', []):
        words = re.findall(r'\b[a-z]{4,}\b', sym.lower())
        for word in words:
            if word not in {'with','that','this','from','have','been','will','more','less','than','when','which','some','such','upon','after','about','these','those','their','there','where','here'}:
                if word not in symptom_map:
                    symptom_map[word] = []
                if did not in symptom_map[word]:
                    symptom_map[word].append(did)

print('Symptom map entries: {}'.format(len(symptom_map)))

# Top symptoms by disease count
top = sorted(symptom_map.items(), key=lambda x: len(x[1]), reverse=True)[:20]
for kw, ids in top:
    print('  {}: {} diseases'.format(kw, len(ids)))

# ── Save updated data ──────────────────────────────────────────────────────────
with open('vitanova-app/data/diseases.json', 'w', encoding='utf-8') as f:
    json.dump(diseases, f, ensure_ascii=False, separators=(',', ':'))

with open('vitanova-app/data/symptom_map.json', 'w', encoding='utf-8') as f:
    json.dump(symptom_map, f, ensure_ascii=False, separators=(',', ':'))

print('\nDone! Files updated.')

# Final stats
with_syms2 = sum(1 for d in diseases if len(d.get('symptoms', [])) > 0)
with_treat2 = sum(1 for d in diseases if len(d.get('treatment', '')) > 20)
with_def2 = sum(1 for d in diseases if len(d.get('definition', '')) > 30)
with_ref2 = sum(1 for d in diseases if len(d.get('referral', '')) > 5)
print('After enhancement:')
print('  With symptoms: {}'.format(with_syms2))
print('  With treatment: {}'.format(with_treat2))
print('  With definition: {}'.format(with_def2))
print('  With referral: {}'.format(with_ref2))
