// Se ejecuta cada 5 minutos desde GitHub Actions. Lee las citas y manda los avisos push que toquen.
const admin = require("firebase-admin");
const { eventos, esperaEstado, TZ } = require("./logica");

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore(), FV = admin.firestore.FieldValue;
const APP_URL = process.env.APP_URL || "./", OWNER = process.env.OWNER_EMAIL;

const nombres = {};
async function nombre(cid) {
  if (!(cid in nombres)) { const s = await db.collection("clientes").doc(cid).get(); nombres[cid] = (s.exists && s.data().nombre) || "Un cliente"; }
  return nombres[cid];
}
async function enviar(uid, titulo, cuerpo, tag) {
  const ref = db.collection("push").doc(uid), s = await ref.get();
  const toks = (s.exists && s.data().toks) || [];
  if (!toks.length) return 0;
  const r = await admin.messaging().sendEachForMulticast({ tokens: toks,
    data: { title: titulo, body: cuerpo, url: APP_URL, tag: tag || "" },
    webpush: { headers: { Urgency: "high", TTL: "7200" } } });
  const malos = [];
  r.responses.forEach((x, i) => { if (!x.success && x.error && /registration-token-not-registered|invalid-argument|invalid-registration/.test(x.error.code || "")) malos.push(toks[i]); });
  if (malos.length) await ref.update({ toks: FV.arrayRemove(...malos) });
  return r.successCount;
}

(async () => {
  const now = Date.now();
  const ayer = new Date(now - 864e5 + (parseInt(TZ) * 3600e3)).toISOString().slice(0, 10); // ayer en hora dominicana
  const snap = await db.collection("reservas").where("dia", ">=", ayer).get();
  let barberUid = null;
  try { barberUid = (await admin.auth().getUserByEmail(OWNER)).uid; } catch (e) { console.log("No se encontró al barbero:", e.message); }
  let enviados = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    for (const ev of eventos(d, now)) {
      const para = ev.para === "barbero" ? barberUid : d.cid;
      if (!para) continue;
      const cuerpo = ev.cuerpo.replace("{n}", ev.cuerpo.includes("{n}") ? await nombre(d.cid) : "");
      let ok = 0;
      try { ok = await enviar(para, ev.titulo, cuerpo, doc.id + ":" + Object.keys(ev.set)[0]); } catch (e) { console.log("Error enviando:", e.message); }
      if (ok > 0) { await doc.ref.update(ev.set); enviados++; console.log("Aviso enviado:", ev.para, ev.titulo); }
    }
  }
  // Lista de espera: pedir que agenden para mañana y quitar a quien ya venció o ya agendó
  const esp = await db.collection("espera").get();
  for (const e of esp.docs) {
    const d = e.data(), st = esperaEstado(d, now, snap.docs.map(x => x.data()).filter(r => r.cid === d.cid));
    if (st === "fuera") { await e.ref.delete(); console.log("Salió de la lista de espera:", d.nombre); continue; }
    if (st === "agenda" && !d.na) {
      let ok = 0;
      try { ok = await enviar(d.cid, "Hoy no se liberó ningún turno", "Agenda tu cita para mañana o saldrás de la lista de espera.", e.id + ":na"); } catch (x) { console.log("Error enviando:", x.message); }
      if (ok > 0) { await e.ref.update({ na: true }); enviados++; console.log("Aviso de agendar enviado a", d.nombre); }
    }
  }
  console.log("Listo. Avisos enviados:", enviados, "· citas revisadas:", snap.size);
})().catch(e => { console.error(e); process.exit(1); });
