with open(r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main\supabase\03_requests_part1.sql", "r", encoding="utf-8") as f:
    for idx, line in enumerate(f, 1):
        if "four functional blocks" in line:
            print(f"Line {idx} in 03_requests_part1.sql:")
            print(line[:300])
