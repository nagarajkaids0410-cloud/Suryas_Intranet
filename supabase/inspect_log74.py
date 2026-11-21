import json

with open(r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main\.data\audit-log.json", "r", encoding="utf-8") as f:
    logs = json.load(f)

log74 = logs[74]
print("Log 74 keys:", log74.keys())
print("details keys:", log74.get("details", {}).keys())
for k, v in log74.get("details", {}).items():
    sz = len(json.dumps(v).encode("utf-8")) / (1024 * 1024)
    print(f"  details[{k}]: {sz:.2f} MB, type: {type(v)}")
    if isinstance(v, dict):
        for subk, subv in v.items():
            subsz = len(json.dumps(subv).encode("utf-8")) / (1024 * 1024)
            print(f"    details[{k}][{subk}]: {subsz:.2f} MB")
