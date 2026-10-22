import sys
src, out = sys.argv[1], sys.argv[2]
s = open(src).read()
cut = s.index('</style>') + len('</style>')
head, body = s[:cut], s[cut:]
head = head.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
jspdf = '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>\n'
assert body.count(jspdf) == 1
body = body.replace(jspdf, '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>\n')
config = '''<script>
window.ORDO_CONFIG = {
  supabaseUrl: "https://axtexyjywzjrgmxxwbzj.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4dGV4eWp5d3pqcmdteHh3YnpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NzEwODIsImV4cCI6MjEwODI0NzA4Mn0.iQCUygg7XgzdvJPARvivaEOe1HhWSD7RvHWkvLcYrnY"
};
</script>'''
html = f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Rédaction d'ordonnances médicales en PDF pour les médecins inscrits au RPPS.">
<meta name="robots" content="noindex">
<style>:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
{head}
{config}
</head>
<body>{body}
</body>
</html>
'''
open(out, 'w').write(html)
