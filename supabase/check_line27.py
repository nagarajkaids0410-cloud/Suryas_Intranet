with open(r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main\supabase\03_requests_part1.sql", "r", encoding="utf-8") as f:
    lines = f.readlines()

for lnum in [27, 28]:
    line = lines[lnum - 1]
    # Check if string literals are valid
    print(f"Line {lnum} length: {len(line)}")
    # Find where 'four' is
    pos = line.find("four")
    print("Context around 'four':", line[max(0, pos-40):min(len(line), pos+40)])
