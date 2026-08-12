# Spicecoast Business Lead Finder & Automation

An automated lead generation and enrichment tool combining **Google Places API** and **Hunter.io** for targeted B2B lead discovery and email verification.

## Features
- **Business Discovery**: Uses Google Places Text Search (New API) to find relevant businesses by type, city, and country.
- **Domain Extraction & Email Discovery**: Parses domains and queries Hunter.io to discover verified contact emails.
- **Deliverability Verification**: Verifies email deliverability to minimize bounce rates.
- **Safety Limits & Daily Budgeting**: Enforces daily search limits with automatic calendar day resets and boundary validations.

## Setup

1. Clone the repository:
   ```bash
   git clone git@github.com:adarshtj07/SpicecoastBusinessAutomation.git
   cd SpicecoastBusinessAutomation
   ```

2. Install dependencies:
   ```bash
   pip install requests python-dotenv
   ```

3. Configure your API keys in `lead_finder_test.py` or create a `.env` file:
   ```env
   GOOGLE_API_KEY=your_google_places_api_key
   HUNTER_API_KEY=your_hunter_api_key
   ```

4. Run the Lead Finder:
   ```bash
   python3 lead_finder_test.py
   ```

5. Run unit tests:
   ```bash
   python3 -m unittest test_limits.py
   ```
