# Klar

To-dos – schnell diktiert, klar sortiert. Eine Progressive Web App ohne Build-Schritt.

- **App:** https://juto99.github.io/klar/
- **Daten:** liegen ausschließlich lokal im Browser des jeweiligen Geräts (IndexedDB). Dieses Repository enthält nur Programmcode – keine To-dos, keine Personendaten.
- **Offline:** `sw.js` hält alle Dateien im Cache vor.

## Installieren

- **iPhone/iPad:** Adresse in Safari öffnen → Teilen → „Zum Home-Bildschirm“.
- **Mac/Windows:** In Chrome oder Edge → Adressleiste → „App installieren“.

## Neue Version veröffentlichen

1. Änderungen in `index.html` vornehmen.
2. In `sw.js` die `VERSION` erhöhen (z. B. `klar-v2`).
3. Committen und pushen – GitHub Pages veröffentlicht automatisch.

## Etappen

1. ✅ PWA, lokale Datenbank, Eingabe-Assistent, Listen, Kalender, Kategorien, Personen, Projekte, Erledigt/Archiv
2. Feinschliff Ansichten
3. Login + Sync zwischen Geräten (Supabase)
4. KI-Parser + Wispr-Kurzbefehl („Eingang“)
5. Import aus Obsidian
