// @ts-nocheck
// Génère le PDF d'une ordonnance pour un médecin connecté. L'identité imprimée (nom, prénom, RPPS)
// vient toujours du profil vérifié dans l'annuaire santé, jamais des données envoyées par le navigateur.
// Fichier généré par outils/build_edge.py à partir de source/ordonnancier.html.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { jsPDF } from "npm:jspdf@2.5.1";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const DEFAULT_SETTINGS = {
  titre: "Dr", prenom: "", nom: "", specialite: "Médecine générale", qualifs: "",
  adresse: "", cp: "", ville: "", tel: "", email: "",
  rpps: "", am: "", finess: "", conventionnement: "Conventionné secteur 1", horaires: "Consultations sur rendez-vous",
  urgence: "En cas d’urgence, composez le 15",
  format: "A5", couleur: "#0E6B5C", signature: "", police: "sans", disposition: "gauche",
};
const TITLES = { standard: "", bizone: "", biologie: "Prescription d’examens de biologie médicale", imagerie: "Prescription d’examens d’imagerie médicale", soins: "Prescription de soins" };
const ZONE_ALD = "Prescriptions relatives au traitement de l’affection de longue durée reconnue (liste ou hors liste) — AFFECTION EXONÉRANTE";
const ZONE_HORS = "Prescriptions SANS RAPPORT avec l’affection de longue durée — MALADIES INTERCURRENTES";
const accentOf = (P) => (/^#[0-9a-f]{6}$/i.test(P?.couleur || "") ? P.couleur.toUpperCase() : DEFAULT_SETTINGS.couleur);
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toNum = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
function isoLocal(d) { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); }
const todayISO = () => isoLocal(new Date());
function fmtDate(iso) { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; }
const longFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const fmtLong = (iso) => (iso ? longFmt.format(new Date(iso + "T12:00:00")) : "");
const num = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n || 0);
const lines = (s) => String(s || "").split(/\n/).map((x) => x.trim()).filter(Boolean);
const civ = (p) => (p?.sexe === "F" ? "Mme" : p?.sexe === "M" ? "M." : "");
function patientName(p, withCiv = true) { if (!p || !p.nom) return "Patient non renseigné"; return [withCiv ? civ(p) : "", p.prenom, String(p.nom).toUpperCase()].filter(Boolean).join(" "); }
function doctorName(P) { return [P.titre, P.prenom, P.nom ? String(P.nom).toUpperCase() : ""].filter(Boolean).join(" "); }
const medTitle = (l) => [l.dci, l.dosage].filter(Boolean).join(" ") + (l.forme ? (l.dci || l.dosage ? ", " : "") + l.forme : "");
function ageOf(iso, at) {
  if (!iso) return "";
  const b = new Date(iso + "T12:00:00"), a = new Date((at || todayISO()) + "T12:00:00");
  let m = (a.getFullYear() - b.getFullYear()) * 12 + a.getMonth() - b.getMonth(); if (a.getDate() < b.getDate()) m--;
  if (m < 0) return "";
  return m < 36 ? `${m} mois` : `${Math.floor(m / 12)} ans`;
}
function patientSub(p, at, poids) {
  const parts = [];
  if (p?.naissance) parts.push(`${p.sexe === "F" ? "Née" : p.sexe === "M" ? "Né" : "Né(e)"} le ${fmtDate(p.naissance)} (${ageOf(p.naissance, at)})`);
  if (toNum(poids)) parts.push(`${num(toNum(poids))} kg`);
  return parts.join(" · ");
}
function medLines(l) {
  return [l.posologie,
    [l.duree ? "Durée : " + l.duree : "", l.quantite ? "Quantité : " + l.quantite : ""].filter(Boolean).join(" · "),
    [l.nr ? `Non substituable (${l.nrMotif || "MTE"})` : "", l.horsAmm ? "Prescription hors AMM" : ""].filter(Boolean).join(" · "),
    l.commentaire].filter(Boolean);
}

function buildPDF(o, P) {
  const p = o.patient || {}, a4 = P.format === "A4";
  const pdf = new jsPDF({ unit: "mm", format: a4 ? "a4" : "a5" });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
  const M = a4 ? 18 : 12, R = W - M, CW = R - M, fs = a4 ? 10 : 8.6, lh = fs * 0.43;
  const ACC = hexRgb(accentOf(P)), INK = [18, 32, 29], MUT = [86, 106, 101], LINE = [215, 223, 221], TINT = [243, 246, 245];
  const tx = (s) => String(s ?? "").replace(/[  ]/g, " ");
  const FOOT = 16, F = P.police === "serif" ? "times" : "helvetica", centre = P.disposition === "centre";
  let y = M;
  const ensure = (h) => { if (y + h > H - FOOT - 4) { pdf.addPage(); y = M; } };
  const para = (text, x, w, style = "normal", size = fs, color = INK) => { pdf.setFont(F, style); pdf.setFontSize(size); pdf.setTextColor(...color); const ls = pdf.splitTextToSize(tx(text), w); ensure(ls.length * size * 0.43); pdf.text(ls, x, y + size * 0.35); y += ls.length * size * 0.43; };

  // En-tête prescripteur
  if (centre) {
    let cy = y;
    pdf.setFont(F, "bold"); pdf.setFontSize(fs + 3.5); pdf.setTextColor(...INK);
    pdf.splitTextToSize(tx(doctorName(P) || "Prescripteur"), CW).forEach((x) => { pdf.text(x, W / 2, cy + 4, { align: "center" }); cy += (fs + 3.5) * 0.45; });
    cy += 1.5;
    if (P.specialite) { pdf.setFont(F, "bold"); pdf.setFontSize(fs); pdf.setTextColor(...ACC); pdf.text(tx(P.specialite), W / 2, cy + 2.5, { align: "center" }); cy += lh + 0.6; }
    pdf.setFont(F, "normal"); pdf.setFontSize(fs - 0.6); pdf.setTextColor(...MUT);
    [...lines(P.qualifs), [...lines(P.adresse), [P.cp, P.ville].filter(Boolean).join(" ")].filter(Boolean).join(" · "), [P.tel ? "Tél. " + P.tel : "", P.email].filter(Boolean).join(" · ")].filter(Boolean)
      .forEach((l) => pdf.splitTextToSize(tx(l), CW).forEach((x) => { pdf.text(x, W / 2, cy + 2.5, { align: "center" }); cy += (fs - 0.6) * 0.43; }));
    const ids = [["RPPS", P.rpps], ["N° AM", P.am], ["FINESS", P.finess]].filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join("   ·   ");
    if (ids) { cy += 1.5; pdf.setFont("courier", "bold"); pdf.setFontSize(fs - 0.8); pdf.setTextColor(...INK); pdf.text(tx(ids), W / 2, cy + 2.5, { align: "center" }); cy += (fs - 0.8) * 0.45; }
    y = cy + 3;
  } else {
    const idW = a4 ? 52 : 44, lw = CW - idW - 4;
    let ly = y;
    pdf.setFont(F, "bold"); pdf.setFontSize(fs + 3.5); pdf.setTextColor(...INK);
    pdf.splitTextToSize(tx(doctorName(P) || "Prescripteur"), lw).forEach((x) => { pdf.text(x, M, ly + 4); ly += (fs + 3.5) * 0.45; });
    ly += 1.5;
    if (P.specialite) { pdf.setFont(F, "bold"); pdf.setFontSize(fs); pdf.setTextColor(...ACC); pdf.text(tx(P.specialite), M, ly + 2.5); ly += lh + 0.6; }
    pdf.setFont(F, "normal"); pdf.setFontSize(fs - 0.6); pdf.setTextColor(...MUT);
    [...lines(P.qualifs), ...lines(P.adresse), [P.cp, P.ville].filter(Boolean).join(" "), P.tel ? "Tél. " + P.tel : "", P.email].filter(Boolean)
      .forEach((l) => pdf.splitTextToSize(tx(l), lw).forEach((x) => { pdf.text(x, M, ly + 2.5); ly += (fs - 0.6) * 0.43; }));
    let ry = y + 2;
    pdf.setFontSize(fs - 0.8);
    [["RPPS", P.rpps], ["N° AM", P.am], ["FINESS", P.finess]].filter(([, v]) => v).forEach(([k, v]) => { pdf.setFont(F, "normal"); pdf.setTextColor(...MUT); pdf.text(k, R - idW, ry + 2.5); pdf.setFont("courier", "bold"); pdf.setTextColor(...INK); pdf.text(tx(v), R, ry + 2.5, { align: "right" }); ry += (fs - 0.8) * 0.5; });
    y = Math.max(ly, ry) + 3;
  }
  pdf.setDrawColor(...ACC); pdf.setLineWidth(0.6); pdf.line(M, y, R, y); pdf.setLineWidth(0.2);
  y += 6;

  // Lieu, date, patient
  pdf.setFont(F, "normal"); pdf.setFontSize(fs); pdf.setTextColor(...INK);
  pdf.text(tx((o.lieu ? `À ${o.lieu}, le ` : "Le ") + fmtLong(o.date)), R, y, { align: "right" });
  y += lh + 3;
  para(patientName(p), M, CW, "bold", fs + 1.5);
  const sub = patientSub(p, o.date, o.poids); if (sub) para(sub, M, CW, "normal", fs, MUT);
  y += 4;
  if (TITLES[o.type]) { pdf.setFont(F, "bold"); pdf.setFontSize(fs); pdf.setTextColor(...ACC); pdf.text(tx(TITLES[o.type].toUpperCase()), W / 2, y + 2, { align: "center" }); y += lh + 4; }

  // Prescriptions
  let n = 0;
  const drawLine = (l) => {
    if (l.kind === "texte") {
      pdf.setFont(F, "normal"); pdf.setFontSize(fs);
      const ls = pdf.splitTextToSize(tx(l.texte), CW - 6); ensure(ls.length * lh + 2);
      pdf.setTextColor(...ACC); pdf.setFont(F, "bold"); pdf.text("-", M + 1, y + fs * 0.35);
      pdf.setFont(F, "normal"); pdf.setTextColor(...INK); pdf.text(ls, M + 6, y + fs * 0.35); y += ls.length * lh + 3; return;
    }
    n++;
    pdf.setFont(F, "bold"); pdf.setFontSize(fs + 0.6);
    const head = pdf.splitTextToSize(tx(medTitle(l)), CW - 6);
    pdf.setFont(F, "normal"); pdf.setFontSize(fs);
    const det = medLines(l).flatMap((x) => pdf.splitTextToSize(tx(x), CW - 6).map((t) => [t, /^Non substituable|^Prescription hors AMM/.test(x)]));
    ensure(head.length * lh + det.length * lh + 3);
    pdf.setFont(F, "bold"); pdf.setFontSize(fs + 0.6); pdf.setTextColor(...ACC); pdf.text(`${n}.`, M, y + fs * 0.35);
    pdf.setTextColor(...INK); pdf.text(head, M + 6, y + fs * 0.35); y += head.length * (fs + 0.6) * 0.43;
    det.forEach(([t, it]) => { pdf.setFont(F, it ? "italic" : "normal"); pdf.setFontSize(fs); pdf.setTextColor(...INK); pdf.text(t, M + 6, y + fs * 0.35); y += lh; });
    y += 3;
  };
  const zoneHead = (label) => {
    pdf.setFont(F, "bold"); pdf.setFontSize(fs - 1);
    const ls = pdf.splitTextToSize(tx(label), CW - 6), h = ls.length * (fs - 1) * 0.43 + 4;
    ensure(h + 8); pdf.setDrawColor(...INK); pdf.setFillColor(...TINT); pdf.rect(M, y, CW, h, "FD");
    pdf.setTextColor(...INK); pdf.text(ls, W / 2, y + 2 + (fs - 1) * 0.35, { align: "center" }); y += h + 4;
  };
  if (o.type === "bizone") {
    [["ald", ZONE_ALD], ["hors", ZONE_HORS]].forEach(([z, label], zi) => {
      if (zi) y += 2;
      zoneHead(label);
      const ls = (o.lignes || []).filter((l) => (l.zone || "ald") === z);
      if (ls.length) ls.forEach(drawLine); else { para("Néant", M + 6, CW - 6, "normal", fs, MUT); y += 3; }
    });
  } else (o.lignes || []).forEach(drawLine);

  if (toNum(o.renouvellement)) { y += 1; para(`À renouveler ${toNum(o.renouvellement)} fois.`, M, CW, "bold", fs); }
  if (o.mentions) { y += 2; para(o.mentions, M, CW, "normal", fs); }

  // Signature
  const sh = a4 ? 26 : 22, sw = a4 ? 60 : 48;
  y += 4; ensure(sh + 4);
  const sy = Math.max(y, H - FOOT - 6 - sh);
  pdf.setFont(F, "normal"); pdf.setFontSize(fs - 1); pdf.setTextColor(...MUT); pdf.text("Signature", R - sw, sy + 2);
  if (P.signature) { try { const ip = pdf.getImageProperties(P.signature); let h = sh - 5, w = (h * ip.width) / ip.height; if (w > sw) { w = sw; h = (w * ip.height) / ip.width; } pdf.addImage(P.signature, "PNG", R - sw, sy + 4, w, h); } catch (e) {} }

  // Pied de page
  const foot = [P.urgence, [P.conventionnement, P.horaires].filter(Boolean).join(" · ")].filter(Boolean), pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i); pdf.setDrawColor(...LINE); pdf.line(M, H - FOOT, R, H - FOOT);
    let fy = H - FOOT + 4;
    foot.forEach((t, j) => { pdf.setFont(F, j ? "normal" : "bold"); pdf.setFontSize(fs - 1.4); pdf.setTextColor(...(j ? MUT : INK)); pdf.text(tx(t), W / 2, fy, { align: "center" }); fy += (fs - 1.4) * 0.45; });
    if (pages > 1) { pdf.setFont(F, "normal"); pdf.setFontSize(fs - 1.6); pdf.setTextColor(...MUT); pdf.text(`${i}/${pages}`, R, H - 5, { align: "right" }); }
  }
  return pdf;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée" });
  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
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
