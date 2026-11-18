"""Audit an iPoint FileMaker Merge export before importing it."""

import argparse
import csv
import io
import json
from collections import Counter
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path


def audit(path: Path, start: date) -> dict:
    data = path.read_bytes()
    try:
        contents = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        contents = data.decode("cp1252")

    reader = csv.DictReader(io.StringIO(contents, newline=""))
    required = {"Creation Date", "id_Serial", "Sales Rep", "total_Price"}
    missing = required.difference(reader.fieldnames or [])
    if missing:
        raise ValueError(f"Missing export columns: {', '.join(sorted(missing))}")

    identifiers = Counter()
    findings = Counter()
    total = Decimal(0)
    for row in reader:
        date_text = (row["Creation Date"] or "").strip()
        if not date_text:
            findings["excluded_missing_date"] += 1
            continue
        try:
            created = datetime.strptime(date_text.split()[0], "%m/%d/%Y").date()
        except ValueError:
            findings["invalid_date"] += 1
            continue
        if created < start:
            continue
        findings["rows_in_window"] += 1
        amount_text = (row["total_Price"] or "").strip()
        identifier = (row["id_Serial"] or "").strip()
        rep = (row["Sales Rep"] or "").strip()
        if not identifier:
            findings["missing_source_id"] += 1
        if not rep:
            findings["missing_source_rep"] += 1
        if not amount_text:
            findings["missing_amount"] += 1
        if not all((identifier, rep, amount_text)):
            findings["excluded_missing_required_field"] += 1
            continue
        identifiers[identifier] += 1
        try:
            amount = Decimal(amount_text)
            if not amount.is_finite():
                raise InvalidOperation
        except InvalidOperation:
            findings["invalid_amount"] += 1
        else:
            total += amount

    findings["duplicate_source_id_rows"] = sum(count - 1 for count in identifiers.values())
    return {
        "start": start.isoformat(),
        "findings": dict(findings),
        "raw_snapshot_amount_sum": str(total),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path)
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    args = parser.parse_args()
    print(json.dumps(audit(args.export, args.start), indent=2))


if __name__ == "__main__":
    main()
