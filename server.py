"""
SpiceCoast Lead Finder - Flask API Backend Server
-------------------------------------------------
Serves API endpoints to connect the React UI with Google Places & Hunter.io APIs.
"""

import os
import time
import json
from datetime import date
from flask import Flask, request, jsonify
from flask_cors import CORS

import lead_finder_test as lft

app = Flask(__name__)
CORS(app)

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
        print(f"Error saving leads history: {e}")


@app.route("/api/status", methods=["GET"])
def get_status():
    today, used_today = lft.load_daily_usage()
    remaining = max(0, lft.DAILY_LIMIT - used_today)
    return jsonify({
        "date": today,
        "count": used_today,
        "limit": lft.DAILY_LIMIT,
        "remaining": remaining,
        "has_google_key": bool(lft.GOOGLE_API_KEY),
        "has_hunter_key": bool(lft.HUNTER_API_KEY)
    })


@app.route("/api/leads", methods=["GET"])
def get_leads():
    history = load_leads_history()
    today, used_today = lft.load_daily_usage()
    return jsonify({
        "all_leads": history.get("leads", []),
        "search_history": history.get("searches", []),
        "usage": {"date": today, "count": used_today}
    })


@app.route("/api/search", methods=["POST"])
def search_leads():
    body = request.get_json() or {}
    business_type = body.get("business_type", "").strip()
    city = body.get("city", "").strip()
    country = body.get("country", "").strip()
    requested_count = int(body.get("count", 20))
    mode = body.get("mode", "auto")  # "live", "simulated", "auto"

    if not business_type or not city or not country:
        return jsonify({"error": "Business type, city, and country are required."}), 400

    if requested_count < 1 or requested_count > 50:
        return jsonify({"error": "Number to find must be between 1 and 50."}), 400

    today, used_today = lft.load_daily_usage()
    remaining = max(0, lft.DAILY_LIMIT - used_today)

    if remaining <= 0:
        return jsonify({"error": f"Daily limit of {lft.DAILY_LIMIT} reached for today."}), 429

    fetch_count = min(requested_count, remaining)
    query = f"{business_type} in {city}, {country}"

    processed_leads = []
    is_live_mode = False

    # Attempt live search if mode is "live" or "auto"
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
                        time.sleep(0.5)
                        if emails:
                            best_email = emails[0].get("value")
                            status = lft.verify_email(best_email)
                            time.sleep(0.5)
                            email = best_email
                            email_status = "deliverable" if status in ("valid", "deliverable") else (
                                "risky" if status in ("accept_all", "webmail") else "invalid"
                            )

                    phone_status = "valid" if phone and phone != "—" else "invalid"

                    lead_obj = {
                        "id": f"live-{Date_now()}-{idx}",
                        "name": name,
                        "address": address,
                        "phone": phone,
                        "phoneStatus": phone_status,
                        "email": email,
                        "emailStatus": email_status,
                        "website": website or f"https://{domain}" if domain else "#",
                        "foundAt": str(date.today()),
                        "source": "live"
                    }
                    processed_leads.append(lead_obj)
        except Exception as e:
            if mode == "live":
                return jsonify({"error": f"Live API search error: {str(e)}"}), 500
            # If auto, fallback to simulated
            is_live_mode = False

    # Fallback to Simulation if live search produced no results or mode was "simulated"
    if not processed_leads:
        import random
        suffixes = ["Traders", "Exports", "& Sons", "Spice Co.", "Trading House", "International", "Merchants", "Imports", "Global", "Enterprises"]
        phone_weights = [("valid", 0.8), ("invalid", 0.2)]
        email_weights = [("deliverable", 0.6), ("risky", 0.2), ("not_found", 0.2)]

        for i in range(fetch_count):
            if used_today >= lft.DAILY_LIMIT:
                break
            used_today += 1
            lft.save_daily_usage(today, used_today)

            suffix = random.choice(suffixes)
            first_word = business_type.split()[0].title() if business_type else "Spice"
            comp_name = f"{city.title()} {first_word} {suffix}"
            dom = f"{comp_name.lower().replace(' ', '').replace('&', '').replace('.', '')}.com"
            p_stat = "valid" if random.random() < 0.8 else "invalid"
            r_mail = random.random()
            e_stat = "deliverable" if r_mail < 0.6 else ("risky" if r_mail < 0.8 else "not_found")

            lead_obj = {
                "id": f"sim-{Date_now()}-{i}",
                "name": comp_name,
                "address": f"{100 + i * 14} {city.title()} Trade Road, {city.title()}, {country.title()}",
                "phone": f"+91 {random.randint(70000, 99999)} {random.randint(10000, 89999)}" if p_stat == "valid" else "—",
                "phoneStatus": p_stat,
                "email": f"contact@{dom}" if e_stat != "not_found" else "—",
                "emailStatus": e_stat,
                "website": f"https://{dom}",
                "foundAt": str(date.today()),
                "source": "simulated"
            }
            processed_leads.append(lead_obj)

    # Update history file
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

    return jsonify({
        "leads": processed_leads,
        "count": len(processed_leads),
        "mode": "live" if is_live_mode else "simulated",
        "usage": {"date": today, "count": used_today, "remaining": max(0, lft.DAILY_LIMIT - used_today)}
    })


def Date_now():
    return int(time.time() * 1000)


if __name__ == "__main__":
    print("🌶️  SpiceCoast Lead Finder API server running on http://127.0.0.1:5001")
    app.run(host="127.0.0.1", port=5001, debug=False)
