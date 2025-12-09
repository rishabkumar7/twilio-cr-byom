#!/usr/bin/env python3
"""
Count calls to/from your Twilio number during a time window.

Examples:
  # All calls (default)
  python scripts/call_count.py --start 2025-01-01 --end 2025-01-31

  # Inbound only or Outbound only
  python scripts/call_count.py --start 2025-01-01 --end 2025-01-31 --inbound
  python scripts/call_count.py --start 2025-01-01 --end 2025-01-31 --outbound

Notes:
- Reads TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER from .env
- Times are interpreted as UTC unless an offset (e.g., +02:00) or 'Z' is provided
"""

import argparse
import os
from datetime import date, datetime, time, timezone

from dotenv import load_dotenv
from twilio.rest import Client


def _parse_dt(value: str, end_of_day: bool = False) -> datetime:
    """Parse ISO-like date or datetime string into a UTC, naive datetime.

    Accepts:
      - YYYY-MM-DD (assumes 00:00:00 for start, 23:59:59 for end)
      - YYYY-MM-DDTHH:MM[:SS[.ffffff]][Z|+HH:MM|-HH:MM]

    Returns naive datetime in UTC, as Twilio expects UTC for start_time filters.
    """
    s = value.strip()

    # Date-only
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        d = date.fromisoformat(s)
        if end_of_day:
            dt = datetime.combine(d, time(23, 59, 59))
        else:
            dt = datetime.combine(d, time(0, 0, 0))
        # Treat as UTC and return naive
        return dt

    # Normalize trailing Z to +00:00 for fromisoformat
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"

    try:
        dt = datetime.fromisoformat(s)
    except ValueError as exc:
        raise ValueError(
            f"Invalid datetime '{value}'. Use YYYY-MM-DD or ISO-8601 (e.g., 2025-01-01T12:30Z)."
        ) from exc

    # If no tzinfo, assume UTC; else convert to UTC
    if dt.tzinfo is None:
        # assume already UTC, return naive
        return dt
    # Convert to UTC and drop tzinfo (naive UTC)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def main() -> int:
    load_dotenv()

    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    twilio_number = os.getenv("TWILIO_PHONE_NUMBER")

    if not account_sid or not auth_token or not twilio_number:
        print("Error: Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER in .env")
        return 2

    parser = argparse.ArgumentParser(description="Count calls to your Twilio number in a time range")
    parser.add_argument(
        "--start",
        required=True,
        help="Start time (UTC by default). Format: YYYY-MM-DD or ISO-8601 (e.g., 2025-01-01T00:00Z)",
    )
    parser.add_argument(
        "--end",
        required=True,
        help="End time (UTC by default). Format: YYYY-MM-DD or ISO-8601 (e.g., 2025-01-31T23:59:59)",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--inbound",
        action="store_true",
        help="Count only inbound calls (to your Twilio number)",
    )
    group.add_argument(
        "--outbound",
        action="store_true",
        help="Count only outbound calls (from your Twilio number)",
    )
    parser.add_argument(
        "--status-breakdown",
        action="store_true",
        help="Show count by Twilio call status in addition to totals",
    )

    args = parser.parse_args()

    try:
        start_dt = _parse_dt(args.start, end_of_day=False)
        end_dt = _parse_dt(args.end, end_of_day=True)
    except ValueError as e:
        print(str(e))
        return 2

    if end_dt < start_dt:
        print("Error: --end must be after --start")
        return 2

    client = Client(account_sid, auth_token)

    # Build common time filters
    time_filters = {
        "start_time_after": start_dt,
        "start_time_before": end_dt,
    }

    inbound_count = 0
    outbound_count = 0
    status_counts_in = {}
    status_counts_out = {}

    # Determine which directions to include. Default is both (all).
    include_inbound = True
    include_outbound = True
    if args.inbound:
        include_outbound = False
    elif args.outbound:
        include_inbound = False

    if include_inbound:
        for call in client.calls.stream(to=twilio_number, **time_filters):
            inbound_count += 1
            if args.status_breakdown:
                status_counts_in[call.status] = status_counts_in.get(call.status, 0) + 1

    if include_outbound:
        for call in client.calls.stream(from_=twilio_number, **time_filters):
            outbound_count += 1
            if args.status_breakdown:
                status_counts_out[call.status] = status_counts_out.get(call.status, 0) + 1

    # Compute total and human-readable direction label
    if include_inbound and include_outbound:
        direction_label = "all"
        total = inbound_count + outbound_count
    elif include_inbound:
        direction_label = "inbound"
        total = inbound_count
    else:
        direction_label = "outbound"
        total = outbound_count

    print("Twilio call count")
    print(f"Number: {twilio_number}")
    print(f"Range (UTC): {start_dt.isoformat()} -> {end_dt.isoformat()}")
    print(f"Direction: {direction_label}")

    if include_inbound:
        print(f"Inbound (to {twilio_number}): {inbound_count}")
        if args.status_breakdown and status_counts_in:
            for k in sorted(status_counts_in.keys()):
                print(f"  - {k}: {status_counts_in[k]}")

    if include_outbound:
        print(f"Outbound (from {twilio_number}): {outbound_count}")
        if args.status_breakdown and status_counts_out:
            for k in sorted(status_counts_out.keys()):
                print(f"  - {k}: {status_counts_out[k]}")

    print(f"Total: {total}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
