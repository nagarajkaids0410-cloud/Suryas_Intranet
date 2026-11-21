import re

with open(r"C:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main\supabase\03_seed_requests.sql", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines, 1):
    if not line.strip().startswith("INSERT INTO"):
        continue
    # Check if single quotes are balanced
    # Replace escaped single quotes '' with nothing
    temp = line.replace("''", "")
    cnt = temp.count("'")
    if cnt % 2 != 0:
        print(f"Line {idx} has UNBALANCED QUOTES (count={cnt})!")
        print(line[:120])
    
    # Also check if 'four' appears outside string literals
    # We can tokenize strings vs non-strings
    # In SQL, anything between ' and ' (handling '') is string
    # Let's find tokens outside strings
    parts = re.split(r"(?<!')'(?:''|[^'])*'(?!')", line)
    # parts are the non-string segments!
    for p in parts:
        if "four" in p.lower():
            print(f"CRITICAL: Line {idx} has 'four' OUTSIDE string literal!")
            print(f"Part: {p}")
            print(f"Full line snippet: {line[:200]}")
