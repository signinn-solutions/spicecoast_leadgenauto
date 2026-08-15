"""
Mail Auto-Responder — Hostinger Agentic Mail + DeepSeek
---------------------------------------------------------
Receives Hostinger Mail's webhook when a new email arrives, asks
DeepSeek to draft a reply, and sends it back via Hostinger's Mail API
(not raw SMTP).

Integrates into the SpiceCoast full-stack dashboard with real-time logs,
quota protection, and simulation fallbacks.
"""

import os
import sys
import time
import json
import requests
from datetime import date
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# ---------------- CONFIG ----------------
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

HOSTINGER_API_TOKEN = os.getenv("HOSTINGER_API_TOKEN", "")
HOSTINGER_WEBHOOK_BEARER_TOKEN = os.getenv("HOSTINGER_WEBHOOK_BEARER_TOKEN", "")
SENDER_MAILBOX = os.getenv("SENDER_MAILBOX", "outreach@thespicecoast.com")

# Hostinger Agentic Mail API Endpoint
HOSTINGER_SEND_ENDPOINT = os.getenv(
    "HOSTINGER_SEND_ENDPOINT",
    f"https://api.mail.hostinger.com/v1/mailboxes/{SENDER_MAILBOX}/messages"
)

DAILY_REPLY_LIMIT = int(os.getenv("DAILY_REPLY_LIMIT", "30"))
AUTO_SEND = os.getenv("AUTO_SEND", "false").lower() in ("true", "1", "yes")

USAGE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reply_usage.json")
MAILBOX_HISTORY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mailbox_history.json")
# -----------------------------------------


def get_deepseek_client():
    """Initializes and returns an OpenAI client configured for DeepSeek API."""
    if not DEEPSEEK_API_KEY:
        return None
    try:
        from openai import OpenAI
        return OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")
    except Exception as e:
        print(f"[Warning] Failed to initialize DeepSeek client: {e}")
        return None


def load_daily_usage(usage_file=USAGE_FILE):
    """Load today's AI reply count with automatic calendar-day reset."""
    today = str(date.today())
    if os.path.exists(usage_file):
        try:
            with open(usage_file, "r") as f:
                data = json.load(f)
            if data.get("date") == today:
                return today, int(data.get("count", 0))
        except Exception:
            return today, 0
    return today, 0


def save_daily_usage(today, count, usage_file=USAGE_FILE):
    """Save today's reply usage count."""
    try:
        with open(usage_file, "w") as f:
            json.dump({"date": today, "count": count}, f, indent=2)
    except Exception as e:
        print(f"[Warning] Could not save reply usage: {e}")


def load_mailbox_history(history_file=MAILBOX_HISTORY_FILE):
    """Load logged incoming emails and drafted/sent responses."""
    if os.path.exists(history_file):
        try:
            with open(history_file, "r") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_mailbox_history(messages, history_file=MAILBOX_HISTORY_FILE):
    """Save mailbox interaction history (keeps last 100)."""
    try:
        with open(history_file, "w") as f:
            json.dump(messages[:100], f, indent=2)
    except Exception as e:
        print(f"[Warning] Could not save mailbox history: {e}")


def looks_like_a_lead_reply(subject, body):
    """Filter to ensure auto-replies only trigger for genuine lead inquiries."""
    positive_signals = [
        "pricing", "price", "catalog", "catalogue", "interested",
        "quote", "quotation", "sample", "moq", "importer", "export",
        "spices", "cardamom", "pepper", "clove", "turmeric", "cinnamon",
        "inquiry", "enquiry", "specification", "container", "fob", "cif"
    ]
    text = f"{subject} {body}".lower()
    return any(word in text for word in positive_signals)


def draft_reply(subject, body, sender_name=""):
    """Drafts an intelligent B2B response using DeepSeek API or smart simulation."""
    client = get_deepseek_client()

    if client and DEEPSEEK_API_KEY:
        try:
            prompt = f"""You are replying on behalf of The Spice Coast (SpiceCoast), a premier Indian spice exporting and trading company.
A prospective B2B lead / importer just emailed us. Write a warm, professional, concise reply (under 120 words).

Key guidelines:
1. Thank them for reaching out and their interest in SpiceCoast's premium spices.
2. Mention we specialize in direct-from-origin Malabar Black Pepper, Alleppey Green Cardamom, Turmeric, Ginger, and Cloves with strict export quality certification.
3. State that our export desk is preparing our latest harvest catalog and export price list for them.
4. Ask one clear qualifying question (e.g. required destination port, volume/MOQ, or specific spice grade required).
5. Sign off cordially as 'The SpiceCoast Export Team'.
6. Do NOT invent specific numerical prices.

Original Subject: {subject}
Original Inbound Message:
{body}
"""
            response = client.chat.completions.create(
                model=DEEPSEEK_MODEL,
                messages=[
                    {"role": "system", "content": "You are a professional B2B export sales director for SpiceCoast."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=300,
                temperature=0.7,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"[DeepSeek API Error]: {e}. Falling back to template draft.")

    # Graceful fallback draft (used when DEEPSEEK_API_KEY is not yet supplied or network fails)
    greeting = f"Dear {sender_name}," if sender_name else "Hello,"
    return (
        f"{greeting}\n\n"
        f"Thank you for contacting The Spice Coast! We appreciate your interest in our premium export-grade spices.\n\n"
        f"We specialize in direct-origin Malabar Black Pepper, Alleppey Green Cardamom, High-Curcumin Turmeric, and Cinnamon. "
        f"Our team is currently preparing our updated product catalog and seasonal export pricing for you.\n\n"
        f"To provide an accurate quote, could you please confirm your estimated order volume and preferred delivery terms (FOB / CIF destination port)?\n\n"
        f"Warm regards,\n"
        f"The SpiceCoast Export Desk\n"
        f"{SENDER_MAILBOX}"
    )


def send_email_via_hostinger(to_address, subject, body):
    """Sends an email response via Hostinger's Agentic Mail API."""
    if not HOSTINGER_API_TOKEN:
        print("[Hostinger API] No HOSTINGER_API_TOKEN configured. Action logged as simulated send.")
        return {"status": "simulated", "message": "No Hostinger API token configured."}

    headers = {
        "Authorization": f"Bearer {HOSTINGER_API_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "to": [to_address],
        "from": SENDER_MAILBOX,
        "subject": f"Re: {subject}" if not subject.lower().startswith("re:") else subject,
        "text": body,
    }

    try:
        resp = requests.post(HOSTINGER_SEND_ENDPOINT, headers=headers, json=payload, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[Hostinger API Error]: {e}")
        raise e


def verify_webhook_auth(auth_header):
    """Verifies incoming webhook bearer token from Hostinger."""
    if not HOSTINGER_WEBHOOK_BEARER_TOKEN:
        # If user hasn't set a token yet, allow for testing
        return True
    expected = f"Bearer {HOSTINGER_WEBHOOK_BEARER_TOKEN}"
    return auth_header == expected or auth_header == HOSTINGER_WEBHOOK_BEARER_TOKEN


def process_incoming_email(payload, auth_header=None, force_bypass_auth=False, manual_auto_send=None):
    """Core pipeline to process incoming emails, draft AI responses, and manage quotas."""
    if not force_bypass_auth and not verify_webhook_auth(auth_header or ""):
        return {"status": "rejected", "reason": "Invalid or missing webhook bearer token"}, 401

    sender_email = payload.get("from") or payload.get("sender") or payload.get("from_address", "")
    sender_name = payload.get("from_name", "")
    subject = payload.get("subject", "Spice Inquiry")
    body = payload.get("message") or payload.get("text") or payload.get("body") or payload.get("content", "")

    if not sender_email:
        return {"status": "ignored", "reason": "No sender email found in payload"}, 200

    is_lead = looks_like_a_lead_reply(subject, body)
    if not is_lead:
        return {"status": "ignored", "reason": "Did not match B2B lead keywords (filtered out)"}, 200

    today, used_today = load_daily_usage()
    if used_today >= DAILY_REPLY_LIMIT:
        return {"status": "blocked", "reason": f"Daily reply limit of {DAILY_REPLY_LIMIT} reached."}, 200

    # Draft reply using DeepSeek
    reply_text = draft_reply(subject, body, sender_name)

    auto_send_effective = AUTO_SEND if manual_auto_send is None else manual_auto_send
    delivery_status = "drafted"
    delivery_error = None

    if auto_send_effective:
        try:
            send_email_via_hostinger(sender_email, subject, reply_text)
            delivery_status = "sent"
            used_today += 1
            save_daily_usage(today, used_today)
        except Exception as err:
            delivery_status = "send_failed"
            delivery_error = str(err)
    else:
        delivery_status = "drafted"
        # Increment usage when draft is generated
        used_today += 1
        save_daily_usage(today, used_today)

    # Log record to mailbox history
    history = load_mailbox_history()
    message_record = {
        "id": f"msg-{int(time.time() * 1000)}",
        "sender": sender_email,
        "senderName": sender_name or sender_email.split("@")[0].title(),
        "subject": subject,
        "body": body,
        "draftReply": reply_text,
        "status": delivery_status,
        "error": delivery_error,
        "autoSend": auto_send_effective,
        "model": DEEPSEEK_MODEL if DEEPSEEK_API_KEY else "DeepSeek Simulated",
        "mailbox": SENDER_MAILBOX,
        "receivedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    history.insert(0, message_record)
    save_mailbox_history(history)

    return {
        "status": delivery_status,
        "to": sender_email,
        "reply": reply_text,
        "message": message_record,
        "usage": {"date": today, "count": used_today, "remaining": max(0, DAILY_REPLY_LIMIT - used_today)}
    }, 200


if __name__ == "__main__":
    from flask import Flask, request, jsonify
    from flask_cors import CORS

    standalone_app = Flask(__name__)
    CORS(standalone_app)

    @standalone_app.route("/webhook", methods=["POST"])
    def webhook():
        auth_hdr = request.headers.get("Authorization", "")
        payload = request.get_json(silent=True) or {}
        res, code = process_incoming_email(payload, auth_header=auth_hdr)
        return jsonify(res), code

    port = int(os.getenv("MAIL_PORT", "5002"))
    print(f"\n📧  SpiceCoast Standalone Mail Autoresponder running on port {port}")
    print(f"📮  Mailbox: {SENDER_MAILBOX}")
    print(f"🤖  DeepSeek Model: {DEEPSEEK_MODEL}")
    print(f"⚡  Auto-Send: {AUTO_SEND} | Daily Limit: {DAILY_REPLY_LIMIT}\n")
    standalone_app.run(host="0.0.0.0", port=port)
