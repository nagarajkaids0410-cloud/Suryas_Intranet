import os

root_dir = r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main"
ignore = {"node_modules", ".next", ".git", ".data"}

functions = ["findUserByUsername", "findUserById", "getAllUsers", "getPendingUsers", "addUser", "updateUser", "approveUser", "denyUser"]

results = {f: [] for f in functions}

for dirpath, dirnames, filenames in os.walk(root_dir):
    dirnames[:] = [d for d in dirnames if d not in ignore]
    for fname in filenames:
        if fname.endswith(".ts") or fname.endswith(".tsx"):
            fpath = os.path.join(dirpath, fname)
            relpath = os.path.relpath(fpath, root_dir)
            if relpath.startswith("lib\\user-database.ts"):
                continue
            with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                for idx, line in enumerate(f, 1):
                    for fn in functions:
                        if fn in line:
                            results[fn].append((relpath, idx, line.strip()))

for fn, matches in results.items():
    print(f"\n=== {fn} ({len(matches)} matches) ===")
    for m in matches[:10]:
        print(f"  {m[0]}:{m[1]} -> {m[2]}")
    if len(matches) > 10:
        print(f"  ... and {len(matches) - 10} more")
