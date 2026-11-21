import json

with open(r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main\.data\audit-log.json", "r", encoding="utf-8") as f:
    logs = json.load(f)

for idx, l in enumerate(logs):
    sz = len(json.dumps(l).encode("utf-8")) / (1024 * 1024)
    if sz > 1.0:
        print(f"Log {idx}: {sz:.2f} MB, action: {l.get('action')}")
