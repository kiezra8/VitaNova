import json, os, sys

p1 = 'vitanova-app/data/diseases.json'
p2 = 'vitanova-app/data/symptom_map.json'

if os.path.exists(p1):
    with open(p1, 'r', encoding='utf-8') as f:
        data = json.load(f)
    sz = os.path.getsize(p1)
    print('diseases.json: {} entries, size: {:,} bytes'.format(len(data), sz))
    print('Sample:', data[0]['name'] if data else 'empty')
else:
    print('diseases.json NOT found')

if os.path.exists(p2):
    with open(p2, 'r', encoding='utf-8') as f:
        sm = json.load(f)
    print('symptom_map.json: {} keys'.format(len(sm)))
else:
    print('symptom_map.json NOT found')
