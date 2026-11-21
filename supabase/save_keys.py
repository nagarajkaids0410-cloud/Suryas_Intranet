env_path = r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main\.env"
with open(env_path, "r", encoding="utf-8") as f:
    content = f.read()

lines = content.splitlines()

# Update or add SUPABASE_SERVICE_ROLE_KEY
service_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cmx2Y3dxb2J2b2dibnpwbnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NTA5MDY0MywiZXhwIjoyMTEwNjY2NjQzfQ.pcyK50o2nIM4joyix-f2rpGMtVjf4h561di6nl2Bye4"
anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cmx2Y3dxb2J2b2dibnpwbnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwOTA2NDMsImV4cCI6MjExMDY2NjY0M30.SSgA3O1ZMkWEXV7x82bPnWhbjJm7hBaKVHTclFfMuLk"
url = "https://jzrlvcwqobvogbnzpnvc.supabase.co"

new_lines = []
for l in lines:
    if l.startswith("SUPABASE_SERVICE_ROLE_KEY=") or l.startswith("NEXT_PUBLIC_SUPABASE_ANON_KEY=") or l.startswith("NEXT_PUBLIC_SUPABASE_URL="):
        continue
    new_lines.append(l)

new_lines.append(f'NEXT_PUBLIC_SUPABASE_URL="{url}"')
new_lines.append(f'NEXT_PUBLIC_SUPABASE_ANON_KEY="{anon_key}"')
new_lines.append(f'SUPABASE_SERVICE_ROLE_KEY="{service_key}"')

with open(env_path, "w", encoding="utf-8") as f:
    f.write("\n".join(new_lines) + "\n")

print("Updated .env with all Supabase keys successfully!")
