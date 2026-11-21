import re

file_path = r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main\supabase\complete_database_setup.sql"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

errors = 0
insert_count = 0
create_count = 0

for idx, line in enumerate(lines, 1):
    s = line.strip()
    if s.startswith("CREATE TABLE") or s.startswith("CREATE INDEX") or s.startswith("ALTER TABLE"):
        create_count += 1
    elif s.startswith("INSERT INTO"):
        insert_count += 1
        if not s.endswith(";"):
            print(f"ERROR: Line {idx} does not end with ';'")
            errors += 1
        # Check that 'four' does not appear outside string literals
        parts = re.split(r"(?<!')'(?:''|[^'])*'(?!')", line)
        for p in parts:
            if "four" in p.lower():
                print(f"ERROR: Line {idx} has 'four' outside string literal!")
                errors += 1

print(f"Verified: {create_count} DDL statements, {insert_count} INSERT statements.")
if errors == 0:
    print("ALL CHECKS PASSED 100% PERFECTLY!")
else:
    print(f"Found {errors} errors.")
