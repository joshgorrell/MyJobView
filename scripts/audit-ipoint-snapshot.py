"""Audit an iPoint FileMaker Merge export before importing it."""

import argparse
import csv
import io
import json
from collections import Counter
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path


def audit(
    path: Path,
    start: date,
    rep_map: dict[str, str] | None = None,
    staging_rows: list[dict] | None = None,
) -> dict:
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
            target = None
            if rep_map is not None:
                target = rep_map.get(rep)
                if target is None:
                    findings["unmapped_rep_rows"] += 1
                else:
                    findings["mapped_rep_rows"] += 1
                    if target != rep:
                        findings["reassigned_rep_rows"] += 1
            if staging_rows is not None:
                staging_rows.append({
                    "source_id": identifier,
                    "created_date": created.isoformat(),
                    "source_salesperson": rep,
                    "reporting_salesperson": target,
                    "amount": str(amount),
                    "source_status": row.get("status"),
                })

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
    parser.add_argument("--rep-map", type=Path, help="JSON object from source names to reporting names")
    parser.add_argument("--stage", type=Path, help="Write a new local JSON Lines staging file")
    args = parser.parse_args()
    rep_map = None
    if args.rep_map:
        rep_map = json.loads(args.rep_map.read_text(encoding="utf-8"))
        if not isinstance(rep_map, dict) or any(
            not source.strip() or not isinstance(target, str) or not target.strip()
            for source, target in rep_map.items()
        ):
            parser.error("--rep-map must contain an object of nonblank source and reporting names")
    staging_rows = [] if args.stage else None
    summary = audit(args.export, args.start, rep_map, staging_rows)
    if args.stage:
        if summary["findings"]["duplicate_source_id_rows"]:
            parser.error("Staging requires unique source IDs in the selected window")
        with args.stage.open("x", encoding="utf-8") as staged:
            for row in staging_rows:
                staged.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
