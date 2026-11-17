"""Stage a read-only Google Sheets workbook export for the Madar PostgreSQL import."""
import argparse
import csv
from datetime import date, datetime, time
import json
from pathlib import Path
import re

from openpyxl import load_workbook

def value(cell, audit=False):
    v = cell.value
    if cell.data_type == "e":
        raise ValueError("Workbook contains a spreadsheet error")
    if isinstance(v, datetime):
        if audit:
            return v.isoformat(sep=' ', timespec='milliseconds')
        return v.strftime("%Y-%m-%d %H:%M" if v.hour or v.minute else "%Y-%m-%d")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, time):
        return v.strftime("%H:%M")
    return "" if v is None else v

def schema(code):
    block = code.split("var SCHEMA = {", 1)[1].split("\n};", 1)[0]
    result = {
        name: re.findall(r"'([^']+)'", columns)
        for name, columns in re.findall(r"(?m)^  (\w+):\s*\[([^\]]+)\]", block)
    }
    result["AuditLog"] = ["time", "user", "action", "sheet", "id"]
    return result

def convert(workbook, expected):
    if set(workbook.sheetnames) != set(expected):
        raise ValueError("Workbook tabs differ from the deployed Madar schema")
    for name, keys in expected.items():
        rows = workbook[name].iter_rows()
        headings = [value(c) for c in next(rows)]
        filled = [(i, key) for i, key in enumerate(headings) if key != ""]
        present = [k for _, k in filled]
        if not present or present[0] != keys[0] or len(set(present)) != len(present):
            raise ValueError(f"Invalid header in {name}")
        columns = keys + [key for key in present if key not in keys]
        if not all(isinstance(k, str) and re.fullmatch(r"[A-Za-z0-9_]+", k) for k in columns):
            raise ValueError(f"Unsupported header in {name}")
        result = [columns]
        ids = set()
        for row in rows:
            if not any(c.value is not None for c in row):
                continue
            if any(c.value is not None and not headings[i] for i, c in enumerate(row)):
                raise ValueError(f"Row with data under a missing header in {name}")
            record = {key: value(row[i], audit=name == "AuditLog") for i, key in filled if i < len(row)}
            identity = str(record.get(keys[0], ""))
            if not identity.strip() or (name != "AuditLog" and identity in ids):
                raise ValueError(f"Missing or duplicate row identity in {name}")
            ids.add(identity)
            if name == "Team":
                record["key"] = ""
                if str(record.get("username", "")).strip().casefold() == "admin" or identity == "local-bootstrap-admin":
                    raise ValueError("Workbook identity conflicts with the local admin")
            if name == "Config" and re.search(r"password|secret|token|credential|api.key", identity, re.I):
                raise ValueError("Workbook Config contains a credential-like entry")
            result.append([record.get(key, "") for key in columns])
        yield name, result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[1] / "apps-script" / "Code.gs"
    workbook = load_workbook(args.workbook, read_only=True, data_only=True)
    data = dict(convert(workbook, schema(source.read_text(encoding="utf-8"))))
    workbook.close()
    with args.output.open("x", encoding="utf-8", newline="") as output:
        writer = csv.writer(output, delimiter="\t", lineterminator="\n")
        for name, rows in data.items():
            writer.writerow((name, json.dumps(rows, ensure_ascii=False, allow_nan=False, separators=(",", ":"))))
    print(f"Prepared {len(data)} tabs and {sum(len(rows) - 1 for rows in data.values())} records")

if __name__ == "__main__":
    main()
