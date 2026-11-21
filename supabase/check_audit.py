import json

with open(r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main\.data\audit-log.json", "r", encoding="utf-8") as f:
    logs = json.load(f)

print("Total logs:", len(logs))
for idx in range(45, 60):
    if idx < len(logs):
        sz = len(json.dumps(logs[idx]).encode("utf-8")) / (1024 * 1024)
        print(f"Log {idx}: {sz:.2f} MB, action: {logs[idx].get('action')}")
