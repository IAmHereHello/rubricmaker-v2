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

### Backend als systemd-service

Maak `/etc/systemd/system/rubricmaker-api.service`:

```ini
[Unit]
Description=Rubricmaker API
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/rubricmaker-v2
ExecStart=/home/pi/.local/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable rubricmaker-api
sudo systemctl start rubricmaker-api
```

### Frontend builden en serveren

```bash
cd frontend
npm run build
# Serveer de dist/ map via nginx of een simpele static server
npx serve dist -l 3000 -s
```

Of voeg een tweede systemd-service toe die `npx serve dist -l 3000 -s` draait.

### Toegang via Tailscale

Zorg dat Tailscale actief is op de Pi en gebruik het Tailscale-IP om de app vanaf een andere machine te bereiken:

- Frontend: `http://<tailscale-ip>:3000`
- API:       `http://<tailscale-ip>:8000/docs`

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
