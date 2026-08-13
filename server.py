"""
SpiceCoast Lead Finder - Lightweight Backend API Server
-------------------------------------------------------
Runs on Python 3 standard library (zero external pip dependencies required).
Handles all API endpoints and CORS for the SpiceCoast React dashboard.
"""

import os
import sys
import time
import json
import random
from datetime import date
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse

# Import lead finder core logic and environment loader
import lead_finder_test as lft

PORT = 5001
HISTORY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "leads_history.json")


def load_leads_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {"leads": [], "searches": []}
    return {"leads": [], "searches": []}


def save_leads_history(data):
    try:
        with open(HISTORY_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[Warning] Error saving leads history: {e}")


def generate_simulated_leads(business_type, city, country, count):
    suffixes = ["Traders", "Exports", "& Sons", "Spice Co.", "Trading House", "International", "Merchants", "Imports", "Global", "Enterprises"]
    first_word = business_type.split()[0].title() if business_type else "Spice"
    simulated = []

    for i in range(count):
        suffix = random.choice(suffixes)
        comp_name = f"{city.title()} {first_word} {suffix}"
        clean_name = comp_name.lower().replace(" ", "").replace("&", "").replace(".", "").replace("'", "")
        dom = f"{clean_name}.com"
        p_valid = random.random() < 0.8
        r_mail = random.random()
        e_stat = "deliverable" if r_mail < 0.65 else ("risky" if r_mail < 0.85 else "not_found")

        simulated.append({
            "id": f"sim-{int(time.time() * 1000)}-{i}",
            "name": comp_name,
            "address": f"{100 + i * 14} {city.title()} Trade Avenue, {city.title()}, {country.title()}",
            "phone": f"+91 {random.randint(70000, 99999)} {random.randint(10000, 89999)}" if p_valid else "—",
            "phoneStatus": "valid" if p_valid else "invalid",
            "email": f"contact@{dom}" if e_stat != "not_found" else "—",
            "emailStatus": e_stat,
            "website": f"https://{dom}",
            "foundAt": str(date.today()),
            "source": "simulated"
        })
    return simulated


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class LeadFinderHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def _send_json(self, status_code, payload):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/status":
            today, used_today = lft.load_daily_usage()
            remaining = max(0, lft.DAILY_LIMIT - used_today)
            self._send_json(200, {
                "date": today,
                "count": used_today,
                "limit": lft.DAILY_LIMIT,
                "remaining": remaining,
                "has_google_key": bool(lft.GOOGLE_API_KEY),
                "has_hunter_key": bool(lft.HUNTER_API_KEY)
            })
            return

        if path == "/api/leads":
            history = load_leads_history()
            today, used_today = lft.load_daily_usage()
            self._send_json(200, {
                "all_leads": history.get("leads", []),
                "search_history": history.get("searches", []),
                "usage": {"date": today, "count": used_today}
            })
            return

        self._send_json(404, {"error": "Endpoint not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/search":
            content_len = int(self.headers.get("Content-Length", 0))
            body_raw = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
            try:
                body = json.loads(body_raw)
            except Exception:
                body = {}

            business_type = body.get("business_type", "").strip()
            city = body.get("city", "").strip()
            country = body.get("country", "").strip()
            requested_count = int(body.get("count", 20))
            mode = body.get("mode", "auto")

            if not business_type or not city or not country:
                self._send_json(400, {"error": "Business type, city, and country are required."})
                return

            if requested_count < 1 or requested_count > 50:
                self._send_json(400, {"error": "Number to find must be between 1 and 50."})
                return

            today, used_today = lft.load_daily_usage()
            remaining = max(0, lft.DAILY_LIMIT - used_today)

            if remaining <= 0:
                self._send_json(429, {"error": f"Daily limit of {lft.DAILY_LIMIT} reached for today."})
                return

            fetch_count = min(requested_count, remaining)
            query = f"{business_type} in {city}, {country}"

            processed_leads = []
            is_live_mode = False

            # Try Live Google Places & Hunter.io APIs if configured and requested
            if mode in ("live", "auto") and lft.GOOGLE_API_KEY and lft.HUNTER_API_KEY:
                try:
                    places = lft.search_places(query, max_results=fetch_count)
                    if places:
                        is_live_mode = True
                        for idx, place in enumerate(places):
                            if used_today >= lft.DAILY_LIMIT:
                                break

                            name = place.get("displayName", {}).get("text", f"{city} {business_type.title()} {idx+1}")
                            address = place.get("formattedAddress", f"{city}, {country}")
                            phone = place.get("nationalPhoneNumber", "—")
                            website = place.get("websiteUri", "")
                            domain = lft.extract_domain(website)

                            used_today += 1
                            lft.save_daily_usage(today, used_today)

                            email = "—"
                            email_status = "not_found"

                            if domain:
                                emails = lft.find_emails(domain)
                                time.sleep(0.4)
                                if emails:
                                    best_email = emails[0].get("value")
                                    status = lft.verify_email(best_email)
                                    time.sleep(0.4)
                                    email = best_email
                                    email_status = "deliverable" if status in ("valid", "deliverable") else (
                                        "risky" if status in ("accept_all", "webmail") else "invalid"
                                    )

                            phone_status = "valid" if phone and phone != "—" else "invalid"

                            lead_obj = {
                                "id": f"live-{int(time.time() * 1000)}-{idx}",
                                "name": name,
                                "address": address,
                                "phone": phone,
                                "phoneStatus": phone_status,
                                "email": email,
                                "emailStatus": email_status,
                                "website": website or (f"https://{domain}" if domain else "#"),
                                "foundAt": str(date.today()),
                                "source": "live"
                            }
                            processed_leads.append(lead_obj)
                except Exception as e:
                    print(f"[API Error]: {e}")
                    if mode == "live":
                        self._send_json(500, {"error": f"Live API search error: {str(e)}"})
                        return
                    is_live_mode = False

            # Simulation fallback if live search yielded no results or mode was "simulated"
            if not processed_leads:
                sim_leads = generate_simulated_leads(business_type, city, country, fetch_count)
                for lead in sim_leads:
                    if used_today >= lft.DAILY_LIMIT:
                        break
                    used_today += 1
                    lft.save_daily_usage(today, used_today)
                    processed_leads.append(lead)

            # Persist to history
            history = load_leads_history()
            existing_leads = history.get("leads", [])
            updated_leads = existing_leads + processed_leads
            searches = history.get("searches", [])
            new_search_record = {
                "id": int(time.time() * 1000),
                "query": f"{business_type} · {city}, {country}",
                "count": len(processed_leads),
                "date": str(date.today()),
                "mode": "live" if is_live_mode else "simulated"
            }
            searches.insert(0, new_search_record)
            history["leads"] = updated_leads
            history["searches"] = searches[:50]
            save_leads_history(history)

            self._send_json(200, {
                "leads": processed_leads,
                "count": len(processed_leads),
                "mode": "live" if is_live_mode else "simulated",
                "usage": {"date": today, "count": used_today, "remaining": max(0, lft.DAILY_LIMIT - used_today)}
            })
            return

        self._send_json(404, {"error": "Endpoint not found"})

    def log_message(self, format, *args):
        # Clean custom logging format
        print(f"[SpiceCoast API] {self.address_string()} - {format % args}")


def run_server():
    server_address = ("127.0.0.1", PORT)
    httpd = ThreadedHTTPServer(server_address, LeadFinderHandler)
    print(f"\n🌶️  SpiceCoast API server running on http://127.0.0.1:{PORT}")
    print("✨  Zero external dependencies required (Pure Python 3)")
    print("📡  Ready to serve Lead Finder requests...\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping SpiceCoast API server...")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
