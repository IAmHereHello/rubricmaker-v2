# Rubricmaker v2

Nakijktool voor wiskunde: toetsen maken, nakijken en leerlingvoortgang bijhouden.

## Vereisten

- Python 3.11+
- Node.js 18+ en npm

## Backend (FastAPI + SQLite)

```bash
cd backend
pip install -r requirements.txt

# Starten (vanuit de root van het project):
cd ..
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

De database (`rubricmaker.db`) wordt automatisch aangemaakt bij de eerste start.

API-documentatie is beschikbaar op: `http://localhost:8000/docs`

## Frontend (React + Vite)

```bash
cd frontend
npm install
npm start          # of: npm run dev
```

De app is dan bereikbaar op `http://localhost:3000`.

Via Vite's proxy stuurt de frontend alle `/api/...` requests automatisch door naar de backend op poort 8000, dus beide servers moeten tegelijk draaien.

## Raspberry Pi 5 — productiedraaiing

De `deploy/` map bevat alle bestanden die nodig zijn om de app automatisch te laten starten.

### Eenmalige setup (eerste keer)

Zorg dat het project gecloned is in `/home/michael/rubricgrader`, en draai dan:

```bash
bash /home/michael/rubricgrader/deploy/setup.sh
```

Dit doet het volgende automatisch:
1. Maakt een Python `.venv` aan en installeert backend-dependencies
2. Bouwt de frontend (`npm run build`)
3. Installeert en activeert `rubricmaker-api` als systemd-service
4. Installeert nginx, koppelt de config in `deploy/nginx-rubricmaker.conf`, en start nginx
5. Plaatst een klikbare snelkoppeling op het bureaublad

Na de setup start de app automatisch bij elke herstart van de Pi.

### Hoe het werkt (architectuur)

In productie draait er geen Vite dev-server. In plaats daarvan:

- **FastAPI** draait op `127.0.0.1:8000` (alleen lokaal bereikbaar)
- **nginx** luistert op poort 3000 en doet twee dingen:
  - `/api/...` → doorsturen naar FastAPI op poort 8000 (zonder het `/api`-prefix)
  - Al het overige → statische bestanden serveren vanuit `frontend/dist/`

De SPA-routing (`try_files ... /index.html`) zorgt dat React Router correct werkt.

### App bijwerken naar de nieuwste versie

Dubbelklik op `Rubricmaker updaten` op het bureaublad, **of** draai via SSH:

```bash
cd /home/michael/rubricgrader
./update.sh
```

Het script haalt de nieuwste main-branch op, herbouwt de frontend, en herstart de backend.

### Handmatige commando's

```bash
# Status controleren
sudo systemctl status rubricmaker-api
sudo systemctl status nginx

# Logs bekijken
journalctl -u rubricmaker-api -f

# Handmatig herstarten
sudo systemctl restart rubricmaker-api
sudo systemctl reload nginx
```

### Toegang via Tailscale

Zorg dat Tailscale actief is op de Pi en gebruik het Tailscale-IP:

- App: `http://<tailscale-ip>:3000`
- API-docs: `http://<tailscale-ip>:8000/docs` (alleen voor debuggen)

## Pagina's

| Pad | Beschrijving |
|-----|-------------|
| `/students` | Leerlingenbeheer per klas |
| `/students/:id/progress` | Voortgang per leerling (heatmap per domein × niveau) |
| `/tests` | Toetsenlijst |
| `/tests/:id/edit` | Toets en vragen bewerken |
| `/sessions/new` | Nakijksessie starten |
| `/sessions/:id/grade` | Nakijkscherm (vraag voor vraag, leerling voor leerling) |
| `/classes/:class_name/overview` | Klasoverzicht heatmap gefilterd op route |

## Routes

Elke leerling heeft een **route**: oranje, geel of blauw.  
Elke vraag is van toepassing op een subset van routes. Niet-toepasselijke vragen worden automatisch overgeslagen tijdens het nakijken.

## Niveaulagen (De Lange's piramide)

- **Reproductie** — standaardprocedures en feitenkennis
- **Verbinding** — concepten verbinden en toepassen
- **Reflectie** — redeneren, beargumenteren, wiskundig denken
# rubricgrader
