import json, os

files = [
    'vitanova-app/data/diseases.json',
    'vitanova-app/data/symptom_map.json',
    'vitanova-app/data/chapters.json'
]
for f in files:
    if os.path.exists(f):
        size = os.path.getsize(f)
        print('OK: {} ({:,} bytes)'.format(f, size))
    else:
        print('MISSING: {}'.format(f))

with open('vitanova-app/data/diseases.json', 'r', encoding='utf-8') as fp:
    diseases = json.load(fp)

print('Total diseases: {}'.format(len(diseases)))
for d in diseases[:5]:
    name = d.get('name', 'N/A')
    chapter = d.get('chapter', 'N/A')
    syms = d.get('symptoms', [])
    meds = d.get('medications', [])
    print('  {} | {} | {} symptoms | {} meds'.format(name[:40], chapter[:30], len(syms), len(meds)))
