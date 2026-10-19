/* Mi Casa · Finance — V10.0.0
   Vanilla JS + Firebase (Auth + Firestore). Same data model as V9.5.5, plus:
   - attachments stored in households/{h}/attachments/{id} (legacy inline data still read)
   - roles: owner · admin · member · viewer   (members/{id}.role, households/{h}.ownerId)
   - monthlyClosings/{YYYY-MM}.status = "closed" | "open"  (a doc without status counts as closed)
   - recurring.autoCreate + participantIds → one pending bill per month (expenses/rec_{rid}_{YYYY-MM})
   - goalContributions, settings/categories, recurringRuns
*/
export const firebaseConfig = {
  apiKey: "AIzaSyBmyu4QSwuLbVEPfuYozXHLhwTGYr6pQ1U",
  authDomain: "mi-casa-gastos-ad8db.firebaseapp.com",
  projectId: "mi-casa-gastos-ad8db",
  storageBucket: "mi-casa-gastos-ad8db.firebasestorage.app",
  messagingSenderId: "938411430388",
  appId: "1:938411430388:web:60e0621370f281fde569a1"
};
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, collection, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const APP_VERSION = "10.1.0";
const fb = initializeApp(firebaseConfig), auth = getAuth(fb), db = getFirestore(fb);

/* ───────────────────────── helpers ───────────────────────── */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
const money = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));
const moneyHTML = n => { const s = money(n), i = s.lastIndexOf("."); return i < 0 ? esc(s) : `${esc(s.slice(0, i))}<small>${esc(s.slice(i))}</small>`; };
const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase()).join("");
const pad2 = n => String(n).padStart(2, "0");
const localISO = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => localISO();
const monthKey = d => (d || today()).slice(0, 7);
const nowMonth = () => monthKey();
const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return localISO(new Date(y, m - 1, d + n)); };
const ic = (name, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
function safeDel(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } }
let uiLang = safeGet("miCasaLanguage") || "es";
const locale = () => uiLang === "en" ? "en-US" : "es-US";
const monthLabel = k => { const [y, m] = k.split("-").map(Number); return new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1))); };
const fmtDate = iso => { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}) }).format(new Date(y, m - 1, d)); };
const emailKey = e => encodeURIComponent(String(e || "").trim().toLowerCase());
const isPermissionError = err => /permission|insufficient/i.test(String(err?.code || err?.message || ""));

/* ───────────────────────── categories ───────────────────────── */
const BASE_CATS = ["Casa", "Comida", "Servicios", "Teléfono", "Transporte", "Salud", "Suscripciones", "Otros"];
const CAT_META = { Casa: ["home", "home"], Comida: ["cart", "food"], Servicios: ["bolt", "utilities"], Teléfono: ["phone", "phone"], Transporte: ["car", "transport"], Salud: ["heart", "health"], Suscripciones: ["play", "subs"], Otros: ["dots", "other"] };
let customCats = [];
const allCategories = () => [...BASE_CATS, ...customCats.filter(c => c && !BASE_CATS.includes(c))];
const categoryClass = c => CAT_META[c]?.[1] || "custom";
const catIcon = c => `<span class="cat-ic cat-${categoryClass(c)}">${ic(CAT_META[c]?.[0] || "tag")}</span>`;
function fillCategorySelects() {
  const cats = allCategories();
  $$("select[data-cat-select]").forEach(sel => {
    const mode = sel.dataset.catSelect, cur = sel.value;
    const first = mode === "all" ? `<option value="">Todas las categorías</option>` : mode === "any" ? `<option value="">Cualquier categoría</option>` : "";
    sel.innerHTML = first + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    if (cur && cats.includes(cur)) sel.value = cur; else if (mode === "plain") sel.value = cats[0];
  });
}

/* ───────────────────────── state ───────────────────────── */
let me = null, userDoc = null, householdId = null, household = null, members = [], expenses = [], settlements = [], budgets = {}, recurrings = [], closings = {}, goals = [], goalContribs = [], automationRules = [], coverageRules = {}, unsubs = [];
let activeMonth = nowMonth(), currentSplit = "equal", attachmentCache = [], homeRange = "month", currentView = "home", activityPageSize = 25, activityKind = "all", loadErrors = {}, pendingRegistration = null, setupKind = "pending";
const attachmentDataCache = new Map();

/* ───────────────────────── people & roles ───────────────────────── */
const PROFILE_COLORS = [["#C8653F", "Terracota"], ["#D49A2A", "Mostaza"], ["#5E9A6F", "Salvia"], ["#3F8A9A", "Petróleo"], ["#4A7FC1", "Azul"], ["#8B74C9", "Lavanda"], ["#C9628A", "Rosa"], ["#8C6A52", "Café"]];
const isOwner = () => !!(me && household && household.ownerId === me.uid);
const myMember = () => members.find(m => m.authUid === me?.uid) || members.find(m => m.id === me?.uid) || null;
const member = id => members.find(m => m.id === id) || { id, name: "Persona" };
function roleOf(m) { if (m?.authUid && household && m.authUid === household.ownerId) return "owner"; return m?.role === "admin" || m?.role === "viewer" ? m.role : "member"; }
const myRole = () => isOwner() ? "owner" : roleOf(myMember() || {});
const canManage = () => ["owner", "admin"].includes(myRole());
const canWrite = () => myRole() !== "viewer";
const ROLE_LABEL = { owner: "Owner", admin: "Administrador", member: "Miembro", viewer: "Solo lectura" };
function personColor(m) { if (m?.accentColor) return m.accentColor; const id = String(m?.id || ""); let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PROFILE_COLORS[h % PROFILE_COLORS.length][0]; }
function memberAvatar(m, size = "") {
  m = m || {}; const style = `--p:${esc(personColor(m))}`;
  if (m.avatarData) return `<span class="avatar ${size} has-photo" style="${style}"><img src="${esc(m.avatarData)}" alt=""></span>`;
  if (m.avatarPreset && m.avatarPreset !== "initials") return `<span class="avatar ${size} preset" style="${style}">${esc(m.avatarPreset)}</span>`;
  return `<span class="avatar ${size}" style="${style}">${esc(initials(m.name))}</span>`;
}
function canEditExpense(e) {
  if (!canWrite()) return false; if (!e || canManage()) return true;
  const mm = myMember(); return e.createdBy === me?.uid || (!!mm && e.payerId === mm.id);
}
function canEditMemberAdmin(m) {
  if (isOwner()) return true; if (!canManage()) return false;
  const r = roleOf(m); return r === "member" || r === "viewer" || m.id === myMember()?.id;
}
function applyRoleUI() {
  const role = myRole();
  document.body.classList.remove("role-owner", "role-admin", "role-member", "role-viewer"); document.body.classList.add("role-" + role);
  $$(".manage-only").forEach(x => x.classList.toggle("hidden", !canManage()));
  $$(".write-only").forEach(x => x.classList.toggle("hidden", !canWrite()));
}

/* ───────────────────────── months: closing & locking ───────────────────────── */
const isMonthClosed = key => !!closings[key] && closings[key].status !== "open";
function lockReasonFor(date) { const k = monthKey(date || ""); return date && isMonthClosed(k) ? `${cap(monthLabel(k))} está cerrado. Reábrelo para hacer cambios.` : ""; }

/* ───────────────────────── feedback ───────────────────────── */
let livePillTimer = null, toastTimer = null;
function showLivePill(msg, icon = "✓") { const p = $("#livePill"); if (!p) return; $("#livePillText").textContent = msg; $("#livePillIcon").textContent = icon; p.classList.add("show"); clearTimeout(livePillTimer); livePillTimer = setTimeout(() => p.classList.remove("show"), 2600); }
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2800); }
const AUTH_ERRORS = {
  "auth/email-already-in-use": "Ese email ya tiene una cuenta.", "auth/invalid-credential": "Email o contraseña incorrectos.", "auth/wrong-password": "Email o contraseña incorrectos.",
  "auth/user-not-found": "No hay una cuenta con ese email. Si te invitaron, usa «Activar acceso».", "auth/weak-password": "La contraseña necesita al menos 6 caracteres.",
  "auth/invalid-email": "Revisa el email.", "auth/missing-password": "Escribe tu contraseña.", "auth/too-many-requests": "Demasiados intentos. Espera unos minutos o cambia tu contraseña.",
  "auth/network-request-failed": "Sin conexión. Revisa tu internet e inténtalo otra vez.", "auth/user-disabled": "Esta cuenta está desactivada."
};
function authError(err) { $("#authError").textContent = AUTH_ERRORS[err?.code] || err?.message || "Ocurrió un error."; }
function showOnly(id) { ["authView", "setupView", "appView"].forEach(x => $("#" + x).classList.toggle("hidden", x !== id)); }
function clearSubs() { unsubs.forEach(f => { try { f(); } catch { /* already detached */ } }); unsubs = []; }
function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; } else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; } }

/* ───────────────────────── auth ───────────────────────── */
function setAuthTab(tab) {
  const login = tab === "login";
  $("#loginTab").classList.toggle("active", login); $("#registerTab").classList.toggle("active", !login);
  $("#loginTab").setAttribute("aria-selected", String(login)); $("#registerTab").setAttribute("aria-selected", String(!login));
  $("#loginForm").classList.toggle("hidden", !login); $("#registerForm").classList.toggle("hidden", login); $("#authError").textContent = "";
}
$("#loginTab").onclick = () => setAuthTab("login"); $("#registerTab").onclick = () => setAuthTab("register");
function bindPwToggle(btn, input) { $(btn).onclick = () => { const i = $(input), show = i.type === "password"; i.type = show ? "text" : "password"; $(btn).setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña"); $(btn).innerHTML = ic(show ? "eye-off" : "eye"); }; }
bindPwToggle("#loginPasswordToggle", "#loginPassword"); bindPwToggle("#registerPasswordToggle", "#registerPassword");
$("#loginEmail").value = safeGet("miCasaLastEmail") || "";
(function readInviteLink() {
  const p = new URLSearchParams(location.search), inv = (p.get("invite") || "").trim().toLowerCase();
  if (!inv) return;
  const name = (p.get("n") || "").trim();
  setAuthTab("register");
  $("#registerEmail").value = inv; $("#registerEmail").readOnly = true; $("#registerEmailUnlock").classList.remove("hidden");
  if (name) $("#registerName").value = name;
  $("#registerIntro").textContent = `${name ? `Hola ${name}: ` : ""}te invitaron a Mi Casa. Elige una contraseña y listo.`;
  $("#loginEmail").value = inv;
})();
$("#registerEmailUnlock").onclick = () => { $("#registerEmail").readOnly = false; $("#registerEmail").focus(); $("#registerEmailUnlock").classList.add("hidden"); };
$("#loginForm").onsubmit = async e => {
  e.preventDefault(); $("#authError").textContent = "";
  const email = $("#loginEmail").value.trim().toLowerCase(), pw = $("#loginPassword").value;
  if (!email || !pw) { $("#authError").textContent = "Escribe tu email y tu contraseña."; return; }
  busy($("#loginSubmit"), true, "Entrando…");
  try { await signInWithEmailAndPassword(auth, email, pw); safeSet("miCasaLastEmail", email); } catch (err) { authError(err); } finally { busy($("#loginSubmit"), false); }
};
$("#registerForm").onsubmit = async e => {
  e.preventDefault(); $("#authError").textContent = "";
  const name = $("#registerName").value.trim(), email = $("#registerEmail").value.trim().toLowerCase(), password = $("#registerPassword").value;
  if (!name) { $("#authError").textContent = "Escribe tu nombre."; return; }
  if (!/^\S+@\S+\.\S+$/.test(email)) { $("#authError").textContent = "Revisa el email."; return; }
  if (password.length < 6) { $("#authError").textContent = "La contraseña necesita al menos 6 caracteres."; return; }
  busy($("#registerSubmit"), true, "Activando…");
  pendingRegistration = { name, email };
  try {
    const c = await createUserWithEmailAndPassword(auth, email, password);
    try { await updateProfile(c.user, { displayName: name }); } catch { /* name is also stored in users/{uid} */ }
    safeSet("miCasaLastEmail", email);
  } catch (err) {
    pendingRegistration = null;
    if (err?.code === "auth/email-already-in-use") { setAuthTab("login"); $("#loginEmail").value = email; $("#authError").textContent = "Ese email ya tiene cuenta. Entra con tu contraseña: tu invitación se aplica sola."; $("#loginPassword").focus(); }
    else authError(err);
  } finally { busy($("#registerSubmit"), false); }
};
$("#forgotPassword").onclick = async () => {
  const email = $("#loginEmail").value.trim();
  if (!email) { $("#authError").textContent = "Escribe primero tu email."; $("#loginEmail").focus(); return; }
  try { await sendPasswordResetEmail(auth, email); $("#authError").textContent = `Te enviamos un enlace a ${email} para elegir una contraseña nueva.`; } catch (err) { authError(err); }
};
async function doLogout() { closeSheets(); try { await signOut(auth); } catch (err) { console.warn(err); toast("No se pudo cerrar sesión."); } }
["#setupLogout", "#logoutBtn", "#familyLogoutBtn"].forEach(id => $(id).onclick = doLogout);

function showSetup(kind) {
  setupKind = kind; document.body.classList.remove("app-loading");
  const T = {
    pending: ["ACCESO PENDIENTE", "Esta cuenta aún no pertenece a Mi Casa", "Solo el Owner o un administrador pueden invitarte. Pídeles que te agreguen con este mismo email.", "Ya me invitaron · Reintentar"],
    paused: ["ACCESO EN PAUSA", "Tu acceso está en pausa", "El Owner o un administrador pausó tu acceso. Cuando lo reactiven podrás entrar otra vez.", "Reintentar"],
    error: ["NO PUDIMOS CARGAR", "No pudimos cargar tu cuenta", "Revisa tu conexión e inténtalo otra vez. Si sigue pasando, avisa al Owner.", "Reintentar"]
  }[kind] || [];
  $("#setupEyebrow").textContent = T[0]; $("#setupTitle").textContent = T[1]; $("#setupCopy").textContent = T[2]; $("#claimInviteBtn").textContent = T[3];
  $("#setupEmail").textContent = me?.email || ""; showOnly("setupView");
}
async function claimMyInvite() {
  if (!me?.email) return false;
  const email = me.email.toLowerCase(), ref = doc(db, "invites", emailKey(email));
  let snap; try { snap = await getDoc(ref); } catch (err) { console.warn("invite lookup", err); return false; }
  if (!snap.exists()) return false;
  const inv = snap.data(); if (String(inv.email || "").toLowerCase() !== email) return false;
  const name = pendingRegistration?.name || me.displayName || email.split("@")[0];
  await setDoc(doc(db, "households", inv.householdId, "members", inv.memberId), { authUid: me.uid, email, inviteStatus: "active", joinedAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, "users", me.uid), { name, email, householdId: inv.householdId, memberId: inv.memberId, joinedAt: serverTimestamp() }, { merge: true });
  userDoc = { ...(userDoc || {}), householdId: inv.householdId, memberId: inv.memberId };
  try { await deleteDoc(ref); } catch { /* the owner can clean it up */ }
  pendingRegistration = null; householdId = inv.householdId; await startApp(); toast("¡Bienvenido a Mi Casa!"); return true;
}
$("#claimInviteBtn").onclick = async () => {
  if (setupKind !== "pending") { location.reload(); return; }
  try { if (!(await claimMyInvite())) toast(`Todavía no hay una invitación para ${me?.email || "este email"}.`); } catch (err) { console.warn(err); toast("No se pudo aceptar la invitación."); }
};
function resetState() { userDoc = null; householdId = null; household = null; members = []; expenses = []; settlements = []; recurrings = []; budgets = {}; closings = {}; goals = []; goalContribs = []; automationRules = []; coverageRules = {}; customCats = []; loadErrors = {}; healed = false; recurringChecked = ""; attachmentDataCache.clear(); }
onAuthStateChanged(auth, async user => {
  clearSubs(); resetState(); me = user;
  if (!user) { showOnly("authView"); document.body.classList.remove("app-loading"); return; }
  try {
    const uref = doc(db, "users", user.uid); let us = await getDoc(uref);
    if (!us.exists()) {
      const name = pendingRegistration?.name || user.displayName || user.email.split("@")[0];
      await setDoc(uref, { name, email: String(user.email).toLowerCase(), householdId: null, createdAt: serverTimestamp() });
      us = await getDoc(uref);
    }
    userDoc = us.data() || {}; householdId = userDoc.householdId || null;
    if (location.search.includes("invite=")) history.replaceState(null, "", location.pathname);
    if (!householdId) { if (await claimMyInvite()) return; showSetup("pending"); return; }
    await startApp();
  } catch (err) { console.warn("account load", err); showSetup("error"); }
});

/* ───────────────────────── data streams ───────────────────────── */
const CORE_STREAMS = ["members", "expenses", "settlements"];
let dataReady = {}, renderTimer = null;
const STREAM_KEYS = ["members", "expenses", "settlements", "budgets", "recurring", "closings", "goals", "goalContribs", "automations", "coverage", "categories"];
function beginInitialLoad() { dataReady = Object.fromEntries(STREAM_KEYS.map(k => [k, false])); document.body.classList.add("app-loading"); renderTodayActions(); }
const allDataReady = () => Object.keys(dataReady).length > 0 && Object.values(dataReady).every(Boolean);
function markDataReady(key) { dataReady[key] = true; scheduleRender(); }
function streamFailed(key, error) {
  console.warn(`Mi Casa: ${key} could not load`, error);
  dataReady[key] = true;
  if (CORE_STREAMS.includes(key)) loadErrors[key] = error || true;
  renderLoadErrors(); scheduleRender();
}
function renderLoadErrors() {
  const keys = Object.keys(loadErrors), b = $("#loadErrorBanner"); if (!b) return;
  b.classList.toggle("hidden", !keys.length); if (!keys.length) return;
  const names = { members: "las personas", expenses: "los gastos", settlements: "los pagos" }, denied = keys.some(k => isPermissionError(loadErrors[k]));
  $("#loadErrorText").textContent = `No se pudieron cargar ${keys.map(k => names[k] || k).join(", ")}. ${denied ? "Puede que tu acceso haya cambiado; habla con el Owner." : "Revisa tu conexión."} Los montos pueden estar incompletos.`;
}
$("#loadErrorRetry").onclick = () => location.reload();
function scheduleRender() {
  if (!allDataReady()) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { renderTimer = null; document.body.classList.remove("app-loading"); renderAll(); afterRender(); }, 40);
}
const docsOf = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
function listen(key, ref, fn) { unsubs.push(onSnapshot(ref, s => { try { fn(s); } finally { markDataReady(key); } }, e => streamFailed(key, e))); }
async function startApp() {
  showOnly("appView"); document.body.classList.add("app-loading");
  let h; try { h = await getDoc(doc(db, "households", householdId)); } catch (err) { console.warn(err); showSetup(isPermissionError(err) ? "pending" : "error"); return; }
  if (!h.exists()) { showSetup("error"); return; }
  household = { id: h.id, ...h.data() };
  $("#sideHouse").textContent = household.name || "Mi Casa";
  $("#appVersionLabel").textContent = "v" + APP_VERSION;
  $("#accountEmail").textContent = `Entraste como ${me.email}`;
  beginInitialLoad();
  const H = (...p) => collection(db, "households", householdId, ...p), S = name => doc(db, "households", householdId, "settings", name);
  listen("members", H("members"), s => { members = docsOf(s); });
  listen("expenses", query(H("expenses"), orderBy("date", "desc")), s => { expenses = docsOf(s); });
  listen("settlements", H("settlements"), s => { settlements = docsOf(s); });
  listen("budgets", H("budgets"), s => { budgets = {}; s.docs.forEach(d => budgets[d.id] = d.data()); });
  listen("recurring", H("recurring"), s => { recurrings = docsOf(s); });
  listen("closings", H("monthlyClosings"), s => { closings = {}; s.docs.forEach(d => closings[d.id] = d.data()); });
  listen("goals", H("goals"), s => { goals = docsOf(s); });
  listen("goalContribs", H("goalContributions"), s => { goalContribs = docsOf(s); });
  listen("automations", H("automationRules"), s => { automationRules = docsOf(s); });
  listen("coverage", S("coverage"), s => { coverageRules = s.exists() ? (s.data().rules || {}) : {}; });
  listen("categories", S("categories"), s => { customCats = s.exists() ? (s.data().custom || []).filter(Boolean) : []; fillCategorySelects(); });
}
let healed = false, recurringChecked = "";
async function healAccess() {
  const mm = myMember(); if (healed || !mm || !me) return; healed = true;
  try { if (userDoc?.memberId !== mm.id) { await setDoc(doc(db, "users", me.uid), { memberId: mm.id }, { merge: true }); userDoc = { ...(userDoc || {}), memberId: mm.id }; } } catch (err) { console.warn("users.memberId", err); }
  const last = mm.lastSeenAt?.seconds ? mm.lastSeenAt.seconds * 1000 : 0;
  if (mm.appVersion !== APP_VERSION || Date.now() - last > 6 * 3600e3) { try { await updateDoc(doc(db, "households", householdId, "members", mm.id), { lastSeenAt: serverTimestamp(), appVersion: APP_VERSION }); } catch (err) { console.warn("lastSeen", err); } }
}
function afterRender() {
  const mm = myMember();
  if (!mm && !isOwner()) { clearSubs(); showSetup("pending"); return; }   // la quitaron de la casa
  if (mm?.accessPaused && !isOwner()) { clearSubs(); showSetup("paused"); return; }
  healAccess();
  if (recurringChecked !== nowMonth() && canWrite()) { recurringChecked = nowMonth(); ensureRecurringBills().catch(err => console.warn("recurring bills", err)); }
}

/* ───────────────────────── calculation (logic kept from V9.5.5) ───────────────────────── */
const isPendingBill = e => e.paymentStatus === "pending" || !e.payerId;
function monthExpenses(key = activeMonth) { return expenses.filter(x => monthKey(x.date) === key); }
function paidMonthExpenses(key = activeMonth) { return monthExpenses(key).filter(e => e.paymentStatus !== "pending" && e.payerId); }
function pendingMonthBills(key = activeMonth) { return monthExpenses(key).filter(isPendingBill); }
function openPendingBills() { return expenses.filter(isPendingBill); }
function prevMonthKey(key) { const [y, m] = key.split("-").map(Number), d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`; }
function expenseShares(e) { if (e.shares && Object.keys(e.shares).length) return e.shares; const ids = e.participantIds || []; if (!ids.length) return {}; const each = Number(e.amount || 0) / ids.length; return Object.fromEntries(ids.map(id => [id, each])); }
function effectiveExpenseShares(e) { const original = expenseShares(e), effective = {}; for (const [id, val] of Object.entries(original)) { const coverer = e.useCoverage === true ? (coverageRules[id] || id) : id; const target = members.some(m => m.id === coverer) ? coverer : id; effective[target] = (effective[target] || 0) + Number(val || 0); } return effective; }
function coverageTextForExpense(e) { if (e.useCoverage !== true) return "Sin cobertura familiar"; const moves = []; Object.keys(expenseShares(e)).forEach(id => { const c = coverageRules[id]; if (c && c !== id) moves.push(`${member(c).name} cubre a ${member(id).name}`); }); return [...new Set(moves)].join(" · "); }
function calc(key = activeMonth) { const paid = {}, share = {}, originalShare = {}; members.forEach(m => { paid[m.id] = 0; share[m.id] = 0; originalShare[m.id] = 0; }); for (const e of paidMonthExpenses(key)) { paid[e.payerId] = (paid[e.payerId] || 0) + Number(e.amount || 0); for (const [id, v] of Object.entries(expenseShares(e))) originalShare[id] = (originalShare[id] || 0) + Number(v || 0); for (const [id, v] of Object.entries(effectiveExpenseShares(e))) share[id] = (share[id] || 0) + Number(v || 0); } const balances = {}; members.forEach(m => balances[m.id] = (paid[m.id] || 0) - (share[m.id] || 0)); return { paid, share, originalShare, balances }; }
function settledBalanceData(key = activeMonth) {
  const base = calc(key), balances = { ...base.balances }, paymentsOut = {}, paymentsIn = {};
  members.forEach(m => { paymentsOut[m.id] = 0; paymentsIn[m.id] = 0; });
  settlements.filter(s => s.month === key && s.status === "paid").forEach(s => {
    const amount = Number(s.amount || 0);
    balances[s.from] = (balances[s.from] || 0) + amount; balances[s.to] = (balances[s.to] || 0) - amount;
    paymentsOut[s.from] = (paymentsOut[s.from] || 0) + amount; paymentsIn[s.to] = (paymentsIn[s.to] || 0) + amount;
  });
  return { ...base, balances, paymentsOut, paymentsIn };
}
function settlementPlan(key = activeMonth) { const { balances } = settledBalanceData(key); let debt = Object.entries(balances).filter(([, v]) => v < -.005).map(([id, v]) => ({ id, a: -v })).sort((a, b) => b.a - a.a), cred = Object.entries(balances).filter(([, v]) => v > .005).map(([id, v]) => ({ id, a: v })).sort((a, b) => b.a - a.a), out = [], i = 0, j = 0; while (i < debt.length && j < cred.length) { const a = Math.min(debt[i].a, cred[j].a); out.push({ from: debt[i].id, to: cred[j].id, amount: a }); debt[i].a -= a; cred[j].a -= a; if (debt[i].a < .005) i++; if (cred[j].a < .005) j++; } return out; }
/* Deudas directas (V10.1): por cada gasto pagado, cada quien le debe a quien pagó por él (con la misma
   división y cobertura de siempre). Se cruza SOLO dentro de cada pareja y se descuentan los pagos entre esa
   pareja. «Simplificar pagos» usa settlementPlan(), que cruza las deudas de todos para hacer menos transferencias. */
let balanceMode = safeGet("miCasaBalanceMode") === "simplified" ? "simplified" : "direct";
function directPlan(key = activeMonth) {
  const ids = new Set(members.map(m => m.id)), pair = {}, why = {};
  const add = (a, b, v) => { if (!ids.has(a) || !ids.has(b) || a === b) return; const k = a < b ? `${a}|${b}` : `${b}|${a}`; pair[k] = (pair[k] || 0) + (a < b ? v : -v); };
  for (const e of paidMonthExpenses(key)) for (const [id, v] of Object.entries(effectiveExpenseShares(e))) {
    const amt = Number(v || 0); if (id === e.payerId || !(amt > 0)) continue;
    add(id, e.payerId, amt); (why[`${id}>${e.payerId}`] ??= []).push({ description: e.description, amount: amt });
  }
  for (const s of settlements) if (s.month === key && s.status === "paid") add(s.from, s.to, -Number(s.amount || 0));
  return Object.entries(pair).filter(([, v]) => Math.abs(v) > .005).map(([k, v]) => { const [a, b] = k.split("|"), from = v > 0 ? a : b, to = v > 0 ? b : a; return { from, to, amount: Math.abs(v), items: (why[`${from}>${to}`] || []).sort((x, y) => y.amount - x.amount) }; }).sort((x, y) => y.amount - x.amount);
}
const balancePlan = (key = activeMonth) => balanceMode === "simplified" ? settlementPlan(key) : directPlan(key);
function myPlanTotals(key = activeMonth) { const mm = myMember(), plan = balancePlan(key), sum = l => l.reduce((s, p) => s + p.amount, 0); return { owed: mm ? sum(plan.filter(p => p.to === mm.id)) : 0, owe: mm ? sum(plan.filter(p => p.from === mm.id)) : 0 }; }
function totalBudget() { return allCategories().reduce((s, c) => s + Number(budgets[`${activeMonth}_${c}`]?.limit || 0), 0); }
function catTotals() { const o = {}; monthExpenses().forEach(e => o[e.category] = (o[e.category] || 0) + Number(e.amount || 0)); return o; }
function startOfLocalDay(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function rangeExpenses() {
  if (homeRange === "month") return monthExpenses();
  const t = today(), start = homeRange === "today" ? t : addDays(t, -6);
  return expenses.filter(e => e.date && e.date >= start && e.date <= t);
}
const totalsFor = ex => ex.reduce((s, e) => s + Number(e.amount || 0), 0);
function catsFor(ex) { const o = {}; ex.forEach(e => o[e.category] = (o[e.category] || 0) + Number(e.amount || 0)); return o; }
const rangeLabel = () => homeRange === "today" ? "HOY" : homeRange === "week" ? "ÚLTIMOS 7 DÍAS" : (activeMonth === nowMonth() ? "ESTE MES" : monthLabel(activeMonth).toUpperCase());
function addMonths(key, delta) { const [y, m] = key.split("-").map(Number), d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function expenseAttachments(e) { const a = [...(e.attachments || [])]; if (!a.length && e.receiptData) a.push({ name: e.receiptName || "Comprobante", type: e.receiptType || "", data: e.receiptData }); return a; }
const receiptExpenseCount = () => expenses.filter(e => expenseAttachments(e).length).length;
const receiptFileCount = () => expenses.reduce((n, e) => n + expenseAttachments(e).length, 0);
const budgetSettings = () => budgets[`${activeMonth}__settings`] || {};
const globalBudgetLimit = () => Number(budgetSettings().globalLimit || totalBudget() || 0);
const weeklyBudgetLimit = () => Number(budgetSettings().weeklyLimit || 0);
function daysInMonth(key = activeMonth) { const [y, m] = key.split("-").map(Number); return new Date(y, m, 0).getDate(); }
function daysElapsedInActiveMonth() { if (activeMonth < nowMonth()) return daysInMonth(activeMonth); if (activeMonth > nowMonth()) return 0; return new Date().getDate(); }
function forecastMonthTotal() { const total = totalsFor(monthExpenses()), elapsed = Math.max(1, daysElapsedInActiveMonth()); return activeMonth === nowMonth() ? total / elapsed * daysInMonth(activeMonth) : total; }
function safeToSpendAmount() { const limit = globalBudgetLimit(); if (!limit) return null; const spent = totalsFor(monthExpenses()), left = Math.max(1, daysInMonth() - Math.min(daysInMonth(), daysElapsedInActiveMonth()) + 1); return Math.max(0, limit - spent) / left; }
function currentWeekExpenses() { const t = today(), start = addDays(t, -6); return expenses.filter(e => e.date && e.date >= start && e.date <= t); }
const topCategoryFor = ex => Object.entries(catsFor(ex)).sort((a, b) => b[1] - a[1])[0] || null;
const recurringDay = (r, key = activeMonth) => Math.min(Math.max(1, Number(r.day) || 1), daysInMonth(key));
function nextRecurringSummary() { const d = new Date().getDate(), act = recurrings.filter(r => r.active !== false), up = act.filter(r => recurringDay(r, nowMonth()) >= d).sort((a, b) => a.day - b.day)[0] || act.sort((a, b) => a.day - b.day)[0]; return up ? { title: up.name, sub: `Día ${recurringDay(up, nowMonth())} · ${money(up.amount)}` } : { title: "—", sub: "Sin recurrentes" }; }
function financialHealth() { const limit = globalBudgetLimit(), forecast = forecastMonthTotal(), pending = balancePlan().length; let score = 100; const reasons = []; if (limit) { if (forecast > limit * 1.15) { score -= 35; reasons.push("proyección sobre presupuesto"); } else if (forecast > limit) { score -= 22; reasons.push("proyección ajustada"); } else reasons.push("presupuesto bajo control"); } else { score -= 10; reasons.push("sin presupuesto global"); } if (pending > 3) { score -= 16; reasons.push(`${pending} saldos pendientes`); } else if (pending) { score -= 7; reasons.push(`${pending} saldos por resolver`); } score = Math.max(20, Math.min(100, score)); return { score, label: score >= 85 ? "Dentro del plan" : score >= 68 ? "Atención moderada" : "Necesita atención", reasons }; }
function automationLabel(r) { if (r.type === "budget80") return `${r.category || "Una categoría"} al 80% del presupuesto`; if (r.type === "largeExpense") return `Gasto mayor a ${money(r.threshold || 100)}`; if (r.type === "missingReceipt") return `Pedir comprobante sobre ${money(r.threshold || 100)}`; if (r.type === "recurringSoon") return `Avisar ${Number(r.threshold || 3)} días antes de un recurrente`; return "Regla"; }

/* ───────────────────────── status ───────────────────────── */
function expenseStatus(e) {
  if (e.paymentStatus === "pending" || !e.payerId) return "pending";
  const linked = settlements.filter(s => s.status === "paid" && s.expenseId === e.id).reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const total = Object.values(effectiveExpenseShares(e)).reduce((s, v) => s + Number(v || 0), 0);
  if (linked > 0 && linked + 0.005 < total) return "partial";
  if (linked >= total && total > 0) return "settled";
  return coverageApplies(e) ? "covered" : "paid";
}
// "Cubierto" solo cuando la cobertura de verdad pasa una parte a otra persona (los montos no cambian)
function coverageApplies(e) { return e.useCoverage === true && Object.keys(expenseShares(e)).some(id => coverageRules[id] && coverageRules[id] !== id && members.some(m => m.id === coverageRules[id])); }
const STATUS_META = { paid: ["Pagado", "check"], pending: ["Pendiente", "clock"], partial: ["Parcial", "half"], settled: ["Saldado", "checks"], covered: ["Cubierto", "heart"], overdue: ["Vencida", "alert"] };
const statusLabel = s => STATUS_META[s]?.[0] || s;
const billState = e => isPendingBill(e) && e.dueDate && e.dueDate < today() ? "overdue" : expenseStatus(e);
const statusPill = (e, s = billState(e)) => `<span class="status s-${s}">${ic(STATUS_META[s]?.[1] || "dots")}${statusLabel(s)}</span>`;
function settlementTotalForExpense(e, from = null) { return settlements.filter(s => s.status === "paid" && s.expenseId === e.id && (!from || s.from === from)).reduce((sum, s) => sum + Number(s.amount || 0), 0); }
function expenseSettlementOptions(e) {
  if (!e?.payerId) return [];
  const shares = effectiveExpenseShares(e), to = e.payerId;
  return Object.entries(shares).filter(([id, a]) => id !== to && Number(a) > 0).map(([from, a]) => {
    const already = settlements.filter(s => s.status === "paid" && s.expenseId === e.id && s.from === from && s.to === to).reduce((sum, s) => sum + Number(s.amount || 0), 0);
    return { from, to, amount: Math.max(0, Number(a) - already) };
  }).filter(x => x.amount > .005);
}

/* ───────────────────────── render: everything ───────────────────────── */
function renderAll() {
  if (!householdId || !household) return;
  applyRoleUI();
  const mm = myMember();
  $("#sideName").textContent = mm?.name || me?.displayName || me?.email || "";
  $("#sideRole").textContent = ROLE_LABEL[myRole()];
  $("#sideAvatar").outerHTML = memberAvatar(mm || { name: me?.email }, "").replace('class="avatar', 'id="sideAvatar" class="avatar');
  $("#topAvatar").outerHTML = memberAvatar(mm || { name: me?.email }, "sm").replace('class="avatar', 'id="topAvatar" class="avatar');
  $("#monthEyebrow").textContent = monthLabel(activeMonth).toUpperCase();
  const viewing = activeMonth !== nowMonth();
  $("#monthViewing").classList.toggle("hidden", !viewing); $("#monthViewingLabel").textContent = cap(monthLabel(activeMonth));
  renderHero(); renderTodayActions(); renderCategories(); renderWeekBars(); renderPeople(); renderGoals(); renderRecent(); renderIntelligence();
  renderActivity(); renderBills(); renderBalances(); renderMonthClose(); renderCalendar(); renderSubscriptions();
  renderFamily(); renderAdmin(); renderCoverageSummary(); renderAutomations(); renderNotifications();
  if (currentView === "vault") renderVault();
  const vc = receiptFileCount(); $("#vaultCountHome").textContent = plural(vc, "archivo guardado", "archivos guardados");
  if (currentView === "home") $("#pageTitle").textContent = homeTitle();
  renderLoadErrors(); applyLanguage();
}
function homeTitle() { const first = (myMember()?.name || me?.displayName || "").split(" ")[0]; return `${greeting()}${first ? `, ${first}` : ""}`; }

/* ── Inicio · banda 1: resumen ── */
function renderHero() {
  const homeEx = rangeExpenses(), homeTotal = totalsFor(homeEx), settled = settledBalanceData(), mm = myMember();
  const yourPart = !isOwner() && homeRange === "month" && mm;
  const heroValue = yourPart ? Number(settled.share[mm.id] || 0) : homeTotal;
  $("#heroKicker").textContent = `${yourPart ? "TU PARTE" : "GASTO FAMILIAR"} · ${rangeLabel()}`;
  const failed = !!loadErrors.expenses;
  $("#monthTotal").innerHTML = failed ? "—" : moneyHTML(heroValue);
  const monthTotalValue = totalsFor(monthExpenses()), prevTotal = totalsFor(monthExpenses(prevMonthKey(activeMonth))), top = topCategoryFor(homeEx);
  const trend = prevTotal ? `${monthTotalValue <= prevTotal ? "↓" : "↑"} ${Math.abs((monthTotalValue - prevTotal) / prevTotal * 100).toFixed(0)}% vs. ${monthLabel(prevMonthKey(activeMonth)).split(" ")[0]}` : "Primer mes con datos";
  $("#monthTrend").textContent = failed ? "No se pudieron cargar los gastos" : [trend, plural(homeEx.length, "movimiento", "movimientos"), top ? `${top[0]} lidera` : ""].filter(Boolean).join(" · ");
  const mine = myPlanTotals(); $("#owedToMe").innerHTML = moneyHTML(mine.owed); $("#iOwe").innerHTML = moneyHTML(mine.owe);
  const tb = globalBudgetLimit(), pct = tb ? monthTotalValue / tb * 100 : 0;
  $("#budgetUsed").textContent = tb ? `${Math.round(pct)}% de ${money(tb).replace(".00", "")}` : "Sin límite";
  $("#budgetBar").style.width = `${Math.min(100, pct)}%`; $("#budgetBar").parentElement.classList.toggle("over", pct > 100); $("#budgetBar").parentElement.classList.toggle("near", pct >= 80 && pct <= 100);
  renderHeroChart(homeEx);
}
function renderHeroChart(ex) {
  const el = $("#heroSparkChart"), legend = $("#heroLegend");
  if (homeRange === "today") { el.innerHTML = ""; legend.innerHTML = ""; el.classList.add("empty"); return; }
  el.classList.remove("empty");
  let days, labels, startISO;
  if (homeRange === "week") { startISO = addDays(today(), -6); days = 7; }
  else { startISO = `${activeMonth}-01`; days = daysInMonth(activeMonth); }
  const byDay = new Array(days).fill(0);
  ex.forEach(e => { if (!e.date) return; const [y, m, d] = e.date.split("-").map(Number), [sy, sm, sd] = startISO.split("-").map(Number); const idx = Math.round((new Date(y, m - 1, d) - new Date(sy, sm - 1, sd)) / 864e5); if (idx >= 0 && idx < days) byDay[idx] += Number(e.amount || 0); });
  const shownDays = homeRange === "week" ? 7 : Math.max(1, daysElapsedInActiveMonth() || days);
  const cum = []; byDay.reduce((s, v, i) => { s += v; cum[i] = s; return s; }, 0);
  const limit = homeRange === "month" ? globalBudgetLimit() : weeklyBudgetLimit();
  const max = Math.max(1, ...cum, limit || 0) * 1.08, W = 320, Hh = 88, x = i => days === 1 ? W : (i / (days - 1)) * W, y = v => Hh - (v / max) * (Hh - 6) - 3;
  const pts = cum.slice(0, shownDays).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lastX = x(shownDays - 1), lastY = y(cum[shownDays - 1] || 0);
  const pace = limit ? `<line class="pace" x1="0" y1="${y(0)}" x2="${W}" y2="${y(limit).toFixed(1)}"/>` : "";
  el.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none"><polygon class="area" points="0,${Hh} ${pts} ${lastX.toFixed(1)},${Hh}"/>${pace}<polyline class="line" points="${pts}"/><circle class="dot" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.5"/></svg>`;
  labels = homeRange === "week" ? "Acumulado de 7 días" : "Acumulado del mes";
  legend.innerHTML = `<span><i class="lg-line"></i>${labels}</span>${limit ? `<span><i class="lg-pace"></i>Ritmo del presupuesto (${money(limit).replace(".00", "")})</span>` : ""}`;
}
$$("[data-home-range]").forEach(b => b.addEventListener("click", () => { homeRange = b.dataset.homeRange; $$("[data-home-range]").forEach(x => x.classList.toggle("active", x === b)); renderHero(); renderCategories(); }));
$("#heroBudgetBtn").onclick = () => canManage() ? openBudgets() : toast("Solo el Owner o un administrador cambian el presupuesto.");

/* ── Inicio · banda 2: hoy ── */
function billGroups() {
  const t = today(), in7 = addDays(t, 7), by = (a, b) => String(a.dueDate || a.date).localeCompare(String(b.dueDate || b.date));
  const pending = openPendingBills().slice().sort(by);
  return {
    pending,
    overdue: pending.filter(e => e.dueDate && e.dueDate < t),
    week: pending.filter(e => e.dueDate && e.dueDate >= t && e.dueDate <= in7),
    later: pending.filter(e => e.dueDate && e.dueDate > in7),
    noDue: pending.filter(e => !e.dueDate),
    paid: monthExpenses().filter(e => !isPendingBill(e)).sort((a, b) => String(b.date).localeCompare(String(a.date)))
  };
}
function previousOpenMonths() {
  const keys = new Set(expenses.filter(e => !isPendingBill(e) && e.date).map(e => monthKey(e.date)));
  return [...keys].filter(k => k !== activeMonth && k <= nowMonth()).sort().reverse().slice(0, 12)
    .map(key => { const plan = balancePlan(key); return { key, plan, total: plan.reduce((s, p) => s + p.amount, 0) }; })
    .filter(x => x.plan.length).slice(0, 6);
}
function gotoMonth(key, view = "balances") { activeMonth = key; renderAll(); go(view); }
function buildTodayItems() {
  if (!allDataReady()) return null;
  const items = [], g = billGroups(), mm = myMember(), sum = list => list.reduce((s, e) => s + Number(e.amount || 0), 0);
  if (g.overdue.length) items.push({ tone: "bad", icon: "alert", title: `${plural(g.overdue.length, "cuenta vencida", "cuentas vencidas")}`, sub: `${money(sum(g.overdue))} · ${g.overdue[0].description} venció el ${fmtDate(g.overdue[0].dueDate)}`, run: () => go("bills") });
  if (g.week.length) items.push({ tone: "warn", icon: "clock", title: `${plural(g.week.length, "cuenta vence", "cuentas vencen")} esta semana`, sub: `${money(sum(g.week))} · la próxima: ${g.week[0].description}, ${fmtDate(g.week[0].dueDate)}`, run: () => go("bills") });
  if (g.noDue.length) items.push({ tone: "warn", icon: "bill", title: `${plural(g.noDue.length, "cuenta sin pagar", "cuentas sin pagar")}`, sub: `${money(sum(g.noDue))} por pagar`, run: () => go("bills") });
  const plan = balancePlan(), mine = mm ? plan.filter(p => p.from === mm.id || p.to === mm.id) : [];
  mine.forEach(p => {
    if (p.from === mm.id) items.push({ tone: "bad", icon: "swap", title: `Le debes ${money(p.amount)} a ${member(p.to).name}`, sub: canWrite() ? "Toca para registrar el pago" : "Saldos de este mes", run: () => canWrite() ? openSettlementPayment({ ...p, maxAmount: p.amount }) : go("balances") });
    else items.push({ tone: "good", icon: "swap", title: `${member(p.from).name} te debe ${money(p.amount)}`, sub: "Cuando te pague, regístralo en Saldos", run: () => go("balances") });
  });
  const others = plan.length - mine.length;
  if (others > 0) items.push({ tone: "info", icon: "swap", title: `${plural(others, "pago pendiente", "pagos pendientes")} entre otras personas`, sub: money(plan.filter(p => !mine.includes(p)).reduce((s, p) => s + p.amount, 0)), run: () => go("balances") });
  const prev = previousOpenMonths();
  if (prev.length) items.push({ tone: "warn", icon: "calendar", title: `${cap(monthLabel(prev[0].key))} quedó con saldos sin pagar`, sub: `${money(prev[0].total)} · ${plural(prev[0].plan.length, "transferencia", "transferencias")}`, run: () => gotoMonth(prev[0].key) });
  const d = new Date().getDate(), soon = recurrings.filter(r => r.active !== false && r.autoCreate !== true).map(r => ({ r, day: recurringDay(r, nowMonth()) })).filter(x => x.day >= d && x.day <= d + 3).sort((a, b) => a.day - b.day);
  soon.forEach(({ r, day }) => items.push({ tone: "info", icon: "repeat", title: `${r.name} ${day === d ? "es hoy" : day === d + 1 ? "es mañana" : `es el día ${day}`}`, sub: money(r.amount), run: () => go("month") }));
  const left = daysInMonth(nowMonth()) - d;
  if (canManage() && activeMonth === nowMonth() && !isMonthClosed(nowMonth()) && left <= 2) items.push({ tone: "info", icon: "lock", title: left ? `Faltan ${plural(left, "día", "días")} para cerrar ${monthLabel(nowMonth()).split(" ")[0]}` : `Hoy termina ${monthLabel(nowMonth()).split(" ")[0]}`, sub: "Revisa y cierra el mes", run: () => go("month") });
  return items;
}
let todayItems = [];
function renderTodayActions() {
  const box = $("#todayActionList"), items = buildTodayItems();
  if (!items) { box.innerHTML = `<div class="skel-row"></div><div class="skel-row"></div>`; $("#todayCount").classList.add("hidden"); return; }
  todayItems = items;
  $("#todayCount").textContent = items.length; $("#todayCount").classList.toggle("hidden", !items.length);
  box.innerHTML = items.length ? items.map((i, n) => `<button type="button" class="today-item tone-${i.tone}" data-today-index="${n}"><span class="today-ic">${ic(i.icon)}</span><span class="today-copy"><b>${esc(i.title)}</b><small>${esc(i.sub)}</small></span>${ic("chev-right", "chev")}</button>`).join("")
    : `<div class="all-good">${ic("check")}<div><b>Todo al día</b><small>No hay cuentas vencidas ni saldos pendientes.</small></div></div>`;
  $$("#todayActionList [data-today-index]").forEach(b => b.onclick = () => todayItems[Number(b.dataset.todayIndex)]?.run());
}

/* ── Inicio · banda 3: explorar ── */
function renderCategories() {
  const source = rangeExpenses(), total = totalsFor(source), entries = Object.entries(catsFor(source)).sort((a, b) => b[1] - a[1]);
  $("#categoryList").innerHTML = entries.length ? entries.slice(0, 6).map(([k, v]) => {
    const lim = homeRange === "month" ? Number(budgets[`${activeMonth}_${k}`]?.limit || 0) : 0, p = lim ? v / lim * 100 : total ? v / total * 100 : 0;
    return `<button type="button" class="cat-row" data-space="${esc(k)}">${catIcon(k)}<span class="cat-main"><b>${esc(k)}</b><small>${lim ? `${Math.round(p)}% de ${money(lim).replace(".00", "")}` : `${Math.round(p)}% del total`}</small><i class="bar ${lim && p > 100 ? "over" : lim && p >= 80 ? "near" : ""}"><i style="width:${Math.min(100, p)}%"></i></i></span><b class="money">${moneyHTML(v)}</b></button>`;
  }).join("") : `<div class="empty">${ic("sparkle")}<b>Aún no hay gastos</b><small>Registra el primero con el botón +.</small></div>`;
  $$("#categoryList [data-space]").forEach(b => b.onclick = () => openSpaceDetail(b.dataset.space));
}
const WEEKDAY_INITIALS = ["D", "L", "M", "M", "J", "V", "S"];
function lastDays(n) { const t = today(); return Array.from({ length: n }, (_, i) => addDays(t, i - n + 1)); }
function renderWeekBars() {
  const days = lastDays(7), vals = days.map(d => totalsFor(expenses.filter(e => e.date === d))), max = Math.max(1, ...vals), avg = vals.reduce((a, b) => a + b, 0) / 7;
  $("#weeklyBars").innerHTML = days.map((d, i) => { const v = vals[i], [y, m, dd] = d.split("-").map(Number), wd = new Date(y, m - 1, dd).getDay(); return `<div class="week-col ${i === 6 ? "is-today" : ""}" title="${esc(fmtDate(d))}: ${money(v)}"><div class="week-track"><i class="${v > avg * 1.45 && v > 0 ? "high" : ""}" style="height:${Math.max(v ? 10 : 3, v / max * 100)}%"></i></div><b>${WEEKDAY_INITIALS[wd]}</b><small>${v ? money(v).replace(".00", "") : ""}</small></div>`; }).join("");
  $("#weekTotal").innerHTML = moneyHTML(vals.reduce((a, b) => a + b, 0));
}
function balanceChip(v) { return v > .005 ? `<span class="bal good">Recibe ${money(v)}</span>` : v < -.005 ? `<span class="bal bad">Debe ${money(-v)}</span>` : `<span class="bal">Al día</span>`; }
function renderPeople() {
  const { balances } = settledBalanceData();
  $("#peopleStrip").innerHTML = members.map(m => `<button type="button" class="person-chip" data-person="${esc(m.id)}" style="--p:${esc(personColor(m))}">${memberAvatar(m, "lg")}<b>${esc(m.name.split(" ")[0])}</b>${balanceChip(balances[m.id] || 0)}</button>`).join("") || `<div class="empty"><b>Sin personas</b></div>`;
  $$("#peopleStrip [data-person]").forEach(b => b.onclick = () => openMemberDetail(b.dataset.person));
}
function renderRecent() {
  $("#recentList").innerHTML = expenses.length ? expenses.slice(0, 5).map(feedHTML).join("") : `<div class="empty">${ic("list")}<b>Todavía no hay gastos</b><small>Toca + para registrar el primero.</small></div>`;
  bindFeed("#recentList");
}
function renderIntelligence() {
  const spent = totalsFor(monthExpenses()), forecast = forecastMonthTotal(), limit = globalBudgetLimit(), safe = safeToSpendAmount(), elapsed = daysElapsedInActiveMonth();
  $("#forecastAmount").innerHTML = moneyHTML(forecast);
  $("#forecastCopy").textContent = limit ? `${forecast <= limit ? "Cerrarían dentro de" : "Pasaría"} ${money(limit)} · según ${plural(elapsed || 1, "día", "días")}` : `Según ${plural(elapsed || 1, "día", "días")} de actividad`;
  $("#forecastTrack").style.width = `${limit ? Math.min(100, forecast / limit * 100) : Math.min(100, (elapsed / daysInMonth()) * 100)}%`;
  $("#safeToSpend").innerHTML = safe == null ? "—" : moneyHTML(safe);
  $("#safeSpendCopy").textContent = safe == null ? "Define un presupuesto del mes para activarlo." : `Quedan ${money(Math.max(0, limit - spent))} para el resto del mes.`;
  const h = financialHealth(); $("#healthScore").textContent = h.score; $("#healthLabel").textContent = h.label; $("#healthCopy").textContent = h.reasons.join(" · "); $("#healthRing").style.setProperty("--health", `${h.score * 3.6}deg`);
  const week = currentWeekExpenses(), wt = totalsFor(week), top = topCategoryFor(week), largest = [...week].sort((a, b) => Number(b.amount) - Number(a.amount))[0], wl = weeklyBudgetLimit(), nr = nextRecurringSummary();
  $("#weeklyRecapGrid").innerHTML = `<div><small>Gasto semanal</small><b>${money(wt)}</b><em>${wl ? `${Math.round(wt / wl * 100)}% de ${money(wl)}` : "Últimos 7 días"}</em></div><div><small>Categoría principal</small><b>${top ? esc(top[0]) : "—"}</b><em>${top ? money(top[1]) : "Sin movimientos"}</em></div><div><small>Mayor gasto</small><b>${largest ? money(largest.amount) : "—"}</b><em>${largest ? esc(largest.description) : "Sin movimientos"}</em></div><div><small>Próximo recurrente</small><b>${esc(nr.title)}</b><em>${esc(nr.sub)}</em></div>`;
}
$("#openVaultFromHome").onclick = () => go("vault");

/* ───────────────────────── feed ───────────────────────── */
function feedHTML(e) {
  const pending = isPendingBill(e), payer = member(e.payerId), att = expenseAttachments(e).length;
  const who = pending ? `<span class="who muted">Nadie la ha pagado</span>` : `<span class="who" style="--p:${esc(personColor(payer))}"><i class="pdot"></i>${esc(payer.name)} pagó</span>`;
  return `<div class="feed-item" data-id="${esc(e.id)}" role="button" tabindex="0">${catIcon(e.category)}<div class="feed-copy"><b class="feed-title">${esc(e.description)}</b><small>${who} · ${esc(fmtDate(e.date))}${(e.participantIds || []).length > 1 ? ` · ${(e.participantIds || []).length} personas` : ""}${att ? ` · ${ic("camera", "tiny")}${att}` : ""}</small></div><div class="feed-amount"><b class="money">${moneyHTML(e.amount)}</b>${statusPill(e)}</div></div>`;
}
function bindFeed(sel) {
  $$(`${sel} .feed-item[data-id]`).forEach(el => {
    const e = expenses.find(x => x.id === el.dataset.id); if (!e) return;
    el.onclick = () => openExpenseDetail(e);
    el.onkeydown = ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openExpenseDetail(e); } };
    bindExpenseGesture(el, e); bindLongPress(el, () => openTransactionActions(e));
  });
}

/* ───────────────────────── Gastos ───────────────────────── */
function filterExpenses({ q = "", cat = "", status = "all", person = "", month = "" } = {}) {
  q = q.trim().toLowerCase();
  return expenses.filter(e => (!q || `${e.description} ${e.notes || ""} ${e.category || ""}`.toLowerCase().includes(q)) && (!cat || e.category === cat) && (!month || monthKey(e.date) === month)
    && (!person || e.payerId === person || (e.participantIds || []).includes(person))
    && (status === "all" || (status === "receipt" ? expenseAttachments(e).length > 0 : expenseStatus(e) === status)));
}
const activityFilters = () => ({ q: $("#activitySearch").value, cat: $("#activityCategory").value, status: activityKind, person: $("#activityPerson").value, month: $("#activityMonth").value });
function renderActivity() {
  const pSel = $("#activityPerson"), pCur = pSel.value; pSel.innerHTML = `<option value="">Todas las personas</option>` + members.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join(""); pSel.value = pCur;
  const mSel = $("#activityMonth"), mCur = mSel.value, months = [...new Set(expenses.map(e => monthKey(e.date)).filter(Boolean))].sort().reverse();
  mSel.innerHTML = `<option value="">Todos los meses</option>` + months.map(k => `<option value="${k}">${esc(cap(monthLabel(k)))}</option>`).join(""); mSel.value = months.includes(mCur) ? mCur : "";
  const filtered = filterExpenses(activityFilters()), visible = filtered.slice(0, activityPageSize);
  $("#activitySummary").textContent = `${plural(filtered.length, "movimiento", "movimientos")} · ${money(totalsFor(filtered))}`;
  $("#activityList").innerHTML = visible.length ? visible.map(feedHTML).join("") : `<div class="empty">${ic("search")}<b>No hay movimientos</b><small>Prueba con otros filtros.</small></div>`;
  const more = $("#activityLoadMore"); more.classList.toggle("hidden", visible.length >= filtered.length); more.textContent = `Ver más movimientos (${filtered.length - visible.length})`;
  bindFeed("#activityList");
}
$("#activitySearch").addEventListener("input", () => { activityPageSize = 25; renderActivity(); });
["#activityCategory", "#activityPerson", "#activityMonth"].forEach(s => $(s).addEventListener("change", () => { activityPageSize = 25; renderActivity(); }));
$("#activityLoadMore").addEventListener("click", () => { activityPageSize += 25; renderActivity(); });
$$("#activityChips [data-activity-kind]").forEach(b => b.addEventListener("click", () => { activityKind = b.dataset.activityKind; activityPageSize = 25; $$("#activityChips button").forEach(x => x.classList.toggle("active", x === b)); renderActivity(); }));
$("#activityVault").onclick = () => go("vault");
$("#activityAdd").onclick = () => openExpense();
$("#activityExport").onclick = () => { const list = filterExpenses(activityFilters()); downloadFile(`mi-casa-gastos-${today()}.csv`, "text/csv;charset=utf-8", expensesCSV(list)); };

/* ───────────────────────── export ───────────────────────── */
const csvCell = v => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function expensesCSV(list) {
  const head = ["Fecha", "Descripción", "Categoría", "Monto", "Estado", "Pagó", "Participantes", "Vence", "Comprobantes", "Nota"];
  const rows = list.map(e => [e.date || "", e.description || "", e.category || "Otros", Number(e.amount || 0).toFixed(2), statusLabel(expenseStatus(e)), isPendingBill(e) ? "Pendiente" : member(e.payerId).name, (e.participantIds || []).map(id => member(id).name).join(" / "), e.dueDate || "", expenseAttachments(e).length, e.notes || ""]);
  return "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
}
async function downloadFile(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  try {
    const file = typeof File === "function" ? new File([blob], name, { type: mime }) : null;
    if (file && matchMedia("(pointer:coarse)").matches && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (err) { if (err?.name === "AbortError") return; }
  if (!URL.createObjectURL) { toast("Tu navegador no permite descargar el archivo."); return; }
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`Descargando ${name}`);
}
async function exportBackup() {
  if (!canManage()) { toast("Solo el Owner o un administrador pueden descargar el respaldo."); return; }
  toast("Preparando respaldo…");
  let attachments = [];
  try { const s = await getDocs(collection(db, "households", householdId, "attachments")); attachments = docsOf(s); } catch (err) { console.warn("backup attachments", err); }
  const data = { app: "Mi Casa", version: APP_VERSION, exportedAt: new Date().toISOString(), household, members, expenses, settlements, budgets, recurring: recurrings, monthlyClosings: closings, goals, goalContributions: goalContribs, automationRules, coverage: coverageRules, categories: customCats, attachments };
  downloadFile(`mi-casa-respaldo-${today()}.json`, "application/json", JSON.stringify(data, null, 1));
}
$("#adminBackupBtn").onclick = exportBackup;
$("#adminCsvAllBtn").onclick = () => downloadFile(`mi-casa-todos-los-gastos-${today()}.csv`, "text/csv;charset=utf-8", expensesCSV(expenses));
$("#monthCsvBtn").onclick = () => downloadFile(`mi-casa-${activeMonth}.csv`, "text/csv;charset=utf-8", expensesCSV(monthExpenses().slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))));

/* ───────────────────────── detalle de gasto ───────────────────────── */
function openExpenseDetail(e) {
  if (!e) return;
  const effective = effectiveExpenseShares(e), attachments = expenseAttachments(e), participants = (e.participantIds || []).map(id => member(id).name).join(", ") || "—";
  const lock = lockReasonFor(e.date), editable = canEditExpense(e) && !lock, pending = isPendingBill(e);
  $("#expenseDetailEditBtn").dataset.id = e.id; $("#expenseDetailEditBtn").classList.toggle("hidden", !editable);
  const acts = [];
  if (pending && editable) acts.push(`<button class="primary" type="button" data-detail-action="markpaid">${ic("check")}Marcar pagada</button>`);
  if (!pending && canWrite() && !lock && expenseSettlementOptions(e).length) acts.push(`<button class="secondary" type="button" data-detail-action="payment">${ic("swap")}Registrar pago</button>`);
  if (attachments.length) acts.push(`<button class="secondary" type="button" data-detail-action="receipt">${ic("camera")}Ver ${plural(attachments.length, "comprobante", "comprobantes")}</button>`);
  if (canWrite()) acts.push(`<button class="secondary" type="button" data-detail-action="duplicate">${ic("copy")}Duplicar</button>`);
  $("#expenseDetailContent").innerHTML = `<div class="detail-hero">${catIcon(e.category)}<div>${statusPill(e)}<h3>${esc(e.description)}</h3><p>${esc(e.category || "Otros")} · ${esc(fmtDate(e.date))}${e.dueDate ? ` · vence ${esc(fmtDate(e.dueDate))}` : ""}</p></div><strong class="money">${moneyHTML(e.amount)}</strong></div>
  ${lock ? `<p class="info-note warn">${ic("lock")}<span>${esc(lock)}</span></p>` : ""}
  <div class="detail-grid"><div><span>Pagó</span><b>${pending ? "Nadie todavía" : esc(member(e.payerId).name)}</b></div><div><span>Para</span><b>${esc(participants)}</b></div><div><span>Cobertura</span><b>${esc(coverageTextForExpense(e) || "Individual")}</b></div><div><span>Pagos aplicados</span><b>${money(settlementTotalForExpense(e))}</b></div></div>
  <h4 class="detail-sub">Quién responde</h4><div class="detail-rows">${Object.entries(effective).map(([id, v]) => `<div class="detail-row" style="--p:${esc(personColor(member(id)))}">${memberAvatar(member(id), "sm")}<span>${esc(member(id).name)}</span><b class="money">${money(v)}</b></div>`).join("") || "<p class='muted'>Sin división.</p>"}</div>
  ${e.notes ? `<h4 class="detail-sub">Nota</h4><p class="detail-note">${esc(e.notes)}</p>` : ""}
  <div class="detail-actions">${acts.join("")}</div>`;
  $$("#expenseDetailContent [data-detail-action]").forEach(b => b.onclick = () => {
    const a = b.dataset.detailAction;
    if (a === "markpaid") { closeSheets(); openExpense(e, { status: "paid" }); }
    if (a === "payment") { const opts = expenseSettlementOptions(e); if (opts.length) openSettlementPayment({ ...opts[0], maxAmount: opts[0].amount, expenseId: e.id, description: e.description }); }
    if (a === "receipt") openAttachmentViewer(attachments, 0);
    if (a === "duplicate") { closeSheets(); duplicateExpense(e); }
  });
  openSheet("#expenseDetailSheet", "full");
}
$("#expenseDetailEditBtn").addEventListener("click", () => { const e = expenses.find(x => x.id === $("#expenseDetailEditBtn").dataset.id); if (e) { closeSheets(); openExpense(e); } });

/* ───────────────────────── Cuentas ───────────────────────── */
function billCard(e) {
  const state = billState(e), d = e.dueDate || (isPendingBill(e) ? "" : e.date), [, m, dd] = (d || "--").split("-");
  const mon = d ? new Intl.DateTimeFormat(locale(), { month: "short" }).format(new Date(Number(d.slice(0, 4)), Number(m) - 1, 1)).replace(".", "").toUpperCase() : "";
  const chip = d ? `<span class="date-chip"><b>${Number(dd)}</b><small>${esc(mon)}</small></span>` : `<span class="date-chip none">${catIcon(e.category)}</span>`;
  let extra = "";
  if (state === "partial") { const owed = Object.entries(effectiveExpenseShares(e)).filter(([id]) => id !== e.payerId).reduce((s, [, v]) => s + Number(v || 0), 0), got = settlementTotalForExpense(e); extra = `<i class="bar"><i style="width:${Math.min(100, owed ? got / owed * 100 : 0)}%"></i></i>`; }
  const when = isPendingBill(e) ? (e.dueDate ? (state === "overdue" ? `Venció el ${fmtDate(e.dueDate)}` : `Vence el ${fmtDate(e.dueDate)}`) : `Registrada el ${fmtDate(e.date)}`) : `${member(e.payerId).name} pagó · ${fmtDate(e.date)}`;
  return `<button type="button" class="tl-item s-${state}" data-bill="${esc(e.id)}">${chip}<span class="tl-main"><b>${esc(e.description)}</b><small>${statusPill(e, state)} ${esc(when)}</small>${extra}</span><strong class="money">${moneyHTML(e.amount)}</strong></button>`;
}
function renderBills() {
  const g = billGroups(), total = totalsFor(g.pending), next = nextRecurringSummary();
  $("#billsPendingTotal").innerHTML = moneyHTML(total); $("#billsPendingCount").textContent = String(g.pending.length); $("#billsOverdueCount").textContent = String(g.overdue.length);
  $("#billsNextRecurring").textContent = next.title === "—" ? "—" : `${next.title} · ${next.sub}`;
  const fill = (id, list, empty) => { $(id).innerHTML = list.length ? list.map(billCard).join("") : `<p class="tl-empty">${empty}</p>`; $(id).closest(".tl-group").classList.toggle("is-empty", !list.length); };
  fill("#billsOverdue", g.overdue, "Ninguna vencida."); fill("#billsWeek", g.week, "Nada vence en los próximos 7 días."); fill("#billsLater", g.later, "Sin cuentas más adelante.");
  fill("#billsNoDue", g.noDue, "Sin cuentas sin fecha."); fill("#billsPaid", g.paid.slice(0, 12), "Aún no hay cuentas pagadas este mes.");
  $$("#billsPage [data-bill]").forEach(b => b.onclick = () => openExpenseDetail(expenses.find(e => e.id === b.dataset.bill)));
  const n = g.overdue.length; $("#sideBillsCount").textContent = n; $("#sideBillsCount").classList.toggle("hidden", !n); $("#dockBillsDot").classList.toggle("hidden", !n);
}
$("#newPendingBillBtn").onclick = () => openExpense(null, { status: "pending" });

/* ───────────────────────── Saldos ───────────────────────── */
function flowWhy(p) {
  if (!p.items) return `<small class="flow-why">Deudas cruzadas para hacer menos transferencias.</small>`;
  const top = p.items.slice(0, 2).map(x => `${esc(x.description)} (${money(x.amount)})`).join(", "), more = p.items.length - 2, gross = p.items.reduce((s, x) => s + x.amount, 0);
  return `<small class="flow-why">${p.items.length ? `Por ${top}${more > 0 ? ` y ${plural(more, "gasto más", "gastos más")}` : ""}` : "Saldo a favor de pagos anteriores"}${p.items.length && Math.abs(gross - p.amount) > .005 ? `, ya descontado lo que se deben entre ellos y los pagos` : ""}.</small>`;
}
function flowCard(p, i, withButton) {
  const from = member(p.from), to = member(p.to);
  return `<div class="flow" style="--from:${esc(personColor(from))};--to:${esc(personColor(to))}"><div class="flow-person">${memberAvatar(from, "lg")}<b>${esc(from.name)}</b><small>paga</small></div><div class="flow-mid"><span class="flow-line"></span><strong class="money">${moneyHTML(p.amount)}</strong>${withButton ? `<button class="secondary small" type="button" data-settle-index="${i}">${ic("check")}Registrar pago</button>` : ""}</div><div class="flow-person">${memberAvatar(to, "lg")}<b>${esc(to.name)}</b><small>recibe</small></div>${flowWhy(p)}</div>`;
}
function renderBalances() {
  const plan = balancePlan(), mine = myPlanTotals(), closed = isMonthClosed(activeMonth);
  $("#balancesReceivable").innerHTML = moneyHTML(mine.owed); $("#balancesPayable").innerHTML = moneyHTML(mine.owe);
  $$("[data-balance-mode]").forEach(b => { const on = b.dataset.balanceMode === balanceMode; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  $("#balanceModeText").textContent = balanceMode === "direct" ? "Cada quien le paga a quien puso el dinero por él." : "Las deudas se cruzan entre todos para hacer la menor cantidad de transferencias. Cada quien termina igual, pero puede pagarle a otra persona.";
  const paidS = settlements.filter(s => s.month === activeMonth && s.status === "paid");
  $("#balancesPaidMonth").innerHTML = moneyHTML(paidS.reduce((s, x) => s + Number(x.amount || 0), 0));
  $("#settlementList").innerHTML = plan.length ? plan.map((p, i) => flowCard(p, i, canWrite() && !closed)).join("") : `<div class="all-good">${ic("checks")}<div><b>Todo saldado en ${esc(monthLabel(activeMonth).split(" ")[0])}</b><small>No hay transferencias pendientes.</small></div></div>`;
  $$("#settlementList [data-settle-index]").forEach(b => b.onclick = () => { const p = plan[Number(b.dataset.settleIndex)]; if (p) openSettlementPayment({ ...p, maxAmount: p.amount }); });
  $$("#settlementList .flow").forEach((el, i) => canWrite() && !closed && bindSwipeGesture(el, null, () => { const p = plan[i]; if (p) openSettlementPayment({ ...p, maxAmount: p.amount }); }));
  const prev = previousOpenMonths(), box = $("#previousBalances");
  box.classList.toggle("hidden", !prev.length);
  box.innerHTML = prev.length ? `<div class="card-head"><h3>Otros meses sin saldar</h3></div>${prev.map(x => `<button type="button" class="link-row" data-goto-month="${x.key}">${ic("calendar")}<span><b>${esc(cap(monthLabel(x.key)))}</b><small>${plural(x.plan.length, "transferencia", "transferencias")} · ${x.plan.map(p => `${esc(member(p.from).name)} → ${esc(member(p.to).name)}`).slice(0, 2).join(", ")}</small></span><strong class="money">${money(x.total)}</strong>${ic("chev-right")}</button>`).join("")}` : "";
  $$("#previousBalances [data-goto-month]").forEach(b => b.onclick = () => gotoMonth(b.dataset.gotoMonth));
  const hist = paidS.slice().sort((a, b) => (b.paidAt?.seconds || 0) - (a.paidAt?.seconds || 0));
  $("#settlementHistory").innerHTML = hist.length ? hist.map(s => { const canDel = !closed && (canManage() || s.createdBy === me?.uid); return `<div class="feed-item static"><span class="cat-ic cat-good">${ic("check")}</span><div class="feed-copy"><b>${esc(member(s.from).name)} → ${esc(member(s.to).name)}</b><small>${esc(s.method || "Pago")}${s.expenseDescription ? ` · ${esc(s.expenseDescription)}` : ""}${s.note ? ` · ${esc(s.note)}` : ""}</small></div><div class="feed-amount"><b class="money">${moneyHTML(s.amount)}</b><small>${s.expenseId ? "Aplicado a una cuenta" : "Pago"}</small></div>${canDel ? `<button class="icon-btn sm danger-ghost" type="button" data-delete-settlement="${esc(s.id)}" aria-label="Borrar pago">${ic("trash")}</button>` : ""}</div>`; }).join("") : `<div class="empty">${ic("swap")}<b>Sin pagos registrados</b><small>Aparecen aquí cuando alguien registra un pago.</small></div>`;
  $$("#settlementHistory [data-delete-settlement]").forEach(b => b.onclick = async () => {
    const s = settlements.find(x => x.id === b.dataset.deleteSettlement); if (!s || !confirm(`¿Borrar el pago de ${money(s.amount)} de ${member(s.from).name} a ${member(s.to).name}? Los saldos se recalculan.`)) return;
    try { await deleteDoc(doc(db, "households", householdId, "settlements", s.id)); toast("Pago borrado"); } catch (err) { console.warn(err); toast("No se pudo borrar el pago."); }
  });
}
$$("[data-balance-mode]").forEach(b => b.addEventListener("click", () => { balanceMode = b.dataset.balanceMode === "simplified" ? "simplified" : "direct"; safeSet("miCasaBalanceMode", balanceMode); renderAll(); }));
$("#balancesRecordPayment").onclick = () => { const p = balancePlan()[0]; openSettlementPayment(p ? { ...p, maxAmount: p.amount } : {}); };
function memberOptions(selected = "") { return members.map(m => `<option value="${esc(m.id)}" ${m.id === selected ? "selected" : ""}>${esc(m.name)}</option>`).join(""); }
function openSettlementPayment(opts = {}) {
  if (!canWrite()) { toast("Tu acceso es de solo lectura."); return; }
  if (isMonthClosed(activeMonth)) { toast(lockReasonFor(`${activeMonth}-01`)); return; }
  const from = opts.from || myMember()?.id || members[0]?.id || "", to = opts.to || members.find(m => m.id !== from)?.id || "";
  $("#settlementPaymentTitle").textContent = opts.expenseId ? "Saldar esta cuenta" : "Registrar pago";
  $("#settlementExpenseId").value = opts.expenseId || "";
  if (opts.expenseId) { const e = expenses.find(x => x.id === opts.expenseId), available = expenseSettlementOptions(e); $("#settlementFrom").innerHTML = available.map(x => `<option value="${esc(x.from)}">${esc(member(x.from).name)} · ${money(x.amount)}</option>`).join(""); $("#settlementTo").innerHTML = memberOptions(to); }
  else { $("#settlementFrom").innerHTML = memberOptions(from); $("#settlementTo").innerHTML = memberOptions(to); }
  $("#settlementFrom").value = from; $("#settlementTo").value = to;
  $("#settlementAmount").value = opts.amount ? Number(opts.amount).toFixed(2) : "";
  $("#settlementAmount").dataset.max = String(Number(opts.maxAmount || 0));
  $("#settlementAmountHelp").textContent = opts.maxAmount ? `Pendiente: ${money(opts.maxAmount)}. Puedes registrar solo una parte.` : "Puedes registrar el total o solo una parte.";
  $("#settlementMethod").value = "Transferencia"; $("#settlementNote").value = "";
  $("#settlementPaymentContext").innerHTML = opts.expenseId ? `<b>${esc(opts.description || "Cuenta")}</b><small>El pago se aplica a esta cuenta y también reduce el saldo del mes.</small>` : `<b>${esc(cap(monthLabel(activeMonth)))}</b><small>Se descuenta del saldo de este mes.</small>`;
  openSheet("#settlementPaymentSheet", "medium");
}
async function saveSettlementPayment() {
  if (!canWrite()) return;
  if (isMonthClosed(activeMonth)) { toast(lockReasonFor(`${activeMonth}-01`)); return; }
  const from = $("#settlementFrom").value, to = $("#settlementTo").value, amount = Number(String($("#settlementAmount").value).replace(/[$,]/g, "") || 0), max = Number($("#settlementAmount").dataset.max || 0), expenseId = $("#settlementExpenseId").value || null;
  if (!from || !to || from === to) { toast("Elige dos personas diferentes."); return; }
  if (!(amount > 0)) { toast("Escribe un monto válido."); return; }
  if (max > 0 && amount > max + .005) { toast(`El máximo pendiente es ${money(max)}.`); return; }
  try {
    const data = { from, to, amount, month: activeMonth, status: "paid", method: $("#settlementMethod").value || "Transferencia", note: $("#settlementNote").value.trim(), createdBy: me.uid, paidAt: serverTimestamp() };
    if (expenseId) { data.expenseId = expenseId; data.expenseDescription = expenses.find(x => x.id === expenseId)?.description || ""; }
    await addDoc(collection(db, "households", householdId, "settlements"), data);
    closeSheets(); toast(expenseId ? "Cuenta actualizada" : "Pago registrado");
  } catch (err) { console.warn(err); toast(isPermissionError(err) ? "No tienes permiso para registrar este pago." : "No se pudo registrar el pago."); }
}
$("#settlementPaymentForm").addEventListener("submit", e => { e.preventDefault(); saveSettlementPayment(); });
$("#settlementFrom").addEventListener("change", () => { const expenseId = $("#settlementExpenseId").value; if (!expenseId) return; const e = expenses.find(x => x.id === expenseId), opt = expenseSettlementOptions(e).find(x => x.from === $("#settlementFrom").value); if (opt) { $("#settlementTo").value = opt.to; $("#settlementAmount").value = opt.amount.toFixed(2); $("#settlementAmount").dataset.max = String(opt.amount); $("#settlementAmountHelp").textContent = `Pendiente: ${money(opt.amount)}`; } });

/* ───────────────────────── formulario de gasto ───────────────────────── */
function participantButtons(selected) { return members.map(m => `<button type="button" class="participant ${selected.includes(m.id) ? "selected" : ""}" data-id="${esc(m.id)}" aria-pressed="${selected.includes(m.id)}" style="--p:${esc(personColor(m))}">${memberAvatar(m, "sm")}${esc(m.name)}</button>`).join(""); }
function bindParticipantPicker(sel, onChange) { $$(`${sel} .participant`).forEach(b => b.onclick = () => { b.classList.toggle("selected"); b.setAttribute("aria-pressed", String(b.classList.contains("selected"))); onChange?.(); }); }
function fillExpenseControls(selected) {
  $("#expensePayer").innerHTML = members.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");
  $("#participantPicker").innerHTML = participantButtons(selected);
  bindParticipantPicker("#participantPicker", () => { renderCustomSplitRows(); updatePerPerson(); renderExpenseCoveragePreview(); });
}
const selectedIds = (sel = "#participantPicker") => $$(`${sel} .participant.selected`).map(x => x.dataset.id);
function renderCustomSplitRows(existing = {}) {
  if (currentSplit === "equal") { $("#customSplitRows").classList.add("hidden"); return; }
  $("#customSplitRows").classList.remove("hidden");
  $("#customSplitRows").innerHTML = selectedIds().map(id => `<label class="split-person">${memberAvatar(member(id), "sm")}<span>${esc(member(id).name)}</span><input class="split-input" data-id="${esc(id)}" inputmode="decimal" placeholder="${currentSplit === "percent" ? "%" : "$"}" value="${existing[id] ?? ""}" aria-label="${currentSplit === "percent" ? "Porcentaje" : "Monto"} de ${esc(member(id).name)}"></label>`).join("");
  $$(".split-input").forEach(i => i.addEventListener("input", updatePerPerson));
}
function updatePerPerson() {
  const n = selectedIds().length, a = parseFloat($("#expenseAmount").value) || 0;
  if (currentSplit === "equal") $("#perPerson").textContent = n ? `${money(a / n)} c/u` : "Elige personas";
  else { const vals = $$(".split-input").reduce((s, i) => s + (parseFloat(i.value) || 0), 0); $("#perPerson").textContent = currentSplit === "percent" ? `${vals.toFixed(1)}% de 100%` : `${money(vals)} de ${money(a)}`; }
}
let currentPaymentStatus = "paid";
function setPaymentStatus(status) {
  currentPaymentStatus = status === "pending" ? "pending" : "paid";
  $$(".payment-status").forEach(b => { const on = b.dataset.paymentStatus === currentPaymentStatus; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  $("#expensePayerWrap").classList.toggle("hidden", currentPaymentStatus === "pending");
  $("#pendingBillHelp").classList.toggle("hidden", currentPaymentStatus !== "pending");
  $("#expenseDueWrap").classList.toggle("hidden", currentPaymentStatus !== "pending");
  if (!$("#expenseId").value) $("#expenseSheetTitle").textContent = currentPaymentStatus === "pending" ? "Nueva cuenta por pagar" : "Nuevo gasto";
}
function renderExpenseCoveragePreview() { const el = $("#coverageExpensePreview"); if (!$("#expenseUseCoverage").checked) { el.classList.add("hidden"); return; } const moves = selectedIds().map(id => coverageRules[id] && coverageRules[id] !== id ? `${member(coverageRules[id]).name} cubre a ${member(id).name}` : "").filter(Boolean); if (!moves.length) { el.classList.add("hidden"); return; } el.classList.remove("hidden"); el.innerHTML = `<b>Responsabilidad final:</b> ${[...new Set(moves)].map(esc).join(" · ")}`; }
$$(".payment-status").forEach(b => b.addEventListener("click", () => setPaymentStatus(b.dataset.paymentStatus)));
$("#expenseUseCoverage").addEventListener("change", renderExpenseCoveragePreview);
$("#expenseAmount").addEventListener("input", updatePerPerson);
$$(".split-tab").forEach(b => b.onclick = () => { currentSplit = b.dataset.split; $$(".split-tab").forEach(x => x.classList.toggle("active", x === b)); $("#splitHelp").textContent = currentSplit === "equal" ? "Se divide por igual." : currentSplit === "amount" ? "Escribe el monto de cada persona." : "Escribe el porcentaje de cada persona."; renderCustomSplitRows(); updatePerPerson(); });

function openExpense(e = null, opts = {}) {
  if (!canWrite()) { toast("Tu acceso es de solo lectura."); return; }
  if (e && !canEditExpense(e)) { toast("Solo puedes cambiar los gastos que tú registraste o pagaste."); return; }
  if (!members.length) { toast("Primero agrega a las personas de la casa."); return; }
  closeSheets();
  $("#expenseForm").reset();
  attachmentCache = e ? expenseAttachments(e).map(a => ({ ...a })) : [];
  $("#expenseId").value = e?.id || ""; $("#expenseSheetTitle").textContent = e ? "Editar gasto" : "Nuevo gasto";
  $("#expenseDate").value = e?.date || opts.date || today(); $("#expenseAmount").value = e?.amount ?? ""; $("#expenseDescription").value = e?.description || "";
  fillCategorySelects(); $("#expenseCategory").value = e?.category && allCategories().includes(e.category) ? e.category : (e?.category ? (() => { const o = document.createElement("option"); o.value = o.textContent = e.category; $("#expenseCategory").appendChild(o); return e.category; })() : "Casa");
  fillExpenseControls(e ? (e.participantIds || []) : members.map(m => m.id));
  $("#expensePayer").value = e?.payerId || e?.suggestedPayerId || myMember()?.id || members[0]?.id;
  $("#expenseDueDate").value = e?.dueDate || ""; $("#expenseNotes").value = e?.notes || "";
  setPaymentStatus(opts.status || e?.paymentStatus || (e && !e.payerId ? "pending" : "paid"));
  if (e && opts.status === "paid" && isPendingBill(e)) $("#expenseSheetTitle").textContent = "Marcar como pagada";
  $("#expenseUseCoverage").checked = e ? e.useCoverage === true : true;
  currentSplit = e?.splitMode || "equal"; $$(".split-tab").forEach(x => x.classList.toggle("active", x.dataset.split === currentSplit));
  renderCustomSplitRows(e?.splitValues || {}); updatePerPerson(); renderExpenseCoveragePreview(); renderAttachmentPreview();
  const lock = e ? lockReasonFor(e.date) : "";
  $("#expenseLockNote").classList.toggle("hidden", !lock); $("#expenseLockNote span").textContent = lock;
  $("#deleteExpense").classList.toggle("hidden", !e || !!lock); $("#saveExpenseBtn").disabled = !!lock;
  openSheet("#expenseSheet");
  setTimeout(() => { if (!e) $("#expenseAmount").focus(); }, 120);
}
$("#expenseForm").onsubmit = async ev => {
  ev.preventDefault();
  if (!canWrite()) { toast("Tu acceso es de solo lectura."); return; }
  const id = $("#expenseId").value, existing = id ? expenses.find(x => x.id === id) : null;
  if (existing && !canEditExpense(existing)) { toast("Solo puedes cambiar los gastos que tú registraste o pagaste."); return; }
  const date = $("#expenseDate").value, lock = lockReasonFor(date) || (existing ? lockReasonFor(existing.date) : "");
  if (lock) { toast(lock); return; }
  const amount = parseFloat(String($("#expenseAmount").value).replace(/[$,]/g, "")), ids = selectedIds(), description = $("#expenseDescription").value.trim();
  if (!(amount > 0)) { toast("Escribe un monto válido."); $("#expenseAmount").focus(); return; }
  if (!description) { toast("Escribe en qué se gastó."); $("#expenseDescription").focus(); return; }
  if (!date) { toast("Elige la fecha."); return; }
  if (!ids.length) { toast("Elige al menos una persona."); return; }
  let shares = {}, splitValues = {};
  if (currentSplit === "equal") ids.forEach(pid => shares[pid] = amount / ids.length);
  else {
    const vals = {}; $$(".split-input").forEach(i => vals[i.dataset.id] = parseFloat(i.value) || 0); splitValues = vals;
    const sum = Object.values(vals).reduce((a, b) => a + b, 0);
    if (currentSplit === "amount") { if (Math.abs(sum - amount) > .01) { toast(`La división debe sumar ${money(amount)}.`); return; } shares = vals; }
    else { if (Math.abs(sum - 100) > .05) { toast("Los porcentajes deben sumar 100%."); return; } ids.forEach(pid => shares[pid] = amount * (vals[pid] || 0) / 100); }
  }
  const btn = $("#saveExpenseBtn"); busy(btn, true, "Guardando…");
  try {
    const ref = id ? doc(db, "households", householdId, "expenses", id) : doc(collection(db, "households", householdId, "expenses"));
    const attachments = await persistAttachments(ref.id, attachmentCache);
    const data = { amount, description, date, month: date.slice(0, 7), category: $("#expenseCategory").value, paymentStatus: currentPaymentStatus, payerId: currentPaymentStatus === "pending" ? null : $("#expensePayer").value, dueDate: $("#expenseDueDate").value || null, useCoverage: $("#expenseUseCoverage").checked, participantIds: ids, splitMode: currentSplit, splitValues, shares, notes: $("#expenseNotes").value.trim(), attachments, receiptData: null, receiptName: null, receiptType: null, updatedAt: serverTimestamp() };
    if (id) await setDoc(ref, data, { merge: true }); else await setDoc(ref, { ...data, createdBy: me.uid, createdAt: serverTimestamp() });
    if (existing) { const keep = new Set(attachments.map(a => a.id).filter(Boolean)); for (const a of expenseAttachments(existing)) if (a.id && !keep.has(a.id)) deleteAttachmentDoc(a.id); }
    closeSheets(); toast(id ? "Gasto actualizado" : currentPaymentStatus === "pending" ? "Cuenta guardada" : "Gasto guardado");
  } catch (err) {
    console.warn(err);
    toast(err?.code === "mi-casa/too-big" ? "Los comprobantes pesan demasiado para guardarlos juntos. Quita alguno o publica las reglas nuevas (ver DEPLOY.md)." : isPermissionError(err) ? "No tienes permiso para guardar este gasto." : "No se pudo guardar el gasto.");
  } finally { busy(btn, false); }
};
$("#deleteExpense").onclick = async () => {
  const id = $("#expenseId").value, e = expenses.find(x => x.id === id); if (!e) return;
  if (!canEditExpense(e)) { toast("No puedes borrar este gasto."); return; }
  const lock = lockReasonFor(e.date); if (lock) { toast(lock); return; }
  if (!confirm(`¿Eliminar «${e.description}»? No se puede deshacer.`)) return;
  try { await deleteDoc(doc(db, "households", householdId, "expenses", id)); expenseAttachments(e).forEach(a => a.id && deleteAttachmentDoc(a.id)); closeSheets(); toast("Gasto eliminado"); }
  catch (err) { console.warn(err); toast("No tienes permiso para eliminarlo."); }
};
function duplicateExpense(e) { if (!canWrite()) { toast("Tu acceso es de solo lectura."); return; } openExpense({ ...e, id: "", createdBy: me?.uid, date: today(), attachments: [], receiptData: null }); $("#expenseId").value = ""; $("#expenseSheetTitle").textContent = "Duplicar gasto"; $("#deleteExpense").classList.add("hidden"); $("#expenseLockNote").classList.add("hidden"); $("#saveExpenseBtn").disabled = false; showLivePill("Copia lista para guardar", "＋"); }

/* ───────────────────────── comprobantes ───────────────────────── */
const attachmentMeta = a => ({ id: a.id, name: a.name || "Comprobante", type: a.type || "", size: a.size || 0, compressed: !!a.compressed, ...(a.originalName ? { originalName: a.originalName } : {}) });
async function persistAttachments(expenseId, list) {
  const out = [];
  for (const a of list) {
    if (a.id) { out.push(attachmentMeta(a)); continue; }
    if (!a.data) continue;
    const ref = doc(collection(db, "households", householdId, "attachments"));
    try {
      await setDoc(ref, { expenseId, name: a.name || "Comprobante", type: a.type || "", size: a.size || 0, data: a.data, createdBy: me.uid, createdAt: serverTimestamp() });
      attachmentDataCache.set(ref.id, a.data); out.push(attachmentMeta({ ...a, id: ref.id }));
    } catch (err) {
      if (!isPermissionError(err)) throw err;
      out.push({ ...a }); // reglas viejas: se guarda en línea como en V9
    }
  }
  const inline = out.filter(a => a.data).reduce((s, a) => s + String(a.data).length, 0);
  if (inline > 850000) throw Object.assign(new Error("too-big"), { code: "mi-casa/too-big" });
  return out;
}
async function loadAttachmentData(a) {
  if (!a) return null; if (a.data) return a.data; if (!a.id) return null;
  if (attachmentDataCache.has(a.id)) return attachmentDataCache.get(a.id);
  try { const s = await getDoc(doc(db, "households", householdId, "attachments", a.id)); const data = s.exists() ? s.data().data || null : null; if (data) attachmentDataCache.set(a.id, data); return data; }
  catch (err) { console.warn("attachment", err); return null; }
}
function deleteAttachmentDoc(id) { attachmentDataCache.delete(id); deleteDoc(doc(db, "households", householdId, "attachments", id)).catch(err => console.warn("attachment delete", err)); }
function attachmentKind(a) { const t = String(a?.type || "").toLowerCase(), n = String(a?.name || "").toLowerCase(); if (t.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(n)) return "image"; if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf"; return "file"; }
function hydrateThumbs(root) {
  $$(`${root} img[data-att-id]`).forEach(async img => { const item = { id: img.dataset.attId }; const data = await loadAttachmentData(item); if (data) { img.src = data; img.closest(".thumb")?.classList.add("loaded"); } });
}
function thumbHTML(a) {
  const kind = attachmentKind(a);
  if (kind === "image") return a.data ? `<span class="thumb loaded"><img src="${esc(a.data)}" alt=""></span>` : `<span class="thumb"><img data-att-id="${esc(a.id)}" alt="">${ic("camera")}</span>`;
  return `<span class="thumb file">${kind === "pdf" ? "PDF" : ic("file")}</span>`;
}
let viewerItems = [], viewerIndex = 0;
function openAttachmentViewer(items, index = 0) {
  viewerItems = (items || []).filter(a => a?.data || a?.id);
  if (!viewerItems.length) { toast("Vista previa no disponible."); return; }
  viewerIndex = Math.max(0, Math.min(index, viewerItems.length - 1));
  $("#attachmentViewer").classList.remove("hidden"); $("#attachmentViewer").setAttribute("aria-hidden", "false"); renderAttachmentViewer();
}
async function renderAttachmentViewer() {
  const a = viewerItems[viewerIndex]; if (!a) return; const idx = viewerIndex, kind = attachmentKind(a), stage = $("#attachmentViewerStage");
  $("#attachmentViewerCount").textContent = `${viewerIndex + 1} de ${viewerItems.length}`; $("#attachmentViewerName").textContent = a.name || "Comprobante";
  $("#attachmentViewerPrev").disabled = viewerIndex === 0; $("#attachmentViewerNext").disabled = viewerIndex === viewerItems.length - 1;
  stage.innerHTML = `<div class="viewer-loading">${ic("refresh")}Cargando…</div>`; $("#attachmentViewerOpen").removeAttribute("href");
  const data = await loadAttachmentData(a); if (idx !== viewerIndex) return;
  if (!data) { stage.innerHTML = `<div class="viewer-empty">${ic("alert")}<b>No se pudo cargar</b><p>Revisa tu conexión.</p></div>`; return; }
  $("#attachmentViewerOpen").href = data; $("#attachmentViewerOpen").download = a.name || "comprobante";
  stage.innerHTML = kind === "image" ? `<img src="${esc(data)}" alt="${esc(a.name || "Comprobante")}">` : kind === "pdf" ? `<iframe src="${esc(data)}" title="${esc(a.name || "PDF")}"></iframe>` : `<div class="viewer-empty">${ic("file")}<b>${esc(a.name || "Archivo")}</b><p>Este archivo no tiene vista previa.</p></div>`;
}
function closeAttachmentViewer() { $("#attachmentViewer").classList.add("hidden"); $("#attachmentViewer").setAttribute("aria-hidden", "true"); $("#attachmentViewerStage").innerHTML = ""; }
$("#attachmentViewerClose").addEventListener("click", closeAttachmentViewer); $("[data-close-preview]").addEventListener("click", closeAttachmentViewer);
$("#attachmentViewerPrev").addEventListener("click", () => { if (viewerIndex > 0) { viewerIndex--; renderAttachmentViewer(); } });
$("#attachmentViewerNext").addEventListener("click", () => { if (viewerIndex < viewerItems.length - 1) { viewerIndex++; renderAttachmentViewer(); } });
function renderAttachmentPreview() {
  const box = $("#receiptPreview");
  box.innerHTML = attachmentCache.map((a, i) => `<div class="attachment-item" data-preview-index="${i}">${thumbHTML(a)}<span class="att-meta"><b>${esc(a.name || "Archivo")}</b><small>${attachmentKind(a) === "pdf" ? "PDF" : "Imagen"}${a.size ? ` · ${Math.ceil(Number(a.size) / 1024)} KB` : ""}${a.compressed ? " · optimizada" : ""}</small></span><button type="button" class="icon-btn sm remove-attachment" data-index="${i}" aria-label="Quitar ${esc(a.name || "comprobante")}">${ic("x")}</button></div>`).join("");
  hydrateThumbs("#receiptPreview");
  $$("#receiptPreview .attachment-item").forEach(el => el.onclick = ev => { if (ev.target.closest(".remove-attachment")) return; openAttachmentViewer(attachmentCache, Number(el.dataset.previewIndex)); });
  $$("#receiptPreview .remove-attachment").forEach(b => b.onclick = ev => { ev.stopPropagation(); attachmentCache.splice(Number(b.dataset.index), 1); renderAttachmentPreview(); });
}
const RECEIPT_IMAGE_MAX_BYTES = 200 * 1024, RECEIPT_PDF_MAX_BYTES = 350 * 1024;
function blobToDataURL(blob) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); }); }
function imageFileToElement(file) { return new Promise((resolve, reject) => { const url = URL.createObjectURL(file), img = new Image(); img.onload = () => { URL.revokeObjectURL(url); resolve(img); }; img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image-decode")); }; img.src = url; }); }
function canvasToBlob(canvas, type, quality) { return new Promise(resolve => canvas.toBlob(resolve, type, quality)); }
async function compressReceiptImage(file, maxBytes = RECEIPT_IMAGE_MAX_BYTES) {
  const img = await imageFileToElement(file);
  let maxSide = Math.min(2000, Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height)), quality = .84, best = null;
  const draw = side => { const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height, scale = Math.min(1, side / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale)), c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d", { alpha: false }); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h); return c; };
  for (let pass = 0; pass < 12; pass++) { const blob = await canvasToBlob(draw(maxSide), "image/jpeg", quality); if (!blob) throw new Error("image-compress"); best = blob; if (blob.size <= maxBytes) break; if (quality > .48) quality -= .09; else { maxSide = Math.max(900, Math.round(maxSide * .82)); quality = .68; } }
  if (best && best.size > maxBytes) { let side = Math.min(1000, maxSide); for (let i = 0; i < 6 && best.size > maxBytes; i++) { side = Math.max(650, Math.round(side * .82)); best = await canvasToBlob(draw(side), "image/jpeg", .55); if (!best) throw new Error("image-compress"); } }
  if (!best || best.size > maxBytes) throw new Error("image-too-large");
  return { data: await blobToDataURL(best), size: best.size, type: "image/jpeg" };
}
$("#expenseReceipt").addEventListener("change", async e => {
  const files = [...(e.target.files || [])]; if (!files.length) return; let compressed = 0;
  for (const f of files) {
    const isImage = (f.type || "").startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name || "");
    try {
      if (isImage) { toast(`Optimizando ${f.name}…`); const o = await compressReceiptImage(f); attachmentCache.push({ name: (f.name || "comprobante").replace(/\.[^.]+$/, "") + ".jpg", originalName: f.name, type: o.type, size: o.size, originalSize: f.size, compressed: true, data: o.data }); compressed++; continue; }
      if (f.size > RECEIPT_PDF_MAX_BYTES) { toast(`${f.name} pesa más de 350 KB y no se agregó.`); continue; }
      attachmentCache.push({ name: f.name, type: f.type || "archivo", size: f.size, data: await blobToDataURL(f) });
    } catch (err) { console.warn("Receipt optimization failed", err); toast(`No se pudo preparar ${f.name}.`); }
  }
  e.target.value = ""; renderAttachmentPreview();
  if (compressed) toast(`${plural(compressed, "foto optimizada", "fotos optimizadas")} a 200 KB o menos`);
});

/* ───────────────────────── hojas ───────────────────────── */
let activeSheet = null, lastFocus = null;
function openSheet(id, detent = null) {
  const sheet = $(id); if (!sheet) return;
  if (!activeSheet) lastFocus = document.activeElement;
  $$(".sheet").forEach(x => { if (x !== sheet) { x.classList.add("hidden"); x.classList.remove("sheet-visible", "sheet-full", "sheet-compact", "is-dragging"); x.style.transform = ""; } });
  $("#overlay").classList.remove("hidden");
  sheet.classList.remove("hidden", "sheet-full", "sheet-compact"); sheet.classList.add("sheet-visible");
  const d = detent || sheet.dataset.detent || "medium"; sheet.dataset.currentDetent = d; sheet.classList.toggle("sheet-full", d === "full"); sheet.classList.toggle("sheet-compact", d === "compact"); sheet.style.transform = "";
  activeSheet = sheet; document.body.classList.add("has-sheet");
  setTimeout(() => { if (activeSheet === sheet && !sheet.contains(document.activeElement)) sheet.querySelector("h2")?.setAttribute("tabindex", "-1"), sheet.querySelector("h2")?.focus({ preventScroll: true }); }, 60);
}
function closeSheets() {
  $("#overlay").classList.add("hidden");
  $$(".sheet").forEach(x => { x.classList.add("hidden"); x.classList.remove("sheet-visible", "sheet-full", "sheet-compact", "is-dragging"); x.style.transform = ""; });
  const had = !!activeSheet; activeSheet = null; document.body.classList.remove("has-sheet");
  if (had && lastFocus && document.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch { /* element gone */ } }
}
$("#overlay").onclick = closeSheets;
$$("[data-close-sheet]").forEach(b => b.addEventListener("click", closeSheets));
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") {
    if (!$("#attachmentViewer").classList.contains("hidden")) { if (e.key === "ArrowLeft" && viewerIndex > 0) { viewerIndex--; renderAttachmentViewer(); } if (e.key === "ArrowRight" && viewerIndex < viewerItems.length - 1) { viewerIndex++; renderAttachmentViewer(); } }
    return;
  }
  if (!$("#attachmentViewer").classList.contains("hidden")) { closeAttachmentViewer(); return; }
  if (!$("#reportLanguageModal").classList.contains("hidden")) { $("#reportLanguageModal").classList.add("hidden"); return; }
  if (activeSheet) closeSheets();
});
(function initSheetDrag() {
  $$(".sheet .sheet-handle").forEach(handle => {
    let startY = 0, dy = 0, dragging = false;
    handle.addEventListener("pointerdown", e => { const s = handle.closest(".sheet"); if (!s || s.classList.contains("hidden")) return; startY = e.clientY; dy = 0; dragging = true; s.classList.add("is-dragging"); handle.setPointerCapture?.(e.pointerId); });
    handle.addEventListener("pointermove", e => { if (!dragging) return; const s = handle.closest(".sheet"); dy = e.clientY - startY; if (dy > 0) s.style.transform = `translateY(${Math.min(dy, 260)}px)`; else if (dy < -45) { s.classList.add("sheet-full"); s.classList.remove("sheet-compact"); s.dataset.currentDetent = "full"; } });
    handle.addEventListener("pointerup", () => { if (!dragging) return; const s = handle.closest(".sheet"); dragging = false; s.classList.remove("is-dragging"); if (dy > 110) closeSheets(); else s.style.transform = ""; });
  });
})();

/* ───────────────────────── crear (un solo menú) ───────────────────────── */
function openQuickActions() { if (!canWrite()) { toast("Tu acceso es de solo lectura."); return; } openSheet("#quickActionsSheet", "compact"); }
["#newExpenseBtn", "#mobileAdd"].forEach(id => $(id).onclick = openQuickActions);
$("#qaExpense").onclick = () => openExpense(null, { status: "paid" });
$("#qaPendingBill").onclick = () => openExpense(null, { status: "pending" });
$("#qaSettle").onclick = () => { const p = balancePlan()[0]; closeSheets(); openSettlementPayment(p ? { ...p, maxAmount: p.amount } : {}); };
$("#qaReceipt").onclick = () => { openExpense(null, { status: "paid" }); setTimeout(() => $("#expenseReceipt").click(), 260); };
$("#qaRecurring").onclick = () => openRecurringEditor();
$("#qaCloseMonth").onclick = () => { closeSheets(); activeMonth = nowMonth(); renderAll(); go("month"); openMonthCloseSummary(); };

/* ───────────────────────── gestos ───────────────────────── */
function bindSwipeGesture(el, onLeft, onRight) { if (!el || el.dataset.swipeReady) return; el.dataset.swipeReady = "1"; let sx = 0, sy = 0, dx = 0, active = false; el.addEventListener("pointerdown", e => { if (e.pointerType === "mouse") return; sx = e.clientX; sy = e.clientY; dx = 0; active = true; el.style.transition = "none"; }); el.addEventListener("pointermove", e => { if (!active) return; const x = e.clientX - sx, y = e.clientY - sy; if (Math.abs(x) > Math.abs(y) && Math.abs(x) > 8) { dx = Math.max(-92, Math.min(92, x)); el.style.transform = `translateX(${dx * .48}px)`; el.classList.add("is-swiping"); } }); el.addEventListener("pointerup", () => { if (!active) return; active = false; el.style.transition = "transform .22s cubic-bezier(.2,.8,.2,1)"; el.style.transform = ""; el.classList.remove("is-swiping"); if (Math.abs(dx) > 68) { el.dataset.swiped = "1"; if (dx < 0 && onLeft) onLeft(); if (dx > 0 && onRight) onRight(); setTimeout(() => el.dataset.swiped = "", 260); } }); el.addEventListener("click", e => { if (el.dataset.swiped === "1") { e.preventDefault(); e.stopImmediatePropagation(); } }, true); }
function bindExpenseGesture(el, e) { bindSwipeGesture(el, () => { if (canEditExpense(e) && !lockReasonFor(e.date)) { openExpense(e); showLivePill("Editar gasto", "✎"); } }, () => { if (canWrite()) duplicateExpense(e); }); }
function bindLongPress(el, callback) { if (!el || el.dataset.longReady) return; el.dataset.longReady = "1"; let timer = null, sx = 0, sy = 0; const clear = () => { clearTimeout(timer); timer = null; }; el.addEventListener("pointerdown", e => { sx = e.clientX; sy = e.clientY; clear(); timer = setTimeout(() => { timer = null; el.dataset.longPressed = "1"; callback?.(); navigator.vibrate?.(12); }, 480); }); el.addEventListener("pointermove", e => { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) clear(); }); el.addEventListener("pointerup", clear); el.addEventListener("pointercancel", clear); el.addEventListener("click", e => { if (el.dataset.longPressed === "1") { el.dataset.longPressed = ""; e.preventDefault(); e.stopImmediatePropagation(); } }, true); }
function openTransactionActions(e) {
  if (!e) return; const editable = canEditExpense(e) && !lockReasonFor(e.date), acts = [];
  if (editable) acts.push(["edit", "edit", "Editar", "Cambiar los datos", "accent"]);
  if (canWrite()) acts.push(["duplicate", "copy", "Duplicar", "Crear uno parecido hoy", "good"]);
  if (editable) acts.push(["coverage", "heart", `${e.useCoverage === true ? "Quitar" : "Aplicar"} cobertura familiar`, "Recalcula quién responde", "lilac"]);
  if (canWrite() && !lockReasonFor(e.date) && expenseSettlementOptions(e).length) acts.push(["settle-expense", "swap", "Registrar pago de esta cuenta", "Total o parcial", "good"]);
  if (expenseAttachments(e).length) acts.push(["receipt", "camera", "Ver comprobante", plural(expenseAttachments(e).length, "archivo", "archivos"), "info"]);
  acts.push(["detail", "list", "Ver detalle", "Quién responde y pagos", "ink"]);
  $("#transactionActionsTitle").textContent = e.description;
  $("#transactionActionsContent").innerHTML = acts.map(([a, icn, t, s, tone]) => `<button type="button" class="action" data-action="${a}"><span class="action-ic tone-${tone}">${ic(icn)}</span><span><b>${esc(t)}</b><small>${esc(s)}</small></span></button>`).join("");
  $$("#transactionActionsContent [data-action]").forEach(b => b.onclick = async () => {
    const a = b.dataset.action;
    if (a === "coverage") { try { const next = e.useCoverage !== true; await updateDoc(doc(db, "households", householdId, "expenses", e.id), { useCoverage: next, updatedAt: serverTimestamp() }); closeSheets(); toast(next ? "Cobertura aplicada" : "Cobertura quitada"); } catch (err) { console.warn(err); toast("No se pudo actualizar la cobertura."); } return; }
    if (a === "settle-expense") { const opts = expenseSettlementOptions(e); if (opts.length) openSettlementPayment({ ...opts[0], maxAmount: opts[0].amount, expenseId: e.id, description: e.description }); return; }
    closeSheets();
    if (a === "edit") openExpense(e); if (a === "duplicate") duplicateExpense(e); if (a === "receipt") openAttachmentViewer(expenseAttachments(e), 0); if (a === "detail") openExpenseDetail(e);
  });
  openSheet("#transactionActionsSheet", "compact");
}
(function initPullToRefresh() { let start = 0, dy = 0, tracking = false; const indicator = $("#pullRefresh"); window.addEventListener("touchstart", e => { if (window.scrollY <= 0 && !activeSheet) { start = e.touches[0].clientY; tracking = true; dy = 0; } }, { passive: true }); window.addEventListener("touchmove", e => { if (!tracking) return; dy = e.touches[0].clientY - start; if (dy > 0 && dy < 120) { indicator.classList.add("show"); indicator.style.transform = `translate(-50%, ${Math.min(54, dy * .45)}px)`; } }, { passive: true }); window.addEventListener("touchend", () => { if (!tracking) return; tracking = false; if (dy > 78 && allDataReady()) { renderAll(); showLivePill("Mi Casa actualizada", "↻"); } indicator.classList.remove("show"); indicator.style.transform = ""; }, { passive: true }); })();

/* ───────────────────────── Mi Casa · personas ───────────────────────── */
function lastSeenText(m) { const s = m.lastSeenAt?.seconds; if (!s) return ""; const mins = Math.round((Date.now() - s * 1000) / 60000); if (mins < 2) return "activo ahora"; if (mins < 60) return `visto hace ${mins} min`; const h = Math.round(mins / 60); if (h < 24) return `visto hace ${h} h`; return `visto hace ${plural(Math.round(h / 24), "día", "días")}`; }
function accessText(m) { if (m.accessPaused) return "Acceso en pausa"; if (m.authUid) return ["Con acceso", lastSeenText(m)].filter(Boolean).join(" · "); if (m.email) return "Invitación pendiente"; return "Sin acceso a la app"; }
function renderFamily() {
  const { paid, share, balances } = settledBalanceData(), plan = balancePlan();
  $("#familyHubTitle").textContent = household?.name || "Mi Casa";
  $("#familyHubTotal").innerHTML = moneyHTML(totalsFor(monthExpenses()));
  $("#familyHubStatus").textContent = plan.length ? `${plural(members.length, "persona", "personas")} · ${plural(plan.length, "pago por resolver", "pagos por resolver")}` : `${plural(members.length, "persona", "personas")} · todo al día`;
  $("#familyHubAvatars").innerHTML = members.map(m => memberAvatar(m, "")).join("");
  $("#membersList").innerHTML = members.map(m => `<button type="button" class="member-row" data-person="${esc(m.id)}" style="--p:${esc(personColor(m))}">${memberAvatar(m, "lg")}<span class="member-main"><b>${esc(m.name)}${m.authUid === me?.uid ? " <em>(tú)</em>" : ""}</b><small>${esc(m.email || "Sin email")} · ${esc(accessText(m))}</small></span><span class="member-side"><span class="role-pill r-${roleOf(m)}">${ROLE_LABEL[roleOf(m)]}</span>${balanceChip(balances[m.id] || 0)}</span></button>`).join("");
  $$("#membersList [data-person]").forEach(b => b.onclick = () => openMemberDetail(b.dataset.person));
  $("#monthPeople").innerHTML = members.map(m => `<div class="people-row" style="--p:${esc(personColor(m))}">${memberAvatar(m, "sm")}<b>${esc(m.name)}</b><span><small>Pagó</small>${money(paid[m.id] || 0)}</span><span><small>Su parte</small>${money(share[m.id] || 0)}</span><span class="${(balances[m.id] || 0) >= 0 ? "pos" : "neg"}"><small>${(balances[m.id] || 0) >= 0 ? "Recibe" : "Debe"}</small>${money(Math.abs(balances[m.id] || 0))}</span></div>`).join("");
  const mode = safeGet("miCasaTheme") || "auto"; $("#themeToggleText").textContent = `Tema: ${{ auto: "automático", light: "claro", dark: "oscuro" }[mode]}`;
  $("#languageToggleText").textContent = uiLang === "es" ? "English" : "Español";
}
function renderAdmin() {
  if (!canManage()) { $("#adminUsers").innerHTML = ""; $("#accessReadiness").innerHTML = ""; return; }
  const mmId = myMember()?.id;
  $("#adminUsers").innerHTML = members.map(m => {
    const r = roleOf(m), editable = canEditMemberAdmin(m), self = m.id === mmId, acts = [];
    if (editable) acts.push(`<button class="secondary mini edit-admin-member" type="button" data-member="${esc(m.id)}">${ic("edit")}Editar</button>`);
    if (editable && m.email && !m.authUid) acts.push(`<button class="secondary mini" type="button" data-invite-member="${esc(m.id)}">${ic("link")}Enlace</button>`);
    if (editable && m.email && m.authUid) acts.push(`<button class="secondary mini" type="button" data-reset-member="${esc(m.id)}">${ic("key")}Contraseña</button>`);
    if (editable && m.authUid && !self && r !== "owner") acts.push(`<button class="secondary mini" type="button" data-pause-member="${esc(m.id)}">${ic(m.accessPaused ? "resume" : "pause")}${m.accessPaused ? "Reactivar" : "Pausar"}</button>`);
    if (editable && !self && r !== "owner") acts.push(`<button class="danger-ghost mini" type="button" data-remove-member="${esc(m.id)}">${ic("trash")}Quitar</button>`);
    return `<div class="member-row admin-user ${m.accessPaused ? "paused" : ""}" data-member-row="${esc(m.id)}" style="--p:${esc(personColor(m))}">${memberAvatar(m, "lg")}<span class="member-main"><b>${esc(m.name)}${self ? " <em>(tú)</em>" : ""}</b><small>${esc(m.email || "Sin email")}</small><small class="access ${m.accessPaused ? "bad" : m.authUid ? "good" : "warn"}">${esc(accessText(m))}</small></span><span class="role-pill r-${r}">${ROLE_LABEL[r]}</span><div class="admin-actions">${acts.join("")}</div></div>`;
  }).join("");
  $$("#adminUsers .edit-admin-member").forEach(b => b.onclick = () => openMemberAdminEditor(b.dataset.member));
  $$("#adminUsers [data-invite-member]").forEach(b => b.onclick = () => openInviteSheet(member(b.dataset.inviteMember)));
  $$("#adminUsers [data-reset-member]").forEach(b => b.onclick = () => sendReset(member(b.dataset.resetMember).email));
  $$("#adminUsers [data-pause-member]").forEach(b => b.onclick = () => togglePause(b.dataset.pauseMember));
  $$("#adminUsers [data-remove-member]").forEach(b => b.onclick = () => removeMember(b.dataset.removeMember));
  // lista para las reglas V10 = su cuenta ya está enlazada por users.memberId (activó con invitación: joinedAt),
  // su ficha usa el mismo UID, o ya abrió la V10 (que completa el enlace)
  const linked = members.filter(m => m.authUid), ready = linked.filter(m => m.authUid === household?.ownerId || m.id === m.authUid || !!m.joinedAt || Number(String(m.appVersion || "0").split(".")[0]) >= 10), missing = linked.filter(m => !ready.includes(m));
  $("#accessReadiness").innerHTML = `<div class="card-head"><h3>${ic("shield")}Reglas de seguridad</h3><span class="count-pill ${missing.length ? "warn" : "good"}">${ready.length} de ${linked.length}</span></div>
    <p class="muted small">Los permisos de cada rol ya se aplican en la app. Para que Firebase también los haga cumplir (y quien quites de la casa pierda el acceso de verdad), publica las reglas nuevas: archivo <b>firestore.rules</b>, pasos en <b>DEPLOY.md</b>.</p>
    ${missing.length ? `<p class="readiness warn">${ic("clock")}<span>${ready.length} de ${linked.length} personas listas. Falta que abran la versión nueva: <b>${missing.map(m => esc(m.name)).join(", ")}</b>. Si no la abren, después de publicar las reglas esa persona verá «Acceso pendiente» hasta que entre una vez.</span></p>` : `<p class="readiness good">${ic("check")}<span>${ready.length} de ${linked.length} personas listas. Ya puedes publicar las reglas.</span></p>`}`;
}
async function sendReset(email) { if (!email) { toast("Esa persona no tiene email."); return; } try { await sendPasswordResetEmail(auth, email); toast(`Enviamos un enlace a ${email} para cambiar su contraseña.`); } catch (err) { console.warn(err); toast("No se pudo enviar. ¿Esa persona ya activó su acceso?"); } }
async function togglePause(id) {
  const m = member(id); if (!canEditMemberAdmin(m) || roleOf(m) === "owner" || m.id === myMember()?.id) return;
  const pause = !m.accessPaused; if (pause && !confirm(`¿Pausar el acceso de ${m.name}? Sus gastos se conservan y puedes reactivarlo cuando quieras.`)) return;
  try { await updateDoc(doc(db, "households", householdId, "members", id), { accessPaused: pause, accessChangedBy: me.uid, accessChangedAt: serverTimestamp() }); toast(pause ? `Acceso de ${m.name} en pausa` : `${m.name} puede entrar otra vez`); } catch (err) { console.warn(err); toast("No se pudo cambiar el acceso."); }
}
async function removeMember(id) {
  const m = member(id); if (!canEditMemberAdmin(m) || roleOf(m) === "owner" || m.id === myMember()?.id) return;
  if (!confirm(`¿Quitar a ${m.name} de Mi Casa? Sus gastos anteriores no se borran.`)) return;
  try { if (m.email && !m.authUid) { try { await deleteDoc(doc(db, "invites", emailKey(m.email))); } catch { /* already gone */ } } await deleteDoc(doc(db, "households", householdId, "members", id)); toast(`${m.name} ya no está en Mi Casa`); } catch (err) { console.warn(err); toast("No se pudo quitar."); }
}
function renderCoverageSummary() { const covered = members.filter(m => coverageRules[m.id] && coverageRules[m.id] !== m.id); $("#coverageSummary").innerHTML = covered.length ? covered.map(m => { const c = member(coverageRules[m.id]); return `<div class="coverage-chip">${memberAvatar(c, "sm")}<span><b>${esc(c.name)}</b> cubre a <b>${esc(m.name)}</b></span>${memberAvatar(m, "sm")}</div>`; }).join("") : `<div class="empty small"><b>Sin cobertura</b><small>Cada persona responde por su parte.</small></div>`; }
function openCoverageManager() { if (!canManage()) { toast("Solo el Owner o un administrador cambian la cobertura."); return; } const opts = members.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join(""); $("#coverageRows").innerHTML = members.map(m => `<label class="coverage-row">${memberAvatar(m, "sm")}<span><b>${esc(m.name)}</b><small>Quién responde por sus gastos</small></span><select data-covered="${esc(m.id)}" aria-label="Quién cubre a ${esc(m.name)}"><option value="">Se cubre sola/o</option>${opts}</select></label>`).join(""); $$("#coverageRows select").forEach(s => { const v = coverageRules[s.dataset.covered] || ""; s.value = v === s.dataset.covered ? "" : v; }); openSheet("#coverageSheet"); }
async function saveCoverage() { if (!canManage()) return; const rules = {}; $$("#coverageRows select").forEach(s => { if (s.value && s.value !== s.dataset.covered) rules[s.dataset.covered] = s.value; }); try { await setDoc(doc(db, "households", householdId, "settings", "coverage"), { rules, updatedAt: serverTimestamp(), updatedBy: me.uid }, { merge: true }); closeSheets(); toast("Cobertura guardada"); } catch (err) { console.warn(err); toast("No se pudo guardar la cobertura."); } }
$("#editCoverageBtn").onclick = openCoverageManager; $("#saveCoverageBottom").onclick = saveCoverage;
$("#applyCoverageExisting").onclick = async () => {
  if (!canManage()) return;
  const candidates = expenses.filter(e => e.useCoverage !== true), open = candidates.filter(e => !lockReasonFor(e.date)), skipped = candidates.length - open.length;
  if (!confirm(`¿Aplicar la cobertura a ${plural(open.length, "gasto", "gastos")}?${skipped ? ` ${plural(skipped, "gasto queda", "gastos quedan")} igual porque su mes está cerrado.` : ""} No cambia quién pagó.`)) return;
  try { for (const e of open) await updateDoc(doc(db, "households", householdId, "expenses", e.id), { useCoverage: true, updatedAt: serverTimestamp() }); closeSheets(); toast(`Cobertura aplicada a ${plural(open.length, "gasto", "gastos")}`); } catch (err) { console.warn(err); toast("No se pudo aplicar la cobertura."); }
};
function openMemberDetail(id) {
  const m = member(id), { paid, share, balances } = settledBalanceData(), allMine = monthExpenses().filter(e => e.payerId === id || (e.participantIds || []).includes(id)), self = m.authUid && m.authUid === me?.uid, canEdit = isOwner() || canManage() && canEditMemberAdmin(m) || self;
  const personalCats = {}; allMine.forEach(e => { const part = Number(expenseShares(e)[id] || 0); personalCats[e.category] = (personalCats[e.category] || 0) + part; });
  const top = Object.entries(personalCats).sort((a, b) => b[1] - a[1])[0], bal = balances[id] || 0;
  $("#memberDetailTitle").textContent = self ? "Tu perfil" : "Perfil";
  $("#memberDetailContent").innerHTML = `<div class="profile-hero" style="--p:${esc(personColor(m))}">${memberAvatar(m, "xl")}<div><h3>${esc(m.name)}</h3><p>${esc(m.email || "Sin email")}</p><span class="role-pill r-${roleOf(m)}">${ROLE_LABEL[roleOf(m)]}</span></div></div>
   <div class="profile-actions">${canEdit ? `<button class="secondary small" type="button" data-pd="edit">${ic("sparkle")}Personalizar</button>` : ""}<button class="secondary small" type="button" data-pd="report">${ic("file")}Reporte PDF</button></div>
   <div class="stat-row compact"><div class="stat"><span>Pagó</span><b class="money">${money(paid[id] || 0)}</b></div><div class="stat"><span>Su parte</span><b class="money">${money(share[id] || 0)}</b></div><div class="stat ${bal >= 0 ? "stat-good" : "stat-bad"}"><span>Balance</span><b class="money">${bal >= 0 ? "+" : "−"}${money(Math.abs(bal))}</b></div></div>
   <p class="muted small">${top ? `Donde más gasta: <b>${esc(top[0])}</b> · ${money(top[1])}` : "Sin movimientos este mes."}</p>
   <h4 class="detail-sub">Movimientos del mes</h4><div class="feed" id="memberDetailFeed">${allMine.slice(0, 8).map(feedHTML).join("") || `<p class="muted small">Sin movimientos.</p>`}</div>
   ${self ? `<h4 class="detail-sub">Tu cuenta</h4><div class="account-actions"><button class="secondary" type="button" data-pd="password">${ic("key")}Cambiar contraseña</button><button class="danger-outline" type="button" data-pd="logout">${ic("logout")}Cerrar sesión</button></div>` : ""}`;
  $$("#memberDetailContent [data-pd]").forEach(b => b.onclick = () => { const a = b.dataset.pd; if (a === "edit") openProfileEditor(id); if (a === "report") { closeSheets(); setTimeout(() => prepareReportModal("member", id), 80); } if (a === "password") sendReset(me.email); if (a === "logout") doLogout(); });
  bindFeed("#memberDetailFeed");
  openSheet("#memberDetailSheet");
}
const openMyProfile = () => { const mm = myMember(); if (mm) openMemberDetail(mm.id); };
$("#profileBtn").onclick = openMyProfile; $("#sideUserBtn").onclick = openMyProfile;
$("#familyPasswordBtn").onclick = () => sendReset(me?.email);

/* ── administrar personas ── */
function refreshMemberAdminPreview() {
  const id = $("#memberEditId").value, m = id ? member(id) : null, name = $("#memberName").value.trim() || m?.name || "Nueva persona";
  $("#memberAdminPreviewName").textContent = name; $("#memberAdminAccessText").textContent = m ? accessText(m) : ($("#memberEmail").value.trim() ? "Recibirá un enlace para entrar" : "Sin acceso a la app");
  $("#memberAdminAvatarPreview").outerHTML = memberAvatar({ ...(m || { id: "new" }), name }, "lg").replace('class="avatar', 'id="memberAdminAvatarPreview" class="avatar');
}
function setRoleOptions(allowAdmin) { const opt = $("#memberRole option[value='admin']"); if (opt) { opt.disabled = !allowAdmin; opt.hidden = !allowAdmin; } }
function openNewMemberAdmin() {
  if (!canManage()) { toast("Solo el Owner o un administrador agregan personas."); return; }
  $("#memberForm").reset(); $("#memberEditId").value = ""; $("#memberSheetTitle").textContent = "Agregar persona"; $("#memberRole").value = "member"; setRoleOptions(isOwner());
  $("#memberRoleWrap").classList.remove("hidden"); ["#memberResetPassword", "#memberEditAvatar", "#memberShowInvite"].forEach(s => $(s).classList.add("hidden"));
  refreshMemberAdminPreview(); openSheet("#memberSheet"); setTimeout(() => $("#memberName").focus(), 120);
}
function openMemberAdminEditor(id) {
  const m = member(id); if (!canEditMemberAdmin(m)) { toast("No puedes editar a esta persona."); return; }
  $("#memberForm").reset(); $("#memberEditId").value = id; $("#memberName").value = m.name || ""; $("#memberEmail").value = m.email || "";
  const r = roleOf(m), self = m.id === myMember()?.id; setRoleOptions(isOwner()); $("#memberRole").value = r === "owner" ? "admin" : r;
  $("#memberRoleWrap").classList.toggle("hidden", r === "owner" || self);
  $("#memberSheetTitle").textContent = "Editar persona";
  $("#memberResetPassword").classList.toggle("hidden", !(m.email && m.authUid)); $("#memberShowInvite").classList.toggle("hidden", !(m.email && !m.authUid)); $("#memberEditAvatar").classList.remove("hidden");
  refreshMemberAdminPreview(); openSheet("#memberSheet");
}
$("#inviteBtn").onclick = openNewMemberAdmin; $("#adminInviteBtn").onclick = openNewMemberAdmin;
$("#memberName").addEventListener("input", refreshMemberAdminPreview); $("#memberEmail").addEventListener("input", refreshMemberAdminPreview);
$("#memberEditAvatar").onclick = () => { const id = $("#memberEditId").value; if (id) { closeSheets(); setTimeout(() => openProfileEditor(id), 80); } };
$("#memberResetPassword").onclick = () => sendReset($("#memberEmail").value.trim().toLowerCase());
$("#memberShowInvite").onclick = () => { const id = $("#memberEditId").value; if (id) openInviteSheet(member(id)); };
$("#memberForm").onsubmit = async e => {
  e.preventDefault(); if (!canManage()) return;
  const id = $("#memberEditId").value, name = $("#memberName").value.trim(), email = $("#memberEmail").value.trim().toLowerCase();
  let role = $("#memberRole").value; if (role === "admin" && !isOwner()) role = "member"; if (!["admin", "member", "viewer"].includes(role)) role = "member";
  if (!name) { toast("Escribe un nombre."); return; }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) { toast("Revisa el email."); return; }
  if (members.some(m => m.id !== id && email && String(m.email || "").toLowerCase() === email)) { toast("Ese email ya es de otra persona."); return; }
  try {
    if (id) {
      const m = member(id); if (!canEditMemberAdmin(m)) return;
      const oldEmail = (m.email || "").toLowerCase(), patch = { name, email: email || null, inviteStatus: m.authUid ? "active" : email ? "pending" : "none", updatedAt: serverTimestamp() };
      if (roleOf(m) !== "owner" && m.id !== myMember()?.id) patch.role = role;
      await setDoc(doc(db, "households", householdId, "members", id), patch, { merge: true });
      if (oldEmail && oldEmail !== email && !m.authUid) { try { await deleteDoc(doc(db, "invites", emailKey(oldEmail))); } catch { /* none */ } }
      if (email && !m.authUid) await setDoc(doc(db, "invites", emailKey(email)), { email, householdId, memberId: id, householdName: household.name || "Mi Casa", role: patch.role || roleOf(m), invitedBy: me.uid, createdAt: serverTimestamp() }, { merge: true });
      closeSheets();
      if (email && !m.authUid && email !== oldEmail) openInviteSheet({ ...m, name, email });
      else toast(m.authUid && oldEmail !== email ? "Guardado. El email con el que entra solo lo puede cambiar esa persona." : "Persona actualizada");
    } else {
      const mref = doc(collection(db, "households", householdId, "members"));
      await setDoc(mref, { name, email: email || null, role, authUid: null, inviteStatus: email ? "pending" : "none", createdBy: me.uid, createdAt: serverTimestamp() });
      if (email) await setDoc(doc(db, "invites", emailKey(email)), { email, householdId, memberId: mref.id, householdName: household.name || "Mi Casa", role, invitedBy: me.uid, createdAt: serverTimestamp() }, { merge: true });
      closeSheets();
      if (email) openInviteSheet({ id: mref.id, name, email }); else toast(`${name} agregada/o a Mi Casa`);
    }
  } catch (err) { console.warn(err); toast("No se pudo guardar. Revisa tu conexión o tus permisos."); }
};
function inviteLink(m) { return `${location.origin}${location.pathname}?invite=${encodeURIComponent(String(m.email || "").toLowerCase())}&n=${encodeURIComponent(String(m.name || "").split(" ")[0])}`; }
function openInviteSheet(m) {
  if (!m?.email) return;
  const link = inviteLink(m), first = String(m.name || "").split(" ")[0], msg = `Hola ${first}, te invité a Mi Casa para llevar juntos las cuentas de la casa. Abre este enlace y elige tu contraseña: ${link}`;
  $("#inviteName").textContent = m.name; $("#inviteEmail").textContent = m.email; $("#inviteLink").value = link;
  $("#inviteWhatsApp").href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  $("#inviteMail").href = `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent("Tu acceso a Mi Casa")}&body=${encodeURIComponent(msg)}`;
  $("#inviteShareBtn").onclick = async () => { if (navigator.share) { try { await navigator.share({ title: "Mi Casa", text: msg.replace(link, "").trim(), url: link }); } catch { /* cancelled */ } } else copyText(link); };
  $("#inviteCopyBtn").onclick = () => copyText(link);
  openSheet("#inviteSheet");
}
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast("Enlace copiado"); } catch { const i = $("#inviteLink"); i.focus(); i.select(); try { document.execCommand("copy"); toast("Enlace copiado"); } catch { toast("Mantén presionado el enlace para copiarlo."); } } }

/* ── perfil ── */
let profileDraft = { avatarData: null, avatarPreset: "initials", accentColor: PROFILE_COLORS[0][0] };
$("#profileColorPicker").innerHTML = PROFILE_COLORS.map(([hex, name]) => `<button type="button" data-color="${hex}" style="--c:${hex}" aria-label="${name}"></button>`).join("");
function openProfileEditor(id) {
  const m = member(id); if (!(canManage() && canEditMemberAdmin(m) || m.authUid === me?.uid)) { toast("No puedes editar este perfil."); return; }
  profileDraft = { avatarData: m.avatarData || null, avatarPreset: m.avatarPreset || "initials", accentColor: personColor(m) };
  $("#profileEditMemberId").value = id; $("#profileEditName").textContent = m.name; renderProfileDraft(m); openSheet("#profileEditSheet");
}
function renderProfileDraft(m = member($("#profileEditMemberId").value)) {
  $("#profileAvatarPreview").outerHTML = memberAvatar({ ...m, ...profileDraft }, "lg").replace('class="avatar', 'id="profileAvatarPreview" class="avatar');
  const ini = $("#avatarPresetPicker [data-preset='initials']"); if (ini) ini.textContent = initials(m.name);
  $$("#avatarPresetPicker button").forEach(b => { const on = b.dataset.preset === profileDraft.avatarPreset && !profileDraft.avatarData; b.classList.toggle("selected", on); b.setAttribute("aria-pressed", String(on)); });
  $$("#profileColorPicker button").forEach(b => { const on = b.dataset.color.toLowerCase() === String(profileDraft.accentColor).toLowerCase(); b.classList.toggle("selected", on); b.setAttribute("aria-pressed", String(on)); });
}
function compressProfileImage(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => { const img = new Image(); img.onerror = reject; img.onload = () => { const size = 320, c = document.createElement("canvas"); c.width = size; c.height = size; const ctx = c.getContext("2d"), s = Math.min(img.width, img.height), sx = (img.width - s) / 2, sy = (img.height - s) / 2; ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size); resolve(c.toDataURL("image/jpeg", .76)); }; img.src = reader.result; }; reader.readAsDataURL(file); }); }
$("#profilePhotoInput").addEventListener("change", async e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 8 * 1024 * 1024) { toast("La foto es demasiado grande."); return; } try { profileDraft.avatarData = await compressProfileImage(f); profileDraft.avatarPreset = "initials"; renderProfileDraft(); } catch { toast("No pudimos preparar esa foto."); } });
$$("#avatarPresetPicker button").forEach(b => b.onclick = () => { profileDraft.avatarData = null; profileDraft.avatarPreset = b.dataset.preset; renderProfileDraft(); });
$$("#profileColorPicker button").forEach(b => b.onclick = () => { profileDraft.accentColor = b.dataset.color; renderProfileDraft(); });
$("#profileEditForm").addEventListener("submit", async e => {
  e.preventDefault(); const id = $("#profileEditMemberId").value, m = member(id); if (!(canManage() && canEditMemberAdmin(m) || m.authUid === me?.uid)) return;
  try { await updateDoc(doc(db, "households", householdId, "members", id), { avatarData: profileDraft.avatarData || null, avatarPreset: profileDraft.avatarPreset || "initials", accentColor: profileDraft.accentColor, profileUpdatedAt: serverTimestamp() }); closeSheets(); toast("Perfil actualizado"); } catch (err) { console.warn(err); toast("No se pudo guardar el perfil."); }
});

/* ───────────────────────── presupuestos y categorías ───────────────────────── */
function openBudgets() {
  if (!canManage()) { toast("Solo el Owner o un administrador cambian el presupuesto."); return; }
  const s = budgetSettings(); $("#globalBudgetInput").value = s.globalLimit || ""; $("#weeklyBudgetInput").value = s.weeklyLimit || ""; $("#rolloverBudgetInput").checked = !!s.rollover;
  $("#budgetSheetTitle").textContent = `Presupuestos · ${cap(monthLabel(activeMonth))}`;
  $("#budgetRows").innerHTML = allCategories().map(c => `<label class="budget-row">${catIcon(c)}<span>${esc(c)}</span><input class="budget-input" data-cat="${esc(c)}" inputmode="decimal" placeholder="Sin límite" value="${budgets[`${activeMonth}_${c}`]?.limit || ""}" aria-label="Límite de ${esc(c)}"></label>`).join("");
  openSheet("#budgetSheet");
}
$("#editBudgetsBtn").onclick = () => canManage() ? openBudgets() : toast("Solo el Owner o un administrador cambian el presupuesto.");
$("#adminBudgetAdvanced").onclick = openBudgets;
$("#budgetForm").onsubmit = async e => {
  e.preventDefault(); if (!canManage()) return;
  try {
    await Promise.all($$(".budget-input").map(i => setDoc(doc(db, "households", householdId, "budgets", `${activeMonth}_${i.dataset.cat}`), { month: activeMonth, category: i.dataset.cat, limit: Number(i.value || 0), updatedAt: serverTimestamp() }, { merge: true })));
    await setDoc(doc(db, "households", householdId, "budgets", `${activeMonth}__settings`), { month: activeMonth, globalLimit: Number($("#globalBudgetInput").value || 0), weeklyLimit: Number($("#weeklyBudgetInput").value || 0), rollover: $("#rolloverBudgetInput").checked, updatedAt: serverTimestamp() }, { merge: true });
    closeSheets(); toast("Presupuesto guardado");
  } catch (err) { console.warn(err); toast("No se pudo guardar el presupuesto."); }
};
function openCategories() { if (!canManage()) return; renderCategoryChips(); openSheet("#categorySheet"); }
function renderCategoryChips() { $("#categoryChips").innerHTML = allCategories().map(c => `<span class="cat-chip">${catIcon(c)}${esc(c)}${BASE_CATS.includes(c) ? "" : `<button type="button" class="icon-btn sm" data-remove-cat="${esc(c)}" aria-label="Quitar ${esc(c)}">${ic("x")}</button>`}</span>`).join(""); $$("[data-remove-cat]").forEach(b => b.onclick = () => saveCustomCats(customCats.filter(c => c !== b.dataset.removeCat))); }
async function saveCustomCats(list) { try { await setDoc(doc(db, "households", householdId, "settings", "categories"), { custom: list, updatedAt: serverTimestamp(), updatedBy: me.uid }, { merge: true }); customCats = list; fillCategorySelects(); renderCategoryChips(); } catch (err) { console.warn(err); toast(isPermissionError(err) ? "Para categorías propias hay que publicar las reglas nuevas." : "No se pudo guardar la categoría."); } }
$("#adminCategories").onclick = openCategories;
$("#categoryForm").onsubmit = e => { e.preventDefault(); const name = $("#newCategoryName").value.trim().replace(/\s+/g, " "); if (!name) return; if (allCategories().some(c => c.toLowerCase() === name.toLowerCase())) { toast("Esa categoría ya existe."); return; } $("#newCategoryName").value = ""; saveCustomCats([...customCats, name]); };

/* ───────────────────────── recurrentes ───────────────────────── */
function updateRecurringHint() { const d = Number($("#recurringDay").value); $("#recurringDayHint").textContent = d > 28 ? "En los meses más cortos vence el último día del mes." : ""; }
function openRecurringEditor(r = null) {
  if (!canManage()) { toast("Solo el Owner o un administrador manejan los recurrentes."); return; }
  closeSheets(); $("#recurringForm").reset(); fillCategorySelects();
  $("#recurringId").value = r?.id || ""; $("#recurringSheetTitle").textContent = r ? "Editar recurrente" : "Pago recurrente";
  $("#recurringName").value = r?.name || ""; $("#recurringAmount").value = r?.amount ?? ""; $("#recurringDay").value = r?.day || 1;
  $("#recurringCategory").value = r?.category && allCategories().includes(r.category) ? r.category : "Servicios";
  $("#recurringPayer").innerHTML = members.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join(""); $("#recurringPayer").value = r?.payerId || myMember()?.id || members[0]?.id;
  $("#recurringParticipants").innerHTML = participantButtons(r?.participantIds?.length ? r.participantIds : members.map(m => m.id)); bindParticipantPicker("#recurringParticipants");
  $("#recurringAutoCreate").checked = r ? r.autoCreate === true : true; $("#recurringActive").checked = r ? r.active !== false : true;
  $("#deleteRecurringBtn").classList.toggle("hidden", !r); updateRecurringHint(); openSheet("#recurringSheet");
}
$("#recurringDay").addEventListener("input", updateRecurringHint);
$("#addRecurringBtn").onclick = () => openRecurringEditor();
$("#recurringForm").onsubmit = async e => {
  e.preventDefault(); if (!canManage()) return;
  const id = $("#recurringId").value, name = $("#recurringName").value.trim(), amount = Number(String($("#recurringAmount").value).replace(/[$,]/g, "")), day = Number($("#recurringDay").value), participantIds = selectedIds("#recurringParticipants");
  if (!name) { toast("Escribe el nombre."); return; } if (!(amount > 0)) { toast("Escribe un monto válido."); return; } if (!(day >= 1 && day <= 31)) { toast("El día va del 1 al 31."); return; }
  if ($("#recurringAutoCreate").checked && !participantIds.length) { toast("Elige para quién es."); return; }
  const data = { name, amount, day, category: $("#recurringCategory").value, payerId: $("#recurringPayer").value, participantIds, autoCreate: $("#recurringAutoCreate").checked, active: $("#recurringActive").checked, updatedAt: serverTimestamp() };
  try { if (id) await setDoc(doc(db, "households", householdId, "recurring", id), data, { merge: true }); else await addDoc(collection(db, "households", householdId, "recurring"), { ...data, createdAt: serverTimestamp() }); closeSheets(); toast("Recurrente guardado"); recurringChecked = ""; setTimeout(() => afterRender(), 300); }
  catch (err) { console.warn(err); toast("No se pudo guardar el recurrente."); }
};
$("#deleteRecurringBtn").onclick = async () => { const id = $("#recurringId").value; if (!id || !confirm("¿Eliminar este recurrente? Las cuentas que ya creó se quedan.")) return; try { await deleteDoc(doc(db, "households", householdId, "recurring", id)); closeSheets(); toast("Recurrente eliminado"); } catch (err) { console.warn(err); toast("No se pudo eliminar."); } };
let recurringRun = null;
function ensureRecurringBills() { if (!recurringRun) recurringRun = runRecurringBills().finally(() => { recurringRun = null; }); return recurringRun; }
async function runRecurringBills() {
  if (!householdId || !canWrite()) return 0;
  const key = nowMonth(); if (isMonthClosed(key)) return 0;
  let created = 0;
  for (const r of recurrings) {
    if (r.active === false || r.autoCreate !== true) continue;
    const ids = (r.participantIds || []).filter(id => members.some(m => m.id === id)), amount = Number(r.amount || 0);
    if (!ids.length || !(amount > 0)) continue;
    const expId = `rec_${r.id}_${key}`; if (expenses.some(e => e.id === expId)) continue;
    const runRef = doc(db, "households", householdId, "recurringRuns", `${r.id}_${key}`);
    try {
      if ((await getDoc(runRef)).exists()) continue;
      await setDoc(runRef, { recurringId: r.id, month: key, expenseId: expId, createdBy: me.uid, createdAt: serverTimestamp() });
    } catch (err) { console.warn("recurring marker", err); return created; }
    const due = `${key}-${pad2(recurringDay(r, key))}`, each = amount / ids.length;
    try {
      await setDoc(doc(db, "households", householdId, "expenses", expId), { amount, description: r.name, date: `${key}-01`, month: key, dueDate: due, category: r.category || "Otros", paymentStatus: "pending", payerId: null, suggestedPayerId: r.payerId || null, useCoverage: true, participantIds: ids, splitMode: "equal", splitValues: {}, shares: Object.fromEntries(ids.map(id => [id, each])), notes: "Creada automáticamente desde un pago recurrente.", attachments: [], recurringId: r.id, recurringMonth: key, createdBy: me.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      created++;
    } catch (err) { console.warn("recurring bill", err); deleteDoc(runRef).catch(() => {}); }
  }
  if (created) showLivePill(`${plural(created, "cuenta del mes creada", "cuentas del mes creadas")}`, "↻");
  return created;
}

/* ───────────────────────── calendario y cierre ───────────────────────── */
function renderCalendar() {
  const [y, m] = activeMonth.split("-").map(Number), days = new Date(y, m, 0).getDate(), first = new Date(y, m - 1, 1).getDay();
  const exByDay = {}, recByDay = {};
  expenses.forEach(e => { const place = isPendingBill(e) && e.dueDate ? e.dueDate : e.date; if (monthKey(place) !== activeMonth) return; (exByDay[Number(place.slice(8, 10))] ??= []).push(e); });
  recurrings.filter(r => r.active !== false && !expenses.some(e => e.id === `rec_${r.id}_${activeMonth}`)).forEach(r => (recByDay[recurringDay(r)] ??= []).push(r));
  const t = today(), isThisMonth = t.slice(0, 7) === activeMonth, todayDay = Number(t.slice(8, 10));
  $("#calendarMonthLabel").textContent = cap(monthLabel(activeMonth));
  let html = `<div class="cal-head">${["D", "L", "M", "M", "J", "V", "S"].map(x => `<b>${x}</b>`).join("")}</div><div class="cal-grid">${"<span></span>".repeat(first)}`;
  for (let d = 1; d <= days; d++) {
    const ex = exByDay[d] || [], rec = recByDay[d] || [], dayTotal = totalsFor(ex), overdue = ex.some(e => billState(e) === "overdue"), pend = ex.some(isPendingBill);
    html += `<button type="button" class="cal-day ${isThisMonth && d === todayDay ? "today" : ""} ${ex.length || rec.length ? "has-events" : ""} ${overdue ? "overdue" : pend ? "pending" : ""}" data-day="${d}" aria-label="${d}: ${ex.length ? money(dayTotal) : "sin gastos"}${rec.length ? `, ${rec.map(r => r.name).join(", ")}` : ""}"><b>${d}</b>${dayTotal ? `<i>${money(dayTotal).replace(".00", "")}</i>` : ""}${rec.slice(0, 1).map(r => `<em>${esc(r.name)}</em>`).join("")}<span class="cal-dots">${[...new Set(ex.map(e => categoryClass(e.category)))].slice(0, 3).map(x => `<u class="cat-${x}"></u>`).join("")}${rec.length ? `<u class="rec"></u>` : ""}</span></button>`;
  }
  $("#financialCalendar").innerHTML = html + "</div>";
  $$("#financialCalendar .cal-day").forEach(b => { const day = Number(b.dataset.day); b.onclick = () => openDayDetail(day); if (canWrite()) bindLongPress(b, () => { openExpense(null, { status: "paid", date: `${activeMonth}-${pad2(day)}` }); showLivePill("Gasto para ese día", "＋"); }); });
  const active = recurrings.slice().sort((a, b) => a.day - b.day);
  $("#recurringList").innerHTML = active.length ? active.map(r => `<${canManage() ? "button type=\"button\"" : "div"} class="feed-item ${canManage() ? "" : "static"} ${r.active === false ? "inactive" : ""}" data-recurring="${esc(r.id)}">${catIcon(r.category)}<div class="feed-copy"><b class="feed-title">${esc(r.name)}</b><small>Día ${recurringDay(r)} · ${esc(r.category || "Otros")}${r.autoCreate ? ` · ${ic("repeat", "tiny")}crea la cuenta sola` : ""}${r.active === false ? " · pausado" : ""}</small></div><div class="feed-amount"><b class="money">${moneyHTML(r.amount)}</b></div></${canManage() ? "button" : "div"}>`).join("") : `<div class="empty">${ic("repeat")}<b>Sin pagos recurrentes</b><small>Agrega renta, internet, teléfono o suscripciones.</small></div>`;
  $$("#recurringList [data-recurring]").forEach(b => { if (canManage()) b.onclick = () => openRecurringEditor(recurrings.find(r => r.id === b.dataset.recurring)); });
}
function renderSubscriptions() { const a = recurrings.filter(r => r.active !== false), m = a.reduce((s, r) => s + Number(r.amount || 0), 0); $("#subscriptionMonthly").innerHTML = moneyHTML(m); $("#subscriptionYearly").innerHTML = moneyHTML(m * 12); }
function renderMonthClose() {
  const key = activeMonth, ex = monthExpenses(key), paidEx = ex.filter(e => !isPendingBill(e)), pending = pendingMonthBills(key), plan = balancePlan(key), missing = paidEx.filter(e => !expenseAttachments(e).length), paidS = settlements.filter(s => s.month === key && s.status === "paid"), closed = isMonthClosed(key), info = closings[key] || {};
  $("#monthCloseTitle").textContent = cap(monthLabel(key));
  const st = $("#monthCloseStatus"); st.textContent = closed ? "Cerrado" : "Abierto"; st.className = `status-badge ${closed ? "closed" : "open"}`;
  $("#monthCloseMetrics").innerHTML = `<div><span>Gastos pagados</span><b class="money">${moneyHTML(totalsFor(paidEx))}</b></div><div><span>Cuentas pendientes</span><b>${pending.length}</b></div><div><span>Pagos entre personas</span><b class="money">${moneyHTML(paidS.reduce((s, x) => s + Number(x.amount || 0), 0))}</b></div><div><span>Transferencias por hacer</span><b>${plan.length}</b></div>`;
  const row = (ok, text) => `<div class="check-row ${ok ? "ok" : "warn"}">${ic(ok ? "check" : "alert")}<span>${text}</span></div>`;
  $("#monthCloseChecklist").innerHTML = closed ? `<div class="check-row ok">${ic("lock")}<span>Mes cerrado${info.closedAt?.seconds ? ` el ${fmtDate(localISO(new Date(info.closedAt.seconds * 1000)))}` : ""}${info.closedBy ? ` por ${esc(members.find(m => m.authUid === info.closedBy)?.name || "el Owner")}` : ""}. Nadie puede cambiar sus gastos ni pagos hasta reabrirlo.</span></div>`
    : row(!pending.length, pending.length ? `${plural(pending.length, "cuenta pendiente", "cuentas pendientes")} de ${money(totalsFor(pending))}` : "Sin cuentas pendientes") + row(!missing.length, missing.length ? `${plural(missing.length, "gasto", "gastos")} sin comprobante` : "Todos los gastos tienen comprobante") + row(!plan.length, plan.length ? `${plural(plan.length, "saldo", "saldos")} sin resolver · ${money(plan.reduce((s, p) => s + p.amount, 0))}` : "Todos los saldos resueltos");
  $("#closeMonthBtn").innerHTML = closed ? `${ic("unlock")}<span>Reabrir mes</span>` : `${ic("lock")}<span>Cerrar mes</span>`;
}
$("#closeMonthBtn").onclick = async () => {
  if (!canManage()) return;
  if (isMonthClosed(activeMonth)) {
    if (!confirm(`¿Reabrir ${cap(monthLabel(activeMonth))}? Se podrán volver a cambiar sus gastos.`)) return;
    try { await setDoc(doc(db, "households", householdId, "monthlyClosings", activeMonth), { status: "open", reopenedBy: me.uid, reopenedAt: serverTimestamp() }, { merge: true }); toast("Mes reabierto"); } catch (err) { console.warn(err); toast("No se pudo reabrir."); }
    return;
  }
  openMonthCloseSummary();
};
function openMonthCloseSummary() {
  if (!canManage()) return;
  const key = activeMonth, ex = monthExpenses(key), paidEx = ex.filter(e => !isPendingBill(e)), total = totalsFor(paidEx), cats = catsFor(paidEx), top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0], { paid } = calc(key), payer = Object.entries(paid).sort((a, b) => b[1] - a[1])[0], plan = balancePlan(key), pending = pendingMonthBills(key), missing = paidEx.filter(e => !expenseAttachments(e).length);
  const warn = (n, txt, view) => `<button type="button" class="check-row ${n ? "warn" : "ok"}" ${n ? `data-close-go="${view}"` : "disabled"}>${ic(n ? "alert" : "check")}<span>${txt}</span>${n ? ic("chev-right", "chev") : ""}</button>`;
  $("#monthCloseSheetTitle").textContent = `Cerrar ${monthLabel(key).split(" ")[0]}`;
  $("#monthCloseContent").innerHTML = `<div class="close-hero"><span>${esc(cap(monthLabel(key)))}</span><strong class="money">${moneyHTML(total)}</strong><small>${plural(paidEx.length, "gasto pagado", "gastos pagados")}</small></div>
    <div class="detail-grid"><div><span>Categoría principal</span><b>${top ? `${esc(top[0])} · ${money(top[1])}` : "—"}</b></div><div><span>Quien adelantó más</span><b>${payer && payer[1] ? `${esc(member(payer[0]).name)} · ${money(payer[1])}` : "—"}</b></div></div>
    <h4 class="detail-sub">Antes de cerrar, revisa</h4>
    <div class="checklist">${warn(pending.length, pending.length ? `${plural(pending.length, "cuenta pendiente", "cuentas pendientes")} sin pagar` : "Sin cuentas pendientes", "bills")}${warn(missing.length, missing.length ? `${plural(missing.length, "gasto", "gastos")} sin comprobante` : "Todos con comprobante", "activity")}${warn(plan.length, plan.length ? `${plural(plan.length, "saldo", "saldos")} sin resolver entre la familia` : "Todos los saldos resueltos", "balances")}</div>
    <p class="info-note">${ic("lock")}<span>Al cerrar, nadie podrá agregar, cambiar ni borrar gastos o pagos de este mes hasta que se reabra.</span></p>
    <div class="sheet-footer"><button class="primary wide" type="button" id="confirmCloseMonth">${ic("lock")}Cerrar ${esc(cap(monthLabel(key)))}</button></div>`;
  $$("#monthCloseContent [data-close-go]").forEach(b => b.onclick = () => { closeSheets(); go(b.dataset.closeGo); });
  $("#confirmCloseMonth").onclick = async () => { try { await setDoc(doc(db, "households", householdId, "monthlyClosings", key), { status: "closed", closedBy: me.uid, closedAt: serverTimestamp(), total }, { merge: true }); closeSheets(); toast(`${cap(monthLabel(key))} cerrado`); } catch (err) { console.warn(err); toast("No se pudo cerrar el mes."); } };
  openSheet("#monthCloseSheet");
}
$("#monthClosePdfBtn").onclick = () => prepareReportModal("global");
$("#prevMonthBtn").onclick = () => { activeMonth = addMonths(activeMonth, -1); renderAll(); };
$("#nextMonthBtn").onclick = () => { activeMonth = addMonths(activeMonth, 1); renderAll(); };
$("#calendarMonthLabel").onclick = () => { activeMonth = nowMonth(); renderAll(); };
$("#backToCurrentMonth").onclick = () => { activeMonth = nowMonth(); renderAll(); };
(function calendarSwipe() { let sx = 0; $("#financialCalendar").addEventListener("touchstart", e => sx = e.changedTouches[0].clientX, { passive: true }); $("#financialCalendar").addEventListener("touchend", e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 70) { activeMonth = addMonths(activeMonth, dx > 0 ? -1 : 1); renderAll(); } }, { passive: true }); })();
function openDayDetail(day) {
  const date = `${activeMonth}-${pad2(day)}`, ex = expenses.filter(e => e.date === date || (isPendingBill(e) && e.dueDate === date && e.date !== date)), rec = recurrings.filter(r => r.active !== false && recurringDay(r) === day);
  $("#dayDetailTitle").textContent = cap(new Intl.DateTimeFormat(locale(), { weekday: "long", month: "long", day: "numeric" }).format(new Date(date + "T12:00:00")));
  $("#dayDetailContent").innerHTML = `<div class="day-summary"><span>${plural(ex.length, "movimiento", "movimientos")}</span><strong class="money">${moneyHTML(totalsFor(ex))}</strong></div>${rec.length ? `<h4 class="detail-sub">Recurrentes</h4>${rec.map(r => `<div class="detail-row">${catIcon(r.category)}<span>${esc(r.name)}</span><b class="money">${money(r.amount)}</b></div>`).join("")}` : ""}<div class="feed" id="dayFeed">${ex.map(feedHTML).join("") || `<div class="empty">${ic("calendar")}<b>Día libre</b><small>No hay gastos en esta fecha.</small></div>`}</div>${canWrite() && !isMonthClosed(activeMonth) ? `<div class="sheet-footer"><button class="secondary wide" type="button" id="dayAddBtn">${ic("plus")}Registrar gasto este día</button></div>` : ""}`;
  bindFeed("#dayFeed"); $("#dayAddBtn")?.addEventListener("click", () => openExpense(null, { status: "paid", date }));
  openSheet("#dayDetailSheet");
}
function openSpaceDetail(cat) {
  const ex = rangeExpenses().filter(e => e.category === cat), total = totalsFor(ex), lim = Number(budgets[`${activeMonth}_${cat}`]?.limit || 0), pct = lim ? Math.round(total / lim * 100) : null;
  $("#spaceDetailTitle").textContent = cat;
  $("#spaceDetailContent").innerHTML = `<div class="space-hero">${catIcon(cat)}<div><small>${esc(rangeLabel())}</small><strong class="money">${moneyHTML(total)}</strong><p>${lim ? `${pct}% de un límite de ${money(lim)}` : plural(ex.length, "movimiento", "movimientos")}</p></div></div>${lim ? `<i class="bar ${pct > 100 ? "over" : pct >= 80 ? "near" : ""}"><i style="width:${Math.min(100, pct)}%"></i></i>` : ""}<div class="feed" id="spaceFeed">${ex.slice(0, 20).map(feedHTML).join("") || `<div class="empty"><b>Sin gastos en ${esc(cat)}</b></div>`}</div>`;
  bindFeed("#spaceFeed"); openSheet("#spaceDetailSheet");
}

/* ───────────────────────── metas ───────────────────────── */
function monthsUntil(target) { if (!target) return null; const [ay, am, ad] = today().split("-").map(Number), [by, bm, bd] = target.split("-").map(Number); let m = (by - ay) * 12 + (bm - am); if (bd < ad) m--; return Math.max(1, m); }
function goalProgress(g) {
  const contribs = goalContribs.filter(c => c.goalId === g.id), saved = Number(g.currentAmount || 0) + contribs.reduce((s, c) => s + Number(c.amount || 0), 0), target = Number(g.targetAmount || 0), remaining = Math.max(0, target - saved), months = monthsUntil(g.targetDate);
  return { saved, target, remaining, pct: target ? Math.min(100, saved / target * 100) : 0, months, perMonth: months ? remaining / months : null, contribs };
}
function goalCard(g) { const p = goalProgress(g); return `<button type="button" class="goal-card" data-goal="${esc(g.id)}"><span class="goal-ic">${esc(g.icon || "★")}</span><span class="goal-main"><b>${esc(g.name)}</b><small>${money(p.saved)} de ${money(p.target)}${p.perMonth && p.remaining ? ` · ${money(p.perMonth)}/mes` : p.remaining ? "" : " · ¡lograda!"}</small><i class="bar good"><i style="width:${p.pct}%"></i></i></span><em>${Math.round(p.pct)}%</em></button>`; }
function renderGoals() {
  const s = [...goals].sort((a, b) => String(a.targetDate || "9999").localeCompare(String(b.targetDate || "9999")));
  $("#homeGoals").innerHTML = s.length ? s.slice(0, 2).map(goalCard).join("") : `<div class="empty small">${ic("target")}<b>Sin metas todavía</b><small>Vacaciones, muebles o un fondo de emergencia.</small></div>`;
  $("#goalsGrid").innerHTML = s.length ? s.map(goalCard).join("") : `<div class="empty">${ic("target")}<b>Sin metas</b><small>${canManage() ? "Crea la primera con «Nueva meta»." : "El Owner o un administrador pueden crear la primera."}</small></div>`;
  $$("[data-goal]").forEach(b => b.onclick = () => openGoalDetail(b.dataset.goal));
}
let detailGoalId = null;
function openGoalDetail(id) {
  const g = goals.find(x => x.id === id); if (!g) return; detailGoalId = id; const p = goalProgress(g);
  $("#goalDetailTitle").textContent = g.name;
  $("#goalDetailContent").innerHTML = `<div class="goal-hero"><span class="goal-ic big">${esc(g.icon || "★")}</span><div><strong class="money">${moneyHTML(p.saved)}</strong><small>de ${money(p.target)} · ${Math.round(p.pct)}%</small></div></div><i class="bar good big"><i style="width:${p.pct}%"></i></i><p class="muted small">${p.remaining ? `Faltan ${money(p.remaining)}${p.perMonth ? ` · ${money(p.perMonth)} al mes hasta el ${fmtDate(g.targetDate)}` : ""}.` : "¡Meta lograda!"}</p>`;
  $("#goalContribMember").innerHTML = members.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join(""); $("#goalContribMember").value = myMember()?.id || members[0]?.id || "";
  $("#goalContribAmount").value = ""; $("#goalContribNote").value = "";
  const list = p.contribs.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  $("#goalContribList").innerHTML = (list.length ? `<h4 class="detail-sub">Aportes</h4>` : "") + list.map(c => `<div class="feed-item static">${memberAvatar(member(c.memberId), "sm")}<div class="feed-copy"><b>${esc(member(c.memberId).name)}</b><small>${esc(fmtDate(c.date))}${c.note ? ` · ${esc(c.note)}` : ""}</small></div><div class="feed-amount"><b class="money">${money(c.amount)}</b></div>${canManage() || c.createdBy === me?.uid ? `<button class="icon-btn sm danger-ghost" type="button" data-del-contrib="${esc(c.id)}" aria-label="Borrar aporte">${ic("trash")}</button>` : ""}</div>`).join("");
  $$("#goalContribList [data-del-contrib]").forEach(b => b.onclick = async () => { if (!confirm("¿Borrar este aporte?")) return; try { await deleteDoc(doc(db, "households", householdId, "goalContributions", b.dataset.delContrib)); } catch (err) { console.warn(err); toast("No se pudo borrar."); } });
  openSheet("#goalDetailSheet");
}
$("#goalContribForm").onsubmit = async e => {
  e.preventDefault(); if (!canWrite() || !detailGoalId) return;
  const amount = Number(String($("#goalContribAmount").value).replace(/[$,]/g, "")); if (!(amount > 0)) { toast("Escribe un monto válido."); return; }
  try { await addDoc(collection(db, "households", householdId, "goalContributions"), { goalId: detailGoalId, amount, memberId: $("#goalContribMember").value, date: today(), note: $("#goalContribNote").value.trim(), createdBy: me.uid, createdAt: serverTimestamp() }); toast("Aporte guardado"); setTimeout(() => openGoalDetail(detailGoalId), 60); }
  catch (err) { console.warn(err); toast(isPermissionError(err) ? "Para registrar aportes hay que publicar las reglas nuevas." : "No se pudo guardar el aporte."); }
};
$("#goalDetailEditBtn").onclick = () => { const g = goals.find(x => x.id === detailGoalId); if (g) openGoalEditor(g); };
function openGoalEditor(g = null) { if (!canManage()) { toast("Solo el Owner o un administrador manejan las metas."); return; } closeSheets(); $("#goalForm").reset(); $("#goalId").value = g?.id || ""; $("#goalName").value = g?.name || ""; $("#goalTarget").value = g?.targetAmount || ""; $("#goalCurrent").value = g?.currentAmount || ""; $("#goalDate").value = g?.targetDate || ""; $("#goalIcon").value = g?.icon || "★"; $("#deleteGoalBtn").classList.toggle("hidden", !g); openSheet("#goalSheet"); }
async function saveGoal() { if (!canManage()) return; const data = { name: $("#goalName").value.trim(), targetAmount: Number($("#goalTarget").value || 0), currentAmount: Number($("#goalCurrent").value || 0), targetDate: $("#goalDate").value || "", icon: $("#goalIcon").value || "★", updatedAt: serverTimestamp() }; if (!data.name || data.targetAmount <= 0) { toast("Completa el nombre y el monto."); return; } try { const id = $("#goalId").value; if (id) await setDoc(doc(db, "households", householdId, "goals", id), data, { merge: true }); else await addDoc(collection(db, "households", householdId, "goals"), { ...data, createdAt: serverTimestamp() }); closeSheets(); toast("Meta guardada"); } catch (err) { console.warn(err); toast("No se pudo guardar la meta."); } }
$("#addGoalBtn").onclick = () => openGoalEditor(); $("#goalForm").addEventListener("submit", e => { e.preventDefault(); saveGoal(); });
$("#deleteGoalBtn").onclick = async () => { const id = $("#goalId").value; if (!id || !confirm("¿Eliminar esta meta y sus aportes?")) return; try { await deleteDoc(doc(db, "households", householdId, "goals", id)); goalContribs.filter(c => c.goalId === id).forEach(c => deleteDoc(doc(db, "households", householdId, "goalContributions", c.id)).catch(() => {})); closeSheets(); } catch (err) { console.warn(err); toast("No se pudo eliminar."); } };

/* ───────────────────────── reglas de avisos, comparar, buscar, comprobantes ───────────────────────── */
function renderAutomations() { $("#automationList").innerHTML = automationRules.length ? automationRules.map(r => `<div class="feed-item static"><span class="cat-ic cat-lilac">${ic("sparkle")}</span><div class="feed-copy"><b>${esc(automationLabel(r))}</b><small>${r.category ? esc(r.category) : "Todas las categorías"} · activa</small></div>${canManage() ? `<button class="icon-btn sm danger-ghost delete-automation" type="button" data-id="${esc(r.id)}" aria-label="Borrar regla">${ic("trash")}</button>` : ""}</div>`).join("") : `<div class="empty small"><b>Sin reglas propias</b><small>Agrega una para afinar los avisos.</small></div>`; $$(".delete-automation").forEach(b => b.onclick = async () => { if (confirm("¿Borrar esta regla?")) await deleteDoc(doc(db, "households", householdId, "automationRules", b.dataset.id)).catch(err => { console.warn(err); toast("No se pudo borrar."); }); }); }
function openAutomation() { if (!canManage()) return; $("#automationForm").reset(); fillCategorySelects(); openSheet("#automationSheet"); }
$("#addAutomationBtn").onclick = openAutomation; $("#adminAutomations").onclick = openAutomation;
$("#automationForm").addEventListener("submit", async e => { e.preventDefault(); if (!canManage()) return; try { await addDoc(collection(db, "households", householdId, "automationRules"), { type: $("#automationType").value, category: $("#automationCategory").value || "", threshold: Number($("#automationThreshold").value || 0), enabled: true, createdAt: serverTimestamp() }); closeSheets(); toast("Regla activada"); } catch (err) { console.warn(err); toast("No se pudo guardar la regla."); } });
function openCompare() { const cur = monthExpenses(activeMonth), pk = prevMonthKey(activeMonth), prev = monthExpenses(pk), ct = totalsFor(cur), pt = totalsFor(prev), cc = catsFor(cur), pc = catsFor(prev), cats = new Set([...Object.keys(cc), ...Object.keys(pc)]), diff = ct - pt, pct = pt ? diff / pt * 100 : null; $("#compareContent").innerHTML = `<div class="compare-hero"><div><small>${esc(cap(monthLabel(activeMonth)))}</small><strong class="money">${moneyHTML(ct)}</strong></div><span>vs.</span><div><small>${esc(cap(monthLabel(pk)))}</small><strong class="money">${moneyHTML(pt)}</strong></div></div><p class="compare-delta ${diff > 0 ? "up" : "down"}"><b>${pct == null ? "Primera comparación" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}</b> ${diff > 0 ? "más gasto" : "menos gasto"}${pt ? ` · ${money(Math.abs(diff))}` : ""}</p><h4 class="detail-sub">Dónde cambió</h4><div class="feed">${[...cats].map(c => { const a = cc[c] || 0, b = pc[c] || 0, d = a - b; return `<div class="feed-item static">${catIcon(c)}<div class="feed-copy"><b>${esc(c)}</b><small>${d ? `${d > 0 ? "+" : "−"}${money(Math.abs(d))} vs. mes anterior` : "sin cambio"}</small></div><div class="feed-amount"><b class="money">${money(a)}</b></div></div>`; }).join("") || `<div class="empty small"><b>Sin datos suficientes</b></div>`}</div>`; openSheet("#compareSheet"); }
$("#openCompareBtn").onclick = openCompare; $("#adminCompare").onclick = openCompare;
function globalSearch(q) { q = (q || "").trim().toLowerCase(); if (!q) return []; const num = Number(q.replace(/[$,]/g, "")), out = []; expenses.forEach(e => { if (`${e.description} ${e.category} ${e.date} ${isPendingBill(e) ? "pendiente" : member(e.payerId).name} ${e.notes || ""}`.toLowerCase().includes(q) || (!Number.isNaN(num) && num > 0 && Math.abs(Number(e.amount) - num) < .01)) out.push({ type: "expense", icon: "list", title: e.description, sub: `${isPendingBill(e) ? "Pendiente" : member(e.payerId).name} · ${money(e.amount)} · ${fmtDate(e.date)}`, id: e.id }); }); members.forEach(m => { if (`${m.name} ${m.email || ""}`.toLowerCase().includes(q)) out.push({ type: "member", icon: "user", title: m.name, sub: "Persona de la casa", id: m.id }); }); recurrings.forEach(r => { if (`${r.name} ${r.category}`.toLowerCase().includes(q)) out.push({ type: "recurring", icon: "repeat", title: r.name, sub: `Recurrente · ${money(r.amount)} · día ${r.day}`, id: r.id }); }); goals.forEach(g => { if (String(g.name).toLowerCase().includes(q)) out.push({ type: "goal", icon: "target", title: g.name, sub: `Meta · ${money(goalProgress(g).saved)} de ${money(g.targetAmount || 0)}`, id: g.id }); }); expenses.forEach(e => expenseAttachments(e).forEach((a, i) => { if (`${a.name || ""} ${e.description}`.toLowerCase().includes(q) || (q === "pdf" && attachmentKind(a) === "pdf")) out.push({ type: "receipt", icon: "camera", title: a.name || "Comprobante", sub: `${e.description} · ${fmtDate(e.date)}`, id: e.id, att: i }); })); return out.slice(0, 40); }
function renderGlobalSearch() { const q = $("#globalSearchInput").value, items = globalSearch(q); $("#globalSearchResults").innerHTML = q ? (items.length ? items.map((x, i) => `<button type="button" class="feed-item" data-result="${i}"><span class="cat-ic">${ic(x.icon)}</span><div class="feed-copy"><b class="feed-title">${esc(x.title)}</b><small>${esc(x.sub)}</small></div>${ic("chev-right", "chev")}</button>`).join("") : `<div class="empty">${ic("search")}<b>Sin resultados</b><small>Prueba con una persona, categoría, monto o «pdf».</small></div>`) : `<div class="chips">${["AT&T", "Comida", "PDF", ...members.slice(0, 2).map(m => m.name.split(" ")[0])].map(s => `<button type="button" class="chip" data-search-chip="${esc(s)}">${esc(s)}</button>`).join("")}</div>`; $$("#globalSearchResults [data-result]").forEach(el => el.onclick = () => { const x = items[Number(el.dataset.result)]; closeSheets(); if (x.type === "expense") openExpenseDetail(expenses.find(e => e.id === x.id)); else if (x.type === "member") openMemberDetail(x.id); else if (x.type === "goal") openGoalDetail(x.id); else if (x.type === "receipt") { const e = expenses.find(e => e.id === x.id); openAttachmentViewer(expenseAttachments(e), x.att); } else if (x.type === "recurring" && canManage()) openRecurringEditor(recurrings.find(r => r.id === x.id)); else go("month"); }); $$("[data-search-chip]").forEach(b => b.onclick = () => { $("#globalSearchInput").value = b.dataset.searchChip; renderGlobalSearch(); }); }
function openGlobalSearch() { openSheet("#globalSearchSheet"); renderGlobalSearch(); setTimeout(() => $("#globalSearchInput").focus(), 180); }
$("#globalSearchBtn").onclick = openGlobalSearch; $("#globalSearchInput").addEventListener("input", renderGlobalSearch);
function renderVault() {
  const search = ($("#vaultSearch").value || "").toLowerCase(), mid = $("#vaultMember").value || "", cat = $("#vaultCategory").value || "", all = [];
  expenses.forEach(e => expenseAttachments(e).forEach((a, i) => all.push({ a, e, i })));
  const filtered = all.filter(x => (!search || `${x.e.description} ${x.a.name}`.toLowerCase().includes(search)) && (!mid || x.e.payerId === mid || (x.e.participantIds || []).includes(mid)) && (!cat || x.e.category === cat));
  $("#vaultFileCount").textContent = all.length; $("#vaultExpenseCount").textContent = receiptExpenseCount(); $("#vaultMonthCount").textContent = all.filter(x => monthKey(x.e.date) === activeMonth).length;
  $("#vaultMember").innerHTML = `<option value="">Todas las personas</option>` + members.map(m => `<option value="${esc(m.id)}" ${m.id === mid ? "selected" : ""}>${esc(m.name)}</option>`).join("");
  $("#vaultGrid").innerHTML = filtered.length ? filtered.map(x => `<button type="button" class="vault-item" data-exp="${esc(x.e.id)}" data-att="${x.i}">${thumbHTML(x.a)}<span><b>${esc(x.a.name || "Comprobante")}</b><small>${esc(x.e.description)} · ${esc(fmtDate(x.e.date))}</small></span></button>`).join("") : `<div class="empty">${ic("folder")}<b>Sin comprobantes</b><small>No hay archivos con esos filtros.</small></div>`;
  hydrateThumbs("#vaultGrid");
  $$(".vault-item").forEach(el => el.onclick = () => { const e = expenses.find(x => x.id === el.dataset.exp); openAttachmentViewer(expenseAttachments(e), Number(el.dataset.att)); });
}
$("#vaultSearch").addEventListener("input", renderVault); $("#vaultMember").addEventListener("change", renderVault); $("#vaultCategory").addEventListener("change", renderVault);
$("#vaultAddExpense").onclick = () => openExpense();

/* ───────────────────────── avisos ───────────────────────── */
function buildNotifications() {
  const list = [], day = new Date().getDate(), ct = catTotals();
  allCategories().forEach(c => { const lim = Number(budgets[`${activeMonth}_${c}`]?.limit || 0), spent = Number(ct[c] || 0); if (lim && spent / lim >= .8) list.push({ type: spent > lim ? "alert" : "budget", title: spent > lim ? `${c} superó el presupuesto` : `${c} llegó al ${Math.round(spent / lim * 100)}%`, sub: `${money(spent)} de ${money(lim)}`, time: `${activeMonth}-01` }); });
  billGroups().overdue.forEach(e => list.push({ type: "alert", title: `Venció: ${e.description}`, sub: `${money(e.amount)} · ${fmtDate(e.dueDate)}`, time: e.dueDate }));
  recurrings.filter(r => r.active !== false && recurringDay(r, nowMonth()) >= day && recurringDay(r, nowMonth()) <= day + 3).forEach(r => list.push({ type: "recurring", title: `${r.name} se acerca`, sub: `Día ${recurringDay(r, nowMonth())} · ${money(r.amount)}`, time: `${nowMonth()}-${pad2(recurringDay(r, nowMonth()))}` }));
  expenses.slice(0, 4).forEach(e => list.push({ type: "expense", title: `Nuevo gasto: ${e.description}`, sub: `${isPendingBill(e) ? "Pendiente" : member(e.payerId).name} · ${money(e.amount)}`, time: e.date }));
  automationRules.filter(r => r.enabled !== false).forEach(r => {
    if (r.type === "largeExpense") { const hit = expenses.find(e => (!r.category || e.category === r.category) && Number(e.amount) >= Number(r.threshold || 100)); if (hit) list.push({ type: "alert", title: "Regla: gasto grande", sub: `${hit.description} · ${money(hit.amount)}`, time: hit.date }); }
    if (r.type === "missingReceipt") { const hit = expenses.find(e => (!r.category || e.category === r.category) && !isPendingBill(e) && Number(e.amount) >= Number(r.threshold || 100) && !expenseAttachments(e).length); if (hit) list.push({ type: "alert", title: "Falta comprobante", sub: `${hit.description} · ${money(hit.amount)}`, time: hit.date }); }
    if (r.type === "budget80") (r.category ? [r.category] : allCategories()).forEach(c => { const lim = Number(budgets[`${activeMonth}_${c}`]?.limit || 0), spent = Number(ct[c] || 0); if (lim && spent / lim >= .8) list.push({ type: "budget", title: `Regla: ${c} al ${Math.round(spent / lim * 100)}%`, sub: `${money(spent)} de ${money(lim)}`, time: `${activeMonth}-01` }); });
    if (r.type === "recurringSoon") { const a = Number(r.threshold || 3); recurrings.filter(x => x.active !== false && recurringDay(x, nowMonth()) >= day && recurringDay(x, nowMonth()) <= day + a).forEach(x => list.push({ type: "recurring", title: `Regla: ${x.name} se acerca`, sub: `Día ${recurringDay(x, nowMonth())} · ${money(x.amount)}`, time: `${nowMonth()}-${pad2(recurringDay(x, nowMonth()))}` })); }
  });
  settlements.filter(s => s.status === "paid").sort((a, b) => (b.paidAt?.seconds || 0) - (a.paidAt?.seconds || 0)).slice(0, 3).forEach(s => list.push({ type: "paid", title: "Pago registrado", sub: `${member(s.from).name} → ${member(s.to).name} · ${money(s.amount)}`, time: `${s.month}-01` }));
  if (!list.length) list.push({ type: "ok", title: "Mi Casa está al día", sub: "No hay avisos importantes.", time: today() });
  return list.sort((a, b) => String(b.time).localeCompare(String(a.time)));
}
const notificationKey = n => `${n.type}|${n.title}|${n.sub}`;
function seenNotifications() { try { return new Set(JSON.parse(safeGet("miCasaSeenNotifs") || "[]")); } catch { return new Set(); } }
function renderNotifications() {
  const list = buildNotifications(), seen = seenNotifications(), unread = list.filter(n => n.type !== "ok" && !seen.has(notificationKey(n))).length;
  const b = $("#notifBadge"); b.textContent = unread > 9 ? "9+" : unread; b.classList.toggle("hidden", !unread);
  const icons = { budget: "pie", alert: "alert", recurring: "repeat", paid: "check", ok: "check", expense: "plus" };
  $("#notificationList").innerHTML = list.map(n => `<div class="feed-item static notif ${n.type} ${seen.has(notificationKey(n)) ? "" : "unread"}"><span class="cat-ic">${ic(icons[n.type] || "bell")}</span><div class="feed-copy"><b>${esc(n.title)}</b><small>${esc(n.sub)}</small></div></div>`).join("");
}
safeDel("miCasaNotificationsSeen");
$("#notifBtn").onclick = () => { renderNotifications(); openSheet("#notificationSheet"); };
$("#markNotificationsRead").onclick = () => { const keys = [...seenNotifications(), ...buildNotifications().map(notificationKey)]; safeSet("miCasaSeenNotifs", JSON.stringify([...new Set(keys)].slice(-200))); renderNotifications(); toast("Avisos marcados como leídos"); };

/* ───────────────────────── navegación ───────────────────────── */
function greeting() { const h = new Date().getHours(); return uiLang === "en" ? (h < 12 ? "Good morning" : h < 19 ? "Good afternoon" : "Good evening") : (h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"); }
function go(view) {
  if (view === "admin" && !canManage()) { view = "home"; toast("Esta sección es para el Owner y los administradores."); }
  if (!$("#" + view + "Page")) view = "home";
  currentView = view;
  $$(".page").forEach(p => p.classList.remove("active", "page-enter")); const page = $("#" + view + "Page"); page.classList.add("active", "page-enter"); setTimeout(() => page.classList.remove("page-enter"), 320);
  $$("[data-view]").forEach(b => { const on = b.dataset.view === view; b.classList.toggle("active", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const titles = { home: homeTitle(), activity: "Gastos", bills: "Cuentas", balances: "Saldos", month: "Calendario", family: "Mi Casa", admin: "Administración", vault: "Comprobantes" };
  $("#pageTitle").textContent = titles[view] || "Mi Casa";
  if (allDataReady()) { if (view === "vault") renderVault(); if (view === "activity") renderActivity(); }
  applyLanguage(); window.scrollTo({ top: 0, behavior: "auto" });
}
$$("[data-view]").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));
$$("[data-jump]").forEach(b => b.addEventListener("click", () => go(b.dataset.jump)));

/* ───────────────────────── tema, idioma, conexión ───────────────────────── */
function applyTheme() {
  const mode = safeGet("miCasaTheme") || "auto", root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", mode);
  const metas = $$("meta[name='theme-color']"); if (mode !== "auto") metas.forEach(m => m.setAttribute("content", mode === "dark" ? "#17120F" : "#F6F0E7")); else { metas[0]?.setAttribute("content", "#F6F0E7"); metas[1]?.setAttribute("content", "#17120F"); }
}
applyTheme();
$("#themeToggle").onclick = () => { const order = ["auto", "light", "dark"], cur = safeGet("miCasaTheme") || "auto", next = order[(order.indexOf(cur) + 1) % 3]; safeSet("miCasaTheme", next); applyTheme(); $("#themeToggleText").textContent = `Tema: ${{ auto: "automático", light: "claro", dark: "oscuro" }[next]}`; };
const EN = {
  "Inicio": "Home", "Gastos": "Expenses", "Cuentas": "Bills", "Saldos": "Balances", "Calendario": "Calendar", "Comprobantes": "Receipts", "Mi Casa": "My Home", "Admin": "Admin", "Registrar": "Add",
  "Hoy": "Today", "7 días": "7 days", "Mes": "Month", "Te deben": "Owed to you", "Tú debes": "You owe", "Presupuesto": "Budget", "HOY": "TODAY", "Qué hay que hacer": "What needs doing", "EXPLORAR": "EXPLORE", "Cómo va la casa": "How home is doing",
  "En qué se gasta": "Where money goes", "Límites": "Limits", "Últimos 7 días": "Last 7 days", "Normal": "Normal", "Día alto": "High day", "La familia este mes": "The family this month", "Ver": "View", "Metas": "Goals", "Ver todas": "View all", "Actividad reciente": "Recent activity", "Ver todo": "View all", "Análisis del mes": "Monthly analysis",
  "Proyección de cierre": "Projected close", "Puedes gastar al día": "Safe to spend per day", "Salud financiera": "Financial health", "Resumen semanal": "Weekly recap", "Comparar meses": "Compare months", "Todo al día": "All caught up",
  "DINERO QUE SE MOVIÓ": "MONEY THAT MOVED", "Agregar": "Add", "Todos": "All", "Pagado": "Paid", "Pendiente": "Pending", "Parcial": "Partial", "Saldado": "Settled", "Cubierto": "Covered", "Vencida": "Overdue", "Con comprobante": "With receipt",
  "Todas las categorías": "All categories", "Todas las personas": "Everyone", "Todos los meses": "All months", "Ver más movimientos": "Show more",
  "POR PAGAR": "TO PAY", "Cuentas pendientes": "Pending bills", "Nueva cuenta": "New bill", "Total pendiente": "Total pending", "Cuentas abiertas": "Open bills", "Vencidas": "Overdue", "Próximo recurrente": "Next recurring", "Vencen esta semana": "Due this week", "Más adelante": "Later", "Sin vencimiento": "No due date", "Pagadas este mes": "Paid this month",
  "ENTRE LA FAMILIA": "WITHIN THE FAMILY", "Registrar pago": "Record payment", "Pagado este mes": "Paid this month", "Pagos registrados": "Recorded payments", "Otros meses sin saldar": "Other months not settled",
  "CIERRE DEL MES": "MONTH CLOSE", "Abierto": "Open", "Cerrado": "Closed", "Reporte PDF": "PDF report", "Exportar CSV": "Export CSV", "Cerrar mes": "Close month", "Reabrir mes": "Reopen month", "Compromisos del mes": "This month's commitments", "Pagos recurrentes": "Recurring payments", "Recurrente": "Recurring", "Al mes": "Monthly", "Al año": "Yearly", "Resumen por persona": "Summary by person",
  "DOCUMENTOS": "DOCUMENTS", "Nuevo gasto": "New expense", "Archivos": "Files", "Este mes": "This month", "NUESTRO HOGAR": "OUR HOME", "Gastos del mes": "This month's spending", "Familia": "Family", "Agregar persona": "Add person", "Quién cubre a quién": "Who covers whom", "Administrar": "Manage", "Metas familiares": "Family goals", "Nueva meta": "New goal", "Reglas de avisos": "Alert rules", "Regla": "Rule", "Tu cuenta": "Your account", "Cambiar contraseña": "Change password", "Cerrar sesión": "Sign out",
  "ADMINISTRACIÓN": "ADMINISTRATION", "Accesos y configuración": "Access & settings", "Invitar persona": "Invite person", "Accesos": "Access", "Herramientas": "Tools", "Presupuestos": "Budgets", "Categorías": "Categories", "Exportar todo": "Export all", "Respaldo completo": "Full backup",
  "¿Qué quieres registrar?": "What do you want to add?", "Gasto pagado": "Paid expense", "Cuenta pendiente": "Pending bill", "Pago entre personas": "Payment between people", "Gasto con foto": "Expense with photo", "Pago recurrente": "Recurring payment", "Cerrar el mes": "Close the month",
  "Cancelar": "Cancel", "Cerrar": "Close", "Guardar": "Save", "Editar": "Edit", "Detalle": "Details", "¿En qué se gastó?": "What was it for?", "Fecha": "Date", "Categoría": "Category", "¿Quién pagó?": "Who paid?", "¿Para quién fue?": "Who was it for?", "Igual": "Equal", "Por monto": "By amount", "Por %": "By %", "Nota": "Note", "Ya se pagó": "Already paid", "Nadie la ha pagado": "Nobody paid yet",
  "Casa": "Home", "Comida": "Food", "Servicios": "Utilities", "Teléfono": "Phone", "Transporte": "Transportation", "Salud": "Health", "Suscripciones": "Subscriptions", "Otros": "Other", "Avisos": "Alerts", "Marcar leído": "Mark read", "Buscar en Mi Casa": "Search Mi Casa", "Anterior": "Previous", "Siguiente": "Next", "Abrir original": "Open original",
  "Entrar": "Sign in", "Activar acceso": "Activate access", "Olvidé mi contraseña": "Forgot my password", "Contraseña": "Password", "Tu nombre": "Your name", "Activar mi acceso": "Activate my access", "Qué bueno verte": "Good to see you", "Activa tu acceso": "Activate your access"
};
function translateText(root = document.body) {
  if (uiLang !== "en") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
  while ((n = walker.nextNode())) { const raw = n.nodeValue, trim = raw.trim(); if (!trim) continue; let out = EN[trim]; if (!out) { for (const [es, en] of Object.entries(EN)) { if (trim.startsWith(es + " ")) { out = en + trim.slice(es.length); break; } } } if (out) n.nodeValue = raw.replace(trim, out); }
  $$("input[placeholder]").forEach(el => { if (EN[el.placeholder]) el.placeholder = EN[el.placeholder]; }); document.documentElement.lang = "en";
}
function applyLanguage() { if (uiLang === "en") translateText(); }
$("#languageToggle").onclick = () => { uiLang = uiLang === "es" ? "en" : "es"; safeSet("miCasaLanguage", uiLang); location.reload(); };
if (uiLang === "en") new MutationObserver(() => translateText()).observe(document.body, { childList: true, subtree: true });
function updateOnline() { $("#offlineBanner").classList.toggle("hidden", navigator.onLine !== false); }
window.addEventListener("online", () => { updateOnline(); showLivePill("Conexión recuperada", "✓"); }); window.addEventListener("offline", updateOnline); updateOnline();

/* ───────────────────────── reportes PDF ───────────────────────── */
let reportType = "global";
const attData = a => a?.data || (a?.id ? attachmentDataCache.get(a.id) : null);
function reportReceiptImages(e) { return expenseAttachments(e).filter(a => String(a.type || "").startsWith("image/") && attData(a)).map((a, i) => `<figure class="receipt-card"><div class="receipt-frame"><img src="${attData(a)}" alt="Comprobante ${i + 1}"></div><figcaption><b>${esc(e.description)}</b><span>${esc(e.date)} · ${money(e.amount)}</span><small>${esc(a.name || `Comprobante ${i + 1}`)}</small></figcaption></figure>`).join(""); }
function reportExpenseRows(list, en = false) { return `<table class="report-table"><thead><tr><th>${en ? "Date" : "Fecha"}</th><th>${en ? "Description" : "Descripción"}</th><th>${en ? "Category" : "Categoría"}</th><th>${en ? "Status" : "Estado"}</th><th>${en ? "Paid by" : "Pagó"}</th><th>${en ? "Participants" : "Participantes"}</th><th class="num">${en ? "Amount" : "Monto"}</th></tr></thead><tbody>${list.map(e => `<tr><td>${esc(e.date)}</td><td><b>${esc(e.description)}</b></td><td>${esc(e.category || "Otros")}</td><td>${esc(en ? { paid: "Paid", pending: "Pending", partial: "Partial", settled: "Settled", covered: "Covered", overdue: "Overdue" }[billState(e)] : statusLabel(billState(e)))}</td><td>${e.payerId ? esc(member(e.payerId).name) : (en ? "Pending" : "Pendiente")}</td><td>${(e.participantIds || []).map(id => esc(member(id).name)).join(", ")}</td><td class="num">${money(e.amount)}</td></tr>`).join("")}</tbody></table>`; }
function proReportShell(body, title, subtitle, en = false) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:Letter;margin:15mm 13mm 16mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#2a211b;background:#fff;font-size:10px;line-height:1.42}.cover{padding:2mm 0 6mm;border-bottom:2px solid #5b3a29;margin-bottom:6mm;display:flex;justify-content:space-between;align-items:flex-end;gap:18px}.brand{display:flex;gap:10px;align-items:center}.brandmark{width:39px;height:39px;border-radius:12px;background:#b5532f;color:#fff;display:grid;place-items:center;font-weight:900;font-size:16px}.brand small{display:block;letter-spacing:.16em;color:#8a7b6f;font-size:7px;font-weight:800}.brand h1{font-size:20px;margin:1px 0 0;font-family:ui-serif,Georgia,serif}.meta{text-align:right;color:#7d6f64}.meta b{display:block;color:#5b3a29;font-size:10px}h2{font-size:14px;margin:0 0 8px;font-family:ui-serif,Georgia,serif}.section{margin:0 0 6mm}.keep{break-inside:avoid}.page-break{break-before:page}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.metric{border:1px solid #e9dfd2;border-radius:12px;padding:10px;min-height:62px;break-inside:avoid}.metric span{display:block;color:#8a7b6f;font-size:7px;text-transform:uppercase;letter-spacing:.07em;font-weight:800}.metric b{display:block;font-size:15px;margin-top:4px}.metric small{color:#8a7b6f}.transfer-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.transfer{border:1px solid #e9dfd2;border-radius:12px;padding:10px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:9px;break-inside:avoid}.transfer .to{text-align:right}.transfer .amount{text-align:center}.transfer .amount b{font-size:13px;display:block}.transfer small{display:block;color:#8a7b6f;font-size:7px}.report-table{width:100%;border-collapse:collapse}.report-table thead{display:table-header-group}.report-table tr{break-inside:avoid}.report-table th{font-size:7px;text-transform:uppercase;letter-spacing:.07em;text-align:left;color:#7d6f64;border-bottom:1.5px solid #ddd0c0;padding:7px 5px}.report-table td{padding:7px 5px;border-bottom:1px solid #eee5da;vertical-align:top}.report-table .num{text-align:right;white-space:nowrap}.positive{color:#2f7d5b}.negative{color:#b4443a}.category-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.category{display:flex;justify-content:space-between;border:1px solid #e9dfd2;border-radius:10px;padding:8px 10px;break-inside:avoid}.category span{color:#7d6f64}.report-empty{border:1px dashed #ddd0c0;border-radius:11px;padding:13px;color:#8a7b6f;text-align:center}.receipt-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;align-items:start}.receipt-card{margin:0;border:1px solid #e9dfd2;border-radius:13px;padding:8px;break-inside:avoid}.receipt-frame{height:245px;display:flex;align-items:center;justify-content:center;background:#f7f2ea;border-radius:9px;overflow:hidden}.receipt-frame img{max-width:100%;max-height:100%;object-fit:contain}.receipt-card figcaption{padding:7px 2px 1px}.receipt-card figcaption b,.receipt-card figcaption span,.receipt-card figcaption small{display:block}.receipt-card figcaption span{color:#6b5d52;margin-top:2px}.receipt-card figcaption small{color:#8a7b6f;margin-top:2px}.footer{margin-top:6mm;padding-top:4mm;border-top:1px solid #eee5da;color:#8a7b6f;font-size:7px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><main class="report"><header class="cover"><div class="brand"><div class="brandmark">⌂</div><div><small>MI CASA · FAMILY FINANCE</small><h1>${esc(title)}</h1></div></div><div class="meta"><b>${esc(subtitle)}</b>${new Date().toLocaleDateString(en ? "en-US" : "es-US", { year: "numeric", month: "long", day: "numeric" })}${isMonthClosed(activeMonth) ? ` · ${en ? "Closed month" : "Mes cerrado"}` : ""}</div></header>${body}<div class="footer">${en ? "Generated by Mi Casa · Household financial report" : "Generado por Mi Casa · Reporte financiero del hogar"} · ${esc(monthLabel(activeMonth))}</div></main></body></html>`;
}
function transfersHTML(list, en) { return list.length ? `<div class="transfer-grid">${list.map(t => `<div class="transfer"><div><b>${esc(member(t.from).name)}</b><small>${en ? "pays" : "paga"}</small></div><div class="amount">→<b>${money(t.amount)}</b></div><div class="to"><b>${esc(member(t.to).name)}</b><small>${en ? "receives" : "recibe"}</small></div></div>`).join("")}</div>` : `<div class="report-empty">${en ? "No pending transfers" : "No hay transferencias pendientes"}</div>`; }
function globalReportHTML(en = false) {
  const { paid, share, balances, paymentsOut } = settledBalanceData(), ex = monthExpenses().slice().sort((a, b) => String(a.date).localeCompare(String(b.date))), plan = balancePlan(), cats = {};
  const paidEx = ex.filter(e => !isPendingBill(e)); paidEx.forEach(e => cats[e.category] = (cats[e.category] || 0) + Number(e.amount || 0));
  const total = totalsFor(paidEx), pendingEx = ex.filter(isPendingBill), pending = totalsFor(pendingEx);
  const people = `<table class="report-table"><thead><tr><th>${en ? "Person" : "Persona"}</th><th class="num">${en ? "Paid expenses" : "Pagó gastos"}</th><th class="num">${en ? "Responsibility" : "Su parte"}</th><th class="num">${en ? "Payments made" : "Pagos hechos"}</th><th class="num">${en ? "Current balance" : "Saldo actual"}</th></tr></thead><tbody>${members.map(m => `<tr><td><b>${esc(m.name)}</b></td><td class="num">${money(paid[m.id] || 0)}</td><td class="num">${money(share[m.id] || 0)}</td><td class="num">${money(paymentsOut[m.id] || 0)}</td><td class="num ${(balances[m.id] || 0) >= 0 ? "positive" : "negative"}">${(balances[m.id] || 0) >= 0 ? "+" : ""}${money(balances[m.id] || 0)}</td></tr>`).join("")}</tbody></table>`;
  const categories = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="category"><span>${esc(c || "Otros")}</span><b>${money(v)}</b></div>`).join("");
  const receipts = ex.map(reportReceiptImages).join("") || `<div class="report-empty">${en ? "No image receipts attached" : "No hay imágenes de comprobantes"}</div>`;
  const body = `<section class="section keep"><div class="metrics"><div class="metric"><span>${en ? "Paid expenses" : "Gastos pagados"}</span><b>${money(total)}</b><small>${paidEx.length} ${en ? "expenses" : "gastos"}</small></div><div class="metric"><span>${en ? "Pending bills" : "Cuentas pendientes"}</span><b>${money(pending)}</b><small>${pendingEx.length} ${en ? "unpaid" : "sin pagar"}</small></div><div class="metric"><span>${en ? "Payments recorded" : "Pagos registrados"}</span><b>${money(settlements.filter(s => s.month === activeMonth && s.status === "paid").reduce((sum, s) => sum + Number(s.amount || 0), 0))}</b><small>${en ? "applied to balances" : "aplicados a saldos"}</small></div><div class="metric"><span>${en ? "Transfers" : "Transferencias"}</span><b>${plan.length}</b><small>${en ? "still pending" : "aún pendientes"}</small></div></div></section><section class="section keep"><h2>${en ? "Who pays whom" : "Quién paga a quién"}</h2><p style="margin:-4px 0 8px;color:#8a7b6f">${balanceMode === "direct" ? (en ? "Direct debts: each person pays whoever paid for them." : "Deudas directas: cada quien le paga a quien pagó por él.") : (en ? "Simplified: debts crossed to minimize transfers." : "Simplificado: deudas cruzadas para hacer menos transferencias.")}</p>${transfersHTML(plan, en)}</section><section class="section"><h2>${en ? "Summary by person" : "Resumen por persona"}</h2>${people}</section><section class="section keep"><h2>${en ? "Spending by category" : "Gastos por categoría"}</h2><div class="category-grid">${categories || `<div class="report-empty">${en ? "No paid expenses" : "Sin gastos pagados"}</div>`}</div></section><section class="section"><h2>${en ? "Pending bills" : "Cuentas pendientes de pago"}</h2>${pendingEx.length ? reportExpenseRows(pendingEx, en) : `<div class="report-empty">${en ? "No pending bills" : "No hay cuentas pendientes"}</div>`}</section><section class="section page-break"><h2>${en ? "Expense detail" : "Detalle completo de gastos"}</h2>${reportExpenseRows(ex, en)}</section><section class="section page-break"><h2>${en ? "Receipts & invoices" : "Comprobantes y facturas"}</h2><div class="receipt-grid">${receipts}</div></section>`;
  return proReportShell(body, en ? "Household Report" : "Reporte global", monthLabel(activeMonth), en);
}
function memberReportHTML(memberId, en = false) {
  const m = member(memberId), { paid, share, balances, paymentsOut } = settledBalanceData(), all = monthExpenses().filter(e => e.payerId === memberId || (e.participantIds || []).includes(memberId)).sort((a, b) => String(a.date).localeCompare(String(b.date))), mine = balancePlan().filter(t => t.from === memberId || t.to === memberId);
  const receipts = all.map(reportReceiptImages).join("") || `<div class="report-empty">${en ? "No image receipts attached" : "No hay imágenes de comprobantes"}</div>`;
  const body = `<section class="section keep"><div class="metrics"><div class="metric"><span>${en ? "Paid" : "Pagó"}</span><b>${money(paid[memberId] || 0)}</b></div><div class="metric"><span>${en ? "Responsibility" : "Su parte"}</span><b>${money(share[memberId] || 0)}</b></div><div class="metric"><span>${en ? "Payments made" : "Pagos hechos"}</span><b>${money(paymentsOut[memberId] || 0)}</b></div><div class="metric"><span>${en ? "Current balance" : "Saldo actual"}</span><b class="${(balances[memberId] || 0) >= 0 ? "positive" : "negative"}">${(balances[memberId] || 0) >= 0 ? "+" : ""}${money(balances[memberId] || 0)}</b></div></div></section><section class="section keep"><h2>${en ? "Who pays whom" : "Quién paga a quién"}</h2>${transfersHTML(mine, en)}</section><section class="section"><h2>${en ? "Expense detail" : "Detalle de gastos"}</h2>${reportExpenseRows(all, en)}</section><section class="section page-break"><h2>${en ? "Receipts & invoices" : "Comprobantes y facturas"}</h2><div class="receipt-grid">${receipts}</div></section>`;
  return proReportShell(body, en ? `${m.name} · Member Report` : `${m.name} · Reporte individual`, monthLabel(activeMonth), en);
}
async function printReportIn(lang) {
  if (reportType === "member" && !$("#reportMemberSelect").value) { toast("Elige una persona."); return; }
  const w = window.open("", "_blank"); if (!w) { toast("Permite ventanas emergentes para generar el PDF."); return; }
  w.document.open(); w.document.write(`<!doctype html><meta charset="utf-8"><title>Mi Casa</title><p style="font:15px system-ui;padding:40px;color:#6b5d52">Preparando el reporte…</p>`); w.document.close();
  const memberId = $("#reportMemberSelect").value, list = monthExpenses().filter(e => reportType !== "member" || e.payerId === memberId || (e.participantIds || []).includes(memberId));
  await Promise.all(list.flatMap(e => expenseAttachments(e).filter(a => a.id && String(a.type || "").startsWith("image/")).map(loadAttachmentData)));
  const html = reportType === "member" ? memberReportHTML(memberId, lang === "en") : globalReportHTML(lang === "en");
  w.document.open(); w.document.write(html); w.document.close();
}
const REPORT_NOTE = { member: "Cuánto pagó, su parte, cuánto debe o recibe, a quién le paga, sus transferencias y sus gastos con comprobantes.", global: "Resumen del mes, categorías, el balance de cada persona, quién paga a quién, pagos registrados, gastos y comprobantes." };
function prepareReportModal(type = "global", memberId = "") {
  reportType = type;
  $("#reportMemberSelect").innerHTML = members.map(m => `<option value="${esc(m.id)}" ${m.id === memberId ? "selected" : ""}>${esc(m.name)}</option>`).join("");
  $$(".report-type").forEach(b => b.classList.toggle("active", b.dataset.reportType === type)); $("#reportMemberWrap").classList.toggle("hidden", type !== "member"); $("#reportPreviewNote").textContent = REPORT_NOTE[type];
  $("#reportLanguageModal").classList.remove("hidden");
}
$$(".report-type").forEach(b => b.onclick = () => { reportType = b.dataset.reportType; $$(".report-type").forEach(x => x.classList.toggle("active", x === b)); $("#reportMemberWrap").classList.toggle("hidden", reportType !== "member"); $("#reportPreviewNote").textContent = REPORT_NOTE[reportType]; });
$("#reportLanguageCancel").onclick = () => $("#reportLanguageModal").classList.add("hidden");
$("#reportSpanish").onclick = () => { $("#reportLanguageModal").classList.add("hidden"); printReportIn("es"); };
$("#reportEnglish").onclick = () => { $("#reportLanguageModal").classList.add("hidden"); printReportIn("en"); };

fillCategorySelects();
applyLanguage();
