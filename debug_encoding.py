import json

with open('apps/web/messages/de.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

about = data['Nav']['about']
print(f"Original: {about}")
print(f"Repr: {repr(about)}")

publish = data['Nav']['publishApp']
print(f"Publish: {publish}")
print(f"Publish Repr: {repr(publish)}")
