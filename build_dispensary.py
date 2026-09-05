"""
VitaNova Dispensary Builder
Extracts detailed drug prescriptions for every disease from Uganda Clinical Guidelines 2023.
Produces dispensary.json — a disease → drug regimen map.
"""
import pymupdf
import json, re, os

doc = pymupdf.open('Uganda Clinical Guidelines 2023 (2).pdf')
all_pages_text = [page.get_text() for page in doc]

with open('vitanova-app/data/diseases.json', 'r', encoding='utf-8') as f:
    diseases = json.load(f)

print('Building dispensary for {} diseases...'.format(len(diseases)))

# ─── Drug detection patterns ────────────────────────────────────────────────
# Matches common drug names (generic)
DRUG_NAMES = re.compile(
    r'\b('
    # Antibiotics
    r'[Aa]moxicillin|[Aa]mpicillin|[Cc]loxacillin|[Ff]lucloxacillin|[Ee]rythromycin|'
    r'[Aa]zithromycin|[Cc]larithromycin|[Dd]oxycycline|[Tt]etracycline|[Cc]iprofloxacin|'
    r'[Ll]evofloxacin|[Mm]oxifloxacin|[Oo]floxacin|[Mm]etronidazole|[Tt]inidazole|'
    r'[Cc]otrimoxazole|[Tt]rimethoprim|[Ss]ulfamethoxazole|[Cc]ephalexin|[Cc]efuroxime|'
    r'[Cc]eftriaxone|[Cc]efotaxime|[Gg]entamicin|[Kk]anamycin|[Aa]mikacin|[Pp]enicillin|'
    r'[Cc]hloramphenicol|[Vv]ancomycin|[Ll]inezolid|[Mm]eropenem|[Ii]mipenem|'
    r'[Nn]itrofurantoin|[Nn]alidixic acid|[Ff]osfomycin|[Cc]lindamycin|[Dd]icloxacillin|'
    # Antifungals
    r'[Ff]luconazole|[Kk]etoconazole|[Ii]traconazole|[Vv]oriconazole|[Aa]mphotericin|'
    r'[Nn]ystatin|[Gg]riseofulvin|[Cc]lotimazole|[Mm]iconazole|[Tt]erbinafine|'
    # Antivirals / ARVs
    r'[Aa]cyclovir|[Vv]alacyclovir|[Oo]seltamivir|[Zz]anamivir|[Aa]baca[vw]ir|'
    r'[Ll]amivudine|[Zz]idovudine|[Tt]enofovir|[Ee]mtricitabine|[Ee]favirenz|'
    r'[Nn]evirapine|[Ll]opinavir|[Rr]itonavir|[Aa]tazan[aA]vir|[Dd]arunavir|'
    r'[Rr]altegravir|[Dd]olutegravir|[Cc]abotegravir|[Bb]ictegravir|[Ee]ntecavir|'
    # Antimalarials
    r'[Aa]rtemether|[Ll]umefantrine|[Qq]uinine|[Ss]ulfadoxine|[Pp]yrimethamine|'
    r'[Cc]hloroquine|[Aa]modiaquine|[Pp]rimaquine|[Mm]efloquine|[Aa]rtesunate|'
    r'[Hh]ydroxychloroquine|[Aa]rtemisinin|[Dd]ihydroartemisinin|[Pp]iperaquine|'
    # TB drugs
    r'[Rr]ifampicin|[Rr]ifampin|[Ii]soniazid|[Pp]yrazinamide|[Ee]thambutol|'
    r'[Ss]treptomycin|[Bb]edaquiline|[Dd]elamanid|[Ll]inezolid|[Cc]lofazimine|'
    # Antiparasitic
    r'[Aa]lbendazole|[Mm]ebendazole|[Pp]raziquantel|[Ll]evamisole|[Ii]vermectin|'
    r'[Dd]iethylcarbamazine|[Nn]ifurtimox|[Bb]enznidazole|[Mm]elarsoprol|[Ee]flornithine|'
    r'[Ss]uramin|[Pp]entamidine|[Mm]iltefosine|[Ss]odium stibogluconate|'
    # Cardiovascular
    r'[Aa]mlodipine|[Nn]ifedipine|[Vv]erapamil|[Dd]iltiazem|[Aa]tenolol|[Mm]etoprolol|'
    r'[Cc]arvedilol|[Pp]ropranolol|[Cc]aptopril|[Ee]nalapril|[Ll]isinopril|[Rr]amipril|'
    r'[Ll]osartan|[Vv]alsartan|[Ff]urosemide|[Ss]pironolactone|[Hh]ydrochlorothiazide|'
    r'[Dd]igoxin|[Aa]spirin|[Ww]arfarin|[Hh]eparin|[Ee]noxaparin|[Aa]torvastatin|'
    r'[Ss]imvastatin|[Rr]osuvastatin|[Gg]lyceryl trinitrate|[Ii]sosorbide|[Ss]odium nitroprusside|'
    r'[Aa]denosine|[Ll]idocaine|[Aa]miodarone|[Ff]lecainide|[Dd]opamine|[Dd]obutamine|'
    r'[Nn]oradrenaline|[Aa]drenaline|[Ee]phedrine|[Aa]tropin[e]?|[Mm]agnesium [Ss]ulphate|'
    # Respiratory
    r'[Ss]albutamol|[Ii]pratropium|[Tt]heophylline|[Aa]minophylline|[Bb]eclomethasone|'
    r'[Ff]luticasone|[Bb]udesonide|[Ss]almeterol|[Ff]ormoterol|[Mm]ontelukast|'
    r'[Oo]xygen|[Dd]examethasone|[Pp]rednisolone|[Hh]ydrocortisone|'
    # Gastrointestinal
    r'[Oo]meprazole|[Ll]ansoprazole|[Rr]anitidine|[Cc]imetidine|[Mm]etoclopramide|'
    r'[Oo]ndansetron|[Pp]romethadine|[Ll]operamide|[Bb]isacodyl|[Ll]actulose|'
    r'[Oo]ral [Rr]ehydration [Ss]alts?|ORS|[Zz]inc|[Oo]ctreotide|'
    # Endocrine / Metabolic
    r'[Mm]etformin|[Gg]libenclamide|[Ii]nsulin|[Gg]largine|[Gg]lulisine|[Aa]spart|'
    r'[Gg]limepiride|[Ss]itagliptin|[Ll]evothyroxine|[Cc]arbimazole|[Pp]ropylthiouracil|'
    r'[Hh]ydrocortisone|[Ff]ludrocortisone|[Cc]alcium|[Vv]itamin [D]|[Cc]olecalciferol|'
    r'[Bb]isphosphonate|[Aa]lendronate|[Uu]ric acid|[Aa]llopurinol|[Cc]olchicine|'
    # Neurology / Psychiatry
    r'[Pp]henytoin|[Cc]arbamazepine|[Vv]alproate|[Ss]odium [Vv]alproate|[Ll]amotrigine|'
    r'[Ll]evetiracetam|[Pp]henobarbital|[Cc]lonazepam|[Dd]iazepam|[Ll]orazepam|'
    r'[Hh]aloperidol|[Cc]hlorpromazine|[Rr]isperidone|[Oo]lanzapine|[Qq]uetiapine|'
    r'[Aa]mitriptyline|[Ff]luoxetine|[Ss]ertraline|[Ee]scitalopram|[Mm]irtazapine|'
    r'[Ll]ithium|[Vv]alproic acid|[Pp]aroxetine|[Cc]lobazam|[Tt]opiramate|'
    # Musculoskeletal / Pain
    r'[Ii]buprofen|[Dd]iclofenac|[Nn]aproxen|[Ii]ndomethacin|[Mm]eloxicam|'
    r'[Pp]aracetamol|[Aa]cetaminophen|[Mm]orphine|[Pp]ethidine|[Tt]ramadol|[Cc]odeine|'
    r'[Ff]entanyl|[Mm]ethadone|[Bb]uprenorphine|[Nn]aloxone|[Mm]ethotrexate|'
    r'[Hh]ydroxychloroquine|[Ss]ulfasalazine|[Pp]rednisol|[Mm]ethylprednisolone|'
    # Obstetrics / Gynaecology
    r'[Oo]xytocin|[Mm]isoprostol|[Ee]rgometrine|[Mm]ethylergometrine|[Mm]agnesium [Ss]ulphate|'
    r'[Hh]ydralazine|[Ll]abetalol|[Nn]ifedipine|[Bb]etamethasone|[Dd]examethasone|'
    r'[Pp]rogesterone|[Ee]strogen|[Cc]ombined [Oo]ral [Cc]ontraceptive|[Pp]rogestogen|'
    r'[Ll]evonorgestrel|[Dd]epo-[Pp]rovera|[Mm]edroxyprogesterone|[Ii]ntrauterine [Dd]evice|'
    r'[Ff]olic [Aa]cid|[Ii]ron [Ss]upplement|[Ff]errous [Ss]ulphate|[Ee]rythropoietin|'
    # Ophthalmology
    r'[Tt]imolol|[Ll]atanoprost|[Bb]rimonidine|[Pp]ilocarpine|[Tt]ropicamide|'
    r'[Cc]hloramph[e]nicol [Ee]ye|[Gg]entamicin [Ee]ye|[Tt]etrahydrozoline|'
    # Dermatology
    r'[Bb]enzyl [Bb]enzoate|[Pp]ermethrin|[Ll]indane|[Ii]verm[ec]tin|'
    r'[Gg]riseofulvin|[Ss]alicylic [Aa]cid|[Bb]etamethasone|[Hh]ydrocortisone [Cc]ream|'
    # Nutrition
    r'[Vv]itamin [A]|[Vv]itamin [B]12?|[Vv]itamin [C]|[Vv]itamin [D]|[Vv]itamin [E]|'
    r'[Zz]inc [Ss]ulphate|[Tt]hiamine|[Rr]iboflavin|[Nn]iacin|[Ff]olic [Aa]cid|'
    r'[Tt]herapeutic [Ff]ood|[Pp]lumpynut|[Ff]-100|[Ff]-75|[Rr]eSoMal|'
    # Anesthesia / IV fluids
    r'[Kk]etamine|[Tt]hiopentone|[Hh]alothane|[Ii]soflurane|[Pp]ropofol|[Mm]idazolam|'
    r'[Ss]uccinylcholine|[Rr]ocuronium|[Vv]ecuronium|[Nn]eostigmine|[Nn]albuphine|'
    r'[Rr]inger\'?s [Ll]actate|[Nn]ormal [Ss]aline|[Dd]extrose|[Hh]aemaccel|[Gg]elofusine|'
    r'[Ww]hole [Bb]lood|[Pp]latelets?|[Ff]resh [Ff]rozen [Pp]lasma|[Pp]acked [Cc]ells?|'
    # Oncology
    r'[Tt]amoxifen|[Cc]yclophosphamide|[Mm]ethotrexate|[Vv]incristine|[Dd]oxorubicin|'
    r'[Pp]aclitaxel|[Cc]isplatin|[Cc]arboplatin|[Hh]ydroxyurea|[Ii]matinib|'
    # Other common
    r'[Aa]ntihistamine|[Cc]hloropheniramine|[Pp]romethazine|[Cc]etirizine|[Ll]oratadine|'
    r'[Oo]meprazole|[Rr]anitidine|[Aa]luminium hydroxide|[Mm]agnesium trisilicate|'
    r'[Gg]lucose|[Ss]odium bicarbonate|[Pp]otassium chloride|[Cc]alcium gluconate|'
    r'[Aa]tropine|[Nn]aloxone|[Ff]lumazenil|[Aa]ctivated [Cc]harcoal'
    r')\b',
    re.IGNORECASE
)

# Dosage pattern: captures drug + amount + unit + frequency/route
DOSAGE_PATTERN = re.compile(
    r'(\d+(?:\.\d+)?(?:,\d+)?)\s*'
    r'(mg|g|mcg|microgram|ml|mL|L|units?|IU|mmol|mEq)\s*'
    r'(?:/\s*(?:kg|dose|day|m2|kg/day|kg/dose))?\s*'
    r'(?:(?:by|via|orally?|IV|IM|SC|PO|PR|SL|topically?|subcut|intramuscular|intravenous)\s+)?'
    r'(?:(?:once|twice|thrice|one|two|three)\s+(?:daily|a day|per day))?\s*'
    r'(?:\d+[-–]\d+\s*(?:hourly|hours?|hrly|hrs?))?\s*'
    r'(?:(?:for|over)\s+\d+[-–]?\d*\s*(?:days?|weeks?|months?|hours?))?',
    re.IGNORECASE
)

ROUTE_MAP = {
    'oral': ['oral', 'orally', 'po', 'mouth', 'swallow', 'tablet', 'capsule', 'syrup', 'suspension'],
    'IV': ['iv', 'intravenous', 'intravenously', 'infusion', 'bolus', 'drip'],
    'IM': ['im', 'intramuscular', 'intramuscularly', 'injection'],
    'SC': ['sc', 'subcutaneous', 'subcutaneously'],
    'topical': ['topical', 'cream', 'ointment', 'lotion', 'gel', 'apply'],
    'inhaled': ['inhale', 'inhaled', 'nebulize', 'nebulised', 'puff', 'metered dose'],
    'rectal': ['rectal', 'rectally', 'suppository', 'pr'],
    'sublingual': ['sublingual', 'sl', 'under the tongue'],
    'eye drops': ['eye drop', 'ophthalmic', 'instill'],
    'ear drops': ['ear drop', 'otic', 'aural'],
}

FREQUENCY_PATTERNS = [
    (r'\bonce\s+daily\b|\bOD\b|once\s+a\s+day|\bq24h\b', 'Once daily (OD)'),
    (r'\btwice\s+daily\b|\bBD\b|\bBID\b|twice\s+a\s+day|\bq12h\b', 'Twice daily (BD)'),
    (r'\bthree\s+times?\s+daily\b|\bTDS\b|\bTID\b|\bq8h\b|\b8\s*hourly\b', 'Three times daily (TDS)'),
    (r'\bfour\s+times?\s+daily\b|\bQDS\b|\bQID\b|\bq6h\b|\b6\s*hourly\b', 'Four times daily (QDS)'),
    (r'\bsingle\s+dose\b|\bstat\b', 'Single dose (STAT)'),
    (r'\bweekly\b', 'Once weekly'),
    (r'\bmonthly\b', 'Once monthly'),
    (r'\bevery\s+(\d+)\s*hours?\b|\b\1\s*hourly\b', 'Every X hours'),
    (r'\bnocte\b|\bat\s+night\b|\bbedtime\b', 'At night (Nocte)'),
    (r'\bmorning\b', 'In the morning'),
]

DURATION_PATTERN = re.compile(
    r'(?:for|over|during)\s+(\d+[-–]?\d*)\s*(days?|weeks?|months?|hours?|cycles?)',
    re.IGNORECASE
)

LINETYPE_PATTERNS = {
    'first_line': re.compile(r'\b(?:first[-\s]?line|1st[-\s]?line|preferred|initial|start\s+with|drug\s+of\s+choice)\b', re.IGNORECASE),
    'second_line': re.compile(r'\b(?:second[-\s]?line|2nd[-\s]?line|alternative|if\s+(?:first|1st)\s+line\s+fails?|switch\s+to)\b', re.IGNORECASE),
    'third_line': re.compile(r'\b(?:third[-\s]?line|3rd[-\s]?line|last\s+resort|salvage)\b', re.IGNORECASE),
    'prophylaxis': re.compile(r'\b(?:prophylaxis|preventive|prophylactic|prevention)\b', re.IGNORECASE),
    'paediatric': re.compile(r'\b(?:children|child|paediatric|pediatric|infant|neonate|neonatal)\b', re.IGNORECASE),
    'pregnancy': re.compile(r'\b(?:pregnant|pregnancy|antenatal|postnatal|breastfeeding|lactating)\b', re.IGNORECASE),
    'severe': re.compile(r'\b(?:severe|complicated|critical|ICU|intensive care)\b', re.IGNORECASE),
    'mild': re.compile(r'\b(?:mild|uncomplicated|outpatient|ambulatory)\b', re.IGNORECASE),
}

def detect_route(text):
    text_lower = text.lower()
    for route, keywords in ROUTE_MAP.items():
        for kw in keywords:
            if kw in text_lower:
                return route
    return 'oral'  # default

def detect_frequency(text):
    for pattern, label in FREQUENCY_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return label
    return ''

def detect_duration(text):
    m = DURATION_PATTERN.search(text)
    if m:
        return 'for {} {}'.format(m.group(1), m.group(2).lower())
    return ''

def detect_line_type(text):
    for line_type, pattern in LINETYPE_PATTERNS.items():
        if pattern.search(text):
            return line_type
    return 'general'

def extract_drug_regimens(text):
    """Extract detailed drug regimens from clinical text."""
    regimens = []
    if not text:
        return regimens

    lines = text.split('\n')
    current_line_type = 'general'

    for i, line in enumerate(lines):
        line_clean = line.strip()
        if not line_clean:
            continue

        # Update line type context
        for lt, pat in LINETYPE_PATTERNS.items():
            if pat.search(line_clean):
                current_line_type = lt
                break

        # Find drug names in this line
        drug_matches = list(DRUG_NAMES.finditer(line_clean))
        if not drug_matches:
            continue

        # Get surrounding context (this line + next 2)
        context = ' '.join(lines[i:min(i+3, len(lines))])

        for dm in drug_matches:
            drug_name = dm.group(0)

            # Get dosage from context after drug name
            after_drug = context[dm.start():]
            dose_match = DOSAGE_PATTERN.search(after_drug[:200])
            dose_str = ''
            unit_str = ''
            if dose_match:
                dose_str = dose_match.group(1)
                unit_str = dose_match.group(2)

            route = detect_route(after_drug[:200])
            frequency = detect_frequency(after_drug[:200])
            duration = detect_duration(after_drug[:200])
            line_type = detect_line_type(line_clean)
            if line_type == 'general':
                line_type = current_line_type

            # Build the regimen entry
            regimen = {
                'drug': drug_name.strip(),
                'dose': dose_str,
                'unit': unit_str,
                'route': route,
                'frequency': frequency,
                'duration': duration,
                'line': line_type,
                'context': line_clean[:200],
            }

            # De-duplicate by drug name within this disease
            existing = next((r for r in regimens if r['drug'].lower() == drug_name.lower()), None)
            if not existing:
                regimens.append(regimen)
            elif dose_str and not existing['dose']:
                # Update if we found better info
                existing.update(regimen)

    return regimens

# ─── Build dispensary ─────────────────────────────────────────────────────────
dispensary = {}

for disease in diseases:
    did = disease['id']
    full_text = disease.get('full_content', '')
    treatment_text = disease.get('treatment', '')

    # Combine treatment and full text for drug extraction
    combined = treatment_text + '\n\n' + full_text[:6000]

    regimens = extract_drug_regimens(combined)

    # Also include already-extracted medications as fallback
    existing_meds = disease.get('medications', [])
    seen_drugs = {r['drug'].lower() for r in regimens}
    for med in existing_meds:
        if med['drug'].lower() not in seen_drugs:
            regimens.append({
                'drug': med['drug'],
                'dose': med.get('dose', ''),
                'unit': '',
                'route': 'oral',
                'frequency': '',
                'duration': '',
                'line': 'general',
                'context': '',
            })
            seen_drugs.add(med['drug'].lower())

    if regimens:
        dispensary[did] = {
            'disease_id': did,
            'disease_name': disease['name'],
            'chapter': disease['chapter'],
            'regimens': regimens,
        }

print('Dispensary entries: {}'.format(len(dispensary)))

# Stats
total_drugs = sum(len(v['regimens']) for v in dispensary.values())
print('Total drug regimens: {}'.format(total_drugs))

# Show sample
sample_keys = list(dispensary.keys())[:5]
for k in sample_keys:
    d = dispensary[k]
    print('\n  {}'.format(d['disease_name']))
    for r in d['regimens'][:4]:
        print('    {} {} {} - {} {}'.format(
            r['drug'], r['dose'], r['unit'], r['frequency'], r['line']
        ))

# Save
with open('vitanova-app/data/dispensary.json', 'w', encoding='utf-8') as f:
    json.dump(dispensary, f, ensure_ascii=False, separators=(',', ':'))

sz = os.path.getsize('vitanova-app/data/dispensary.json')
print('\ndispensary.json: {:,} bytes'.format(sz))
print('Done!')
