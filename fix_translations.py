import json
import os

# --- HR ---
path_hr = r"c:\thesara_RollBack\apps\web\messages\hr.json"
try:
    with open(path_hr, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix garbled encoding if present
    if "Å½" in content or "Å¡" in content:
        try:
             content = content.encode('latin-1').decode('utf-8')
        except:
             pass

    # Remove duplicate lines (specific fix for 'Zapamti moj odabir')
    lines = content.splitlines()
    cleaned_lines = []
    seen_remember = False
    for line in lines:
        if 'Zapamti moj odabir' in line:
            if seen_remember:
                continue
            seen_remember = True
        cleaned_lines.append(line)
    
    content = "\n".join(cleaned_lines)

    data_hr = json.loads(content)
    
    data_hr['ambassadorSection'] = {
        "applicationSuccess": "Prijava uspješno poslana!",
        "modal": {
            "title": "Prijava za Ambassador Program",
            "errorTitle": "Greška:",
            "confirmTerms": "Potvrđujem sljedeće:",
            "term1": "Imam publiku koja bi mogla biti zainteresirana za Thesaru.",
            "term2": "Neću koristiti spam ili neetične metode promocije.",
            "term3": "Razumijem da se isplate vrše putem PayPala (net 30).",
            "term4": "Pristajem na uvjete partnerskog programa.",
            "tiktokLabel": "TikTok Profil",
            "tiktokPlaceholder": "https://tiktok.com/@tvojprofil",
            "instagramLabel": "Instagram Profil",
            "instagramPlaceholder": "https://instagram.com/tvojprofil",
            "youtubeLabel": "YouTube Kanal",
            "youtubePlaceholder": "https://youtube.com/@tvojkanal",
            "newsletterLabel": "Newsletter / Blog",
            "newsletterPlaceholder": "Link na tvoj newsletter ili blog",
            "otherLabel": "Ostalo",
            "otherPlaceholder": "Link na drugu platformu",
            "primaryPlatformLabel": "Primarna platforma",
            "primaryPlatformPlaceholder": "npr. TikTok, Instagram, YouTube...",
            "audienceSizeLabel": "Veličina publike (cca)",
            "audienceSizePlaceholder": "npr. 10k pratitelja, 5k preplatnika...",
            "motivationLabel": "Zašto želiš biti ambasador?",
            "motivationRequired": "(Obavezno)",
            "motivationPlaceholder": "Ukratko opiši svoju publiku i kako planiraš promovirati Thesaru...",
            "cancelButton": "Odustani",
            "submittingButton": "Slanje...",
            "submitButton": "Pošalji prijavu"
        }
    }
    
    with open(path_hr, 'w', encoding='utf-8') as f:
        json.dump(data_hr, f, indent=2, ensure_ascii=False)
    print("HR fixed.")

except Exception as e:
    print(f"Error fix HR: {e}")

# --- EN ---
path_en = r"c:\thesara_RollBack\apps\web\messages\en.json"
try:
    with open(path_en, 'r', encoding='utf-8') as f:
        data_en = json.load(f)
    
    data_en['ambassadorSection'] = {
        "applicationSuccess": "Application sent successfully!",
        "modal": {
            "title": "Ambassador Program Application",
            "errorTitle": "Error:",
            "confirmTerms": "I confirm the following:",
            "term1": "I have an audience that might be interested in Thesara.",
            "term2": "I will not use spam or unethical promotion methods.",
            "term3": "I understand that payouts are made via PayPal (net 30).",
            "term4": "I agree to the partner program terms.",
            "tiktokLabel": "TikTok Profile",
            "tiktokPlaceholder": "https://tiktok.com/@yourprofile",
            "instagramLabel": "Instagram Profile",
            "instagramPlaceholder": "https://instagram.com/yourprofile",
            "youtubeLabel": "YouTube Channel",
            "youtubePlaceholder": "https://youtube.com/@yourchannel",
            "newsletterLabel": "Newsletter / Blog",
            "newsletterPlaceholder": "Link to your newsletter or blog",
            "otherLabel": "Other",
            "otherPlaceholder": "Link to other platform",
            "primaryPlatformLabel": "Primary Platform",
            "primaryPlatformPlaceholder": "e.g. TikTok, Instagram, YouTube...",
            "audienceSizeLabel": "Audience Size (approx)",
            "audienceSizePlaceholder": "e.g. 10k followers, 5k subscribers...",
            "motivationLabel": "Why do you want to be an ambassador?",
            "motivationRequired": "(Required)",
            "motivationPlaceholder": "Briefly describe your audience and how you plan to promote Thesara...",
            "cancelButton": "Cancel",
            "submittingButton": "Sending...",
            "submitButton": "Submit Application"
        }
    }

    with open(path_en, 'w', encoding='utf-8') as f:
        json.dump(data_en, f, indent=2, ensure_ascii=False)
    print("EN fixed.")
except Exception as e:
    print(f"Error fix EN: {e}")

# --- DE ---
path_de = r"c:\thesara_RollBack\apps\web\messages\de.json"
try:
    with open(path_de, 'r', encoding='utf-8') as f:
        data_de = json.load(f)
    
    data_de['ambassadorSection'] = {
        "applicationSuccess": "Bewerbung erfolgreich gesendet!",
        "modal": {
            "title": "Bewerbung zum Ambassador-Programm",
            "errorTitle": "Fehler:",
            "confirmTerms": "Ich bestätige Folgendes:",
            "term1": "Ich habe ein Publikum, das an Thesara interessiert sein könnte.",
            "term2": "Ich werde keinen Spam oder unethische Werbemethoden verwenden.",
            "term3": "Ich verstehe, dass Auszahlungen über PayPal (net 30) erfolgen.",
            "term4": "Ich stimme den Bedingungen des Partnerprogramms zu.",
            "tiktokLabel": "TikTok Profil",
            "tiktokPlaceholder": "https://tiktok.com/@deinprofil",
            "instagramLabel": "Instagram Profil",
            "instagramPlaceholder": "https://instagram.com/deinprofil",
            "youtubeLabel": "YouTube Kanal",
            "youtubePlaceholder": "https://youtube.com/@deinkanal",
            "newsletterLabel": "Newsletter / Blog",
            "newsletterPlaceholder": "Link zu deinem Newsletter oder Blog",
            "otherLabel": "Andere",
            "otherPlaceholder": "Link zu einer anderen Plattform",
            "primaryPlatformLabel": "Primäre Plattform",
            "primaryPlatformPlaceholder": "z.B. TikTok, Instagram, YouTube...",
            "audienceSizeLabel": "Publikumsgröße (ca.)",
            "audienceSizePlaceholder": "z.B. 10k Follower, 5k Abonnenten...",
            "motivationLabel": "Warum möchtest du Ambassador werden?",
            "motivationRequired": "(Erforderlich)",
            "motivationPlaceholder": "Beschreibe kurz dein Publikum und wie du Thesara bewerben möchtest...",
            "cancelButton": "Abbrechen",
            "submittingButton": "Senden...",
            "submitButton": "Bewerbung absenden"
        }
    }

    with open(path_de, 'w', encoding='utf-8') as f:
        json.dump(data_de, f, indent=2, ensure_ascii=False)
    print("DE fixed.")
except Exception as e:
    print(f"Error fix DE: {e}")
