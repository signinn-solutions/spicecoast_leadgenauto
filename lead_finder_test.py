"""
Lead Finder Test Script
------------------------
Chains Google Places API (business discovery) with Hunter.io
(email finding + verification) to produce a validated lead list.

SETUP:
1. pip install requests
2. Fill in GOOGLE_API_KEY and HUNTER_API_KEY below (or via environment variables)
3. Run: python lead_finder_test.py
"""

import requests
import time
import json
import os
import sys
from datetime import date
from urllib.parse import urlparse
from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
HUNTER_API_KEY = os.getenv("HUNTER_API_KEY", "")

DAILY_LIMIT = 50            # hard cap: max businesses found + enriched per day
USAGE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "daily_usage.json")


def load_daily_usage(usage_file=USAGE_FILE):
    """Read today's usage count. Resets automatically on a new calendar day."""
    today = str(date.today())
    if os.path.exists(usage_file):
        try:
            with open(usage_file, "r") as f:
                data = json.load(f)
            if data.get("date") == today:
                return today, int(data.get("count", 0))
        except (json.JSONDecodeError, OSError, ValueError):
            return today, 0
    return today, 0


def save_daily_usage(today, count, usage_file=USAGE_FILE):
    """Persist the usage count for today."""
    try:
        with open(usage_file, "w") as f:
            json.dump({"date": today, "count": count}, f, indent=2)
    except OSError as e:
        print(f"[Warning] Could not save daily usage to {usage_file}: {e}")


def get_user_inputs(remaining_today):
    """Prompt the user for business type, city, country, and how many to find.
    Requested count can never exceed 50, and is further capped by whatever
    daily budget is left (so e.g. 25 now + 25 later, in two different
    cities, still stays within the 50/day ceiling).
    """
    print("=== Lead Search ===")
    try:
        business_type = input("Business type (e.g. 'spice importer'): ").strip()
        while not business_type:
            business_type = input("Business type cannot be empty. Please enter business type: ").strip()

        city = input("City (e.g. 'Hamburg'): ").strip()
        while not city:
            city = input("City cannot be empty. Please enter city: ").strip()

        country = input("Country (e.g. 'Germany'): ").strip()
        while not country:
            country = input("Country cannot be empty. Please enter country: ").strip()

        while True:
            raw = input(f"How many businesses to find (max 50, {remaining_today} left today): ").strip()
            if not raw.isdigit():
                print("Please enter a whole number.")
                continue
            requested = int(raw)
            if requested <= 0:
                print("Please enter a number greater than 0.")
                continue
            if requested > 50:
                print("You can't request more than 50 in a single search.")
                continue
            if requested > remaining_today:
                print(f"Only {remaining_today} left in today's budget. "
                      f"Enter {remaining_today} or less, or run this again tomorrow.")
                continue
            break
    except (KeyboardInterrupt, EOFError):
        print("\n\nSearch cancelled by user.")
        sys.exit(0)

    query = f"{business_type} in {city}, {country}"
    return query, requested


def search_places(query, max_results=20):
    """Step 1: Find businesses via Google Places Text Search (New API).
    Supports pagination if max_results > 20 (Google Places API returns max 20 per page).
    """
    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": (
            "places.displayName,places.formattedAddress,"
            "places.websiteUri,places.nationalPhoneNumber,nextPageToken"
        ),
    }

    all_places = []
    page_token = None

    while len(all_places) < max_results:
        page_size = min(max_results - len(all_places), 20)
        body = {
            "textQuery": query,
            "pageSize": page_size
        }
        if page_token:
            body["pageToken"] = page_token

        try:
            resp = requests.post(url, headers=headers, json=body, timeout=15)
            if resp.status_code == 403:
                error_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                error_msg = error_data.get("error", {}).get("message", "Permission Denied")
                print(f"\n[Google Places API Error 403]: {error_msg}")
                print("-> Please ensure 'Places API (New)' is enabled in your Google Cloud Console project:")
                print("   https://console.cloud.google.com/apis/library/places.googleapis.com")
                print("-> Also verify that the API key has no restrictions blocking Places API and billing is enabled.\n")
                break
            resp.raise_for_status()
            data = resp.json()
            places = data.get("places", [])
            if not places:
                break
            all_places.extend(places)

            page_token = data.get("nextPageToken")
            if not page_token or len(all_places) >= max_results:
                break
            time.sleep(1)
        except requests.exceptions.RequestException as e:
            print(f"[Google Places API Request Error]: {e}")
            break

    return all_places[:max_results]


def extract_domain(website_url):
    """Turn a full website URL into a bare domain for Hunter.io."""
    if not website_url:
        return None
    netloc = urlparse(website_url).netloc or website_url
    # Remove port if present, strip www., and clean path
    netloc = netloc.split(":")[0]
    return netloc.replace("www.", "").strip("/")


def find_emails(domain):
    """Step 2: Find candidate emails at a domain via Hunter.io."""
    url = "https://api.hunter.io/v2/domain-search"
    params = {"domain": domain, "api_key": HUNTER_API_KEY, "limit": 3}
    try:
        resp = requests.get(url, params=params, timeout=15)
        if resp.status_code == 429:
            print("    [Hunter.io]: Rate limit reached.")
            return []
        if resp.status_code == 401 or resp.status_code == 403:
            print(f"    [Hunter.io Auth/Quota Error]: {resp.status_code}")
            return []
        if resp.status_code != 200:
            return []
        return resp.json().get("data", {}).get("emails", [])
    except requests.exceptions.RequestException as e:
        print(f"    [Hunter.io Request Error]: {e}")
        return []


def verify_email(email):
    """Step 3: Verify a single email's deliverability via Hunter.io."""
    url = "https://api.hunter.io/v2/email-verifier"
    params = {"email": email, "api_key": HUNTER_API_KEY}
    try:
        resp = requests.get(url, params=params, timeout=15)
        if resp.status_code != 200:
            return "unknown"
        return resp.json().get("data", {}).get("status", "unknown")
    except requests.exceptions.RequestException:
        return "unknown"


def main():
    if not GOOGLE_API_KEY or not HUNTER_API_KEY:
        print("[Error] Missing GOOGLE_API_KEY or HUNTER_API_KEY.")
        print("Please define them in a .env file (see .env.example) or export them as environment variables.")
        return

    today, used_today = load_daily_usage()
    remaining = DAILY_LIMIT - used_today

    print(f"Daily usage so far ({today}): {used_today}/{DAILY_LIMIT}")

    if remaining <= 0:
        print(f"Daily limit of {DAILY_LIMIT} reached. No more requests will be made until tomorrow.")
        return

    print(f"Remaining budget for today: {remaining}\n")

    query, requested = get_user_inputs(remaining)

    # Cap to whichever is smaller: what the user asked for, or what's left today
    fetch_count = min(requested, remaining)
    print(f"\nSearching Google Places for: '{query}' (requesting {fetch_count})\n")

    places = search_places(query, max_results=fetch_count)
    if not places:
        print("No businesses found from Google Places search.")
        return

    print(f"Found {len(places)} businesses (capped to your request / remaining daily budget).\n")

    leads = []

    for place in places:
        # Hard stop mid-run if the limit is hit (e.g. this run + a previous run today)
        if used_today >= DAILY_LIMIT:
            print(f"\nDaily limit of {DAILY_LIMIT} reached mid-run. Stopping here.")
            break

        name = place.get("displayName", {}).get("text", "Unknown")
        address = place.get("formattedAddress", "")
        phone = place.get("nationalPhoneNumber", "")
        website = place.get("websiteUri", "")
        domain = extract_domain(website)

        print(f"- {name} | {phone} | {website}")

        # Count this business toward today's usage now (it's "found" either way)
        used_today += 1
        save_daily_usage(today, used_today)

        if not domain:
            print("    No website found, skipping email lookup.\n")
            continue

        emails = find_emails(domain)
        time.sleep(1)  # be polite to the API rate limits

        if not emails:
            print("    No emails found on this domain.\n")
            continue

        best_email = emails[0].get("value")
        status = verify_email(best_email)
        time.sleep(1)

        print(f"    Email candidate: {best_email} -> {status}\n")

        leads.append({
            "business": name,
            "address": address,
            "phone": phone,
            "website": website,
            "email": best_email,
            "email_status": status,
        })

    print("\n=== VALID LEADS (deliverable/valid emails only) ===")
    valid_leads = [l for l in leads if l["email_status"] in ("valid", "deliverable")]
    for lead in valid_leads:
        print(lead)

    print(f"\nTotal businesses processed this run: {len(places)}")
    print(f"Total with an email candidate: {len(leads)}")
    print(f"Total with a VALID deliverable email: {len(valid_leads)}")
    print(f"Total used today: {used_today}/{DAILY_LIMIT}")


if __name__ == "__main__":
    main()
