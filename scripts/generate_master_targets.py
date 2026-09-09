import os
import re
import time
import json
import base64
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import pandas as pd
import requests

# Automatically load environment variables.
# paz.env holds the real keys and wins over any empty placeholders in .env/.env.local.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv()
load_dotenv(".env.local")
load_dotenv(os.path.join(_REPO_ROOT, "paz.env"), override=True)

# Supabase API Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

# Gong API Configuration (Supports standard and Vite env prefixes)
GONG_ACCESS_KEY = os.getenv("GONG_ACCESS_KEY") or os.getenv("VITE_GONG_ACCESS_KEY") or os.getenv("GONG_KEY")
GONG_SECRET_KEY = os.getenv("GONG_SECRET_KEY") or os.getenv("VITE_GONG_SECRET_KEY") or os.getenv("GONG_SECRET")

OUTPUT_CSV_FILE = "Master_Dreamforce_Targets.csv"
DAYS_BACK = 365  # 1-Year Horizon (Fast Download & High-Intent Data)

# Target keywords covering all expansion plays
TARGET_KEYWORDS = [
    # legacy ServiceNow keywords removed in favor of PAZ Portal focused targeting
    # (examples kept in paz-portal UI and datasets)
    "change request", "change management", "cab approval",
    "copado connect", "subscriber code", "integration failed",
    "crt", "workday", "robotic testing", "recorder",
    "agentia", "copado ai", "test agent"
]

NOISE_PATTERNS = [
    "automatic reply:", "out of the office", "ooo", "to request access:",
    "on vacation", "please rate our performance", "please leave your message",
    "transferred to", "forwarded to voice", "automated attendant",
    "leave a message after the tone", "your call has been forwarded"
]

IGNORED_DOMAINS = {
    "copado.com", "gmail.com", "yahoo.com", "outlook.com",
    "salesforce.com", "hotmail.com"
}

def is_noise(text: str, subject: str = "") -> bool:
    combined = f"{subject} {text}".lower()
    return any(pattern in combined for pattern in NOISE_PATTERNS)

def is_within_365_days(date_str: str) -> bool:
    if not date_str or str(date_str).lower() in ["n/a", "null", "none"]:
        return True
    try:
        clean_str = str(date_str).strip()
        if "T" in clean_str:
            clean_str = clean_str.split("T")[0]
        dt = datetime.strptime(clean_str, "%Y-%m-%d")
        cutoff = datetime.now() - timedelta(days=DAYS_BACK)
        return dt >= cutoff
    except Exception:
        try:
            clean_str = str(date_str).strip().split()[0]
            dt = datetime.strptime(clean_str, "%m/%d/%Y")
            cutoff = datetime.now() - timedelta(days=DAYS_BACK)
            return dt >= cutoff
        except Exception:
            return True

def determine_primary_play(snippets_text: str) -> str:
    lower = snippets_text.lower()
    if any(k in lower for k in ["agentia", "test agent", "copado ai"]):
        return "Copado Agentia AI"
    if any(k in lower for k in ["workday", "crt", "recorder", "robotic"]):
        return "CRT & Non-Salesforce Testing"
    if any(k in lower for k in ["copado connect", "subscriber code", "integration failed"]):
        return "Copado Connect Repair"
    if any(k in lower for k in ["change request", "cab approval", "change management"]):
        return "Change Management Automation"
    return "PAZ Portal"

def main():
    print("🚀 Starting Offline Master Target Extraction (365-Day Window)...")

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("❌ Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.")
        return

    sb_headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }

    # --------------------------------------------------------------------------
    # STEP 1: Fetch 1-Year Support Cases (Server-Side Date Filter + Pagination)
    # --------------------------------------------------------------------------
    print("\n[1/4] Fetching past 365 days of Support Cases from Supabase...")
    one_year_ago_iso = (datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)).strftime("%Y-%m-%d")
    
    all_cases = []
    page_size = 1000
    start_row = 0
    has_more = True

    while has_more:
        headers_with_range = {
            **sb_headers,
            "Range-Unit": "items",
            "Range": f"{start_row}-{start_row + page_size - 1}"
        }
        cases_url = f"{SUPABASE_URL}/rest/v1/support_cases?select=*&date_opened=gte.{one_year_ago_iso}"
        res = requests.get(cases_url, headers=headers_with_range)
        
        if res.status_code not in [200, 206]:
            print(f"❌ Failed to query Supabase cases: {res.status_code} - {res.text}")
            break

        batch = res.json()
        all_cases.extend(batch)
        print(f"  -> Downloaded batch: {len(batch)} cases (Total: {len(all_cases)})")

        if len(batch) < page_size:
            has_more = False
        else:
            start_row += page_size

    print(f"✓ Retrieved {len(all_cases)} support case records from the past 365 days.")

    # Build customer domain directory from cases
    domain_to_account = {}
    known_customer_accounts = set()

    for c in all_cases:
        acc = (c.get("account_name") or "").strip()
        if acc and acc.lower() != "null" and "copado" not in acc.lower():
            known_customer_accounts.add(acc)

        email = (c.get("contact_email") or "").strip().lower()
        if acc and "@" in email:
            domain = email.split("@")[1]
            if domain not in IGNORED_DOMAINS:
                domain_to_account[domain] = acc
                if "-external." in domain:
                    domain_to_account[domain.replace("-external.", ".")] = acc

    print(f"✓ Built email domain directory for {len(domain_to_account)} customer domains.")

    # --------------------------------------------------------------------------
    # STEP 2: Filter Cases for Intent Snippets
    # --------------------------------------------------------------------------
    print("\n[2/4] Filtering Cases for Expansion Intent Snippets...")
    matched_cases = []

    for c in all_cases:
        acc = (c.get("account_name") or "").strip()
        if acc and "copado" in acc.lower():
            continue

        subj = c.get("subject") or ""
        desc = (c.get("description") or "").replace("<[^>]*>?", "")
        combined_text = f"{subj} {desc}".lower()

        if any(kw in combined_text for kw in TARGET_KEYWORDS):
            if is_within_365_days(c.get("date_opened")):
                matched_cases.append(c)

    print(f"✓ Found {len(matched_cases)} relevant customer support cases.")

    # --------------------------------------------------------------------------
    # STEP 3: Sweep Gong Call API (Robust Rate-Limit & Backoff Handling)
    # --------------------------------------------------------------------------
    matched_calls = {}
    transcripts_map = {}

    if GONG_ACCESS_KEY and GONG_SECRET_KEY:
        print("\n[3/4] Sweeping Gong Call Recordings over past 365 days...")
        gong_auth = base64.b64encode(f"{GONG_ACCESS_KEY}:{GONG_SECRET_KEY}".encode()).decode()
        gong_headers = {
            "Authorization": f"Basic {gong_auth}",
            "Content-Type": "application/json"
        }

        # Format ISO timestamp with UTC Z suffix for Gong API v2
        from_date = (datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)).strftime("%Y-%m-%dT%H:%M:%SZ")
        
        cursor = None
        has_more_gong = True
        pages_fetched = 0
        max_pages = 50
        retry_count = 0

        while has_more_gong and pages_fetched < max_pages:
            params = {"fromDateTime": from_date}
            if cursor:
                params["cursor"] = cursor

            try:
                calls_res = requests.get("https://api.gong.io/v2/calls", headers=gong_headers, params=params)
                
                if calls_res.status_code == 429:
                    retry_count += 1
                    sleep_time = min(5 * retry_count, 15)
                    print(f"⚠️ Gong Rate limit hit. Backing off {sleep_time}s (Attempt {retry_count})...")
                    time.sleep(sleep_time)
                    continue

                retry_count = 0  # Reset counter on successful response

                if calls_res.status_code != 200:
                    print(f"⚠️ Gong call query notice ({calls_res.status_code}): {calls_res.text}")
                    break

                calls_data = calls_res.json()
                calls = calls_data.get("calls", [])
                pages_fetched += 1

                for call in calls:
                    call_id = str(call.get("id"))
                    title = (call.get("title") or "").lower()
                    parties = [p.get("emailAddress", "").lower().strip() for p in call.get("parties", []) if p.get("emailAddress")]

                    matched_acc = None
                    for email in parties:
                        if "@" in email:
                            dom = email.split("@")[1]
                            if dom in domain_to_account:
                                matched_acc = domain_to_account[dom]
                                break

                    if not matched_acc:
                        for k_acc in known_customer_accounts:
                            if len(k_acc) > 3 and k_acc.lower() in title:
                                matched_acc = k_acc
                                break

                    if matched_acc and "copado" not in matched_acc.lower():
                        matched_calls[call_id] = {
                            "callId": call_id,
                            "accountName": matched_acc,
                            "title": call.get("title", ""),
                            "parties": parties
                        }

                cursor = calls_data.get("records", {}).get("cursor") or calls_data.get("cursor")
                has_more_gong = bool(cursor and len(calls) > 0)
                time.sleep(0.5)  # Baseline delay to respect Gong per-minute quotas

            except Exception as e:
                print(f"⚠️ Gong request exception: {e}")
                break

        print(f"✓ Matched {len(matched_calls)} Gong calls linked to real customer accounts.")

        # Batch fetch transcripts in blocks of 50
        call_ids = list(matched_calls.keys())
        if call_ids:
            print(f"  -> Fetching transcripts for {len(call_ids)} matched Gong calls...")
            for i in range(0, len(call_ids), 50):
                batch = call_ids[i:i+50]
                try:
                    t_res = requests.post("https://api.gong.io/v2/calls/transcript", headers=gong_headers, json={"filter": {"callIds": batch}})
                    
                    if t_res.status_code == 429:
                        print("⚠️ Transcript rate limit hit. Pausing 5 seconds...")
                        time.sleep(5)
                        t_res = requests.post("https://api.gong.io/v2/calls/transcript", headers=gong_headers, json={"filter": {"callIds": batch}})

                    if t_res.status_code == 200:
                        for t_item in t_res.json().get("callTranscripts", []):
                            c_id = str(t_item.get("callId"))
                            full_text = " ".join([
                                " ".join([s.get("text", "") for s in m.get("sentences", [])])
                                for m in t_item.get("transcript", [])
                            ])
                            transcripts_map[c_id] = full_text
                    time.sleep(0.5)
                except Exception as e:
                    print(f"⚠️ Transcript batch error: {e}")
    else:
        print("\n[3/4] Skipping Gong sweep (GONG_ACCESS_KEY / GONG_SECRET_KEY not found in environment).")

    # --------------------------------------------------------------------------
    # STEP 4: Aggregate Accounts, Deduplicate Proof, & Export
    # --------------------------------------------------------------------------
    print("\n[4/4] Compiling Deduplicated Proof Trails & Scoring Signals...")
    account_records = {}

    def get_acc(acc_name):
        if acc_name not in account_records:
            account_records[acc_name] = {
                "accountName": acc_name,
                "caseCount": 0,
                "gongCount": 0,
                "totalMentions": 0,
                "lastDate": "N/A",
                "proofList": [],
                "proofKeys": set(),
                "owners": set()
            }
        return account_records[acc_name]

    # Process Cases
    for c in matched_cases:
        acc = (c.get("account_name") or "").strip()
        if not acc or acc.lower() == "null":
            email = (c.get("contact_email") or "").strip().lower()
            if "@" in email:
                dom = email.split("@")[1]
                acc = domain_to_account.get(dom, "Unassigned Account")
            else:
                acc = "Unassigned Account"

        rec = get_acc(acc)
        rec["caseCount"] += 1
        if c.get("case_owner") and c.get("case_owner") != "null":
            rec["owners"].add(c["case_owner"])

        c_date = c.get("date_opened") or "N/A"
        if rec["lastDate"] == "N/A" or c_date > rec["lastDate"]:
            rec["lastDate"] = c_date

        case_id = str(c.get("case_number") or c.get("id"))
        p_key = f"Case_{case_id}"

        clean_desc = (c.get("description") or "").replace("<[^>]*>?", "").strip()
        if not clean_desc or "no description provided" in clean_desc.lower():
            clean_desc = f"Subject Match: {c.get('subject')}"

        if p_key not in rec["proofKeys"] and not is_noise(clean_desc, c.get("subject")):
            rec["proofKeys"].add(p_key)
            rec["totalMentions"] += 1
            rec["proofList"].append(f"[{c_date} Case {case_id}]: [Case {case_id}] {c.get('subject')}: {clean_desc[:150]}...")

    # Process Gong Calls
    for call_id, call_meta in matched_calls.items():
        acc = call_meta["accountName"]
        transcript_text = transcripts_map.get(call_id, "")
        
        if len(transcript_text) > 20 and not is_noise(transcript_text, call_meta["title"]):
            rec = get_acc(acc)
            rec["gongCount"] += 1
            p_key = f"Gong_{call_id}"

            if p_key not in rec["proofKeys"]:
                rec["proofKeys"].add(p_key)
                rec["totalMentions"] += 1
                rec["proofList"].append(f"[{datetime.now().strftime('%m/%d/%Y')} Gong {call_id}]: [Gong Call {call_id}] {call_meta['title']}: {transcript_text[:150]}...")

    # Build final DataFrame
    output_rows = []
    for acc_name, rec in account_records.items():
        if rec["totalMentions"] == 0:
            continue

        proof_log_str = " | ".join(rec["proofList"])
        play = determine_primary_play(proof_log_str)

        level = "LOW"
        if rec["gongCount"] > 0 and rec["caseCount"] > 0:
            level = "HIGH"
        elif rec["gongCount"] >= 2 or rec["caseCount"] >= 2 or rec["totalMentions"] >= 2:
            level = "MEDIUM"

        output_rows.append({
            "Account Name": acc_name,
            "Primary Expansion Play": play,
            "Signal Priority": level,
            "Total Proof Mentions": rec["totalMentions"],
            "Gong Calls Count": rec["gongCount"],
            "Support Cases Count": rec["caseCount"],
            "Last Activity Date": rec["lastDate"],
            "Key Owners": "; ".join(rec["owners"]) if rec["owners"] else "N/A",
            "Evidence & Proof Log": proof_log_str
        })

    df_out = pd.DataFrame(output_rows)
    if not df_out.empty:
        priority_map = {"HIGH": 3, "MEDIUM": 2, "LOW": 1}
        df_out["sort_key"] = df_out["Signal Priority"].map(priority_map)
        df_out = df_out.sort_values(by=["sort_key", "Total Proof Mentions"], ascending=[False, False]).drop(columns=["sort_key"])

    df_out.to_csv(OUTPUT_CSV_FILE, index=False)
    print(f"\n✅ SUCCESS! Exported {len(df_out)} target accounts with evidence logs to '{OUTPUT_CSV_FILE}'.")

if __name__ == "__main__":
    main()