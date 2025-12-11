import json
import os

path = r"c:\thesara_RollBack\apps\web\messages\hr.json"

try:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Heuristic: if we see "Å½" (Ž) it's likely latin-1 interpretation of UTF-8
    if "Å½" in content:
        print("Detected broken encoding (Å½). Attempting fix...")
        try:
            # We want to reverse:  Bytes -> [UTF-8 decode] -> String(wrong)
            # So: String(wrong) -> [Latin-1 encode] -> Bytes -> [UTF-8 decode] -> String(right)
            fixed = content.encode('latin-1').decode('utf-8')
            content = fixed
            print("Encoding fixed successfully.")
        except Exception as e:
            print(f"Failed to fix encoding: {e}")
            # Try removing chars that fail latin-1? No, dangerous.

    data = json.loads(content)
    
    if "ambassadorSection" in data:
        print("Found ambassadorSection.")
    else:
        print("MISSING ambassadorSection!")

    # Write back clean
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("Saved hr.json.")

except Exception as e:
    print(f"Process failed: {e}")
