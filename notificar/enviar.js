// Se ejecuta cada 5 minutos desde GitHub Actions. Lee las citas y manda los avisos push que toquen.
const admin = require("firebase-admin");
const crypto = require("crypto");
const { eventos, esperaEstado, resumen, dispKey, dispRow, citasDuplicadas, ocupaTurno, turnosLibres, elegirEspera, hl, diaTxt, TZ } = require("./logica");

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore(), FV = admin.firestore.FieldValue;
try { console.log("Cuenta de servicio en uso:", JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT).client_email); } catch (e) {}
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

// Clave temporal sin letras confusas (sin 0/O, 1/l/I)
function genClave() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let c = ""; for (let i = 0; i < 8; i++) c += a[crypto.randomInt(a.length)];
  return c;
}

(async () => {
  const now = Date.now();
  // Nombres de los barberos (id -> nombre) para decir "con quién" es la cita
  const bn = { peluca: "Peluca" };
  try { const b = await db.doc("config/barberos").get(); ((b.exists && b.data().items) || []).forEach(x => { bn[x.id] = x.n; }); } catch (e) { console.log("Sin lista de barberos:", e.message); }
  const ayer = new Date(now - 864e5 + (parseInt(TZ) * 3600e3)).toISOString().slice(0, 10); // ayer en hora dominicana
  const snap = await db.collection("reservas").where("dia", ">=", ayer).get();
  let barberUid = null;
  try { barberUid = (await admin.auth().getUserByEmail(OWNER)).uid; } catch (e) { console.log("No se encontró al barbero:", e.message); }
  let enviados = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    for (const ev of eventos(d, now, bn)) {
      const para = ev.para === "barbero" ? barberUid : d.cid;
      if (!para) continue;
      const cuerpo = ev.cuerpo.replace("{n}", ev.cuerpo.includes("{n}") ? await nombre(d.cid) : "");
      let ok = 0;
      try { ok = await enviar(para, ev.titulo, cuerpo, doc.id + ":" + Object.keys(ev.set)[0]); } catch (e) { console.log("Error enviando:", e.message); }
      if (ok > 0) { await doc.ref.update(ev.set); enviados++; console.log("Aviso enviado:", ev.para, ev.titulo); }
    }
  }
  // Resumen de la mañana para el barbero (una vez al día, después de las 7:00 AM)
  const hdr = new Date(now + parseInt(TZ) * 3600e3), hoy = hdr.toISOString().slice(0, 10), hora = hdr.getUTCHours();
  if (barberUid && hora >= 7 && hora < 12) {
    try {
      const rs = await db.doc("config/resumen").get();
      if (!rs.exists || rs.data().dia !== hoy) {
        const r = resumen(snap.docs.map(x => x.data()), hoy, bn);
        const ok = await enviar(barberUid, r.titulo, r.cuerpo, "resumen:" + hoy);
        if (ok > 0) { await db.doc("config/resumen").set({ dia: hoy }); enviados++; console.log("Resumen de la mañana enviado"); }
      }
    } catch (e) { console.log("Error en el resumen:", e.message); }
  }
  // Claves temporales: el barbero las pide desde su panel y aquí se crean (se borran solas a las 24 h)
  const rsts = await db.collection("resets").get();
  for (const r of rsts.docs) {
    const d = r.data();
    if (d.listo && now - d.listo > 864e5) { await r.ref.delete(); console.log("Clave temporal vencida borrada"); continue; }
    if (d.pedido && !d.listo && !d.err) {
      try {
        const clave = genClave();
        await admin.auth().updateUser(r.id, { password: clave });
        await r.ref.set({ pedido: d.pedido, clave, listo: now });
        console.log("Clave temporal creada para un cliente");
      } catch (e) {
        await r.ref.set({ pedido: d.pedido, err: String(e.code || e.message || "error").slice(0, 80) });
        console.log("No se pudo restablecer la clave:", e.code || e.message);
      }
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
  // Disponibilidad pública: cada ~30 min se reconstruye desde las reservas (corrige cualquier diferencia)
  const min = new Date(now).getUTCMinutes();
  if (min < 5 || (min >= 30 && min < 35)) {
    try {
      const hoyD = new Date(now + parseInt(TZ) * 3600e3).toISOString().slice(0, 10);
      const want = {};
      snap.docs.forEach(x => {
        const r = x.data(); if (r.dia < hoyD) return;
        const row = dispRow(r, x.id, now); if (!row) return;
        const k = dispKey(r), c = want[k];
        if (!c || (row.estado !== "cancelada" && c.estado === "cancelada")) want[k] = row;
      });
      const ds = await db.collection("disp").get();
      let batch = db.batch(), n = 0, cambios = 0;
      const op = async f => { f(); cambios++; if (++n >= 400) { await batch.commit(); batch = db.batch(); n = 0; } };
      for (const x of ds.docs) {
        const w = want[x.id];
        if (!w) await op(() => batch.delete(x.ref));
        else { if (JSON.stringify(x.data()) !== JSON.stringify(w)) await op(() => batch.set(x.ref, w)); delete want[x.id]; }
      }
      for (const k of Object.keys(want)) await op(() => batch.set(db.collection("disp").doc(k), want[k]));
      if (n) await batch.commit();
      console.log("Disponibilidad sincronizada. Cambios:", cambios);
    } catch (e) { console.log("Error al sincronizar disponibilidad:", e.message); }
  }
  // Lista de espera automática: cuando alguien cancela, el turno pasa solo al primero de la lista.
  // Va después de la sincronización de disponibilidad para que esta no pise la fila nueva.
  try {
    const rs2 = (await db.collection("reservas").where("dia", ">=", ayer).get()).docs.map(x => ({ id: x.id, ...x.data() }));
    const libres = turnosLibres(rs2, now);
    if (libres.length) {
      const es2 = (await db.collection("espera").get()).docs.map(x => ({ id: x.id, ...x.data() }));
      const bq = new Set((await db.collection("bloqueos").get()).docs.map(x => x.id)); // clientes con reservas pausadas
      for (const r of libres) {
        const k = dispKey(r);
        if (rs2.some(x => x.id !== r.id && dispKey(x) === k && ocupaTurno(x))) continue; // otro ya tomó esa hora
        const f = elegirEspera(r, es2.filter(e => !bq.has(e.cid)), rs2, now);
        if (!f) continue;
        const nref = db.collection("reservas").doc(), oref = db.collection("reservas").doc(r.id),
              dref = db.collection("disp").doc(k), eref = db.collection("espera").doc(f.id);
        const nueva = { cid: f.cid, tipo: f.tipo === "nino" ? "nino" : "adulto", servicio: String(f.servicio || "Corte").slice(0, 120),
          precio: Number(f.precio) || 0, dia: r.dia, hora: r.hora, estado: "activa", motivo: "", recordado: 0,
          creada: now, deEspera: true, bid: r.bid || "peluca" };
        const hecho = await db.runTransaction(async t => {
          const [o, d, e] = await Promise.all([t.get(oref), t.get(dref), t.get(eref)]);
          if (!o.exists || o.data().estado !== "cancelada" || o.data().esp !== "pend") return false; // ya lo resolvieron
          if (!e.exists) return false;                                                               // ya salió de la lista
          if (d.exists && d.data().rid !== r.id && d.data().estado !== "cancelada") return false;    // la hora ya la tiene otro
          t.set(nref, nueva); t.set(dref, dispRow(nueva, nref.id, now)); t.update(oref, { esp: "dado" }); t.delete(eref);
          return true;
        });
        if (!hecho) continue;
        r.esp = "dado"; rs2.push({ id: nref.id, ...nueva });
        const cuando = diaTxt(r.dia) + " a las " + hl(r.hora);
        console.log("Turno de la lista de espera asignado:", f.nombre, cuando);
        try {
          const ok = await enviar(f.cid, "¡Se liberó un turno para ti! 🎉", "Tu cita de " + nueva.servicio + " quedó para el " + cuando + ". Si no puedes ir, cancélala en la app.", nref.id + ":ne");
          if (ok > 0) { await nref.update({ ne: true }); enviados++; }
        } catch (x) { console.log("Error avisando al cliente:", x.message); }
        if (barberUid) { try { await enviar(barberUid, "Turno ocupado desde la lista de espera", (await nombre(f.cid)) + " · " + nueva.servicio + " · " + cuando, nref.id + ":nbe"); } catch (x) { console.log("Error avisando al barbero:", x.message); } }
      }
    }
  } catch (e) { console.log("Error en la lista de espera automática:", e.message); }
  // Una persona = una cita activa. La app ya lo impide; esto corrige cualquier caso que se le escape (quedan 5 min como máximo).
  try {
    const rs3 = (await db.collection("reservas").where("dia", ">=", ayer).get()).docs.map(x => ({ id: x.id, ...x.data() }));
    for (const g of citasDuplicadas(rs3, now)) {
      for (const r of g.cancelar) {
        const oref = db.collection("reservas").doc(r.id), dref = db.collection("disp").doc(dispKey(r));
        const hecho = await db.runTransaction(async t => {
          const [o, d] = await Promise.all([t.get(oref), t.get(dref)]);
          if (!o.exists || o.data().estado !== "activa") return false; // ya cambió
          t.update(oref, { estado: "cancelada", motivo: "Solo se permite una cita activa a la vez", por: "sistema", canceladaEn: now, nbc: now, esp: "" });
          if (d.exists && d.data().rid === r.id) t.delete(dref); // libera la hora
          return true;
        });
        if (!hecho) continue;
        const cual = diaTxt(r.dia) + " a las " + hl(r.hora), queda = diaTxt(g.queda.dia) + " a las " + hl(g.queda.hora);
        console.log("Cita repetida cancelada:", cual, "· se conserva:", queda);
        try { await enviar(r.cid, "Cancelamos una cita repetida", "Solo puedes tener una cita activa. Cancelamos la del " + cual + "; te queda la del " + queda + ".", r.id + ":dup"); } catch (x) { console.log("Error avisando:", x.message); }
      }
    }
  } catch (e) { console.log("Error al revisar citas repetidas:", e.message); }
  // Marca de que el sistema sigue funcionando (el panel avisa si pasa más de 1 hora sin verla)
  await db.doc("config/estado").set({ ult: now });
  console.log("Listo. Avisos enviados:", enviados, "· citas revisadas:", snap.size);
})().catch(e => { console.error(e); process.exit(1); });
