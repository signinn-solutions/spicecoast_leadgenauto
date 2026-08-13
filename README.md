# SpiceCoast · B2B Lead Automation & Verification

An automated lead generation and enrichment platform tailored for **SpiceCoast**, combining **Google Places API** and **Hunter.io** for targeted B2B lead discovery and deliverability verification with an interactive Web Dashboard.

## Features
- **Modern SpiceCoast UI**: Warm spice-themed dashboard (turmeric, paprika, cardamom palette, Fraunces serif & IBM Plex Mono typography).
- **Search & Discovery**: Find businesses by type, city, and country using Google Places Text Search (New API) or instant simulation mode.
- **Enrichment & Verification**: Live email lookup and deliverability verification via Hunter.io.
- **Analytics & Visualizations**: Recharts-powered deliverability breakdown and searchable query history.
- **Lead Filtering & Export**: Filter by deliverable email, valid phone, or fully verified, and export to CSV.
- **Quota Protection**: Enforces 50 leads/day ceiling with automatic daily resets.

---

## Getting Started

### 1. Install Dependencies
```bash
# Python dependencies
pip install requests python-dotenv flask flask-cors

# Frontend dependencies
npm install
```

### 2. Configure API Keys
Create or edit `.env` in the root directory:
```env
GOOGLE_API_KEY=your_google_places_api_key
HUNTER_API_KEY=your_hunter_api_key
```

### 3. Run the Web Application
```bash
# Option A: Run full stack (Flask API + Vite UI concurrently)
npm start

# Option B: Run UI dev server
npm run dev

# Option C: Run Python backend server
python3 server.py
```

### 4. CLI / Test Suite
```bash
# Run CLI script
python3 lead_finder_test.py

# Run limit unit tests
python3 -m unittest test_limits.py
```
