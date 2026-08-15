"""
SpiceCoast Lead Finder & Automation - Unified Flask Backend
------------------------------------------------------------
Provides REST endpoints and CORS handling for:
1. Lead Search & Verification (Google Places + Hunter.io)
2. AI Mail Auto-Responder (Hostinger Agentic Mail Webhook + DeepSeek API)
"""

import os
import sys
import time
import json
import random
from datetime import date
from urllib.parse import urlparse

from flask import Flask, request, jsonify
from flask_cors import CORS

# Import core modules
import lead_finder_test as lft
import mail_autoresponder as mar

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing for all routes

PORT = 5001
HISTORY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "leads_history.json")


# -------------------------------------------------------------
# LEAD FINDER MODULE HELPERS & ROUTES
# -------------------------------------------------------------

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
    body = request.get_json(silent=True) or {}

    business_type = body.get("business_type", "").strip()
    city = body.get("city", "").strip()
    country = body.get("country", "").strip()
    requested_count = int(body.get("count", 20))
    mode = body.get("mode", "auto")

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
                return jsonify({"error": f"Live API search error: {str(e)}"}), 500
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

    return jsonify({
        "leads": processed_leads,
        "count": len(processed_leads),
        "mode": "live" if is_live_mode else "simulated",
        "usage": {"date": today, "count": used_today, "remaining": max(0, lft.DAILY_LIMIT - used_today)}
    })


# -------------------------------------------------------------
# MAILBOX & DEEPSEEK AUTO-RESPONDER ENDPOINTS
# -------------------------------------------------------------

@app.route("/webhook", methods=["POST"])
@app.route("/api/webhook", methods=["POST"])
def incoming_email_webhook():
    """Receives Hostinger Mail webhook callback when a new message arrives."""
    auth_header = request.headers.get("Authorization", "")
    payload = request.get_json(silent=True) or {}
    result, status_code = mar.process_incoming_email(payload, auth_header=auth_header)
    return jsonify(result), status_code


@app.route("/api/mailbox/status", methods=["GET"])
def get_mailbox_status():
    """Returns mailbox settings, API connection status, and daily reply budget."""
    today, used_today = mar.load_daily_usage()
    return jsonify({
        "mailbox": mar.SENDER_MAILBOX,
        "auto_send": mar.AUTO_SEND,
        "daily_limit": mar.DAILY_REPLY_LIMIT,
        "used_today": used_today,
        "remaining_today": max(0, mar.DAILY_REPLY_LIMIT - used_today),
        "date": today,
        "has_deepseek_key": bool(mar.DEEPSEEK_API_KEY),
        "has_hostinger_token": bool(mar.HOSTINGER_API_TOKEN),
        "has_webhook_token": bool(mar.HOSTINGER_WEBHOOK_BEARER_TOKEN),
        "deepseek_model": mar.DEEPSEEK_MODEL,
        "send_endpoint": mar.HOSTINGER_SEND_ENDPOINT
    })


@app.route("/api/mailbox/messages", methods=["GET"])
def get_mailbox_messages():
    """Returns the history of inbound messages and drafted/sent AI replies."""
    messages = mar.load_mailbox_history()
    return jsonify({
        "messages": messages,
        "total": len(messages)
    })


@app.route("/api/mailbox/test-incoming", methods=["POST"])
def test_incoming_email():
    """Simulates or manually tests an incoming inquiry to draft with DeepSeek and optionally send."""
    body = request.get_json(silent=True) or {}
    sender_email = body.get("from", "inquiry@eurospice-hamburg.de")
    sender_name = body.get("from_name", "Markus Weber")
    subject = body.get("subject", "Inquiry: Bulk Malabar Black Pepper & Cardamom FOB pricing")
    message = body.get("message", "Hello SpiceCoast Team,\n\nWe are looking to import 2 FCL containers of TGSEB Black Pepper and Alleppey Green Cardamom (8mm). Please share your current specification sheet and FOB price quotation.\n\nBest regards,\nMarkus Weber")
    auto_send = body.get("auto_send", False)

    payload = {
        "from": sender_email,
        "from_name": sender_name,
        "subject": subject,
        "message": message,
    }

    result, status_code = mar.process_incoming_email(
        payload,
        force_bypass_auth=True,
        manual_auto_send=auto_send
    )
    return jsonify(result), status_code


@app.route("/api/mailbox/send-draft", methods=["POST"])
def send_reviewed_draft():
    """Manually triggers email dispatch via Hostinger API for a previously drafted response."""
    body = request.get_json(silent=True) or {}
    message_id = body.get("id")
    to_address = body.get("to")
    subject = body.get("subject")
    reply_text = body.get("reply")

    if not to_address or not reply_text:
        return jsonify({"error": "Missing recipient address or reply body."}), 400

    try:
        send_res = mar.send_email_via_hostinger(to_address, subject or "Spice Inquiry", reply_text)

        # Update status in history
        history = mar.load_mailbox_history()
        for msg in history:
            if msg.get("id") == message_id or (msg.get("sender") == to_address and msg.get("status") == "drafted"):
                msg["status"] = "sent"
                msg["sentAt"] = time.strftime("%Y-%m-%d %H:%M:%S")
                break
        mar.save_mailbox_history(history)

        return jsonify({"status": "sent", "result": send_res})
    except Exception as e:
        return jsonify({"error": f"Failed to dispatch via Hostinger API: {str(e)}"}), 500


@app.route("/api/mailbox/toggle-autosend", methods=["POST"])
def toggle_autosend():
    """Toggles the AUTO_SEND mode at runtime."""
    body = request.get_json(silent=True) or {}
    new_state = body.get("auto_send")
    if new_state is not None:
        mar.AUTO_SEND = bool(new_state)
    return jsonify({"auto_send": mar.AUTO_SEND})


# -------------------------------------------------------------
# MAIN ENTRY POINT
# -------------------------------------------------------------

if __name__ == "__main__":
    print(f"\n🌶️  SpiceCoast Unified Flask API server running on http://127.0.0.1:{PORT}")
    print(f"📧  Hostinger Webhook listener ready on http://127.0.0.1:{PORT}/webhook")
    print(f"📮  Mailbox: {mar.SENDER_MAILBOX} | Auto-Send: {mar.AUTO_SEND}")
    print(f"🤖  AI Model: {mar.DEEPSEEK_MODEL}\n")
    app.run(host="127.0.0.1", port=PORT, debug=False)
