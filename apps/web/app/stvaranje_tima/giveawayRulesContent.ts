export type GiveawayRuleBullet = {
  text: string;
  subBullets?: string[];
};

export type GiveawayRuleSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: GiveawayRuleBullet[];
};

export type GiveawayRulesCopy = {
  title: string;
  notice: string;
  intro?: string;
  sections: GiveawayRuleSection[];
};

type LocaleRulesMap = Record<string, GiveawayRulesCopy>;

const GIVEAWAY_RULES: LocaleRulesMap = {
  en: {
    title: 'THESARA MINI WEB APP GIVEAWAY – OFFICIAL RULES',
    notice: 'These official rules cover the giveaway promoted on Thesara social media profiles.',
    intro: 'By entering the giveaway you agree to everything listed below, so please read carefully.',
    sections: [
      {
        heading: '1. Promoter',
        paragraphs: [
          'The promoter of this giveaway ("Giveaway") is Thesara (the "Promoter"), operating the platform Thesara.space.',
        ],
      },
      {
        heading: '2. Purpose and nature of the Giveaway',
        paragraphs: [
          'This Giveaway is organised purely for promotional purposes to raise awareness of the Thesara.space platform.',
          'Participation is voluntary and free. This is a goodwill promotion and does not create any obligation on the Promoter beyond what is described in these rules.',
        ],
      },
      {
        heading: '3. Eligibility',
        bullets: [
          {
            text: 'Open to natural persons aged 18+ who have an active TikTok and/or Instagram account (depending on where the Giveaway is announced), unless prohibited by local law.',
          },
          {
            text: 'Employees, contractors and close collaborators of the Promoter are not eligible.',
          },
          {
            text: 'The Giveaway is void where prohibited by law.',
          },
        ],
        paragraphs: [
          'Participants are responsible for ensuring that taking part in this Giveaway is allowed under the laws of their country of residence.',
        ],
      },
      {
        heading: '4. Entry period',
        bullets: [
          { text: 'The Giveaway starts when the official post is published (planned for 3 December 2025 at 00:01 CET).' },
          { text: 'The Giveaway ends on 15 December 2025 at 23:59 CET.' },
        ],
        paragraphs: [
          'The Promoter may adjust these dates and will communicate any changes via its official channels.',
        ],
      },
      {
        heading: '5. How to enter',
        paragraphs: ['To enter, during the Entry Period you must complete the following steps:'],
        bullets: [
          { text: "Like the official Giveaway post on the Promoter's TikTok or Instagram account (as specified in the post)." },
          { text: "Follow the Promoter's account on the same platform." },
        ],
        paragraphs: [
          'No purchase or payment is required to enter or win. A purchase does not increase your chances of winning.',
          'One entry per person per platform. Using multiple accounts, bots or any automated methods to gain extra entries may result in disqualification.',
        ],
      },
      {
        heading: '6. Prize',
        bullets: [
          {
            text: 'There is one (1) prize: a custom mini web application ("Mini App") created by the Promoter and deployed on or via Thesara.space.',
          },
          {
            text: 'A Mini App is defined as a simple, lightweight, browser-based tool, for example: a small utility, calculator, tracker or similarly modest web-based logic.',
          },
          {
            text: 'The Mini App will be built in consultation with the winner, but it will not include, among other things:',
            subBullets: [
              'advanced or complex payment integrations (e.g. Stripe, PayPal, Apple/Google Pay),',
              'large custom back-end systems or complex databases,',
              'full mobile apps (iOS/Android),',
              'multi-user platforms or marketplaces,',
              'long-term or enterprise-level development projects that would reasonably be considered a high-budget (e.g. 10,000+ EUR) project.',
            ],
          },
        ],
        paragraphs: [
          'The approximate maximum value of the work included in this Giveaway is up to EUR [X] (development time, design and deployment combined). The exact amount can be defined internally by the Promoter.',
          'The prize is non-transferable and cannot be exchanged for cash or any other alternative, unless the Promoter decides at its sole discretion to offer a substitute of equal or lesser value.',
        ],
      },
      {
        heading: '7. Scope, expectations and oversized ideas',
        bullets: [
          {
            text: "After the winner is selected, the Promoter will discuss the winner's idea and agree on a realistic, simplified Mini App that fits within the prize scope described above.",
          },
          {
            text: 'If the winner initially proposes a project that is clearly outside this scope, the Promoter will:',
            subBullets: [
              'explain the limitations, and',
              'suggest a simpler version that can reasonably be delivered as part of the Giveaway.',
            ],
          },
          {
            text: 'The final scope of the Mini App is decided by the Promoter, after reasonable discussion with the winner, to keep the project realistic and deliverable in a short timeframe.',
          },
          {
            text: 'If no reasonable agreement on a realistic scope can be reached, the Promoter reserves the right to:',
            subBullets: [
              'cancel the prize for that winner, and',
              'optionally select an alternative winner.',
            ],
          },
        ],
      },
      {
        heading: '8. Winner selection and announcement',
        bullets: [
          {
            text: 'After the Giveaway ends, the Promoter will select one (1) winner at random from all eligible entries that complied with these rules.',
          },
          {
            text: 'The winner will be announced publicly and contacted directly within [X days] after the end of the Giveaway.',
            subBullets: [
              "announced publicly on the Promoter's TikTok/Instagram account, and",
              'contacted via direct message (DM) on the platform where they entered.',
            ],
          },
          {
            text: 'If the winner does not respond within [X days] after being contacted, or is found to be ineligible, the Promoter may select an alternative winner.',
          },
        ],
      },
      {
        heading: '9. Delivery timeline',
        paragraphs: [
          'The Promoter aims to deliver a functioning version of the Mini App within a reasonable time after agreeing on the final scope with the winner (for example, before [Christmas 2025], if the timeline allows).',
          'However, factors such as technical complexity, winner responsiveness and unforeseen circumstances may affect the exact delivery date. The Promoter will keep the winner informed and act in good faith.',
        ],
      },
      {
        heading: '10. Intellectual property and use of the Mini App',
        bullets: [
          { text: 'The underlying source code and technical implementation of the Mini App remain the property of the Promoter, unless otherwise agreed in writing.' },
          { text: 'The winner receives a right to use the Mini App for their personal or business purposes and may, if available, choose to publish and monetize it on Thesara.space under the standard terms of the platform.' },
          { text: 'The Promoter is not obliged to provide full source code, full transfer of intellectual property rights or long-term maintenance as part of the Giveaway prize.' },
          { text: "The Promoter may, with the winner's consent, showcase the Mini App as a portfolio/example on Thesara.space and in its marketing materials." },
        ],
      },
      {
        heading: '11. Data protection and privacy',
        bullets: [
          {
            text: "The Promoter will process participants' data (e.g. usernames, contact details, high-level description of the idea) only for:",
            subBullets: [
              'running and administering the Giveaway,',
              'contacting the winner, and',
              'developing and delivering the Mini App.',
            ],
          },
          { text: "Data will be handled in line with applicable data protection laws (including GDPR, where relevant) and the Promoter's Privacy Policy, available on Thesara.space." },
          { text: 'By participating, you consent to this limited use of your data for the purposes of this Giveaway.' },
        ],
      },
      {
        heading: '12. Platform disclaimer',
        paragraphs: [
          'This promotion is in no way sponsored, endorsed, administered by, or associated with TikTok, Instagram, Meta or any other platform. Participants release these platforms from any responsibility related to the Giveaway.',
        ],
      },
      {
        heading: '13. Limitation of liability',
        bullets: [
          { text: 'The Promoter is not liable for any technical issues, platform outages, lost entries or similar problems beyond its reasonable control.' },
          { text: 'The Promoter is not responsible for any indirect, incidental or consequential damages arising from participation in the Giveaway or use of the Mini App.' },
          { text: 'Nothing in these rules excludes liability for fraud or for any matter which cannot be excluded under applicable law.' },
        ],
      },
      {
        heading: '14. Changes or cancellation',
        paragraphs: [
          "The Promoter reserves the right to modify, suspend or cancel the Giveaway or these rules if necessary due to technical, legal or other reasons beyond its reasonable control. Any material changes will be communicated via the Promoter's official channels.",
        ],
      },
      {
        heading: '15. Governing law and jurisdiction',
        paragraphs: [
          "These rules and the Giveaway are governed by the laws of the Republic of Croatia, and any disputes shall be subject to the exclusive jurisdiction of the competent courts in Croatia, unless mandatory consumer protection laws of the participant's country provide otherwise.",
        ],
      },
      {
        heading: '16. Contact',
        paragraphs: [
          'For any questions regarding this Giveaway, you can contact the Promoter at welcome@thesara.space.',
        ],
      },
    ],
  },
  hr: {
    title: 'THESARA MINI WEB APP GIVEAWAY – SLUŽBENA PRAVILA',
    notice: 'Ova pravila vrijede za nagradnu igru objavljenu na društvenim mrežama Thesare.',
    intro: 'Sudjelovanjem prihvaćate sve niže navedeno, stoga molimo da pravila pozorno pročitate.',
    sections: [
      {
        heading: '1. Organizator',
        paragraphs: [
          'Organizator ove nagradne igre ("Nagradna igra") je Thesara ("Organizator"), koja upravlja platformom Thesara.space.',
        ],
      },
      {
        heading: '2. Svrha i priroda nagradne igre',
        paragraphs: [
          'Nagradna igra organizira se isključivo u promotivne svrhe kako bi se povećala prepoznatljivost platforme Thesara.space.',
          'Sudjelovanje je dobrovoljno i besplatno. Ovo je promotivna akcija dobre volje i ne stvara nikakve obveze Organizatora izvan onih koje su opisane u ovim pravilima.',
        ],
      },
      {
        heading: '3. Pravo sudjelovanja',
        bullets: [
          {
            text: 'Sudjelovati mogu fizičke osobe starije od 18 godina koje imaju aktivan TikTok i/ili Instagram profil (ovisno o tome gdje je nagradna igra objavljena), osim ako je to zabranjeno lokalnim propisima.',
          },
          { text: 'Zaposlenici, vanjski suradnici i bliski partneri Organizatora ne mogu sudjelovati.' },
          { text: 'Nagradna igra je ništetna gdje je to zabranjeno zakonom.' },
        ],
        paragraphs: [
          'Sudionici su sami odgovorni provjeriti je li sudjelovanje dopušteno prema propisima države u kojoj žive.',
        ],
      },
      {
        heading: '4. Trajanje nagradne igre',
        bullets: [
          { text: 'Nagradna igra počinje objavom službene objave (planirano za 3. prosinca 2025. u 00:01 CET).' },
          { text: 'Nagradna igra završava 15. prosinca 2025. u 23:59 CET.' },
        ],
        paragraphs: ['Organizator može prilagoditi navedene datume i o svakoj promjeni će obavijestiti putem službenih kanala.'],
      },
      {
        heading: '5. Kako sudjelovati',
        paragraphs: ['Tijekom trajanja nagradne igre potrebno je napraviti sljedeće korake:'],
        bullets: [
          { text: 'Lajkati službenu objavu nagradne igre na TikTok ili Instagram profilu Organizatora (kako je navedeno u objavi).' },
          { text: 'Zaprati profil Organizatora na istoj platformi.' },
        ],
        paragraphs: [
          'Kupnja ili plaćanje nisu uvjet za sudjelovanje niti povećavaju šanse za dobitak.',
          'Dozvoljen je jedan unos po osobi i po platformi. Korištenje više profila, botova ili automatiziranih metoda za povećanje broja prijava može rezultirati diskvalifikacijom.',
        ],
      },
      {
        heading: '6. Nagrada',
        bullets: [
          {
            text: 'Dodjeljuje se jedna (1) nagrada: personalizirana mini web aplikacija ("Mini App") koju kreira Organizator i objavljuje na ili putem Thesara.space.',
          },
          {
            text: 'Mini App se definira kao jednostavan, lagan, web alat, primjerice mali kalkulator, tracker ili sličan alat ograničene logike.',
          },
          {
            text: 'Mini App nastaje u dogovoru s dobitnikom, ali ne uključuje, između ostalog:',
            subBullets: [
              'napredne ili kompleksne payment integracije (Stripe, PayPal, Apple/Google Pay itd.),',
              'velike prilagođene back-end sustave ili kompleksne baze podataka,',
              'kompletne mobilne aplikacije (iOS/Android),',
              'platforme za više korisnika ili marketplace rješenja,',
              'dugotrajne ili enterprise projekte koje bi se razumno smatralo visokobudžetnima (npr. 10.000+ EUR).',
            ],
          },
        ],
        paragraphs: [
          'Okvirna maksimalna vrijednost rada uključenog u nagradu iznosi do EUR [X] (ukupno vrijeme razvoja, dizajn i implementacija). Točan iznos definira Organizator interno.',
          'Nagrada nije prenosiva i ne može se zamijeniti za novac ili neku drugu opciju, osim ako Organizator po vlastitoj procjeni ne ponudi zamjenu jednake ili manje vrijednosti.',
        ],
      },
      {
        heading: '7. Opseg, očekivanja i preambiciozne ideje',
        bullets: [
          { text: 'Nakon odabira dobitnika Organizator će raspraviti ideju i dogovoriti realan, pojednostavljen Mini App koji stane u opisani opseg nagrade.' },
          {
            text: 'Ako dobitnik predloži projekt koji je očito izvan tog opsega, Organizator će:',
            subBullets: [
              'objasniti ograničenja i',
              'predložiti jednostavniju verziju koja se može isporučiti u sklopu nagradne igre.',
            ],
          },
          { text: 'Konačni opseg Mini Appa definira Organizator nakon razumnog dogovora s dobitnikom kako bi projekt ostao izvediv u kratkom roku.' },
          {
            text: 'Ako se ne postigne razuman dogovor o opsegu, Organizator zadržava pravo:',
            subBullets: ['poništiti nagradu za tog dobitnika i', 'po potrebi odabrati zamjenskog dobitnika.'],
          },
        ],
      },
      {
        heading: '8. Odabir i objava dobitnika',
        bullets: [
          { text: 'Po završetku nagradne igre Organizator nasumično bira jednog (1) dobitnika među svim prijavama koje zadovoljavaju ova pravila.' },
          {
            text: 'Dobitnik će biti objavljen javno i kontaktiran unutar [X dana] nakon završetka nagradne igre:',
            subBullets: ['objava na TikTok/Instagram profilu Organizatora i', 'slanje privatne poruke (DM) na platformi na kojoj je sudjelovao.'],
          },
          { text: 'Ako se dobitnik ne javi u roku od [X dana] od kontakta ili se utvrdi da nije ispunio uvjete, Organizator može odabrati drugog dobitnika.' },
        ],
      },
      {
        heading: '9. Rok isporuke',
        paragraphs: [
          'Organizator će nastojati isporučiti funkcionalnu verziju Mini Appa u razumnom roku nakon dogovora o konačnom opsegu (primjerice do [Božića 2025.], ako to vremenski okvir dopušta).',
          'Na rok isporuke mogu utjecati tehnička složenost, brzina povratne informacije dobitnika i nepredviđene okolnosti. Organizator će dobitnika obavještavati i postupati u dobroj vjeri.',
        ],
      },
      {
        heading: '10. Intelektualno vlasništvo i korištenje Mini Appa',
        bullets: [
          { text: 'Izvorni kod i tehnička implementacija Mini Appa ostaju vlasništvo Organizatora, osim ako pisanim putem nije dogovoreno drugačije.' },
          { text: 'Dobitnik stječe pravo korištenja Mini Appa za osobne ili poslovne potrebe te ga može, ako opcija postoji, objaviti i monetizirati na Thesara.space prema standardnim uvjetima platforme.' },
          { text: 'Organizator nije dužan predati cjelokupan kod, prenijeti sva prava intelektualnog vlasništva niti osigurati dugoročno održavanje u sklopu nagrade.' },
          { text: 'Uz suglasnost dobitnika, Organizator može Mini App koristiti kao referencu u portfelju i marketinškim materijalima.' },
        ],
      },
      {
        heading: '11. Zaštita podataka i privatnost',
        bullets: [
          {
            text: 'Organizator obrađuje podatke sudionika (npr. korisnička imena, kontakt podatke, sažeti opis ideje) samo u svrhu:',
            subBullets: ['provođenja i administracije nagradne igre,', 'kontaktiranja dobitnika i', 'razvoja i isporuke Mini Appa.'],
          },
          { text: 'Podaci se obrađuju u skladu s važećim propisima o zaštiti podataka (uključujući GDPR gdje je primjenjivo) te Politikom privatnosti Organizatora dostupnom na Thesara.space.' },
          { text: 'Sudjelovanjem pristajete na opisanu, ograničenu obradu podataka u svrhu ove nagradne igre.' },
        ],
      },
      {
        heading: '12. Odricanje od odgovornosti platformi',
        paragraphs: ['Ova promocija nije ni na koji način sponzorirana, odobrena, vođena niti povezana s TikTokom, Instagramom, Metom niti bilo kojom drugom platformom. Sudjelovanjem oslobađate navedene platforme svake odgovornosti povezane s nagradnom igrom.'],
      },
      {
        heading: '13. Ograničenje odgovornosti',
        bullets: [
          { text: 'Organizator ne odgovara za tehničke probleme, nedostupnost platformi, izgubljene prijave ili slične situacije izvan razumne kontrole.' },
          { text: 'Organizator ne odgovara za neizravne, slučajne ili posljedične štete koje proizlaze iz sudjelovanja u nagradnoj igri ili korištenja Mini Appa.' },
          { text: 'Ništa iz ovih pravila ne isključuje odgovornost za prijevaru niti za situacije koje se prema primjenjivom pravu ne mogu isključiti.' },
        ],
      },
      {
        heading: '14. Promjene ili otkazivanje',
        paragraphs: ['Organizator zadržava pravo izmijeniti, privremeno obustaviti ili otkazati nagradnu igru ili ova pravila ako je to nužno zbog tehničkih, pravnih ili drugih razloga izvan razumne kontrole. O svim bitnim promjenama obavijestit će sudionike putem službenih kanala.'],
      },
      {
        heading: '15. Mjerodavno pravo i nadležnost',
        paragraphs: ['Na ova pravila i nagradnu igru primjenjuje se pravo Republike Hrvatske, a za eventualne sporove nadležni su sudovi u Republici Hrvatskoj, osim ako obvezni propisi o zaštiti potrošača u zemlji sudionika ne propisuju drugačije.'],
      },
      {
        heading: '16. Kontakt',
        paragraphs: ['Za sva pitanja o nagradnoj igri možete se obratiti Organizatoru na welcome@thesara.space.'],
      },
    ],
  },
  de: {
    title: 'THESARA MINI WEB APP GIVEAWAY – OFFIZIELLE REGELN',
    notice: 'Diese Regeln gelten für das Gewinnspiel, das auf den Social-Media-Kanälen von Thesara veröffentlicht wurde.',
    intro: 'Mit der Teilnahme erkennen Sie alle untenstehenden Bestimmungen an. Bitte lesen Sie die Regeln sorgfältig.',
    sections: [
      {
        heading: '1. Veranstalter',
        paragraphs: ['Veranstalter dieses Gewinnspiels ("Gewinnspiel") ist Thesara (der "Veranstalter"), Betreiber der Plattform Thesara.space.'],
      },
      {
        heading: '2. Zweck und Charakter des Gewinnspiels',
        paragraphs: [
          'Das Gewinnspiel wird ausschließlich zu Werbezwecken organisiert, um die Plattform Thesara.space bekannter zu machen.',
          'Die Teilnahme ist freiwillig und kostenlos. Es handelt sich um eine Promotion aus reiner Kulanz und begründet keine weiteren Verpflichtungen des Veranstalters als in diesen Regeln beschrieben.',
        ],
      },
      {
        heading: '3. Teilnahmeberechtigung',
        bullets: [
          {
            text: 'Teilnahmeberechtigt sind natürliche Personen ab 18 Jahren mit einem aktiven TikTok- und/oder Instagram-Konto (je nachdem, wo das Gewinnspiel angekündigt wird), sofern dies nicht gegen lokale Gesetze verstößt.',
          },
          { text: 'Mitarbeitende, Auftragnehmer und enge Partner des Veranstalters sind nicht teilnahmeberechtigt.' },
          { text: 'Das Gewinnspiel ist dort ungültig, wo es gesetzlich verboten ist.' },
        ],
        paragraphs: ['Teilnehmende sind selbst dafür verantwortlich sicherzustellen, dass die Teilnahme nach den Gesetzen ihres Wohnsitzlandes zulässig ist.'],
      },
      {
        heading: '4. Teilnahmezeitraum',
        bullets: [
          { text: 'Das Gewinnspiel startet mit der Veröffentlichung des offiziellen Posts (geplant für den 3. Dezember 2025 um 00:01 CET).' },
          { text: 'Das Gewinnspiel endet am 15. Dezember 2025 um 23:59 CET.' },
        ],
        paragraphs: ['Der Veranstalter kann diese Daten anpassen und informiert über Änderungen auf den offiziellen Kanälen.'],
      },
      {
        heading: '5. Teilnahme',
        paragraphs: ['Für eine Teilnahme im Aktionszeitraum sind folgende Schritte erforderlich:'],
        bullets: [
          { text: 'Den offiziellen Gewinnspiel-Post auf dem TikTok- oder Instagram-Konto des Veranstalters liken (wie im Post angegeben).' },
          { text: 'Dem Konto des Veranstalters auf derselben Plattform folgen.' },
        ],
        paragraphs: [
          'Für die Teilnahme oder einen Gewinn ist kein Kauf oder eine Zahlung erforderlich. Ein Kauf erhöht nicht die Gewinnchancen.',
          'Pro Person und Plattform ist nur eine Teilnahme zulässig. Mehrere Konten, Bots oder automatisierte Methoden können zur Disqualifikation führen.',
        ],
      },
      {
        heading: '6. Preis',
        bullets: [
          {
            text: 'Es gibt einen (1) Preis: eine individuelle Mini-Webanwendung ("Mini App"), entwickelt vom Veranstalter und bereitgestellt über Thesara.space.',
          },
          {
            text: 'Eine Mini App ist ein einfaches, leichtgewichtiges Web-Tool, zum Beispiel ein kleines Utility, ein Rechner, Tracker oder ähnliche Logik.',
          },
          {
            text: 'Die Mini App wird in Abstimmung mit der Gewinnerin/dem Gewinner erstellt, umfasst jedoch unter anderem nicht:',
            subBullets: [
              'komplexe Zahlungsintegrationen (z. B. Stripe, PayPal, Apple/Google Pay),',
              'große individuelle Back-End-Systeme oder komplexe Datenbanken,',
              'vollständige Mobile Apps (iOS/Android),',
              'Multi-User-Plattformen oder Marktplätze,',
              'langfristige bzw. Enterprise-Projekte, die vernünftigerweise als Hochbudget (z. B. 10.000+ EUR) einzustufen wären.',
            ],
          },
        ],
        paragraphs: [
          'Der ungefähre Höchstwert der im Gewinn enthaltenen Leistung beträgt bis zu EUR [X] (Entwicklungszeit, Design und Bereitstellung). Die genaue Summe bestimmt der Veranstalter intern.',
          'Der Preis ist nicht übertragbar und kann nicht gegen Bargeld oder Alternativen eingetauscht werden, außer der Veranstalter bietet nach eigenem Ermessen einen gleichwertigen oder geringeren Ersatz an.',
        ],
      },
      {
        heading: '7. Umfang, Erwartungen und überdimensionierte Ideen',
        bullets: [
          { text: 'Nach der Auslosung stimmt der Veranstalter die Idee mit der Gewinnerin/dem Gewinner ab und definiert eine realistische, vereinfachte Mini App innerhalb des oben beschriebenen Umfangs.' },
          {
            text: 'Schlägt die Gewinnerin/der Gewinner zunächst ein Projekt außerhalb dieses Rahmens vor, wird der Veranstalter:',
            subBullets: ['die Grenzen erklären und', 'eine einfachere Version vorschlagen, die im Rahmen des Gewinnspiels umsetzbar ist.'],
          },
          { text: 'Der finale Umfang der Mini App wird vom Veranstalter festgelegt, nachdem in angemessenem Rahmen mit der Gewinnerin/dem Gewinner gesprochen wurde, um das Projekt realistisch und zeitnah lieferbar zu halten.' },
          {
            text: 'Kann keine realistische Lösung gefunden werden, behält sich der Veranstalter vor:',
            subBullets: ['den Preis für diese Person zu stornieren und', 'optional eine/n Ersatzgewinner/in zu ziehen.'],
          },
        ],
      },
      {
        heading: '8. Gewinnerermittlung und Bekanntgabe',
        bullets: [
          { text: 'Nach Ende des Gewinnspiels wählt der Veranstalter eine/n Gewinner/in nach dem Zufallsprinzip aus allen gültigen Teilnahmen.' },
          {
            text: 'Die Gewinnerin/der Gewinner wird innerhalb von [X Tagen] nach Ende des Gewinnspiels öffentlich bekannt gegeben und direkt kontaktiert:',
            subBullets: ['öffentliche Bekanntgabe auf dem TikTok-/Instagram-Konto des Veranstalters und', 'Kontakt per Direktnachricht (DM) auf der Plattform, auf der teilgenommen wurde.'],
          },
          { text: 'Reagiert die Gewinnerin/der Gewinner nicht innerhalb von [X Tagen] oder stellt sich als nicht berechtigt heraus, kann der Veranstalter eine/n Ersatzgewinner/in auswählen.' },
        ],
      },
      {
        heading: '9. Lieferzeitplan',
        paragraphs: [
          'Der Veranstalter strebt an, nach Abstimmung des finalen Umfangs innerhalb eines angemessenen Zeitraums eine funktionsfähige Version der Mini App zu liefern (z. B. bis [Weihnachten 2025], sofern der Zeitplan dies zulässt).',
          'Technische Komplexität, Reaktionszeit der Gewinnerin/des Gewinners sowie unvorhergesehene Umstände können den Termin beeinflussen. Der Veranstalter informiert transparent und handelt nach bestem Wissen.',
        ],
      },
      {
        heading: '10. Geistiges Eigentum und Nutzung der Mini App',
        bullets: [
          { text: 'Quellcode und technische Umsetzung der Mini App bleiben Eigentum des Veranstalters, sofern nichts anderes schriftlich vereinbart wird.' },
          { text: 'Die Gewinnerin/der Gewinner erhält das Recht, die Mini App für eigene oder geschäftliche Zwecke zu nutzen und kann sie, sofern verfügbar, auf Thesara.space gemäß den Standardbedingungen veröffentlichen und monetarisieren.' },
          { text: 'Der Veranstalter ist nicht verpflichtet, den vollständigen Quellcode zu übergeben, sämtliche Rechte zu übertragen oder langfristigen Support anzubieten.' },
          { text: 'Mit Zustimmung der Gewinnerin/des Gewinners darf der Veranstalter die Mini App als Referenz auf Thesara.space und in Marketingmaterialien zeigen.' },
        ],
      },
      {
        heading: '11. Datenschutz',
        bullets: [
          {
            text: 'Der Veranstalter verarbeitet Daten der Teilnehmenden (z. B. Benutzernamen, Kontaktdaten, grobe Ideenbeschreibung) ausschließlich zur:',
            subBullets: ['Durchführung und Verwaltung des Gewinnspiels,', 'Kontaktaufnahme mit der Gewinnerin/dem Gewinner und', 'Entwicklung sowie Auslieferung der Mini App.'],
          },
          { text: 'Die Datenverarbeitung erfolgt gemäß den geltenden Datenschutzgesetzen (einschließlich DSGVO, soweit anwendbar) und der Datenschutzrichtlinie auf Thesara.space.' },
          { text: 'Mit der Teilnahme stimmen Sie dieser begrenzten Nutzung Ihrer Daten für das Gewinnspiel zu.' },
        ],
      },
      {
        heading: '12. Haftungsausschluss der Plattformen',
        paragraphs: ['Diese Promotion steht in keiner Verbindung zu TikTok, Instagram, Meta oder einer anderen Plattform und wird weder gesponsert noch unterstützt oder organisiert. Teilnehmende stellen diese Plattformen von sämtlicher Verantwortung im Zusammenhang mit dem Gewinnspiel frei.'],
      },
      {
        heading: '13. Haftungsbeschränkung',
        bullets: [
          { text: 'Der Veranstalter haftet nicht für technische Probleme, Ausfälle der Plattformen, verlorene Einsendungen oder Ähnliches außerhalb seines Einflussbereichs.' },
          { text: 'Der Veranstalter haftet nicht für indirekte, beiläufige oder Folgeschäden, die aus der Teilnahme am Gewinnspiel oder der Nutzung der Mini App entstehen.' },
          { text: 'Nichts in diesen Regeln schließt Haftung für Betrug oder andere gesetzlich unverzichtbare Ansprüche aus.' },
        ],
      },
      {
        heading: '14. Änderungen oder Aussetzung',
        paragraphs: ['Der Veranstalter behält sich das Recht vor, das Gewinnspiel oder diese Regeln bei technischen, rechtlichen oder anderen zwingenden Gründen zu ändern, zu unterbrechen oder zu beenden. Wesentliche Änderungen werden über die offiziellen Kanäle kommuniziert.'],
      },
      {
        heading: '15. Anwendbares Recht und Gerichtsstand',
        paragraphs: ['Es gilt das Recht der Republik Kroatien. Ausschließlicher Gerichtsstand sind die zuständigen Gerichte in Kroatien, sofern zwingende Verbraucherschutzvorschriften des Wohnsitzlandes nichts anderes bestimmen.'],
      },
      {
        heading: '16. Kontakt',
        paragraphs: ['Bei Fragen zum Gewinnspiel kontaktieren Sie den Veranstalter unter welcome@thesara.space.'],
      },
    ],
  },
};

export function getGiveawayRules(locale: string): GiveawayRulesCopy {
  const languageCode = (locale || 'en').split('-')[0];
  return GIVEAWAY_RULES[languageCode] || GIVEAWAY_RULES.en;
}
