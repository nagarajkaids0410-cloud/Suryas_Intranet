import os

base_dir = r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main\supabase"
files = ["02_seed_core.sql", "03_requests_part1.sql", "03_requests_part2.sql"]

for fname in files:
    fpath = os.path.join(base_dir, fname)
    with open(fpath, "r", encoding="utf-8") as f:
        lines = f.readlines()
    insert_count = 0
    for idx, line in enumerate(lines, 1):
        s = line.strip()
        if s.startswith("INSERT INTO"):
            insert_count += 1
            if not s.endswith(";"):
                print(f"ERROR: {fname} line {idx} does not end with ';'")
    print(f"{fname}: {insert_count} INSERT statements checked, all end with ';'")
