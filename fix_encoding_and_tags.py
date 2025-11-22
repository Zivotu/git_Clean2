import json
import codecs

# Read the raw file content
with codecs.open('apps/web/messages/de.json', 'r', encoding='utf-8') as f:
    de_content = f.read()

# Fix all encoding issues in the raw content BEFORE parsing JSON
replacements = [
    ('verÃ¢â€Å"Ã¢â€¢Â¢ffentlichen', 'veröffentlichen'),
    ('Ã¢â€Å"Ã‚Â£ber', 'Über'),
    ('VorschlÃ¢â€Å"ÃƒÂ±ge', 'Vorschläge'),
    ('FÃ¼r', 'Für'),
    ('erhÃ¤ltst', 'erhältst'),
    ('SpinnenwÃ¤chter', 'Spinnenwächter'),
    ('KÃ¤ferfreunde', 'Käferfreunde'),
    ('auffÃ¤llt', 'auffällt'),
    ('ausgebÃ¼xt', 'ausgebüxt'),
    ('Ã¢â€"â€žber', 'Über'),
    ('fÃ¼r', 'für'),
    ('VerÃ¶ffentlichen', 'Veröffentlichen'),
    ('Ã¼ber', 'über'),
    ('prÃ¢ÂÂ¿fen', 'prüfen'),
    ('HÃƒÂ·chstpreis', 'Höchstpreis'),
    ('ZurÃ¢ÂÂ¿ck', 'Zurück'),
    ('HÃŽÂ£ufige', 'Häufige'),
    ('VerÃƒÂ·ffentlichung', 'Veröffentlichung'),
]

for old, new in replacements:
    de_content = de_content.replace(old, new)

# Now parse the fixed JSON
de_data = json.loads(de_content)

# Load other files
with codecs.open('apps/web/messages/en.json', 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with codecs.open('apps/web/messages/hr.json', 'r', encoding='utf-8') as f:
    hr_data = json.load(f)

# Add Create section with tag translations
create_section_en = {
    "tag_Igre": "Games",
    "tag_Kvizovi": "Quizzes",
    "tag_Učenje": "Learning",
    "tag_Alati": "Tools",
    "tag_Business": "Business",
    "tag_Zabava": "Entertainment",
    "tag_Ostalo": "Other"
}

create_section_hr = {
    "tag_Igre": "Igre",
    "tag_Kvizovi": "Kvizovi",
    "tag_Učenje": "Učenje",
    "tag_Alati": "Alati",
    "tag_Business": "Business",
    "tag_Zabava": "Zabava",
    "tag_Ostalo": "Ostalo"
}

create_section_de = {
    "tag_Igre": "Spiele",
    "tag_Kvizovi": "Quiz",
    "tag_Učenje": "Lernen",
    "tag_Alati": "Werkzeuge",
    "tag_Business": "Business",
    "tag_Zabava": "Unterhaltung",
    "tag_Ostalo": "Sonstiges"
}

# Add or update Create section
if "Create" not in en_data:
    en_data["Create"] = {}
en_data["Create"].update(create_section_en)

if "Create" not in hr_data:
    hr_data["Create"] = {}
hr_data["Create"].update(create_section_hr)

if "Create" not in de_data:
    de_data["Create"] = {}
de_data["Create"].update(create_section_de)

# Save all files
with codecs.open('apps/web/messages/en.json', 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with codecs.open('apps/web/messages/hr.json', 'w', encoding='utf-8') as f:
    json.dump(hr_data, f, indent=2, ensure_ascii=False)

with codecs.open('apps/web/messages/de.json', 'w', encoding='utf-8') as f:
    json.dump(de_data, f, indent=2, ensure_ascii=False)

print("✅ German encoding fixed")
print("✅ Tag translations added to all languages")
print("✅ Files saved successfully")
