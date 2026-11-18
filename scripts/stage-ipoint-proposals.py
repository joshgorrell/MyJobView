"""Load an audited iPoint proposal JSONL into private reporting staging."""

import argparse
from datetime import date
from hashlib import sha256
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import UUID


def prepare(path, organization, start, end):
    if end < start:
        raise ValueError("Coverage end precedes coverage start")
    source = path.read_bytes()
    rows = [json.loads(line) for line in source.decode("utf-8").splitlines()]
    if not rows:
        raise ValueError("Proposal staging file is empty")
    source_ids = set()
    for row in rows:
        source_id = row.get("source_id")
        if not isinstance(source_id, str) or not source_id.strip() or source_id in source_ids:
            raise ValueError("Each proposal requires a distinct, nonblank source ID")
        source_ids.add(source_id)
        if not start <= date.fromisoformat(row["created_date"]) <= end:
            raise ValueError("Proposal date is outside the declared coverage window")
        if not (row.get("reporting_salesperson") or "").strip():
            raise ValueError("Resolve salesperson attribution before loading the proposal file")
    return {
        "p_organization_id": str(organization),
        "p_source_kind": "proposal",
        "p_source_sha256": sha256(source).hexdigest(),
        "p_coverage_start": start.isoformat(),
        "p_coverage_end": end.isoformat(),
        "p_records": rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--organization", required=True, type=UUID)
    parser.add_argument("--start", required=True, type=date.fromisoformat)
    parser.add_argument("--end", required=True, type=date.fromisoformat)
    parser.add_argument("--apply", action="store_true", help="Write to the configured reporting staging database")
    args = parser.parse_args()
    payload = prepare(args.file, args.organization, args.start, args.end)
    result = {"rows": len(payload["p_records"]), "sha256": payload["p_source_sha256"]}
    if args.apply:
        url = urlsplit(os.environ["SUPABASE_URL"])
        if (url.scheme != "https" or not url.hostname or not url.hostname.endswith(".supabase.co")
                or url.netloc != url.hostname or url.path not in ("", "/") or url.query or url.fragment):
            parser.error("SUPABASE_URL must be an HTTPS Supabase project URL")
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        request = Request(
            f"https://{url.hostname}/rest/v1/rpc/stage_ipoint_sales_snapshot",
            data=json.dumps(payload).encode("utf-8"),
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=60) as response:
            result["run_id"] = str(UUID(json.load(response)))
    print(json.dumps(result))


if __name__ == "__main__":
    main()
