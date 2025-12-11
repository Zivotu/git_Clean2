import os

path = r"c:\thesara_RollBack\apps\web\messages\hr.json"
content = ""
try:
    # Try reading as UTF-16 (little endian is common for PowerShell output)
    with open(path, 'r', encoding='utf-16') as f:
        content = f.read()
except Exception as e1:
    print(f"Not UTF-16: {e1}")
    try:
        # Try UTF-8 with BOM
        with open(path, 'r', encoding='utf-8-sig') as f:
            content = f.read()
    except Exception as e2:
        print(f"Not UTF-8-SIG: {e2}")
        try:
             # Try default system encoding
             with open(path, 'r', encoding='mbcs') as f:
                content = f.read()
        except Exception as e3:
             print(f"Not MBCS: {e3}")
             # Fallback to latin-1 to just read bytes
             with open(path, 'r', encoding='latin-1') as f:
                 content = f.read()

# Write back as clean UTF-8
if content:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Converted to UTF-8")
else:
    print("Failed to read content")
