import json
import os

def fix_encoding(text):
    if not isinstance(text, str):
        return text
    # Common double-encoding artifacts in de.json
    replacements = {
        "Ã¢â€\x9dÅ"Ã¢â€¢Â¢": "ö",  # veröffentlichen
        "Ã¢â€\x9dÅ"£": "Ü",  # Über
        "Ã¢â€ Å"Ã¢â€¢Â¢": "ö",
        "Ã¢â€ Å"Ã‚Â£": "Ü",
        "Ã¢â€ Å"ÃƒÂ±": "ä",
        "Ã¢â€ Å"£": "Ü",
        "Ã¢â€ Å"à±": "ä",
        "Ã¢â€ Å"Ã†â€™": "ß",
        "ÃƒÂ¼": "ü",
        "ÃƒÂ¶": "ö",
        "ÃƒÂ¤": "ä",
        "ÃƒÅ¸": "ß",
        "Ã¢â€"â€ž": "Ü",
        "Ã¢â€°Â¡Ã†â€™Ãƒâ€"ÃƒÂ©": "...",
        "ÃŽâ€œÃƒâ€¡Ã‚Âª": "...",
        "ÃŽâ€œÃƒâ€¡ÃƒÂ´": "-",
        "ÃŽâ€œÃƒâ€¡ÃƒÂ¦": "-",
        "Ã¢â‚¬â€": "—",
        "Ã¢â‚¬Å"": """,
        "Ã¢â‚¬Å"": """,
        "Ã¢â‚¬Â¦": "…",
        "ÃƒÂ·": "ö",
        "ÃŽÂ£": "ä",
        "Ã¢Â Â¿": "ü",
        "Ã¢â‚¬Â¬": "€",
        "Ã‚Â": "",
        "ÃƒÂ©": "é",
        "ÃƒÂ": "à",
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    
    # Second pass for some remaining artifacts
    text = text.replace("Ã¼", "ü").replace("Ã¶", "ö").replace("Ã¤", "ä").replace("ÃŸ", "ß")
    return text

def recursive_fix(data):
    if isinstance(data, dict):
        return {k: recursive_fix(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [recursive_fix(v) for v in data]
    elif isinstance(data, str):
        return fix_encoding(data)
    return data

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

base_path = "apps/web/messages"
en_path = os.path.join(base_path, "en.json")
hr_path = os.path.join(base_path, "hr.json")
de_path = os.path.join(base_path, "de.json")

en_data = load_json(en_path)
hr_data = load_json(hr_path)
de_data = load_json(de_path)

# Fix DE encoding
de_data = recursive_fix(de_data)

# New keys
new_keys = {
    "noGraphic": {"en": "No graphic", "hr": "Bez grafike", "de": "Keine Grafik"},
    "priceLabel": {"en": "Price", "hr": "Cijena", "de": "Preis"},
    "play": {"en": "Play", "hr": "Igraj", "de": "Spielen"},
    "fullDetails": {"en": "Full Details", "hr": "Detalji", "de": "Details"},
}

bug_tooltip = {"en": "I'm playing hide and seek with the developers 🙂", "hr": "Igram se skrivača s programerima 🙂", "de": "Ich spiele Verstecken mit den Entwicklern 🙂"}

# Add to Home section
for data, lang in [(en_data, "en"), (hr_data, "hr"), (de_data, "de")]:
    if "Home" not in data:
        data["Home"] = {}
    for key, trans in new_keys.items():
        data["Home"][key] = trans[lang]
    
    if "BugGuardian" not in data:
        data["BugGuardian"] = {}
    data["BugGuardian"]["tooltip"] = bug_tooltip[lang]

# Translate HR Home section (overwrite English with Croatian)
hr_home_trans = {
    "headline": {
        "one": "Otkrijte nevjerojatne",
        "two": "Mini-aplikacije i igre"
    },
    "tagline": "Odabrana tržnica za iskustva u pregledniku. Izradite, dijelite i istražujte.",
    "trending": "Trenutno popularno",
    "appsCount": "{count} aplikacija",
    "search": {
        "placeholder": "Pretraži aplikacije, igre ili oznake..."
    },
    "appsFound": "{count} aplikacija pronađeno",
    "publishedCount": "{count} objavljenih aplikacija",
    "membersCount": "{count} registriranih članova",
    "sort": {
        "new": "Najnovije",
        "popular": "Popularno",
        "title": "Abecedno"
    },
    "clear": "Očisti",
    "noApps": "Nema pronađenih aplikacija",
    "tryAdjust": "Pokušajte prilagoditi pretragu ili filtere.",
    "beFirst": "Budite prvi koji će objaviti aplikaciju!",
    "publish": "Objavi aplikaciju",
    "earlyAccessTitle": "Sve je trenutno besplatno",
    "earlyAccessBody": "Gold + Bez reklama su otključani tijekom ranog pristupa. Objavite aplikaciju da iskoristite pogodnosti.",
    "earlyAccessPublish": "Objavi sada",
    "earlyAccessSignIn": "Prijavi se sada",
    "earlyAccessDismiss": "Zatvori",
    "plays": "{count} igranja",
    "leftPanel": {
        "title": "Od AI razgovora do vaše mini aplikacije",
        "subtitle": "Thesara je mjesto gdje pretvarate AI ideje u stvarne aplikacije, igre ili interaktivne priče koje možete podijeliti u nekoliko klikova.",
        "llmLabel": "Započnite s vašim omiljenim modelom",
        "steps": {
            "1": {
                "title": "Razgovarajte sa svojim AI-jem",
                "text": "Zatražite od modela da vam izradi mini aplikaciju, igru, kviz, simulaciju ili predavanje."
            },
            "2": {
                "title": "Preuzmite generirani kod ili ZIP",
                "text": "Asistent vam daje gotovu web aplikaciju koju preuzimate kao kod ili paket."
            },
            "3": {
                "title": "Objavite na Thesari u nekoliko klikova",
                "text": "Učitajte, potvrdite i pritisnite Igraj - vaša aplikacija živi na Thesari, besplatno ili po cijeni koju odredite."
            }
        },
        "storage": {
            "title": "Novi sloj memorije koji LLM-ovi nemaju",
            "tag": "Memorija i sobe",
            "shared": {
                "title": "Dijeljena memorija",
                "text": "Svi dijele isto stanje i rezultate (poput globalne ljestvice) bez oslanjanja na model razgovora."
            },
            "rooms": {
                "title": "Sobe",
                "text": "Omogućite sobe kada želite da više ljudi koristi vašu aplikaciju, ali svatko u privatnoj sesiji ili grupi."
            }
        },
        "footer": "AI entuzijasti - zamislite, razgovarajte s modelom, objavite ovdje i pustite druge da se igraju.",
        "footerHighlight": "Sretno s vašom prvom Thesara aplikacijom!",
        "loading": "Učitavanje..."
    }
}

hr_betahome_trans = {
    "listing": {
        "badge": {
            "free": "BESPLATNO"
        },
        "label": {
            "creator": "Kreator"
        },
        "actions": {
            "play": "Igraj",
            "fullDetails": "Detalji",
            "edit": "Uredi"
        },
        "tag": {
            "trending": "Popularno"
        }
    },
    "hero": {
        "badge": "Otkrijte nevjerojatne mini aplikacije i igre",
        "random": {
            "label": "Nasumični odabir",
            "details": "Pogledaj detalje"
        },
        "actions": {
            "submit": "Objavi aplikaciju"
        },
        "badges": {
            "curated": "Odabrano"
        },
        "card": {
            "description": "Izradite kolekcije AI iskustava i podijelite ih putem linka.",
            "stats": {
                "apps": "{count}+ Mini aplikacija",
                "favorites": "{count} favorita"
            }
        }
    },
    "promo": {
        "featuredLabel": "Izdvojeno",
        "learnMore": "Saznaj više"
    },
    "view": {
        "gridLabel": "Mreža",
        "decreaseGrid": "Prikaži manje kartica po redu",
        "increaseGrid": "Prikaži više kartica po redu"
    },
    "sort": {
        "newest": "Najnovije",
        "popular": "Najpopularnije",
        "alpha": "Abecedno",
        "label": "Sortiraj po"
    },
    "metrics": {
        "liveUsage": "Korištenje uživo",
        "apps": "Objavljene aplikacije",
        "members": "Članova zajednice",
        "runs": "Ukupno pokretanja"
    },
    "empty": {
        "noResults": "Nema rezultata za taj upit. Pokušaj promijeniti filtere.",
        "tryAdjust": "Pokušaj promijeniti tagove ili pretragu.",
        "beFirst": "Budi prvi koji će objaviti mini aplikaciju."
    },
    "filters": {
        "tagsHeading": "Popularne oznake",
        "clear": "Poništi filtere"
    },
    "actions": {
        "refresh": "Osvježi",
        "retry": "Pokušaj ponovo"
    },
    "errors": {
        "listings": "Ne mogu osvježiti feed. Pokušajte ponovo."
    },
    "sections": {
        "trending": {
            "count": "{count} aplikacija"
        }
    },
    "search": {
        "liveStats": "{apps} aktivnih aplikacija · {plays} igranja"
    },
    "sidebar": {
        "title": "Thesara Space v2.0",
        "subtitle": "Od AI razgovora do vaše mini aplikacije.",
        "nav": {
            "discover": "Otkrij",
            "games": "Igre",
            "productivity": "Produktivnost",
            "myApps": "Moje aplikacije",
            "paidApps": "Plaćene aplikacije",
            "myProjects": "Projekti",
            "myCreators": "Kreatori",
            "feelingLucky": "Osjećam se sretno"
        },
        "creatorMode": {
            "badge": "Kreatorski način",
            "title": "Od AI razgovora do vaše mini aplikacije",
            "description": "Stvori igru ili alat, upload-aj ga i dijeli s cijelom zajednicom.",
            "steps": {
                "0": {
                    "title": "Razgovaraj s AI-jem",
                    "text": "Zatraži asistenta da isporuči mini aplikaciju."
                },
                "1": {
                    "title": "Preuzmi kod",
                    "text": "Dobivaš bundle spreman za upload."
                },
                "2": {
                    "title": "Objavi na Thesari",
                    "text": "Upload, potvrdi i klikni Play."
                }
            },
            "memory": {
                "title": "Memorija i sobe",
                "detail1": "Dodatna memorija koju LLM-ovi nemaju.",
                "detail2": "Aktiviraj sobe kad želiš više korisnika s trajnim stanjima."
            },
            "cta": "Objavi svoju aplikaciju"
        }
    },
    "header": {
        "homeAria": "Thesara naslovnica",
        "liveBadge": "Uživo",
        "themeToggle": "Promijeni temu",
        "backLink": "← Natrag na uživo",
        "backLinkMobile": "← Natrag"
    }
}

hr_promo_trans = {
    "banners": {
        "0": {
            "title": "Jednostavne upute",
            "subtitle": "Kako iz razgovora s AI-jem doći do objave na Thesari."
        },
        "1": {
            "title": "Pravila objave",
            "subtitle": "Sve o monetizaciji, licencama i uvjetima."
        }
    }
}

de_betahome_trans = {
    "hero": {
        "badge": "Entdecke großartige Mini-Apps & Spiele"
    }
}

hr_toasts_trans = {
    "welcome": "Dobrodošli na Thesaru!",
    "loginToLike": "Prijavite se za lajkanje aplikacija",
    "slowDown": "Polako 🙂",
    "likeError": "Ne mogu lajkati aplikaciju. Provjerite API URL i status poslužitelja.",
    "loadError": "Ne mogu učitati aplikacije. Provjerite API URL i status poslužitelja.",
    "retry": "Pokušaj ponovo"
}

hr_footer_trans = {
    "slogan": "Tržnica za aplikacije i igre u pregledniku.",
    "allRights": "Sva prava pridržana.",
    "partnershipLink": "Partnerstvo s nama"
}

hr_partnership_trans = {
    "title": "Partnerstvo s nama",
    "description": "Recite nam nešto o svojoj organizaciji i vrsti suradnje koju želite ostvariti.",
    "nameLabel": "Vaše ime",
    "companyLabel": "Tvrtka ili projekt",
    "emailLabel": "Poslovni email",
    "phoneLabel": "Telefon (neobavezno)",
    "messagePlaceholder": "Opišite svoju ideju, ciljanu publiku, rokove ili vrijednost koju očekujete za obje strane.",
    "submit": "Pošalji zahtjev za partnerstvo",
    "sending": "Šaljem...",
    "cancel": "Odustani",
    "successMessage": "Hvala! Odgovorit ćemo uskoro.",
    "errorGeneric": "Nismo mogli poslati zahtjev. Pokušajte ponovo.",
    "errorEmail": "Unesite valjanu email adresu.",
    "errorMessage": "Opišite ideju partnerstva (najmanje 5 znakova).",
    "footerNote": "Također možete poslati email na activity(at)thesara.space",
    "closeLabel": "Zatvori obrazac za partnerstvo"
}

# Recursively update HR Home
def update_dict(target, source):
    for k, v in source.items():
        if isinstance(v, dict):
            if k not in target:
                target[k] = {}
            update_dict(target[k], v)
        else:
            target[k] = v

update_dict(hr_data["Home"], hr_home_trans)
if "BetaHome" in hr_data:
    update_dict(hr_data["BetaHome"], hr_betahome_trans)
if "Toasts" in hr_data:
    update_dict(hr_data["Toasts"], hr_toasts_trans)
if "Footer" in hr_data:
    update_dict(hr_data["Footer"], hr_footer_trans)
if "Partnership" in hr_data:
    update_dict(hr_data["Partnership"], hr_partnership_trans)

if "BetaHome" in de_data:
    update_dict(de_data["BetaHome"], de_betahome_trans)

if "promo" not in hr_data:
    hr_data["promo"] = {}
update_dict(hr_data["promo"], hr_promo_trans)

save_json(en_path, en_data)
save_json(hr_path, hr_data)
save_json(de_path, de_data)

print("Done fixing i18n files.")
