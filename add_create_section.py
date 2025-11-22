import json

# Read de.json
with open('apps/web/messages/de.json', 'r', encoding='utf-8') as f:
    content = f.read()

# Parse JSON
data = json.loads(content)

# Add Create section if it doesn't exist
if "Create" not in data:
    data["Create"] = {
        "tag_Igre": "Spiele",
        "tag_Kvizovi": "Quiz",
        "tag_Učenje": "Lernen",
        "tag_Alati": "Werkzeuge",
        "tag_Business": "Business",
        "tag_Zabava": "Unterhaltung",
        "tag_Ostalo": "Sonstiges"
    }
    print("✅ Create section added to de.json")
else:
    print("ℹ️ Create section already exists in de.json")

# Write back
with open('apps/web/messages/de.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("✅ de.json updated successfully")
