import { CONFIG, isDemo } from "../js/config.js";

const $ = (id) => document.getElementById(id);
const STATUSES = ["new", "quoted", "booked", "completed", "lost"];
const LABELS = {
  junk_removal: "Junk removal", moving: "Moving", both: "Both",
  nova: "NoVA", blacksburg: "Blacksburg",
  friend: "Friend or family", google: "Google", instagram: "Instagram", facebook: "Facebook",
  flyer: "Flyer", repeat: "Repeat customer", other: "Other",
};
const label = (v) => LABELS[v] || v || "Not given";
const money = (n) => (n == null || n === "" ? "-" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "-");

// Build elements safely. Customer text is ALWAYS set with textContent, never innerHTML.
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) n.append(c instanceof Node ? c : document.createTextNode(c ?? ""));
  return n;
}

let supabase = null;
let rows = [];

/* ---------- Data layer ---------- */
async function loadRows() {
  if (isDemo()) return sampleRows();
  const { data, error } = await supabase.from("requests").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function saveRow(id, patch) {
  const row = rows.find((r) => r.id === id);
  Object.assign(row, patch);
  if (isDemo()) return;
  const { error } = await supabase.from("requests").update(patch).eq("id", id);
  if (error) { alert("Save failed: " + error.message); throw error; }
}

async function photoUrls(paths) {
  if (isDemo() || !paths?.length) return [];
  const { data, error } = await supabase.storage.from(CONFIG.PHOTO_BUCKET).createSignedUrls(paths, 600);
  if (error) return [];
  return data.map((d) => d.signedUrl).filter(Boolean);
}

/* ---------- Auth ---------- */
async function init() {
  if (isDemo()) {
    $("demo-banner").hidden = false;
    $("admin-user").hidden = false;
    $("user-email").textContent = "demo@ironridge";
    $("logout-btn").hidden = true;
    return showDashboard();
  }
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  const { data } = await supabase.auth.getSession();
  if (data.session) showDashboard(data.session.user.email);
  else showLogin();
}

function showLogin() {
  $("login-view").hidden = false;
  $("dash-view").hidden = true;
  $("admin-user").hidden = true;
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  $("login-error").classList.remove("show");
  const { data, error } = await supabase.auth.signInWithPassword({ email: fd.get("email"), password: fd.get("password") });
  if (error) {
    $("login-error").textContent = "Login failed. Check your email and password.";
    $("login-error").classList.add("show");
    return;
  }
  showDashboard(data.user.email);
});

$("logout-btn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});

async function showDashboard(email) {
  $("login-view").hidden = true;
  $("dash-view").hidden = false;
  if (email) { $("admin-user").hidden = false; $("user-email").textContent = email; }
  try {
    rows = await loadRows();
  } catch (err) {
    console.error(err);
    alert("Could not load requests. Is this account listed in the admins table?");
    rows = [];
  }
  render();
}

/* ---------- Rendering ---------- */
["range", "status-filter", "search"].forEach((id) => $(id).addEventListener("input", render));

function inRange() {
  const days = Number($("range").value);
  const cutoff = Date.now() - days * 86400000;
  return rows.filter((r) => new Date(r.created_at).getTime() >= cutoff);
}

function render() {
  const set = inRange();
  renderKpis(set);
  renderWeekly();
  renderSources(set);
  renderTable(set);
}

function renderKpis(set) {
  const won = set.filter((r) => ["booked", "completed"].includes(r.status));
  const done = set.filter((r) => r.status === "completed");
  const revenue = done.reduce((s, r) => s + Number(r.final_price || 0), 0);
  const onTimeKnown = done.filter((r) => r.on_time !== null && r.on_time !== undefined);
  const onTime = onTimeKnown.filter((r) => r.on_time).length;
  const fb = done.filter((r) => r.feedback_score);
  const avgFb = fb.length ? fb.reduce((s, r) => s + Number(r.feedback_score), 0) / fb.length : null;
  const unpaid = done.filter((r) => !r.paid).length;

  const kpis = [
    ["Quote requests", set.length, `${set.filter((r) => r.status === "new").length} still new`],
    ["Request to job", set.length ? `${Math.round((won.length / set.length) * 100)}%` : "-", `${won.length} booked or done`],
    ["Jobs completed", done.length, unpaid ? `${unpaid} not marked paid` : "All paid"],
    ["Revenue", money(revenue), done.length ? `Avg ${money(revenue / done.length)} per job` : "No completed jobs"],
    ["On time rate", onTimeKnown.length ? `${Math.round((onTime / onTimeKnown.length) * 100)}%` : "-", `${onTimeKnown.length} jobs tracked`],
    ["Avg feedback", avgFb ? `${avgFb.toFixed(1)} / 5` : "-", `${fb.length} responses`],
  ];
  $("kpis").replaceChildren(...kpis.map(([l, v, s]) =>
    el("div", { class: "kpi" }, el("div", { class: "kpi-label" }, l), el("div", { class: "kpi-value" }, String(v)), el("div", { class: "kpi-sub" }, s))
  ));
}

function renderWeekly() {
  const weeks = 8;
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay());
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const s = new Date(start); s.setDate(s.getDate() - i * 7);
    const e = new Date(s); e.setDate(e.getDate() + 7);
    buckets.push({ s, count: rows.filter((r) => { const t = new Date(r.created_at); return t >= s && t < e; }).length });
  }
  const max = Math.max(1, ...buckets.map((b) => b.count));
  $("weekly").replaceChildren(...buckets.map((b) =>
    el("div", { class: "bar", title: `Week of ${fmtDate(b.s)}: ${b.count}` },
      el("div", { class: "bar-val" }, String(b.count)),
      el("div", { class: "bar-fill", style: `height:${(b.count / max) * 130}px` }),
      el("div", { class: "bar-label" }, fmtDate(b.s)))
  ));
}

function renderSources(set) {
  const counts = {};
  set.forEach((r) => { const k = r.referral_source || "unknown"; counts[k] = (counts[k] || 0) + 1; });
  const list = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...list.map(([, c]) => c));
  $("sources").replaceChildren(...(list.length ? list.map(([k, c]) =>
    el("div", { class: "hbar" },
      el("span", {}, k === "unknown" ? "Not given" : label(k)),
      el("div", { class: "hbar-track" }, el("div", { class: "hbar-fill", style: `width:${(c / max) * 100}%` })),
      el("span", { class: "hbar-val" }, String(c)))
  ) : [el("p", { class: "muted" }, "No data yet.")]));
}

function renderTable(set) {
  const status = $("status-filter").value;
  const q = $("search").value.trim().toLowerCase();
  const list = set.filter((r) => (!status || r.status === status) &&
    (!q || [r.name, r.phone, r.pickup_address, r.email].some((v) => String(v || "").toLowerCase().includes(q))));

  $("empty").hidden = list.length > 0;
  $("rows").replaceChildren(...list.map((r) => {
    const sel = el("select", { class: "input", "aria-label": `Status for ${r.name}`,
      onchange: (e) => saveRow(r.id, { status: e.target.value }).then(render) },
      ...STATUSES.map((s) => el("option", { value: s, selected: r.status === s }, s[0].toUpperCase() + s.slice(1))));
    return el("tr", {},
      el("td", {}, fmtDate(r.created_at)),
      el("td", {}, el("div", {}, r.name), el("div", { class: "muted", style: "font-size:13px" }, r.phone)),
      el("td", {}, label(r.service)),
      el("td", {}, label(r.area)),
      el("td", {}, fmtDate(r.preferred_date)),
      el("td", {}, sel),
      el("td", {}, money(r.quote_amount)),
      el("td", {}, money(r.final_price)),
      el("td", {}, el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => openDetail(r) }, "Open")));
  }));
}

/* ---------- Detail dialog ---------- */
async function openDetail(r) {
  const dl = el("dl", { class: "detail-grid" },
    ...[
      ["Phone", r.phone], ["Email", r.email], ["Service", label(r.service)], ["Area", label(r.area)],
      ["Date wanted", fmtDate(r.preferred_date)], ["Received", new Date(r.created_at).toLocaleString()],
      ["Pickup", r.pickup_address], ["Drop off", r.dropoff_address],
      ["Items", r.items], ["Access notes", r.access_notes],
      ["Heard about us", label(r.referral_source)], ["Referral code", r.referral_code],
    ].map(([k, v]) => el("div", {}, el("dt", {}, k), el("dd", {}, v || "-"))));

  const num = (name, v, lab) => el("label", { class: "field" }, lab, el("input", { class: "input", type: "number", step: "1", min: "0", name, value: v ?? "" }));
  const editForm = el("form", { class: "detail-edit" },
    el("label", { class: "field" }, "Status", el("select", { class: "input", name: "status" },
      ...STATUSES.map((s) => el("option", { value: s, selected: r.status === s }, s)))),
    el("label", { class: "field" }, "Job date", el("input", { class: "input", type: "date", name: "job_date", value: r.job_date || "" })),
    num("quote_amount", r.quote_amount, "Quote ($)"),
    num("final_price", r.final_price, "Final price ($)"),
    num("expenses", r.expenses, "Job expenses ($)"),
    el("label", { class: "field" }, "Feedback (1 to 5)", el("select", { class: "input", name: "feedback_score" },
      el("option", { value: "" }, "None"), ...[1, 2, 3, 4, 5].map((n) => el("option", { value: n, selected: Number(r.feedback_score) === n }, String(n))))),
    el("label", { class: "check" }, el("input", { type: "checkbox", name: "on_time", checked: !!r.on_time }), "Arrived on time"),
    el("label", { class: "check" }, el("input", { type: "checkbox", name: "paid", checked: !!r.paid }), "Paid"),
    el("label", { class: "field full", style: "grid-column:1/-1" }, "Notes", el("textarea", { class: "input", name: "notes", rows: "3" }, r.notes || "")),
    el("div", { class: "save-note", id: "save-note", style: "grid-column:1/-1" }),
    el("button", { class: "btn btn-primary", type: "submit", style: "grid-column:1/-1" }, "Save changes"));

  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(editForm);
    const n = (k) => (fd.get(k) === "" ? null : Number(fd.get(k)));
    await saveRow(r.id, {
      status: fd.get("status"), job_date: fd.get("job_date") || null,
      quote_amount: n("quote_amount"), final_price: n("final_price"), expenses: n("expenses"),
      feedback_score: n("feedback_score"), on_time: fd.get("on_time") === "on", paid: fd.get("paid") === "on",
      notes: fd.get("notes") || null,
    });
    $("save-note").textContent = "Saved.";
    render();
  });

  const photos = el("div", { class: "photos" });
  const urls = await photoUrls(r.photo_paths);
  if (urls.length) urls.forEach((u) => photos.append(el("a", { href: u, target: "_blank", rel: "noopener" }, el("img", { src: u, alt: "Customer photo" }))));
  else photos.append(el("p", { class: "muted" }, r.photo_paths?.length ? `${r.photo_paths.length} photos (connect Supabase to view)` : "No photos"));

  $("detail-body").replaceChildren(
    el("h2", { style: "font-size:36px;margin:0" }, r.name),
    dl, el("h3", { style: "font-size:22px" }, "Photos"), photos,
    el("h3", { style: "font-size:22px;margin-top:20px" }, "Job tracking"), editForm);
  $("detail").showModal();
}

/* ---------- Sample data for demo mode (clearly fake) ---------- */
function sampleRows() {
  const out = [];
  const services = ["junk_removal", "moving", "junk_removal", "moving", "both"];
  const sources = ["friend", "instagram", "google", "friend", "flyer", "repeat", null];
  const statuses = ["completed", "completed", "booked", "quoted", "new", "lost", "completed"];
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 26; i++) {
    const created = new Date(Date.now() - Math.floor(rnd() * 56) * 86400000);
    const status = statuses[Math.floor(rnd() * statuses.length)];
    const quote = status === "new" ? null : 100 + Math.round(rnd() * 30) * 10;
    out.push({
      id: `demo-${i}`, created_at: created.toISOString(),
      name: `Sample Customer ${i + 1}`, phone: "(000) 000-0000", email: null,
      service: services[i % services.length], area: rnd() > 0.5 ? "nova" : "blacksburg",
      preferred_date: new Date(created.getTime() + 5 * 86400000).toISOString().slice(0, 10),
      pickup_address: "[Sample address]", dropoff_address: null,
      items: "Sample item list", access_notes: null,
      referral_source: sources[Math.floor(rnd() * sources.length)], referral_code: null,
      photo_paths: [], status, quote_amount: quote,
      final_price: status === "completed" ? quote : null,
      job_date: null, on_time: status === "completed" ? rnd() > 0.15 : null,
      paid: status === "completed" ? rnd() > 0.1 : false,
      expenses: null, feedback_score: status === "completed" && rnd() > 0.3 ? 4 + Math.round(rnd()) : null, notes: null,
    });
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

init();
