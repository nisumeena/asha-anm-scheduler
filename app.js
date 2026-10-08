// Smart ASHA/ANM Visit Scheduler - client-side prototype (data kept in localStorage)

// ---- Risk rules (prototype prioritization algorithm, NOT a clinical score) ----
const RULES = [
  { label: "High-risk pregnancy",      points: 30, test: p => p.pregnancy === "high" },
  { label: "Newborn",                  points: 25, test: p => p.child === "newborn" },
  { label: "Severe malnutrition",      points: 25, test: p => p.child === "malnutrition" },
  { label: "Missed scheduled visit",   points: 15, test: p => p.missed },
  { label: "Previous referral",        points: 20, test: p => p.referral === "previous" },
  { label: "Chronic condition",        points: 15, test: p => p.chronic },
  { label: "Long time since last visit (30+ days)", points: 10, test: p => daysSince(p.lastVisit) >= 30 },
];
const SLOTS = ["09:00 AM","10:00 AM","11:00 AM","12:00 PM","01:00 PM","02:00 PM","03:00 PM","04:00 PM"];
const KEY = "ashaScheduler.v1";

function daysSince(d) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}
function level(score) { return score >= 70 ? "high" : score >= 40 ? "medium" : "low"; }
function levelName(l) { return { high: "Critical", medium: "Medium", low: "Low" }[l]; }

function assess(p) {
  const hits = RULES.filter(r => r.test(p));
  const score = Math.min(100, hits.reduce((s, r) => s + r.points, 0));
  return { score, level: level(score), reasons: hits.map(r => `${r.label} (+${r.points})`) };
}

// ---- Storage ----
let db = load();
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { patients: [], workers: [], nextId: 1 }; }
  catch { return { patients: [], workers: [], nextId: 1 }; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} }

// ---- Helpers ----
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const iso = d => d.toISOString().slice(0, 10);
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}
const badge = p => `<span class="badge ${p.level}">${p.score} · ${levelName(p.level)}</span>`;
const table = (head, rows, empty) => rows.length
  ? `<tr>${head.map(h => `<th>${h}</th>`).join("")}</tr>${rows.join("")}`
  : `<tr><td class="empty">${empty}</td></tr>`;

function refreshScores() {
  db.patients.forEach(p => Object.assign(p, assess(p)));
}

// ---- Rendering ----
function render() {
  refreshScores();
  const ps = db.patients;
  const cnt = s => ps.filter(p => p.status === s).length;
  $("#stats").innerHTML = [
    ["Total patients", ps.length], ["Critical priority", ps.filter(p => p.level === "high").length],
    ["Pending", cnt("Pending")], ["Scheduled", cnt("Scheduled")],
    ["Completed", cnt("Completed")], ["Workers", db.workers.length],
  ].map(([l, n]) => `<div class="card"><b>${n}</b><span>${l}</span></div>`).join("");

  const sorted = [...ps].sort((a, b) => b.score - a.score);
  $("#topList").innerHTML = `<table>${table(["Patient","Village","Risk","Why","Status"],
    sorted.filter(p => p.status !== "Completed").slice(0, 5).map(p =>
      `<tr><td>${esc(p.name)}</td><td>${esc(p.village)}</td><td>${badge(p)}</td>
       <td class="reasons">${esc(p.reasons.join(", "))}</td><td>${p.status}</td></tr>`),
    "No patients yet. Add one or load sample data.")}</table>`;

  renderPatients();

  $("#workerTable").innerHTML = table(["Name","Type","Village","Phone","Status","Max/day","Booked",""],
    db.workers.map(w => `<tr><td>${esc(w.name)}</td><td>${w.type}</td><td>${esc(w.village)}</td>
      <td>${esc(w.phone)}</td><td>${w.available ? "Available" : "On leave"}</td><td>${w.max}</td>
      <td>${ps.filter(p => p.status === "Scheduled" && p.workerId === w.id).length}</td>
      <td><button class="btn danger small" data-delw="${w.id}">Delete</button></td></tr>`),
    "No workers added yet.");

  const sch = ps.filter(p => p.status === "Scheduled")
    .sort((a, b) => a.visitDate.localeCompare(b.visitDate) || SLOTS.indexOf(a.visitTime) - SLOTS.indexOf(b.visitTime) || b.score - a.score);
  $("#scheduleTable").innerHTML = table(["Date","Time","Patient","Village","Risk","Worker",""],
    sch.map(p => {
      const w = db.workers.find(x => x.id === p.workerId);
      return `<tr><td>${p.visitDate}</td><td>${p.visitTime}</td><td>${esc(p.name)}</td><td>${esc(p.village)}</td>
        <td>${badge(p)}</td><td>${esc(w ? w.name : "-")}</td>
        <td><button class="btn small" data-done="${p.id}">Mark complete</button></td></tr>`;
    }), "Nothing scheduled. Click “Generate smart schedule”.");

  $("#ruleTable").innerHTML = table(["Factor","Score"], RULES.map(r => `<tr><td>${r.label}</td><td>+${r.points}</td></tr>`));
  save();
}

function renderPatients() {
  const q = $("#search").value.trim().toLowerCase();
  const list = db.patients
    .filter(p => !q || [p.name, p.village, p.conditions].join(" ").toLowerCase().includes(q))
    .sort((a, b) => b.score - a.score);
  $("#patientTable").innerHTML = table(["Name","Age/Sex","Village","Risk","Why","Last visit","Next due","Status",""],
    list.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.age === "" || p.age == null ? "-" : p.age)}/${esc(p.gender[0])}</td><td>${esc(p.village)}</td>
      <td>${badge(p)}</td><td class="reasons">${esc(p.reasons.join(", ") || "No risk factors")}</td>
      <td>${p.lastVisit || "-"}</td><td>${p.nextDue || "-"}</td><td>${p.status}</td>
      <td><button class="btn danger small" data-delp="${p.id}">Delete</button></td></tr>`),
    "No patients found.");
}

// ---- Scheduler ----
function generateSchedule() {
  const workers = db.workers.filter(w => w.available);
  if (!workers.length) return toast("Add at least one available worker first.");
  const load = {}; // "workerId|date" -> visits booked
  db.patients.filter(p => p.status === "Scheduled").forEach(p => {
    const k = p.workerId + "|" + p.visitDate; load[k] = (load[k] || 0) + 1;
  });
  const pending = db.patients.filter(p => p.status === "Pending").sort((a, b) => b.score - a.score);
  let placed = 0;
  for (const p of pending) {
    outer: for (let d = 0; d < 14; d++) {
      const date = new Date(); date.setDate(date.getDate() + d);
      const day = iso(date);
      const free = workers.filter(w => (load[w.id + "|" + day] || 0) < Math.min(w.max, SLOTS.length));
      if (!free.length) continue;
      free.sort((a, b) =>
        (norm(b.village) === norm(p.village)) - (norm(a.village) === norm(p.village)) ||
        (load[a.id + "|" + day] || 0) - (load[b.id + "|" + day] || 0));
      const w = free[0], k = w.id + "|" + day;
      Object.assign(p, { status: "Scheduled", workerId: w.id, visitDate: day, visitTime: SLOTS[load[k] || 0] });
      load[k] = (load[k] || 0) + 1; placed++;
      break outer;
    }
  }
  render(); toast(`${placed} visit(s) scheduled.`);
}
const norm = s => (s || "").trim().toLowerCase();

// ---- Events ----
$("#patientForm").addEventListener("submit", e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const p = {
    id: db.nextId++, name: f.get("name").trim(), age: f.get("age"), gender: f.get("gender"),
    village: f.get("village").trim(), location: f.get("location"), pregnancy: f.get("pregnancy"),
    child: f.get("child"), conditions: f.get("conditions"), previousVisits: +f.get("previousVisits") || 0,
    lastVisit: f.get("lastVisit"), nextDue: f.get("nextDue"), referral: f.get("referral"),
    chronic: f.get("chronic") === "on", missed: f.get("missed") === "on", status: "Pending",
  };
  Object.assign(p, assess(p));
  db.patients.push(p); e.target.reset(); render();
  toast(`${p.name}: risk ${p.score} (${levelName(p.level)})`);
});
$("#workerForm").addEventListener("submit", e => {
  e.preventDefault();
  const f = new FormData(e.target);
  db.workers.push({ id: db.nextId++, name: f.get("name").trim(), type: f.get("type"), village: f.get("village"),
    phone: f.get("phone"), available: f.get("available") === "1",
    max: Math.min(8, Math.max(1, +f.get("max") || 8)) });
  e.target.reset(); render(); toast("Worker added.");
});
document.addEventListener("click", e => {
  const t = e.target;
  if (t.dataset.delp) { if (confirm("Delete this patient?")) { db.patients = db.patients.filter(p => p.id != t.dataset.delp); render(); } }
  if (t.dataset.delw) {
    if (!confirm("Delete this worker? Their scheduled visits return to Pending.")) return;
    const id = +t.dataset.delw;
    db.patients.filter(p => p.workerId === id && p.status === "Scheduled").forEach(unschedule);
    db.workers = db.workers.filter(w => w.id !== id); render();
  }
  if (t.dataset.done) { const p = db.patients.find(p => p.id == t.dataset.done); Object.assign(p, { status: "Completed", lastVisit: iso(new Date()), missed: false, previousVisits: p.previousVisits + 1 }); render(); toast("Visit completed."); }
});
function unschedule(p) { Object.assign(p, { status: "Pending", workerId: null, visitDate: null, visitTime: null }); }
$("#genBtn").onclick = generateSchedule;
$("#resetBtn").onclick = () => { db.patients.filter(p => p.status === "Scheduled").forEach(unschedule); render(); toast("Schedule reset."); };
$("#search").oninput = renderPatients;
$("#clearBtn").onclick = () => { if (confirm("Delete ALL data?")) { db = { patients: [], workers: [], nextId: 1 }; render(); } };
$("#seedBtn").onclick = () => {
  const ago = n => iso(new Date(Date.now() - n * 86400000));
  const base = { gender: "Female", location: "", pregnancy: "none", child: "none", conditions: "", previousVisits: 1,
    lastVisit: ago(10), nextDue: "", referral: "none", chronic: false, missed: false, status: "Pending" };
  [
    { name: "Sunita Devi", age: 24, village: "Rampura", pregnancy: "high", missed: true, lastVisit: ago(40), referral: "previous" },
    { name: "Baby of Meena", age: 0, village: "Rampura", child: "newborn", lastVisit: ago(5) },
    { name: "Rahul Kumar", age: 3, gender: "Male", village: "Kheda", child: "malnutrition", missed: true, lastVisit: ago(35) },
    { name: "Ramesh Lal", age: 62, gender: "Male", village: "Kheda", conditions: "Diabetes", chronic: true, lastVisit: ago(45) },
    { name: "Geeta Bai", age: 28, village: "Rampura", pregnancy: "normal", lastVisit: ago(14) },
    { name: "Mohan Singh", age: 35, gender: "Male", village: "Nayagaon", conditions: "Fever", lastVisit: ago(3) },
  ].forEach(s => db.patients.push({ ...base, ...s, id: db.nextId++ }));
  [
    { name: "Kavita (ASHA)", type: "ASHA", village: "Rampura", phone: "9000000001", available: true, max: 4 },
    { name: "Priya (ANM)", type: "ANM", village: "Kheda", phone: "9000000002", available: true, max: 4 },
  ].forEach(w => db.workers.push({ ...w, id: db.nextId++ }));
  render(); toast("Sample data loaded.");
};

// ---- Simple hash router ----
function route() {
  const id = (location.hash || "#dashboard").slice(1);
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === id));
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + id));
}
window.addEventListener("hashchange", route);
route(); render();
