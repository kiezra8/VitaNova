"""
Uganda Clinical Guidelines 2023 - PDF Data Extractor
Extracts all disease management content into structured JSON for the VitaNova app.
"""
import pymupdf
import json
import re
import os

doc = pymupdf.open('Uganda Clinical Guidelines 2023 (2).pdf')
print(f"Total pages: {len(doc)}")

# ─────────────────────────────────────────────────────────────────
# STEP 1: Extract full text from ALL pages (skip first 20 = TOC/prelims)
# ─────────────────────────────────────────────────────────────────
print("Extracting text from all pages...")
pages_text = []
for i, page in enumerate(doc):
    text = page.get_text()
    pages_text.append({'page': i + 1, 'text': text})

print(f"Extracted {len(pages_text)} pages")

# Save raw full text for reference
full_text = '\n'.join([f"=== PAGE {p['page']} ===\n{p['text']}" for p in pages_text])
with open('full_text_raw.txt', 'w', encoding='utf-8', errors='replace') as f:
    f.write(full_text)
print("Raw text saved.")

# ─────────────────────────────────────────────────────────────────
# STEP 2: Parse structured content
# ─────────────────────────────────────────────────────────────────

# Major chapter patterns based on TOC
CHAPTER_PATTERNS = [
    (1, "GENERAL PRINCIPLES"),
    (2, "COMMUNICABLE DISEASES"),
    (3, "HIV/AIDS AND SEXUALLY TRANSMITTED INFECTIONS"),
    (4, "CARDIOVASCULAR DISEASES"),
    (5, "RESPIRATORY DISEASES"),
    (6, "GASTROINTESTINAL DISEASES"),
    (7, "RENAL AND URINARY DISEASES"),
    (8, "ENDOCRINE AND METABOLIC DISEASES"),
    (9, "MENTAL, NEUROLOGICAL AND SUBSTANCE USE DISORDERS"),
    (10, "MUSCULOSKELETAL AND CONNECTIVE TISSUE DISEASES"),
    (11, "EYE DISEASES"),
    (12, "EAR, NOSE AND THROAT"),
    (13, "SKIN AND SOFT TISSUE DISORDERS"),
    (14, "BLOOD AND LYMPH NODE DISORDERS"),
    (15, "CANCERS"),
    (16, "REPRODUCTIVE HEALTH"),
    (17, "EMERGENCY AND TRAUMA"),
    (18, "PAEDIATRICS"),
    (19, "NEONATOLOGY"),
    (20, "NUTRITION"),
    (21, "SURGICAL CONDITIONS"),
    (22, "ANAESTHESIA AND PAIN MANAGEMENT"),
    (23, "ORAL AND DENTAL HEALTH"),
    (24, "PALLIATIVE CARE"),
]

# ─────────────────────────────────────────────────────────────────
# STEP 3: Build diseases database
# ─────────────────────────────────────────────────────────────────

# We'll extract disease blocks using section number patterns
# Pattern: X.Y.Z Disease Name
section_re = re.compile(r'^(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)\s+([A-Z][^\n]+?)(?:\s*\.\s*\d+\s*)?$', re.MULTILINE)

combined_text = '\n'.join([p['text'] for p in pages_text[20:]])  # skip prelims

diseases_db = []

# ─────────────────────────────────────────────────────────────────
# STEP 4: Chunk-based extraction of clinical content
# ─────────────────────────────────────────────────────────────────

def extract_section_content(text, section_num, section_name):
    """Extract clinical management content for a disease section."""
    result = {
        'section': section_num,
        'name': section_name,
        'definition': '',
        'classification': '',
        'symptoms': [],
        'signs': [],
        'diagnosis': '',
        'investigations': '',
        'treatment': '',
        'medications': [],
        'referral': '',
        'prevention': '',
        'notes': '',
        'special_populations': {
            'pregnancy': '',
            'children': '',
            'hiv': '',
            'elderly': ''
        },
        'raw_content': ''
    }
    
    # Key section headers to look for in text
    headers = {
        'definition': ['Definition', 'Description', 'Overview'],
        'classification': ['Classification', 'Types', 'Stages', 'WHO Staging'],
        'symptoms': ['Symptoms', 'Clinical Features', 'Clinical Presentation', 'Complaints', 'Signs and Symptoms'],
        'signs': ['Signs', 'Physical Examination', 'Examination Findings'],
        'diagnosis': ['Diagnosis', 'Diagnostic Criteria', 'Diagnostic Approach'],
        'investigations': ['Investigations', 'Laboratory', 'Lab Tests', 'Workup'],
        'treatment': ['Treatment', 'Management', 'Therapeutic', 'Intervention'],
        'medications': ['Medicines', 'Drugs', 'Drug Treatment', 'First Line', 'Second Line', 'Antibiotics'],
        'referral': ['Referral', 'Refer', 'When to Refer'],
        'prevention': ['Prevention', 'Prophylaxis', 'Control'],
        'notes': ['Note', 'Important', 'Caution', 'Warning'],
    }
    
    # Extract raw content between this section and the next
    # We'll just store cleaned text for now
    result['raw_content'] = text[:5000] if len(text) > 5000 else text
    
    # Try to extract symptoms list
    symp_match = re.search(r'(?:Symptoms?|Clinical Features?|Complaints?)[:\s]*\n((?:[-•*]\s*.+\n?)+)', text, re.IGNORECASE)
    if symp_match:
        symp_text = symp_match.group(1)
        result['symptoms'] = [s.strip().lstrip('-•* ') for s in symp_text.strip().split('\n') if s.strip()]
    
    # Extract treatment info
    treat_match = re.search(r'(?:Treatment|Management)[:\s]*\n(.+?)(?=\n\n|\nReferral|\nPrevention|\n\d+\.)', text, re.IGNORECASE | re.DOTALL)
    if treat_match:
        result['treatment'] = treat_match.group(1).strip()[:2000]
    
    return result

# ─────────────────────────────────────────────────────────────────
# STEP 5: Page-by-page disease extraction
# ─────────────────────────────────────────────────────────────────
print("Building disease index by page ranges...")

# Find section boundaries in page text
# Each disease/condition will be a page range
current_sections = []
current_section_text = []
current_section_info = None

all_pages_text = [p['text'] for p in pages_text]

# Pattern for detecting new disease/condition headings
heading_re = re.compile(
    r'(?:^|\n)(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)\s+([A-Z][A-Za-z\s\(\)/\-\']+?)(?:\n|$)',
    re.MULTILINE
)

sections = []
# Scan through content pages (page 30+ where clinical content starts)
for page_idx in range(30, len(all_pages_text)):
    page_text = all_pages_text[page_idx]
    matches = list(heading_re.finditer(page_text))
    for m in matches:
        sec_num = m.group(1)
        sec_name = m.group(2).strip()
        # Only include 3+ level sections (actual diseases, not chapter headers)
        if sec_num.count('.') >= 1 and len(sec_name) > 3:
            sections.append({
                'section': sec_num,
                'name': sec_name,
                'page': page_idx + 1
            })

print(f"Found {len(sections)} sections")

# Print first 50 for verification
for s in sections[:50]:
    print(f"  {s['section']} - {s['name']} (p.{s['page']})")

with open('sections_found.json', 'w', encoding='utf-8') as f:
    json.dump(sections, f, indent=2, ensure_ascii=False)

print("\nDone! sections_found.json written.")
