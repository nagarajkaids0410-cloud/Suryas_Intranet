import json
import os

BASE_DIR = r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main"
DATA_DIR = os.path.join(BASE_DIR, ".data")

with open(os.path.join(DATA_DIR, "requests.json"), "r", encoding="utf-8") as f:
    requests = json.load(f)

for r in requests:
    s = json.dumps(r)
    sz = len(s.encode("utf-8")) / 1024
    if sz > 100:
        print(f"Request ID: {r.get('id')}, Type: {r.get('type')}, Title: {r.get('title')}, Size: {sz:.1f} KB")
        # Where is the size?
        for k, v in r.items():
            sub_sz = len(json.dumps(v).encode("utf-8")) / 1024
            if sub_sz > 50:
                print(f"   key: {k}, size: {sub_sz:.1f} KB")
                if isinstance(v, dict):
                    for subk, subv in v.items():
                        subsub_sz = len(json.dumps(subv).encode("utf-8")) / 1024
                        if subsub_sz > 50:
                            print(f"      sub-key: {subk}, size: {subsub_sz:.1f} KB")
