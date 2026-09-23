# SpiceCoast · B2B Lead Automation & AI Mailbox (Node.js + Express)

A production-ready automated B2B lead generation, enrichment, and AI email responder platform tailored for **SpiceCoast**, powered by **Node.js, Express.js, DeepSeek AI, Google Places API, Hunter.io, and Hostinger Agentic Mail API**.

---

## 🌟 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Port 3000)                     │
│         React 18 + Vite 6 + Recharts + Lucide Icons         │
└──────────────────────────────┬──────────────────────────────┘
                               │  Vite Reverse Proxy (/api, /webhook)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Node.js + Express.js API                    │
│             (Port 5000 / 5001 or process.env.PORT)          │
└──────┬───────────────────────┬───────────────────────┬──────┘
       │                       │                       │
┌──────▼────────┐      ┌───────▼────────┐      ┌───────▼────────┐
│ Google Places │      │   Hunter.io    │      │  DeepSeek AI & │
│ API (Places)  │      │(Email Verifier)│      │ Hostinger Mail │
└───────────────┘      └────────────────┘      └────────────────┘
```

---

## 🚀 Key Features

1. **B2B Lead Discovery**: Search targeted spice importers and traders by business keyword, city, and country via Google Places Text Search (New API v1) or smart simulation mode.
2. **Contact Enrichment & Deliverability**: Automatic domain parsing, Hunter.io email discovery, and deliverability verification (`deliverable`, `risky`, `undeliverable`).
3. **DeepSeek AI Mail Auto-Responder**: Inbound emails delivered to your Hostinger mailbox trigger a webhook that DeepSeek uses to draft intelligent, customized B2B reply proposals.
4. **Hostinger Agentic Mail Dispatch**: 1-click or automated dispatch directly through Hostinger's REST Mail API.
5. **Quota Protection**: Strict daily rate limit guardrails for lead discovery (50/day) and AI auto-replies (30/day) with calendar-day auto-resets.
6. **Health Check & Production Ready**: `/health` endpoint and static SPA fallback ready for Hostinger Node.js hosting.

---

## 📁 Project Structure

```
spicecoast/
├── server/
│   ├── config/
│   │   └── env.js                 # Configuration & environment variables
│   ├── controllers/
│   │   ├── leadController.js      # Lead status, retrieval & search handlers
│   │   └── mailboxController.js   # Webhook, draft dispatch & mailbox handlers
│   ├── middleware/
│   │   ├── authMiddleware.js      # Hostinger webhook bearer token verification
│   │   └── errorHandler.js        # 404 & global error handler
│   ├── routes/
│   │   ├── apiRoutes.js           # /api/* routes
│   │   └── webhookRoutes.js       # /webhook direct route
│   ├── services/
│   │   ├── deepseekService.js     # DeepSeek AI chat completion & draft generation
│   │   ├── leadFinderService.js   # Places API, Hunter.io & simulated leads
│   │   ├── mailService.js         # Hostinger Agentic Mail API & Nodemailer
│   │   ├── storageService.js      # Daily quota tracking & JSON persistence
│   │   └── webhookService.js      # Inbound email parsing & filter pipeline
│   ├── test/
│   │   └── test_endpoints.js      # Automated endpoint verification test suite
│   ├── app.js                     # Express application setup
│   └── server.js                  # HTTP server listener (0.0.0.0:PORT)
├── src/                           # React frontend source code
├── dist/                          # Production frontend build
├── .env.example                   # Environment configuration template
├── package.json                   # Dependencies & npm scripts
├── server.js                      # Root server entry point wrapper
└── README.md                      # Documentation
```

---

## 🛠️ Prerequisites & Installation

### Requirements
- **Node.js**: `v18.0.0` or higher (Node `20.x` / `22.x` recommended)
- **npm**: `v9.0.0` or higher

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the project root:
```bash
cp .env.example .env
```

Fill in your API credentials:
```env
# Server
PORT=5000
HOST=0.0.0.0
NODE_ENV=production
CORS_ORIGIN=*

# 1. Google Cloud Places API
GOOGLE_API_KEY=your_google_places_api_key_here

# 2. Hunter.io API
HUNTER_API_KEY=your_hunter_api_key_here

# 3. DeepSeek API (for AI mail drafting)
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-chat

# 4. Hostinger Agentic Mail API & Webhook
HOSTINGER_API_TOKEN=your_hostinger_agentic_mail_api_token_here
HOSTINGER_WEBHOOK_BEARER_TOKEN=your_hostinger_webhook_bearer_token_here
SENDER_MAILBOX=sales@thespicecoast.com

# 5. Automation Guardrails
AUTO_SEND=false
DAILY_LEAD_LIMIT=50
DAILY_REPLY_LIMIT=30
```

---

## 🖥️ Running Locally

### Option A: Run Full-Stack Dev Server (Express Backend + Vite UI concurrently)
```bash
npm run dev
```
- **Frontend Dashboard**: `http://localhost:3000`
- **Backend Express API**: `http://localhost:5000` (or `http://localhost:5001`)

### Option B: Run Express Backend Alone
```bash
npm run server
```

### Option C: Build Frontend Bundle & Run Production Server
```bash
npm run build
npm start
```
The Express server will serve both the API routes and the React SPA build on `http://localhost:5000`.

---

## 🧪 Running Automated Tests

Run the built-in verification test suite to check all endpoints, validation errors, simulated leads, and webhook handlers:
```bash
node server/test/test_endpoints.js
```

---

## 📡 API Reference & Endpoints

### 1. System Health
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server health check, uptime, and environment |

### 2. Lead Discovery & Verification
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/status` | Current daily search quota and API key statuses |
| `GET` | `/api/leads` | All saved leads and recent search queries |
| `POST` | `/api/search` | Discover businesses and verify contact emails |

**Sample `POST /api/search` Request Body:**
```json
{
  "business_type": "spice importer",
  "city": "Hamburg",
  "country": "Germany",
  "count": 15,
  "mode": "auto"
}
```

### 3. AI Mailbox & Webhook
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/webhook` | Hostinger Mail webhook callback endpoint |
| `POST` | `/api/webhook` | Webhook alias path |
| `GET` | `/api/mailbox/status` | Mailbox connection, DeepSeek model, & daily reply budget |
| `GET` | `/api/mailbox/messages` | Inbox history with original inquiries & AI drafts |
| `POST` | `/api/mailbox/test-incoming` | Simulate/test inbound email drafting |
| `POST` | `/api/mailbox/send-draft` | Manually dispatch reviewed draft via Hostinger API |
| `POST` | `/api/mailbox/toggle-autosend`| Toggle auto-send mode on/off |

---

## 📨 Hostinger Webhook Integration Guide

### Example Webhook Request Payload from Hostinger
```http
POST /webhook HTTP/1.1
Host: yourdomain.com
Authorization: Bearer YOUR_HOSTINGER_WEBHOOK_BEARER_TOKEN
Content-Type: application/json

{
  "from": "buyer@eurospice-hamburg.de",
  "from_name": "Markus Weber",
  "subject": "Inquiry: Bulk Malabar Black Pepper & Cardamom FOB pricing",
  "message": "Hello SpiceCoast Team, We are looking to import 2 FCL containers of TGSEB Black Pepper and Alleppey Green Cardamom (8mm). Please share your current specification sheet and FOB price quotation."
}
```

### Setup Steps in Hostinger hPanel:
1. Log in to **Hostinger hPanel**.
2. Navigate to **Emails -> [your domain] -> Agentic mail -> Webhooks**.
3. Set the Webhook URL to:
   ```
   https://yourdomain.com/webhook
   ```
4. Copy the Bearer Token generated by Hostinger.
5. Set `HOSTINGER_WEBHOOK_BEARER_TOKEN` in your `.env` to match this token.

---

## ☁️ Hostinger Node.js Deployment Steps

1. **Create Node.js Application in Hostinger hPanel**:
   - Go to **Websites -> Manage -> Advanced -> Node.js**.
   - Select **Node.js Version**: `20.x` or `22.x`.
   - **Application Root**: `/public_html` (or your project directory).
   - **Application Startup File**: `server/server.js` (or `server.js`).
   - **Application Mode**: `Production`.

2. **Upload / Clone Project Files**:
   - Upload the project files or use Git deployment.
   - Run `npm install` and `npm run build` in the Hostinger console / SSH.

3. **Configure Environment Variables**:
   - In Hostinger hPanel Node.js settings or in the `.env` file on the server, set:
     - `PORT` (Hostinger automatically provides this or routes via internal port).
     - `NODE_ENV=production`
     - `GOOGLE_API_KEY`, `HUNTER_API_KEY`, `DEEPSEEK_API_KEY`, `HOSTINGER_API_TOKEN`, `HOSTINGER_WEBHOOK_BEARER_TOKEN`, `SENDER_MAILBOX`.

4. **Start Application**:
   - Click **Restart Application** in Hostinger hPanel.
   - Verify deployment by visiting: `https://yourdomain.com/health`
