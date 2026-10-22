import sys
src, out = sys.argv[1], sys.argv[2]
s = open(src).read()
def grab_line(prefix):
    i = s.index(prefix); j = s.index("\n", i); return s[i:j]
def grab_func(prefix):
    i = s.index(prefix); j = s.index("\n}\n", i) + 2; return s[i:j]
parts = []
start = s.index("const DEFAULT_SETTINGS = {"); end = s.index("};", start) + 2
parts.append(s[start:end])
for pre in ['const TITLES =', 'const ZONE_ALD =', 'const ZONE_HORS =', 'const accentOf =', 'const hexRgb =',
            'const toNum =', 'function isoLocal(', 'const todayISO =', 'function fmtDate(', 'const longFmt =', 'const fmtLong =',
            'const num =', 'const lines =', 'const civ =', 'function patientName(', 'function doctorName(', 'const medTitle =']:
    parts.append(grab_line(pre))
for pre in ['function ageOf(', 'function patientSub(', 'function medLines(']:
    parts.append(grab_func(pre))
pdf = grab_func('function buildPDF(o) {')
old = '''function buildPDF(o) {
  const { jsPDF } = window.jspdf;
  const P = prescOf(o), p = o.patient || snapPatient(getPatient(o.patientId)) || {}, a4 = P.format === "A4";'''
assert old in pdf
pdf = pdf.replace(old, '''function buildPDF(o, P) {
  const p = o.patient || {}, a4 = P.format === "A4";''')
assert 'prescOf' not in pdf and 'window' not in pdf
ts = '''// @ts-nocheck
// Génère le PDF d'une ordonnance pour un médecin connecté. L'identité imprimée (nom, prénom, RPPS)
// vient toujours du profil vérifié dans l'annuaire santé, jamais des données envoyées par le navigateur.
// Fichier généré par outils/build_edge.py à partir de source/ordonnancier.html.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { jsPDF } from "npm:jspdf@2.5.1";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

''' + "\n".join(parts) + "\n\n" + pdf + '''
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée" });
  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.replace(/^Bearer\\s+/i, "");
  if (!jwt) return json(401, { error: "Connexion requise" });
  const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u, error: ue } = await sb.auth.getUser(jwt);
  if (ue || !u?.user) return json(401, { error: "Connexion requise" });
  let body; try { body = await req.json(); } catch { return json(400, { error: "Requête invalide" }); }
  const id = String(body?.id || "");
  if (!id) return json(400, { error: "Ordonnance manquante" });
  const uid = u.user.id;
  const [pr, doc, reg] = await Promise.all([
    sb.from("profils").select("rpps,nom,prenom").eq("user_id", uid).maybeSingle(),
    sb.from("documents").select("data").eq("user_id", uid).eq("collection", "ordos").eq("id", id).maybeSingle(),
    sb.from("reglages").select("data").eq("user_id", uid).maybeSingle(),
  ]);
  if (!pr.data) return json(403, { error: "Compte médecin non vérifié" });
  if (!doc.data) return json(404, { error: "Ordonnance introuvable : enregistrez-la d’abord" });
  const P = { ...DEFAULT_SETTINGS, ...(reg.data?.data || {}), nom: pr.data.nom, prenom: pr.data.prenom, rpps: pr.data.rpps };
  try {
    const pdf = buildPDF(doc.data.data, P);
    return new Response(pdf.output("arraybuffer"), { headers: { ...CORS, "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return json(500, { error: "La création du PDF a échoué" });
  }
});
'''
open(out, "w").write(ts)
print(len(ts))
