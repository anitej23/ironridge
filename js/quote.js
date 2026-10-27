import { CONFIG, isDemo } from "./config.js";

const form = document.getElementById("quote-form");
const errBox = document.getElementById("form-error");
const demoMsg = document.getElementById("demo-msg");
const btn = document.getElementById("submit-btn");

if (isDemo()) demoMsg.classList.add("show");

function showError(msg) {
  errBox.textContent = msg;
  errBox.classList.add("show");
  errBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function validate(data, files) {
  const missing = [];
  for (const f of ["name", "phone", "service", "area", "pickup_address", "items"]) {
    if (!String(data[f] || "").trim()) missing.push(f.replace("_", " "));
  }
  if (missing.length) return `Please fill in: ${missing.join(", ")}.`;
  const digits = String(data.phone).replace(/\D/g, "");
  if (digits.length < 10) return "Please enter a valid phone number.";
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "Please enter a valid email.";
  if (files.length > CONFIG.MAX_PHOTOS) return `Please attach ${CONFIG.MAX_PHOTOS} photos or fewer.`;
  for (const f of files) {
    if (!f.type.startsWith("image/")) return "Photos must be image files.";
    if (f.size > CONFIG.MAX_PHOTO_MB * 1024 * 1024) return `Each photo must be under ${CONFIG.MAX_PHOTO_MB} MB.`;
  }
  return null;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errBox.classList.remove("show");

  const fd = new FormData(form);
  const files = fd.getAll("photos").filter((f) => f && f.size > 0);
  const data = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "photos"));

  const problem = validate(data, files);
  if (problem) return showError(problem);

  if (isDemo()) {
    window.location.href = "thanks.html?demo=1";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
    const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

    // Upload photos first into a random folder (anon users can upload but not read)
    const folder = crypto.randomUUID();
    const photoPaths = [];
    for (const file of files) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${folder}/${Date.now()}_${safe}`;
      const { error } = await supabase.storage.from(CONFIG.PHOTO_BUCKET).upload(path, file);
      if (error) throw error;
      photoPaths.push(path);
    }

    const row = {
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email?.trim() || null,
      service: data.service,
      area: data.area,
      preferred_date: data.preferred_date || null,
      pickup_address: data.pickup_address.trim(),
      dropoff_address: data.dropoff_address?.trim() || null,
      items: data.items.trim(),
      access_notes: data.access_notes?.trim() || null,
      referral_source: data.referral_source || null,
      referral_code: data.referral_code?.trim() || null,
      photo_paths: photoPaths,
    };

    const { error } = await supabase.from("requests").insert(row);
    if (error) throw error;

    window.location.href = "thanks.html";
  } catch (err) {
    console.error(err);
    showError("Something went wrong sending your request. Please try again or call [PHONE].");
    btn.disabled = false;
    btn.textContent = "Send my request";
  }
});
