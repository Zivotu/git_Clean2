import json
import os

path = r"c:\thesara_RollBack\apps\web\messages\hr.json"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

try:
    if "Å½" in content:
        # Try cp1252 to handle Œ and others
        fixed = content.encode('cp1252').decode('utf-8')
        content = fixed
        print("Fixed with cp1252")
    else:
        print("No broken encoding detected (Å½ not found).")

except Exception as e:
    print(f"cp1252 failed: {e}")
    # Fallback: if Œ is the ONLY issue, maybe we can replace it or ignore it?
    # But let's blindly try latin-1 with errors='replace' just to clean up the rest?
    try:
        fixed = content.encode('latin-1', errors='replace').decode('utf-8')
        content = fixed
        print("Fallback latin-1 (replace) successful")
    except Exception as e2:
        print(f"Fallback failed: {e2}")

# Save
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
