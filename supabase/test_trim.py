import json

with open(r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main\.data\audit-log.json", "r", encoding="utf-8") as f:
    logs = json.load(f)

def trim_large_strings(obj):
    if isinstance(obj, dict):
        return {k: trim_large_strings(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [trim_large_strings(item) for item in obj]
    elif isinstance(obj, str) and len(obj) > 500:
        return obj[:100] + "... [trimmed]"
    return obj

cleaned = trim_large_strings(logs[74]["details"])
sz = len(json.dumps(cleaned).encode("utf-8")) / 1024
print(f"Log 74 cleaned size: {sz:.2f} KB (was 7.15 MB!)")
