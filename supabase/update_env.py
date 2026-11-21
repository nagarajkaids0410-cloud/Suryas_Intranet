env_path = r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main\.env"
with open(env_path, "r", encoding="utf-8") as f:
    content = f.read()

lines = content.splitlines()
has_url = any(l.startswith("NEXT_PUBLIC_SUPABASE_URL") for l in lines)
has_anon = any(l.startswith("NEXT_PUBLIC_SUPABASE_ANON_KEY") for l in lines)

if not has_url:
    lines.append('NEXT_PUBLIC_SUPABASE_URL="https://jzrlvcwqobvogbnzpnvc.supabase.co"')
if not has_anon:
    lines.append('NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cmx2Y3dxb2J2b2dibnpwbnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwOTA2NDMsImV4cCI6MjExMDY2NjY0M30.SSgA3O1ZMkWEXV7x82bPnWhbjJm7hBaKVHTclFfMuLk"')

with open(env_path, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")

print("Successfully updated .env with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY")
