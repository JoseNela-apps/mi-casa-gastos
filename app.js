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
import { getFirestore, doc, getDoc, setDoc, addDoc, deleteDoc,updateDoc, collection, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const fb=initializeApp(firebaseConfig),auth=getAuth(fb),db=getFirestore(fb);
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n||0));
const initials=n=>String(n||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("");
const today=()=>new Date().toISOString().slice(0,10), monthKey=d=>(d||today()).slice(0,7);
const nowMonth=()=>monthKey();
let uiLang=localStorage.getItem("miCasaLanguage")||"es";
const monthLabel=k=>{const [y,m]=k.split("-").map(Number);return new Intl.DateTimeFormat(uiLang==="en"?"en-US":"es-US",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,1)))};
const emailKey=e=>encodeURIComponent(String(e||"").trim().toLowerCase());
const CATS=["Casa","Comida","Servicios","Teléfono","Transporte","Salud","Suscripciones","Otros"];
let me=null,householdId=null,household=null,members=[],expenses=[],settlements=[],budgets={},recurrings=[],closings={},goals=[],automationRules=[],coverageRules={},unsubs=[],activeMonth=nowMonth(),currentSplit="equal",attachmentCache=[],homeRange="month",currentView="home",activityPageSize=25,activityKind="all";

const isOwner=()=>!!(me&&household&&household.ownerId===me.uid);
const myMember=()=>members.find(m=>m.authUid===me?.uid)||members.find(m=>m.id===me?.uid)||null;
const member=id=>members.find(m=>m.id===id)||{id,name:"Miembro"};
const PROFILE_COLORS=["#4a90e2","#55b78a","#8b7bd8","#ef9b68","#e77e9f","#4fa8b8"];
function memberAvatar(m,size=""){m=m||{};const style=`${m.accentColor?`--avatar-accent:${m.accentColor};`:""}`;if(m.avatarData)return `<span class="avatar ${size} has-photo" style="${style}"><img src="${m.avatarData}" alt="${esc(m.name||"Perfil")}"></span>`;if(m.avatarPreset&&m.avatarPreset!=="initials")return `<span class="avatar ${size} preset-avatar" style="${style}">${esc(m.avatarPreset)}</span>`;return `<span class="avatar ${size}" style="${style}">${esc(initials(m.name))}</span>`}
function categoryIcon(c){return {Casa:"⌂",Comida:"●",Servicios:"ϟ",Teléfono:"▣",Transporte:"◆",Salud:"＋",Suscripciones:"↻",Otros:"•"}[c]||"•"}
function categoryClass(c){return {Casa:"home",Comida:"food",Servicios:"utilities",Teléfono:"phone",Transporte:"transport",Salud:"health",Suscripciones:"subs",Otros:"other"}[c]||"other"}


let livePillTimer=null;
function showLivePill(msg,icon="✓"){const p=$("#livePill");if(!p)return;$("#livePillText").textContent=msg;$("#livePillIcon").textContent=icon;p.classList.add("show");clearTimeout(livePillTimer);livePillTimer=setTimeout(()=>p.classList.remove("show"),2600)}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");showLivePill(msg,/error|No se|no pudo|incorrect/i.test(msg)?"!":"✓");setTimeout(()=>t.classList.remove("show"),2400)}
function authError(err){const map={"auth/email-already-in-use":"Ese email ya tiene una cuenta.","auth/invalid-credential":"Email o contraseña incorrectos.","auth/weak-password":"La contraseña necesita al menos 6 caracteres.","auth/invalid-email":"Revisa el email."};$("#authError").textContent=map[err.code]||err.message||"Ocurrió un error."}
function showOnly(id){["authView","setupView","appView"].forEach(x=>$("#"+x).classList.toggle("hidden",x!==id))}
function clearSubs(){unsubs.forEach(f=>f());unsubs=[]}

$("#loginTab").onclick=()=>{$("#loginTab").classList.add("active");$("#registerTab").classList.remove("active");$("#loginForm").classList.remove("hidden");$("#registerForm").classList.add("hidden");$("#authError").textContent=""};
$("#registerTab").onclick=()=>{$("#registerTab").classList.add("active");$("#loginTab").classList.remove("active");$("#registerForm").classList.remove("hidden");$("#loginForm").classList.add("hidden");$("#authError").textContent=""};
$("#loginForm").onsubmit=async e=>{e.preventDefault();$("#authError").textContent="";try{await signInWithEmailAndPassword(auth,$("#loginEmail").value.trim(),$("#loginPassword").value)}catch(err){authError(err)}};
$("#registerForm").onsubmit=async e=>{e.preventDefault();$("#authError").textContent="";const name=$("#registerName").value.trim(),email=$("#registerEmail").value.trim().toLowerCase(),password=$("#registerPassword").value;try{const inv=await getDoc(doc(db,"invites",emailKey(email)));if(!inv.exists()){throw {message:"Este email no fue autorizado por el administrador."}}const c=await createUserWithEmailAndPassword(auth,email,password);await updateProfile(c.user,{displayName:name});await setDoc(doc(db,"users",c.user.uid),{name,email:c.user.email,householdId:null,createdAt:serverTimestamp()});me=c.user;await claimMyInvite()}catch(err){authError(err)}};
$("#forgotPassword").onclick=async()=>{const email=$("#loginEmail").value.trim();if(!email){$("#authError").textContent="Escribe primero tu email.";return}try{await sendPasswordResetEmail(auth,email);$("#authError").textContent="Te enviamos un enlace de restablecimiento."}catch(err){authError(err)}};
$("#setupLogout").onclick=()=>signOut(auth);$("#logoutBtn").onclick=()=>signOut(auth);

async function claimMyInvite(){
  if(!me?.email)return false;
  const ref=doc(db,"invites",emailKey(me.email)),snap=await getDoc(ref); if(!snap.exists())return false;
  const inv=snap.data(); if(String(inv.email||"").toLowerCase()!==me.email.toLowerCase())return false;
  await setDoc(doc(db,"households",inv.householdId,"members",inv.memberId),{authUid:me.uid,email:me.email,inviteStatus:"active",joinedAt:serverTimestamp()},{merge:true});
  await setDoc(doc(db,"users",me.uid),{name:me.displayName||me.email.split("@")[0],email:me.email,householdId:inv.householdId,memberId:inv.memberId,joinedAt:serverTimestamp()},{merge:true});
  await deleteDoc(ref);householdId=inv.householdId;await startApp();toast("¡Bienvenido a Mi Casa! ✓");return true;
}
$("#claimInviteBtn").onclick=async()=>{try{if(!(await claimMyInvite()))toast("No encontramos una invitación para este email.")}catch(err){console.error(err);toast("No se pudo aceptar la invitación.")}};

onAuthStateChanged(auth,async user=>{clearSubs();me=user;householdId=null;household=null;members=[];expenses=[];settlements=[];recurrings=[];budgets={};closings={};if(!user){showOnly("authView");return}try{const uref=doc(db,"users",user.uid);let us=await getDoc(uref);if(!us.exists()){await setDoc(uref,{name:user.displayName||user.email.split("@")[0],email:user.email,householdId:null,createdAt:serverTimestamp()});us=await getDoc(uref)}householdId=us.data().householdId||null;if(!householdId){if(await claimMyInvite())return;showOnly("setupView");return}await startApp()}catch(err){console.error(err);toast("No pudimos cargar tu cuenta.")}});

async function startApp(){
  showOnly("appView");
  const h=await getDoc(doc(db,"households",householdId));if(!h.exists()){toast("No encontramos el hogar.");return}
  household={id:h.id,...h.data()};
  $("#sideHouse").textContent=household.name||"Mi Casa";$("#sideName").textContent=me.displayName||me.email;$("#sideAvatar").textContent=initials(me.displayName||me.email);
  $("#adminNav")?.classList.toggle("hidden",!isOwner());$$(".owner-only").forEach(x=>x.classList.toggle("hidden",!isOwner()));$(".side-user small").textContent=isOwner()?"Owner":"Member";
  $("#monthEyebrow").textContent=monthLabel(activeMonth).toUpperCase();$("#statementMonth").textContent=cap(monthLabel(activeMonth));
  beginInitialLoad();
  unsubs.push(onSnapshot(collection(db,"households",householdId,"members"),s=>{members=s.docs.map(d=>({id:d.id,...d.data()}));markDataReady("members")},e=>streamFailed("members",e)));
  unsubs.push(onSnapshot(query(collection(db,"households",householdId,"expenses"),orderBy("date","desc")),s=>{expenses=s.docs.map(d=>({id:d.id,...d.data()}));markDataReady("expenses")},e=>streamFailed("expenses",e)));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"settlements"),s=>{settlements=s.docs.map(d=>({id:d.id,...d.data()}));markDataReady("settlements")},e=>streamFailed("settlements",e)));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"budgets"),s=>{budgets={};s.docs.forEach(d=>budgets[d.id]=d.data());markDataReady("budgets")},e=>streamFailed("budgets",e)));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"recurring"),s=>{recurrings=s.docs.map(d=>({id:d.id,...d.data()}));markDataReady("recurring")},e=>streamFailed("recurring",e)));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"monthlyClosings"),s=>{closings={};s.docs.forEach(d=>closings[d.id]=d.data());markDataReady("closings")},e=>streamFailed("closings",e)));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"goals"),s=>{goals=s.docs.map(d=>({id:d.id,...d.data()}));markDataReady("goals")},e=>streamFailed("goals",e)));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"automationRules"),s=>{automationRules=s.docs.map(d=>({id:d.id,...d.data()}));markDataReady("automations")},e=>streamFailed("automations",e)));
  unsubs.push(onSnapshot(doc(db,"households",householdId,"settings","coverage"),s=>{coverageRules=s.exists()?(s.data().rules||{}):{};markDataReady("coverage")},e=>streamFailed("coverage",e)));
}


let renderTimer=null;
let dataReady={members:false,expenses:false,settlements:false,budgets:false,recurring:false,closings:false,goals:false,automations:false,coverage:false};
function beginInitialLoad(){
  dataReady={members:false,expenses:false,settlements:false,budgets:false,recurring:false,closings:false,goals:false,automations:false,coverage:false};
  document.body.classList.add("app-loading");
}
function allDataReady(){return Object.values(dataReady).every(Boolean)}
function markDataReady(key){dataReady[key]=true;scheduleRender()}
function streamFailed(key,error){
  console.error(`Mi Casa: ${key} could not load`,error);
  dataReady[key]=true;
  scheduleRender();
  if(key==="budgets"||key==="recurring") console.warn(`Optional ${key} stream unavailable; core UI will continue.`);
}
function scheduleRender(){
  if(!allDataReady())return;
  clearTimeout(renderTimer);
  renderTimer=setTimeout(()=>{renderTimer=null;document.body.classList.remove("app-loading");renderAll()},55);
}

const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s;
function monthExpenses(key=activeMonth){return expenses.filter(x=>monthKey(x.date)===key)}
function paidMonthExpenses(key=activeMonth){return monthExpenses(key).filter(e=>e.paymentStatus!=="pending"&&e.payerId)}
function pendingMonthBills(key=activeMonth){return monthExpenses(key).filter(e=>e.paymentStatus==="pending"||!e.payerId)}
function pendingBillsTotal(key=activeMonth){return pendingMonthBills(key).reduce((s,e)=>s+Number(e.amount||0),0)}
function prevMonthKey(key){const [y,m]=key.split("-").map(Number),d=new Date(Date.UTC(y,m-2,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`}
function expenseShares(e){if(e.shares&&Object.keys(e.shares).length)return e.shares;const ids=e.participantIds||[];if(!ids.length)return {};const each=Number(e.amount||0)/ids.length;return Object.fromEntries(ids.map(id=>[id,each]))}
function effectiveExpenseShares(e){const original=expenseShares(e),effective={};for(const [id,val] of Object.entries(original)){const coverer=e.useCoverage===true?(coverageRules[id]||id):id;const target=members.some(m=>m.id===coverer)?coverer:id;effective[target]=(effective[target]||0)+Number(val||0)}return effective}
function coverageTextForExpense(e){if(e.useCoverage!==true)return "Sin cobertura familiar";const moves=[];Object.keys(expenseShares(e)).forEach(id=>{const c=coverageRules[id];if(c&&c!==id)moves.push(`${member(c).name} cubre a ${member(id).name}`)});return [...new Set(moves)].join(" · ")}
function calc(key=activeMonth){const paid={},share={},originalShare={};members.forEach(m=>{paid[m.id]=0;share[m.id]=0;originalShare[m.id]=0});for(const e of paidMonthExpenses(key)){paid[e.payerId]=(paid[e.payerId]||0)+Number(e.amount||0);for(const [id,v] of Object.entries(expenseShares(e)))originalShare[id]=(originalShare[id]||0)+Number(v||0);for(const [id,v] of Object.entries(effectiveExpenseShares(e)))share[id]=(share[id]||0)+Number(v||0)}const balances={};members.forEach(m=>balances[m.id]=(paid[m.id]||0)-(share[m.id]||0));return{paid,share,originalShare,balances}}
function settledBalanceData(key=activeMonth){
  const base=calc(key),balances={...base.balances},paymentsOut={},paymentsIn={};
  members.forEach(m=>{paymentsOut[m.id]=0;paymentsIn[m.id]=0});
  settlements.filter(s=>s.month===key&&s.status==="paid").forEach(s=>{
    const amount=Number(s.amount||0);
    balances[s.from]=(balances[s.from]||0)+amount;
    balances[s.to]=(balances[s.to]||0)-amount;
    paymentsOut[s.from]=(paymentsOut[s.from]||0)+amount;
    paymentsIn[s.to]=(paymentsIn[s.to]||0)+amount;
  });
  return {...base,balances,paymentsOut,paymentsIn};
}

function settlementPlan(){const {balances}=settledBalanceData();let debt=Object.entries(balances).filter(([,v])=>v<-.005).map(([id,v])=>({id,a:-v})).sort((a,b)=>b.a-a.a),cred=Object.entries(balances).filter(([,v])=>v>.005).map(([id,v])=>({id,a:v})).sort((a,b)=>b.a-a.a),out=[],i=0,j=0;while(i<debt.length&&j<cred.length){const a=Math.min(debt[i].a,cred[j].a);out.push({from:debt[i].id,to:cred[j].id,amount:a});debt[i].a-=a;cred[j].a-=a;if(debt[i].a<.005)i++;if(cred[j].a<.005)j++}return out}
function totalBudget(){return CATS.reduce((s,c)=>s+Number(budgets[`${activeMonth}_${c}`]?.limit||0),0)}
function catTotals(){const o={};monthExpenses().forEach(e=>o[e.category]=(o[e.category]||0)+Number(e.amount||0));return o}

function startOfLocalDay(d=new Date()){return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
function rangeExpenses(){
  if(homeRange==="month")return monthExpenses();
  const now=startOfLocalDay(),start=homeRange==="today"?now:new Date(now.getFullYear(),now.getMonth(),now.getDate()-6);
  return expenses.filter(e=>{if(!e.date)return false;const d=new Date(e.date+"T12:00:00");return d>=start&&d<=new Date(now.getTime()+86399999)});
}
function totalsFor(ex){return ex.reduce((s,e)=>s+Number(e.amount||0),0)}
function catsFor(ex){const o={};ex.forEach(e=>o[e.category]=(o[e.category]||0)+Number(e.amount||0));return o}
function rangeLabel(){return homeRange==="today"?"HOY":homeRange==="week"?"ÚLTIMOS 7 DÍAS":"ESTE MES"}
function addMonths(key,delta){const [y,m]=key.split("-").map(Number),d=new Date(y,m-1+delta,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
function expenseAttachments(e){const a=[...(e.attachments||[])];if(!a.length&&e.receiptData)a.push({name:e.receiptName||"Comprobante",type:e.receiptType||"",data:e.receiptData});return a}
function receiptExpenseCount(){return expenses.filter(e=>expenseAttachments(e).length).length}
function receiptFileCount(){return expenses.reduce((n,e)=>n+expenseAttachments(e).length,0)}

function budgetSettings(){return budgets[`${activeMonth}__settings`]||{}}
function globalBudgetLimit(){return Number(budgetSettings().globalLimit||totalBudget()||0)}
function weeklyBudgetLimit(){return Number(budgetSettings().weeklyLimit||0)}
function daysInMonth(key=activeMonth){const [y,m]=key.split("-").map(Number);return new Date(y,m,0).getDate()}
function daysElapsedInActiveMonth(){if(activeMonth<nowMonth())return daysInMonth(activeMonth);if(activeMonth>nowMonth())return 0;return new Date().getDate()}
function forecastMonthTotal(){const total=totalsFor(monthExpenses()),elapsed=Math.max(1,daysElapsedInActiveMonth());return activeMonth===nowMonth()?total/elapsed*daysInMonth(activeMonth):total}
function safeToSpendAmount(){const limit=globalBudgetLimit();if(!limit)return null;const spent=totalsFor(monthExpenses()),left=Math.max(1,daysInMonth()-Math.min(daysInMonth(),daysElapsedInActiveMonth())+1);return Math.max(0,limit-spent)/left}
function currentWeekExpenses(){const now=startOfLocalDay(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6);return expenses.filter(e=>e.date&&new Date(e.date+"T12:00:00")>=start&&new Date(e.date+"T12:00:00")<=new Date(now.getTime()+86399999))}
function topCategoryFor(ex){return Object.entries(catsFor(ex)).sort((a,b)=>b[1]-a[1])[0]||null}
function nextRecurringSummary(){const d=new Date().getDate(),up=recurrings.filter(r=>r.active&&Number(r.day)>=d).sort((a,b)=>a.day-b.day)[0]||recurrings.filter(r=>r.active).sort((a,b)=>a.day-b.day)[0];return up?{title:up.name,sub:`Día ${up.day} · ${money(up.amount)}`}:{title:"—",sub:"Sin recurrentes"}}
function financialHealth(){const limit=globalBudgetLimit(),forecast=forecastMonthTotal(),pending=settlementPlan().length;let score=100,reasons=[];if(limit){if(forecast>limit*1.15){score-=35;reasons.push("proyección sobre presupuesto")}else if(forecast>limit){score-=22;reasons.push("proyección ajustada")}else reasons.push("presupuesto bajo control")}else{score-=10;reasons.push("sin presupuesto global")}if(pending>3){score-=16;reasons.push(`${pending} saldos pendientes`)}else if(pending){score-=7;reasons.push(`${pending} saldos por resolver`)}score=Math.max(20,Math.min(100,score));return {score,label:score>=85?"Dentro del plan":score>=68?"Atención moderada":"Necesita atención",reasons}}
function automationLabel(r){if(r.type==="budget80")return `${r.category||"Una categoría"} al 80% del presupuesto`;if(r.type==="largeExpense")return `Gasto mayor a ${money(r.threshold||100)}`;if(r.type==="missingReceipt")return `Pedir comprobante sobre ${money(r.threshold||100)}`;if(r.type==="recurringSoon")return `Avisar ${Number(r.threshold||3)} días antes`;return "Regla inteligente"}



function renderAll(){
  if(!householdId)return;
  const mex=monthExpenses(),monthTotalValue=totalsFor(mex),homeEx=rangeExpenses(),homeTotal=totalsFor(homeEx),settled=settledBalanceData(),{paid,share}=settled,balances=settled.balances,mine=myMember(),myBal=mine?balances[mine.id]||0:0;
  const heroValue=!isOwner()&&homeRange==="month"&&mine?Number(share[mine.id]||0):homeTotal;
  $("#monthTotal").textContent=money(heroValue);$("#movementCount").textContent=`${homeEx.length} ${homeEx.length===1?"movimiento":"movimientos"}`;$("#owedToMe").textContent=money(Math.max(0,myBal));$("#iOwe").textContent=money(Math.max(0,-myBal));
  const hk=$("#heroKicker");if(hk)hk.textContent=!isOwner()&&homeRange==="month"?`TU PARTE · ${rangeLabel()}`:`GASTO FAMILIAR · ${rangeLabel()}`;
  const mg=$("#mobileGreeting");if(mg){const first=(myMember()?.name||me?.displayName||"familia").split(" ")[0];mg.textContent=isOwner()?`Mi Casa · ${first}`:`Hola, ${first} 👋`}
  const familyStack=$("#familyAvatarStack");if(familyStack)familyStack.innerHTML=members.slice(0,6).map(m=>`<button class="hero-member-avatar" data-person="${esc(m.id)}" title="${esc(m.name)}">${memberAvatar(m,"hero-avatar")}</button>`).join("");
  $("#familyCount")&&($("#familyCount").textContent=`${members.length} personas en Mi Casa`);
  const mobileAvatar=$("#mobileProfileAvatar"),mmNow=myMember();if(mobileAvatar&&mmNow)mobileAvatar.innerHTML=memberAvatar(mmNow,"nav-avatar");
  const prevTotal=monthExpenses(prevMonthKey(activeMonth)).reduce((s,e)=>s+Number(e.amount||0),0);
  renderPremiumCharts(homeTotal,prevTotal,homeEx);
  const status=$("#familyStatusMessage");if(status)status.textContent=monthTotalValue?`${members.length} personas · ${mex.length} movimientos registrados este mes.`:`${members.length} personas listas para organizar los gastos de la casa.`;
  const pulse=$("#familyPulse");if(pulse){const planNow=settlementPlan(),tbNow=totalBudget(),remain=tbNow-monthTotalValue;pulse.innerHTML=`<div class="pulse-row"><span>◎</span><div><b>${planNow.length?planNow.length+" pagos por resolver":"Todo saldado"}</b><small>${planNow.length?"Revisa Saldos para mantener la casa al día.":"No hay transferencias pendientes."}</small></div></div><div class="pulse-row"><span>⌂</span><div><b>${tbNow?(remain>=0?money(remain)+" disponibles":money(Math.abs(remain))+" sobre presupuesto"):"Presupuesto sin configurar"}</b><small>${tbNow?"Según los límites definidos para este mes.":"Puedes definir límites por categoría."}</small></div></div><div class="pulse-row"><span>▧</span><div><b>${expenses.filter(e=>((e.attachments&&e.attachments.length)||e.receiptData)).length} gastos con comprobante</b><small>Las fotos y PDFs pueden abrirse desde cada gasto.</small></div></div>`}
  $("#statementTotal").textContent=money(monthTotalValue);
  const closed=!!closings[activeMonth];$("#statementMeta").textContent=`${mex.length} gastos · ${closed?"Mes cerrado":"Mes abierto"}`;$("#closeMonthBtn").textContent=closed?"Reabrir mes":"Cerrar mes";

  $("#monthTrend").textContent=prevTotal?`${monthTotalValue<=prevTotal?"↓":"↑"} ${Math.abs((monthTotalValue-prevTotal)/prevTotal*100).toFixed(0)}% vs. mes anterior`:"Primer mes con datos";
  const tb=totalBudget(),pct=tb?Math.min(100,monthTotalValue/tb*100):0;$("#budgetUsed").textContent=tb?`${Math.round(pct)}% · ${money(monthTotalValue)} / ${money(tb)}`:"Sin presupuesto";$("#budgetProgress").style.width=`${pct}%`;

  renderInsights(monthTotalValue,prevTotal,paid,balances);
  $("#peopleStrip").innerHTML=members.map(m=>`<button class="family-person-card" data-person="${esc(m.id)}" style="--member-accent:${esc(m.accentColor||"#4a90e2")}">${memberAvatar(m,"family-xl")}<span><small>${m.authUid===me?.uid?"TÚ":"MIEMBRO"}</small><b>${esc(m.name)}</b><em>${balances[m.id]>0.005?"Recibe "+money(balances[m.id]):balances[m.id]<-.005?"Debe "+money(-balances[m.id]):"Saldado ✓"}</em></span><div class="family-person-metrics"><i>Pagó ${money(paid[m.id]||0)}</i><i>Parte ${money(share[m.id]||0)}</i></div></button>`).join("");
  $$(".family-person-card,.hero-member-avatar").forEach(b=>b.onclick=()=>openMemberDetail(b.dataset.person));
  setupSnapCarousel($("#peopleStrip"));
  $$(".person-card").forEach(b=>b.onclick=()=>openMemberDetail(b.dataset.person));

  const plan=settlementPlan();$("#settlementPreview").innerHTML=plan.length?plan.slice(0,2).map(settleHTML).join(""):`<div class="empty"><b>Todo saldado ✓</b>No hay pagos pendientes.</div>`;
  const pendingBillsNow=pendingMonthBills(),pendingBillsAmount=pendingBillsNow.reduce((s,e)=>s+Number(e.amount||0),0);
  if($("#homePendingBills"))$("#homePendingBills").textContent=`${pendingBillsNow.length} cuenta${pendingBillsNow.length===1?"":"s"} pendiente${pendingBillsNow.length===1?"":"s"}`;
  if($("#homePendingBillsAmount"))$("#homePendingBillsAmount").textContent=`${money(pendingBillsAmount)} por pagar`;
  if($("#homeOpenBalances"))$("#homeOpenBalances").textContent=plan.length?`${plan.length} saldo${plan.length===1?"":"s"} por resolver`:"Todo saldado ✓";
  if($("#homeOpenBalancesAmount"))$("#homeOpenBalancesAmount").textContent=plan.length?`${money(plan.reduce((s,p)=>s+Number(p.amount||0),0))} pendiente`:"Sin transferencias pendientes";
  const currentMember=myMember(),currentBalance=currentMember?balances[currentMember.id]||0:0;
  if($("#balancesReceivable"))$("#balancesReceivable").textContent=money(Math.max(0,currentBalance));
  if($("#balancesPayable"))$("#balancesPayable").textContent=money(Math.max(0,-currentBalance));
  const paidSettlements=settlements.filter(s=>s.month===activeMonth&&s.status==="paid").reduce((sum,s)=>sum+Number(s.amount||0),0);
  if($("#balancesPaidMonth"))$("#balancesPaidMonth").textContent=money(paidSettlements);
  $("#settlementList").innerHTML=plan.length?plan.map((p,i)=>settleHTML(p,true,i)).join(""):`<div class="empty"><b>Todo saldado ✓</b>No hay pagos pendientes este mes.</div>`;
  $$(".mark-paid").forEach(b=>b.onclick=()=>markSettlement(Number(b.dataset.index)));
  $$("#settlementList .premium-settle-card").forEach((el,i)=>bindSwipeGesture(el,null,()=>markSettlement(i)));
  const hist=settlements.filter(s=>s.month===activeMonth&&s.status==="paid").sort((a,b)=>(b.paidAt?.seconds||0)-(a.paidAt?.seconds||0));
  $("#settlementHistory").innerHTML=hist.length?hist.map(s=>`<div class="feed-item"><div class="cat-icon">✓</div><div class="feed-copy"><b>${esc(member(s.from).name)} → ${esc(member(s.to).name)}</b><small>${esc(s.method||"Pago")}${s.expenseDescription?` · ${esc(s.expenseDescription)}`:""} · registrado</small></div><div class="feed-amount"><b>${money(s.amount)}</b><small>${s.expenseId?"Cuenta saldada":"Pago"}</small></div></div>`).join(""):`<div class="empty"><b>Sin pagos registrados</b>Los pagos registrados aparecerán aquí.</div>`;

  renderCategories(homeTotal,homeEx);
  renderActivity();
  renderBills();
  renderMembers(paid,share,balances);
  if($("#familyHubTitle"))$("#familyHubTitle").textContent=household?.name||"Mi Casa";
  if($("#familyHubTotal"))$("#familyHubTotal").textContent=money(monthTotalValue);
  if($("#familyHubStatus"))$("#familyHubStatus").textContent=settlementPlan().length?`${settlementPlan().length} pagos por resolver este mes`:`${members.length} personas · Todo al día`;
  if($("#familyHubAvatars"))$("#familyHubAvatars").innerHTML=members.map(m=>memberAvatar(m,"hub-avatar")).join("");
  renderCalendar();
  fillMemberControls();
  const qb=$("#quickBudget");if(qb){const b=qb.querySelector("b"),s=qb.querySelector("small");if(!isOwner()){if(b)b.textContent="Mi perfil";if(s)s.textContent="Personalizar"}else{if(b)b.textContent="Presupuesto";if(s)s.textContent="Límites"}}
  const vc=$("#vaultCountHome");if(vc)vc.textContent=`${receiptFileCount()} ${receiptFileCount()===1?"archivo guardado":"archivos guardados"}`;
  renderNotifications();
  renderIntelligence();renderGoals();renderSubscriptions();renderAutomations();renderCoverageSummary();
  if(currentView==="vault")renderVault();
}


function renderPremiumCharts(total,prevTotal,ex=rangeExpenses()){
  const daily={};ex.forEach(e=>{const d=Number(String(e.date||"").slice(-2));if(d)daily[d]=(daily[d]||0)+Number(e.amount||0)});
  const vals=Array.from({length:31},(_,i)=>daily[i+1]||0),max=Math.max(1,...vals),w=620,h=118;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1))*w},${h-(v/max)*(h-20)-8}`).join(" ");
  const chart=$("#heroSparkChart");if(chart)chart.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#77d9a7" stop-opacity=".36"/><stop offset="100%" stop-color="#77d9a7" stop-opacity="0"/></linearGradient></defs><polygon points="0,${h} ${pts} ${w},${h}" fill="url(#areaFill)"/><polyline points="${pts}" fill="none" stroke="#49a978" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const maxLabel=$("#heroChartMax");if(maxLabel)maxLabel.textContent=money(max);
  const now=new Date(),week=[0,0,0,0,0,0,0];ex.forEach(e=>{const d=new Date((e.date||today())+"T12:00:00");const diff=Math.floor((now-d)/(86400000));if(diff>=0&&diff<7)week[6-diff]+=Number(e.amount||0)});
  const wm=Math.max(1,...week),names=["L","M","M","J","V","S","D"],avg=week.reduce((a,b)=>a+b,0)/7;
  const bars=$("#weeklyBars");if(bars)bars.innerHTML=week.map((v,i)=>`<div class="week-col"><div class="week-track"><i class="${v>avg*1.45&&v>0?"high":""}" style="height:${Math.max(v?12:3,(v/wm)*100)}%"></i></div><b>${names[i]}</b><small>${v?money(v).replace(".00",""):""}</small></div>`).join("");
  const wt=$("#weekTotal");if(wt)wt.textContent=money(week.reduce((a,b)=>a+b,0));
  const cats=catsFor(ex),top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0],si=$("#smartInsight"),ss=$("#smartInsightSub");
  if(si){if(!total){si.textContent="Tu primer insight aparecerá con el primer gasto.";ss.textContent="Mi Casa aprenderá de tus movimientos mensuales."}
    else if(prevTotal){const diff=total-prevTotal,pct=Math.abs(diff)/(prevTotal||1)*100;si.textContent=`Este mes gastaron ${pct.toFixed(0)}% ${diff<=0?"menos":"más"} que el mes anterior.`;ss.textContent=`Diferencia de ${money(Math.abs(diff))}${top?` · ${top[0]} lidera el gasto.`:""}`}
    else{si.textContent=top?`${top[0]} es la categoría principal este mes.`:"Tu casa está tomando forma.";ss.textContent=top?`${money(top[1])} registrados en ${top[0]}.`:"Sigue registrando movimientos para ver tendencias."}}
}
function renderInsights(total,prevTotal,paid,balances){
  const cats=catTotals(),top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0],bigPayer=Object.entries(paid).sort((a,b)=>b[1]-a[1])[0],open=settlementPlan().length;
  const items=[
    top?`<div class="insight"><span>◔</span><div><b>${esc(top[0])} es la categoría principal</b><small>${money(top[1])} este mes</small></div></div>`:`<div class="insight"><span>◔</span><div><b>Aún no hay gastos</b><small>Tu primer insight aparecerá aquí.</small></div></div>`,
    prevTotal?`<div class="insight"><span>${total<=prevTotal?"↓":"↑"}</span><div><b>${total<=prevTotal?"Gastaron menos":"Gastaron más"} que el mes anterior</b><small>${money(Math.abs(total-prevTotal))} de diferencia</small></div></div>`:`<div class="insight"><span>◎</span><div><b>Construyendo historial</b><small>El próximo mes tendremos comparación.</small></div></div>`,
    bigPayer?`<div class="insight"><span>★</span><div><b>${esc(member(bigPayer[0]).name)} adelantó más dinero</b><small>${money(bigPayer[1])} pagados</small></div></div>`:"",
    `<div class="insight"><span>⇄</span><div><b>${open?open+" pagos pendientes":"Todo está saldado"}</b><small>${open?"Puedes registrarlos en Saldos.":"No hay transferencias por hacer."}</small></div></div>`
  ].filter(Boolean);$("#insightsGrid").innerHTML=items.join("");
}
function renderCategories(total,source=rangeExpenses()){
  const cats=catsFor(source),entries=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  $("#categoryList").innerHTML=entries.length?entries.slice(0,8).map(([k,v])=>{const lim=Number(budgets[`${activeMonth}_${k}`]?.limit||0),p=lim?Math.min(100,v/lim*100):total?Math.max(6,v/total*100):0;return `<button type="button" class="space-card ${categoryClass(k)}" data-space="${esc(k)}"><div class="space-icon">${categoryIcon(k)}</div><span>${esc(k)}</span><b>${money(v)}</b><small>${lim?`${Math.round(v/lim*100)}% de ${money(lim)}`:`${Math.round(v/(total||1)*100)}% del período`}</small><div class="space-wave"><i style="width:${p}%"></i></div></button>`}).join(""):`<div class="empty premium-empty"><b>Tu casa está lista</b>Agrega el primer gasto para ver tus espacios financieros.</div>`;
  $$(".space-card[data-space]").forEach(b=>b.onclick=()=>openSpaceDetail(b.dataset.space));
}
function renderActivity(){
  const q=($("#activitySearch")?.value||"").toLowerCase(),cat=$("#activityCategory")?.value||"";
  const filtered=expenses.filter(e=>(!q||String(e.description).toLowerCase().includes(q))&&(!cat||e.category===cat)&&(activityKind==="all"||(activityKind==="paid"&&e.paymentStatus!=="pending"&&e.payerId)||(activityKind==="receipt"&&expenseAttachments(e).length)));
  const empty=`<div class="empty"><b>No hay movimientos</b>No encontramos gastos con esos filtros.</div>`;
  const visible=filtered.slice(0,activityPageSize);
  if($("#activityList"))$("#activityList").innerHTML=visible.length?visible.map(feedHTML).join(""):empty;
  if($("#recentList"))$("#recentList").innerHTML=expenses.length?expenses.slice(0,5).map(feedHTML).join(""):`<div class="empty"><b>No hay gastos todavía</b>Toca “Nuevo gasto” para comenzar.</div>`;
  const more=$("#activityLoadMore");if(more){more.classList.toggle("hidden",visible.length>=filtered.length);more.textContent=`Ver más movimientos (${filtered.length-visible.length})`}
  $$(".feed-item[data-id]").forEach(el=>{const e=expenses.find(x=>x.id===el.dataset.id);el.onclick=()=>openExpense(e);bindExpenseGesture(el,e);bindLongPress(el,()=>openTransactionActions(e))});
}
$("#activitySearch").addEventListener("input",()=>{activityPageSize=25;renderActivity()});$("#activityCategory").addEventListener("change",()=>{activityPageSize=25;renderActivity()});
$("#activityLoadMore")?.addEventListener("click",()=>{activityPageSize+=25;renderActivity()});
$$("#activityChips [data-activity-kind]").forEach(b=>b.addEventListener("click",()=>{activityKind=b.dataset.activityKind;activityPageSize=25;$$("#activityChips button").forEach(x=>x.classList.toggle("active",x===b));renderActivity()}));


function renderBills(){
  const pending=pendingMonthBills().slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const total=pending.reduce((s,e)=>s+Number(e.amount||0),0),next=nextRecurringSummary();
  if($("#billsPendingTotal"))$("#billsPendingTotal").textContent=money(total);
  if($("#billsPendingCount"))$("#billsPendingCount").textContent=String(pending.length);
  if($("#billsNextRecurring"))$("#billsNextRecurring").textContent=next.title==="—"?"—":`${next.title} · ${next.sub}`;
  if($("#pendingBillsList"))$("#pendingBillsList").innerHTML=pending.length?pending.map(e=>`<button class="bill-card" data-bill="${esc(e.id)}"><span class="bill-icon">${categoryIcon(e.category)}</span><div><b>${esc(e.description)}</b><small>${esc(e.category||"Otros")} · ${esc(e.date)} · ${e.participantIds?.length||0} participante${(e.participantIds?.length||0)===1?"":"s"}</small></div><strong>${money(e.amount)}</strong><em>→</em></button>`).join(""):`<div class="empty"><b>Todo pagado ✓</b>No hay cuentas pendientes este mes.</div>`;
  $$("#pendingBillsList [data-bill]").forEach(b=>b.onclick=()=>openExpense(expenses.find(e=>e.id===b.dataset.bill)));
}
function openPendingBill(){
  openExpense();
  setTimeout(()=>setPaymentStatus("pending"),30);
}
$("#newPendingBillBtn")?.addEventListener("click",openPendingBill);
$("#qaPendingBill")?.addEventListener("click",()=>{closeSheets();openPendingBill()});
$("#balancesRecordPayment")?.addEventListener("click",()=>{const p=settlementPlan()[0];if(p)openSettlementPayment({...p,maxAmount:p.amount});else toast("No hay saldos pendientes.")});
function renderMembers(paid,share,balances){
  $("#membersList").innerHTML=members.map(m=>`<button class="member-row clickable-member family-hub-member" data-person="${esc(m.id)}">${memberAvatar(m,"lg")}<div><b>${esc(m.name)}</b><small>${m.authUid===me?.uid?"Tu perfil · ":""}${esc(m.email||"Sin email")}</small><em>${balances[m.id]>0.005?"+"+money(balances[m.id]):balances[m.id]<-.005?"−"+money(-balances[m.id]):"Saldado"}</em></div><span class="role-pill">${m.role==="owner"?"Owner":"Member"}</span></button>`).join("");
  $$(".clickable-member").forEach(b=>b.onclick=()=>openMemberDetail(b.dataset.person));
  $("#adminUsers").innerHTML=isOwner()?members.map(m=>{const status=m.authUid?"Activo":m.email?"Pendiente":"Sin acceso";return `<div class="member-row admin-user">${memberAvatar(m)}<div class="member-main"><b>${esc(m.name)}</b><small>${esc(m.email||"Sin email")} · ${status}</small></div><div class="admin-actions"><button class="secondary mini edit-admin-member" data-member="${esc(m.id)}">Editar</button><button class="secondary mini edit-admin-avatar" data-member="${esc(m.id)}">Avatar</button>${m.email?`<button class="secondary mini reset-access" data-email="${esc(m.email)}">Restablecer contraseña</button>`:""}${m.authUid!==me.uid?`<button class="danger mini remove-member" data-member="${esc(m.id)}">Eliminar</button>`:""}</div></div>`}).join(""):`<div class="empty"><b>Solo el Owner</b>Esta sección está reservada para el administrador.</div>`;
  $$(".edit-admin-member").forEach(b=>b.onclick=()=>openMemberAdminEditor(b.dataset.member));
  $$(".edit-admin-avatar").forEach(b=>b.onclick=()=>openProfileEditor(b.dataset.member));
  $$(".reset-access").forEach(b=>b.onclick=async()=>{try{await sendPasswordResetEmail(auth,b.dataset.email);toast("Enlace de restablecimiento enviado ✓")}catch(e){console.error(e);toast("No se pudo enviar el enlace.")}});
  $$(".remove-member").forEach(b=>b.onclick=async()=>{const id=b.dataset.member,m=member(id);if(!confirm(`¿Quitar a ${m.name} del hogar? Sus gastos históricos no se borrarán.`))return;try{if(m.email&&!m.authUid){try{await deleteDoc(doc(db,"invites",emailKey(m.email)))}catch{}}await deleteDoc(doc(db,"households",householdId,"members",id));toast("Miembro eliminado")}catch(e){console.error(e);toast("No se pudo eliminar.")}});
  $("#monthPeople").innerHTML=members.map(m=>`<div class="settle-row"><div class="settle-person">${memberAvatar(m)}<div><b>${esc(m.name)}</b><small>Pagó ${money(paid[m.id]||0)}</small></div></div><span></span><div class="settle-person right"><div><b>${balances[m.id]>=0?"Recibe":"Debe"} ${money(Math.abs(balances[m.id]||0))}</b><small>Parte ${money(share[m.id]||0)}</small></div></div></div>`).join("");
}
function renderCoverageSummary(){const el=$("#coverageSummary");if(!el)return;const covered=members.filter(m=>coverageRules[m.id]&&coverageRules[m.id]!==m.id);el.innerHTML=covered.length?covered.map(m=>{const c=member(coverageRules[m.id]);return `<div class="coverage-chip-card">${memberAvatar(c)}<div><b>${esc(c.name)}</b><small>cubre a ${esc(m.name)}</small></div><span>→</span>${memberAvatar(m)}</div>`}).join(""):`<div class="empty"><b>Sin cobertura asignada</b>Cada persona responde por su propia parte.</div>`}
function openCoverageManager(){if(!isOwner()){toast("Solo el Owner puede cambiar coberturas.");return}const opts=members.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");$("#coverageRows").innerHTML=members.map(m=>`<div class="coverage-row">${memberAvatar(m)}<div><b>${esc(m.name)}</b><small>Responsable económico</small></div><select data-covered="${esc(m.id)}"><option value="">Se cubre a sí mismo/a</option>${opts}</select></div>`).join("");$$("#coverageRows select").forEach(s=>{const v=coverageRules[s.dataset.covered]||"";s.value=v===s.dataset.covered?"":v});openSheet("#coverageSheet")}
async function saveCoverage(){if(!isOwner())return;const rules={};$$("#coverageRows select").forEach(s=>{if(s.value&&s.value!==s.dataset.covered)rules[s.dataset.covered]=s.value});try{await setDoc(doc(db,"households",householdId,"settings","coverage"),{rules,updatedAt:serverTimestamp(),updatedBy:me.uid},{merge:true});closeSheets();toast("Cobertura familiar guardada ✓")}catch(e){console.error(e);toast("No se pudo guardar la cobertura.")}}
$("#editCoverageBtn")?.addEventListener("click",openCoverageManager);$(".coverageCancel")?.addEventListener("click",closeSheets);$("#saveCoverageTop")?.addEventListener("click",saveCoverage);$("#saveCoverageBottom")?.addEventListener("click",saveCoverage);
$("#applyCoverageExisting")?.addEventListener("click",async()=>{if(!isOwner())return;if(!confirm("¿Aplicar la cobertura familiar a todos los gastos existentes? Esto no cambia quién pagó cada gasto."))return;try{const candidates=expenses.filter(e=>e.useCoverage!==true);for(const e of candidates)await updateDoc(doc(db,"households",householdId,"expenses",e.id),{useCoverage:true,updatedAt:serverTimestamp()});closeSheets();toast(`Cobertura aplicada a ${candidates.length} gasto${candidates.length===1?"":"s"} ✓`)}catch(err){console.error(err);toast("No se pudo aplicar la cobertura.")}});
function openMemberDetail(id){
  const m=member(id),{paid,share,balances}=settledBalanceData(),allMine=monthExpenses().filter(e=>e.payerId===id||(e.participantIds||[]).includes(id)),mine=allMine.slice(0,7),canEdit=isOwner()||m.authUid===me?.uid;
  const personalCats={};allMine.forEach(e=>{const split=(e.split&&e.split[id]!=null)?Number(e.split[id]):((e.participantIds||[]).includes(id)?Number(e.amount||0)/Math.max(1,(e.participantIds||[]).length):0);personalCats[e.category]=(personalCats[e.category]||0)+Number(split||0)});
  const top=Object.entries(personalCats).sort((a,b)=>b[1]-a[1])[0];
  $("#memberDetailContent").innerHTML=`<div class="premium-profile-hero"><div class="profile-cover" style="--profile-accent:${esc(m.accentColor||"#4a90e2")}"></div>${memberAvatar(m,"xl")}<div class="profile-title"><h2>${esc(m.name)}</h2><p>${esc(m.email||"Miembro de Mi Casa")}</p><div class="profile-inline-actions">${canEdit?`<button class="secondary mini edit-profile-btn" data-person="${esc(id)}">✦ Personalizar</button>`:""}<button class="secondary mini member-report-btn" data-person="${esc(id)}">▧ Reporte PDF</button></div></div></div><div class="profile-stats premium"><div><small>Pagó</small><b>${money(paid[id]||0)}</b></div><div><small>Su parte</small><b>${money(share[id]||0)}</b></div><div><small>Balance</small><b class="${balances[id]>=0?"balance-positive":"balance-negative"}">${balances[id]>=0?"+":""}${money(balances[id]||0)}</b></div></div><div class="profile-highlight"><span>◔</span><div><small>Espacio principal</small><b>${top?`${esc(top[0])} · ${money(top[1])}`:"Aún sin datos"}</b></div></div><div class="profile-section-title"><span>ACTIVIDAD</span><h3>Movimientos recientes</h3></div><div class="feed premium-feed">${mine.length?mine.map(feedHTML).join(""):`<div class="empty">Sin movimientos este mes.</div>`}</div>`;
  $(".edit-profile-btn")?.addEventListener("click",()=>openProfileEditor(id));$(".member-report-btn")?.addEventListener("click",()=>{closeSheets();setTimeout(()=>prepareReportModal("member",id),100)});
  $("#memberDetailContent").querySelectorAll(".feed-item[data-id]").forEach(el=>{const e=expenses.find(x=>x.id===el.dataset.id);el.onclick=()=>openExpense(e);bindExpenseGesture(el,e)});
  openSheet("#memberDetailSheet");
}
function settleHTML(p,withButton=false,i=0){const from=member(p.from),to=member(p.to);return `<div class="premium-settle-card"><div class="settle-face">${memberAvatar(from,"lg")}<b>${esc(from.name)}</b><small>paga</small></div><div class="settle-flow"><span>→</span><strong>${money(p.amount)}</strong>${withButton?`<button class="secondary mini mark-paid" data-index="${i}">Registrar pago</button>`:""}</div><div class="settle-face">${memberAvatar(to,"lg")}<b>${esc(to.name)}</b><small>recibe</small></div></div>`}
function memberOptions(selected=""){return members.map(m=>`<option value="${esc(m.id)}" ${m.id===selected?"selected":""}>${esc(m.name)}</option>`).join("")}
function expenseSettlementOptions(e){
  if(!e?.payerId)return [];
  const shares=effectiveExpenseShares(e),to=e.payerId;
  return Object.entries(shares).filter(([id,a])=>id!==to&&Number(a)>0).map(([from,a])=>{
    const already=settlements.filter(s=>s.status==="paid"&&s.expenseId===e.id&&s.from===from&&s.to===to).reduce((sum,s)=>sum+Number(s.amount||0),0);
    return {from,to,amount:Math.max(0,Number(a)-already)};
  }).filter(x=>x.amount>.005);
}
function openSettlementPayment(opts={}){
  const from=opts.from||members[0]?.id||"",to=opts.to||members[1]?.id||"";
  $("#settlementPaymentTitle").textContent=opts.expenseId?"Saldar esta cuenta":"Registrar pago";
  $("#settlementExpenseId").value=opts.expenseId||"";
  if(opts.expenseId){const e=expenses.find(x=>x.id===opts.expenseId),available=expenseSettlementOptions(e);$("#settlementFrom").innerHTML=available.map(x=>`<option value="${esc(x.from)}">${esc(member(x.from).name)} · ${money(x.amount)}</option>`).join("");$("#settlementTo").innerHTML=memberOptions(to)}else{$("#settlementFrom").innerHTML=memberOptions(from);$("#settlementTo").innerHTML=memberOptions(to)}
  $("#settlementFrom").value=from;$("#settlementTo").value=to;
  $("#settlementAmount").value=Number(opts.amount||0).toFixed(2);
  $("#settlementAmount").dataset.max=String(Number(opts.maxAmount||opts.amount||0));
  $("#settlementAmountHelp").textContent=opts.maxAmount?`Máximo pendiente: ${money(opts.maxAmount)}`:"Puedes registrar un pago parcial.";
  $("#settlementMethod").value="Transferencia";$("#settlementNote").value="";
  $("#settlementPaymentContext").innerHTML=opts.expenseId?`<b>${esc(opts.description||"Cuenta")}</b><small>Este pago se aplicará específicamente a esta cuenta y también reducirá el saldo total.</small>`:`<b>${esc(member(from).name)} → ${esc(member(to).name)}</b><small>Puedes registrar el total o solamente una parte.</small>`;
  openSheet("#settlementPaymentSheet","medium");
}
function markSettlement(i){const p=settlementPlan()[i];if(!p)return;openSettlementPayment({...p,maxAmount:p.amount})}
async function saveSettlementPayment(){
  const from=$("#settlementFrom").value,to=$("#settlementTo").value,amount=Number($("#settlementAmount").value||0),max=Number($("#settlementAmount").dataset.max||0),expenseId=$("#settlementExpenseId").value||null;
  if(!from||!to||from===to){toast("Selecciona dos personas diferentes.");return}
  if(!(amount>0)){toast("Ingresa un monto válido.");return}
  if(max>0&&amount>max+.005){toast(`El máximo pendiente es ${money(max)}.`);return}
  try{
    const data={from,to,amount,month:activeMonth,status:"paid",method:$("#settlementMethod").value||"Transferencia",note:$("#settlementNote").value.trim(),createdBy:me.uid,paidAt:serverTimestamp()};
    if(expenseId){data.expenseId=expenseId;const e=expenses.find(x=>x.id===expenseId);data.expenseDescription=e?.description||""}
    await addDoc(collection(db,"households",householdId,"settlements"),data);
    closeSheets();toast(expenseId?"Cuenta actualizada ✓":"Pago registrado ✓");
  }catch(e){console.error(e);toast("No se pudo registrar el pago.")}
}
$("#settlementPaymentForm")?.addEventListener("submit",e=>{e.preventDefault();saveSettlementPayment()});
$("#saveSettlementPaymentTop")?.addEventListener("click",saveSettlementPayment);
$("#settlementFrom")?.addEventListener("change",()=>{const expenseId=$("#settlementExpenseId").value;if(!expenseId)return;const e=expenses.find(x=>x.id===expenseId),opt=expenseSettlementOptions(e).find(x=>x.from===$("#settlementFrom").value);if(opt){$("#settlementTo").value=opt.to;$("#settlementAmount").value=opt.amount.toFixed(2);$("#settlementAmount").dataset.max=String(opt.amount);$("#settlementAmountHelp").textContent=`Máximo pendiente: ${money(opt.amount)}`}});

$(".paymentCancel")?.addEventListener("click",closeSheets);
function feedHTML(e){const icons={Casa:"⌂",Comida:"●",Servicios:"⚡",Teléfono:"◫",Transporte:"◆",Salud:"✚",Suscripciones:"↻",Otros:"•"};return `<div class="feed-item" data-id="${esc(e.id)}"><div class="cat-icon ${categoryClass(e.category)}">${icons[e.category]||"•"}</div><div class="feed-copy"><b>${esc(e.description)}</b><small>${esc(member(e.payerId).name)} pagó · ${(e.participantIds||[]).length} participantes · ${esc(e.date)}</small></div><div class="feed-amount"><b>${money(e.amount)}</b><small>${esc(e.category||"Otros")}${((e.attachments&&e.attachments.length)||e.receiptName)?" · 📎":""}</small></div></div>`}

function fillMemberControls(){
  const opts=members.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");$("#expensePayer").innerHTML=opts;$("#recurringPayer").innerHTML=opts;
  $("#participantPicker").innerHTML=members.map(m=>`<button type="button" class="participant selected" data-id="${esc(m.id)}">${memberAvatar(m)}${esc(m.name)}</button>`).join("");
  $$("#participantPicker .participant").forEach(b=>b.onclick=()=>{b.classList.toggle("selected");renderCustomSplitRows();updatePerPerson()});
}
function selectedIds(){return $$("#participantPicker .participant.selected").map(x=>x.dataset.id)}
function renderCustomSplitRows(existing={}){
  if(currentSplit==="equal"){$("#customSplitRows").classList.add("hidden");return}
  $("#customSplitRows").classList.remove("hidden");$("#customSplitRows").innerHTML=selectedIds().map(id=>`<label class="split-person"><span>${esc(member(id).name)}</span><input class="split-input" data-id="${esc(id)}" inputmode="decimal" placeholder="${currentSplit==="percent"?"%":"$"}" value="${existing[id]??""}"></label>`).join("");$$(".split-input").forEach(i=>i.addEventListener("input",updatePerPerson));
}
function updatePerPerson(){
  const n=selectedIds().length,a=parseFloat($("#expenseAmount").value)||0;
  if(currentSplit==="equal")$("#perPerson").textContent=n?`${money(a/n)} c/u`:"Selecciona personas";
  else{const vals=$$(".split-input").reduce((s,i)=>s+(parseFloat(i.value)||0),0);$("#perPerson").textContent=currentSplit==="percent"?`${vals.toFixed(1)}% asignado`:`${money(vals)} asignado`}
}
let currentPaymentStatus="paid";
function setPaymentStatus(status){currentPaymentStatus=status==="pending"?"pending":"paid";$$(".payment-status").forEach(b=>b.classList.toggle("active",b.dataset.paymentStatus===currentPaymentStatus));$("#expensePayerWrap").classList.toggle("hidden",currentPaymentStatus==="pending");$("#pendingBillHelp").classList.toggle("hidden",currentPaymentStatus!=="pending")}
function renderExpenseCoveragePreview(){const el=$("#coverageExpensePreview");if(!el)return;if(!$("#expenseUseCoverage").checked){el.classList.add("hidden");return}const moves=selectedIds().map(id=>coverageRules[id]&&coverageRules[id]!==id?`${member(coverageRules[id]).name} cubre a ${member(id).name}`:"").filter(Boolean);if(!moves.length){el.classList.add("hidden");return}el.classList.remove("hidden");el.innerHTML=`<b>Responsabilidad final</b><small>${[...new Set(moves)].map(esc).join(" · ")}</small>`}
$$(".payment-status").forEach(b=>b.addEventListener("click",()=>setPaymentStatus(b.dataset.paymentStatus)));
$("#expenseUseCoverage")?.addEventListener("change",renderExpenseCoveragePreview);
$("#expenseAmount").addEventListener("input",updatePerPerson);
$$(".split-tab").forEach(b=>b.onclick=()=>{currentSplit=b.dataset.split;$$(".split-tab").forEach(x=>x.classList.toggle("active",x===b));$("#splitHelp").textContent=currentSplit==="equal"?"Se divide por igual.":currentSplit==="amount"?"Define el monto exacto por persona.":"Define el porcentaje por persona.";renderCustomSplitRows();updatePerPerson()});

let activeSheet=null;
function openSheet(id,detent=null){const sheet=$(id);if(!sheet)return;$$(".sheet").forEach(x=>{if(x!==sheet){x.classList.add("hidden");x.classList.remove("sheet-visible","sheet-full","sheet-compact","is-dragging");x.style.transform=""}});$("#overlay").classList.remove("hidden");sheet.classList.remove("hidden","sheet-full","sheet-compact");sheet.classList.add("sheet-visible");const d=detent||sheet.dataset.detent||"medium";sheet.dataset.currentDetent=d;sheet.classList.toggle("sheet-full",d==="full");sheet.classList.toggle("sheet-compact",d==="compact");sheet.style.transform="";activeSheet=sheet;document.body.classList.add("has-sheet")}
function closeSheets(){$("#overlay").classList.add("hidden");$$(".sheet").forEach(x=>{x.classList.add("hidden");x.classList.remove("sheet-visible","sheet-full","sheet-compact","is-dragging");x.style.transform=""});activeSheet=null;document.body.classList.remove("has-sheet")}
$("#overlay").onclick=closeSheets;$$(".sheetCancel,.memberCancel,.budgetCancel,.recurringCancel,.detailCancel,.quickActionsCancel,.transactionActionsCancel,.paymentCancel").forEach(b=>b.onclick=closeSheets);
function initSheetDrag(){
  $$(".sheet .sheet-handle").forEach(handle=>{let startY=0,dy=0,dragging=false;handle.addEventListener("pointerdown",e=>{const s=handle.closest(".sheet");if(!s||s.classList.contains("hidden"))return;startY=e.clientY;dy=0;dragging=true;s.classList.add("is-dragging");handle.setPointerCapture?.(e.pointerId)});handle.addEventListener("pointermove",e=>{if(!dragging)return;const s=handle.closest(".sheet");dy=e.clientY-startY;if(dy>0)s.style.transform=`translateY(${Math.min(dy,260)}px)`;else if(dy<-45){s.classList.add("sheet-full");s.classList.remove("sheet-compact");s.dataset.currentDetent="full"}});handle.addEventListener("pointerup",()=>{if(!dragging)return;const s=handle.closest(".sheet");dragging=false;s.classList.remove("is-dragging");if(dy>110)closeSheets();else{s.style.transform=""}})});
}
initSheetDrag();

function openExpense(e=null){
  if(!members.length){toast("Primero agrega miembros.");return}
  $("#expenseForm").reset();attachmentCache=e?.attachments?[...e.attachments]:(e?.receiptData?[{name:e.receiptName||"Comprobante",type:e.receiptType||"",data:e.receiptData}]:[]);$("#expenseId").value=e?.id||"";$("#expenseSheetTitle").textContent=e?"Editar gasto":"Nuevo gasto";$("#deleteExpense").classList.toggle("hidden",!e);
  $("#expenseDate").value=e?.date||today();$("#expenseAmount").value=e?.amount||"";$("#expenseDescription").value=e?.description||"";$("#expenseCategory").value=e?.category||"Casa";$("#expensePayer").value=e?.payerId||myMember()?.id||members[0]?.id;$("#expenseNotes").value=e?.notes||"";
  setPaymentStatus(e?.paymentStatus||(e&&!e.payerId?"pending":"paid"));$("#expenseUseCoverage").checked=e ? e.useCoverage===true : true;
  currentSplit=e?.splitMode||"equal";$$(".split-tab").forEach(x=>x.classList.toggle("active",x.dataset.split===currentSplit));
  $$("#participantPicker .participant").forEach(b=>b.classList.toggle("selected",e?(e.participantIds||[]).includes(b.dataset.id):true));
  renderCustomSplitRows(e?.splitValues||{});updatePerPerson();renderExpenseCoveragePreview();
  renderAttachmentPreview();
  openSheet("#expenseSheet");setTimeout(()=>$("#expenseAmount").focus(),100)
}
["#quickExpense","#activityAdd"].forEach(id=>$(id)&&( $(id).onclick=()=>openExpense()));
["#newExpenseBtn","#mobileAdd"].forEach(id=>$(id)&&( $(id).onclick=()=>openQuickActions()));
$("#saveExpenseTop").onclick=()=>$("#expenseForm").requestSubmit();

let viewerItems=[],viewerIndex=0;
function attachmentKind(a){const t=String(a?.type||"").toLowerCase(),n=String(a?.name||"").toLowerCase();if(t.startsWith("image/")||/\.(png|jpe?g|gif|webp|heic)$/i.test(n))return"image";if(t==="application/pdf"||n.endsWith(".pdf"))return"pdf";return"file"}
function attachmentThumb(a,i,removable=true){const kind=attachmentKind(a),visual=kind==="image"&&a.data?`<img src="${a.data}" alt="">`:kind==="pdf"?`<span class="file-tile pdf">PDF</span>`:`<span class="file-tile">FILE</span>`,kb=a.size?`${Math.ceil(Number(a.size)/1024)} KB`:"";return `<div class="attachment-item previewable-attachment" data-preview-index="${i}">${visual}<div class="attachment-meta"><b>${esc(a.name||"Archivo")}</b><small>${kind==="image"?"Imagen":kind==="pdf"?"PDF":esc(a.type||"Archivo")}${kb?` · ${kb}`:""}${a.compressed?" · optimizada":""} · Toca para previsualizar</small></div>${removable?`<button type="button" class="remove-attachment" data-index="${i}" title="Quitar">×</button>`:""}</div>`}
function openAttachmentViewer(items,index=0){viewerItems=(items||[]).filter(a=>a?.data);if(!viewerItems.length){toast(uiLang==="en"?"Preview unavailable.":"Vista previa no disponible.");return}viewerIndex=Math.max(0,Math.min(index,viewerItems.length-1));renderAttachmentViewer();$("#attachmentViewer").classList.remove("hidden");$("#attachmentViewer").setAttribute("aria-hidden","false")}
function renderAttachmentViewer(){const a=viewerItems[viewerIndex];if(!a)return;const kind=attachmentKind(a),stage=$("#attachmentViewerStage");$("#attachmentViewerCount").textContent=`${viewerIndex+1} de ${viewerItems.length}`;$("#attachmentViewerName").textContent=a.name||"Comprobante";$("#attachmentViewerOpen").href=a.data;$("#attachmentViewerOpen").download=a.name||"comprobante";stage.innerHTML=kind==="image"?`<img src="${a.data}" alt="${esc(a.name||"Comprobante")}">`:kind==="pdf"?`<iframe src="${a.data}" title="${esc(a.name||"PDF")}"></iframe>`:`<div class="file-no-preview"><span>▧</span><b>${esc(a.name||"Archivo")}</b><p>Este tipo de archivo no tiene vista previa integrada.</p></div>`;$("#attachmentViewerPrev").disabled=viewerIndex===0;$("#attachmentViewerNext").disabled=viewerIndex===viewerItems.length-1}
function closeAttachmentViewer(){$("#attachmentViewer").classList.add("hidden");$("#attachmentViewer").setAttribute("aria-hidden","true");$("#attachmentViewerStage").innerHTML=""}
$("#attachmentViewerClose")?.addEventListener("click",closeAttachmentViewer);$("[data-close-preview]")?.addEventListener("click",closeAttachmentViewer);$("#attachmentViewerPrev")?.addEventListener("click",()=>{if(viewerIndex>0){viewerIndex--;renderAttachmentViewer()}});$("#attachmentViewerNext")?.addEventListener("click",()=>{if(viewerIndex<viewerItems.length-1){viewerIndex++;renderAttachmentViewer()}});document.addEventListener("keydown",e=>{if($("#attachmentViewer")?.classList.contains("hidden"))return;if(e.key==="Escape")closeAttachmentViewer();if(e.key==="ArrowLeft"&&viewerIndex>0){viewerIndex--;renderAttachmentViewer()}if(e.key==="ArrowRight"&&viewerIndex<viewerItems.length-1){viewerIndex++;renderAttachmentViewer()}});

function renderAttachmentPreview(){
  if(!attachmentCache.length){
    $("#receiptPreview").innerHTML=`<span>▧</span><div><b>Sin comprobantes</b><small>Puedes adjuntar varias fotos o PDFs.</small></div>`;
    return;
  }
  $("#receiptPreview").innerHTML=`<div class="attachment-list">${attachmentCache.map((a,i)=>attachmentThumb(a,i,true)).join("")}</div>`;
  $$("#receiptPreview .previewable-attachment").forEach(el=>el.onclick=e=>{if(e.target.closest(".remove-attachment"))return;openAttachmentViewer(attachmentCache,Number(el.dataset.previewIndex))});
  $$(".remove-attachment").forEach(b=>b.onclick=e=>{e.stopPropagation();attachmentCache.splice(Number(b.dataset.index),1);renderAttachmentPreview()});
}
const RECEIPT_IMAGE_MAX_BYTES=200*1024;
const RECEIPT_PDF_MAX_BYTES=350*1024;

function blobToDataURL(blob){
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)});
}
function imageFileToElement(file){
  return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("image-decode"))};img.src=url});
}
function canvasToBlob(canvas,type,quality){
  return new Promise(resolve=>canvas.toBlob(resolve,type,quality));
}
async function compressReceiptImage(file,maxBytes=RECEIPT_IMAGE_MAX_BYTES){
  const img=await imageFileToElement(file);
  let maxSide=Math.min(2000,Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  let quality=.84,best=null;

  for(let pass=0;pass<12;pass++){
    const sourceW=img.naturalWidth||img.width,sourceH=img.naturalHeight||img.height;
    const scale=Math.min(1,maxSide/Math.max(sourceW,sourceH));
    const w=Math.max(1,Math.round(sourceW*scale)),h=Math.max(1,Math.round(sourceH*scale));
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{alpha:false});
    ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);
    ctx.drawImage(img,0,0,w,h);
    const blob=await canvasToBlob(canvas,"image/jpeg",quality);
    if(!blob)throw new Error("image-compress");
    best=blob;
    if(blob.size<=maxBytes)break;

    if(quality>.48) quality-=.09;
    else { maxSide=Math.max(900,Math.round(maxSide*.82)); quality=.68; }
  }

  if(best && best.size>maxBytes){
    // Final safety pass: progressively reduce dimensions until under 200 KB.
    let side=Math.min(1000,maxSide);
    for(let i=0;i<6 && best.size>maxBytes;i++){
      side=Math.max(650,Math.round(side*.82));
      const sourceW=img.naturalWidth||img.width,sourceH=img.naturalHeight||img.height;
      const scale=Math.min(1,side/Math.max(sourceW,sourceH));
      const w=Math.max(1,Math.round(sourceW*scale)),h=Math.max(1,Math.round(sourceH*scale));
      const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext("2d",{alpha:false});ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
      best=await canvasToBlob(canvas,"image/jpeg",.55);
      if(!best)throw new Error("image-compress");
    }
  }
  if(!best||best.size>maxBytes)throw new Error("image-too-large");
  return {blob:best,data:await blobToDataURL(best),size:best.size,type:"image/jpeg"};
}

$("#expenseReceipt").addEventListener("change",async e=>{
  const files=[...(e.target.files||[])];
  if(!files.length)return;

  let compressedCount=0;
  for(const f of files){
    const isImage=(f.type||"").startsWith("image/")||/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name||"");
    const isPdf=f.type==="application/pdf"||/\.pdf$/i.test(f.name||"");

    try{
      if(isImage){
        toast(uiLang==="en"?`Optimizing ${f.name}…`:`Optimizando ${f.name}…`);
        const optimized=await compressReceiptImage(f);
        const cleanName=(f.name||"comprobante").replace(/\.[^.]+$/,"")+".jpg";
        attachmentCache.push({
          name:cleanName,
          originalName:f.name,
          type:optimized.type,
          size:optimized.size,
          originalSize:f.size,
          compressed:true,
          data:optimized.data
        });
        compressedCount++;
        continue;
      }

      if(isPdf){
        if(f.size>RECEIPT_PDF_MAX_BYTES){
          toast(`${f.name} pesa más de 350 KB y no se agregó.`);
          continue;
        }
      }else if(f.size>RECEIPT_PDF_MAX_BYTES){
        toast(`${f.name} pesa más de 350 KB y no se agregó.`);
        continue;
      }

      const data=await blobToDataURL(f);
      attachmentCache.push({name:f.name,type:f.type||"archivo",size:f.size,data});
    }catch(err){
      console.error("Receipt optimization failed",err);
      toast(uiLang==="en"?`Could not optimize ${f.name}.`:`No se pudo optimizar ${f.name}.`);
    }
  }

  e.target.value="";
  renderAttachmentPreview();
  if(compressedCount){
    toast(uiLang==="en"
      ?`${compressedCount} photo${compressedCount===1?"":"s"} optimized to 200 KB or less ✓`
      :`${compressedCount} foto${compressedCount===1?"":"s"} optimizada${compressedCount===1?"":"s"} a 200 KB o menos ✓`);
  }
});

$("#expenseForm").onsubmit=async e=>{
  e.preventDefault();const amount=parseFloat($("#expenseAmount").value),ids=selectedIds();if(!(amount>0)){toast("Ingresa un monto válido.");return}if(!ids.length){toast("Selecciona al menos una persona.");return}
  let shares={},splitValues={}; if(currentSplit==="equal"){ids.forEach(id=>shares[id]=amount/ids.length)}else{const vals={};$$(".split-input").forEach(i=>vals[i.dataset.id]=parseFloat(i.value)||0);splitValues=vals;if(currentSplit==="amount"){const sum=Object.values(vals).reduce((a,b)=>a+b,0);if(Math.abs(sum-amount)>.01){toast(`La división debe sumar ${money(amount)}.`);return}shares=vals}else{const sum=Object.values(vals).reduce((a,b)=>a+b,0);if(Math.abs(sum-100)>.05){toast("Los porcentajes deben sumar 100%.");return}ids.forEach(id=>shares[id]=amount*(vals[id]||0)/100)}}
  const data={amount,description:$("#expenseDescription").value.trim(),date:$("#expenseDate").value,category:$("#expenseCategory").value,paymentStatus:currentPaymentStatus,payerId:currentPaymentStatus==="pending"?null:$("#expensePayer").value,useCoverage:$("#expenseUseCoverage").checked,participantIds:ids,splitMode:currentSplit,splitValues,shares,notes:$("#expenseNotes").value.trim(),attachments:attachmentCache,receiptData:null,receiptName:null,receiptType:null,updatedAt:serverTimestamp()};
  try{const id=$("#expenseId").value;if(id)await setDoc(doc(db,"households",householdId,"expenses",id),data,{merge:true});else await addDoc(collection(db,"households",householdId,"expenses"),{...data,createdBy:me.uid,createdAt:serverTimestamp()});closeSheets();toast(id?"Gasto actualizado ✓":"Gasto agregado ✓")}catch(err){console.error(err);toast("No se pudo guardar el gasto.")}
};
$("#deleteExpense").onclick=async()=>{const id=$("#expenseId").value;if(!id||!confirm("¿Eliminar este gasto?"))return;try{await deleteDoc(doc(db,"households",householdId,"expenses",id));closeSheets();toast("Gasto eliminado")}catch(e){toast("No tienes permiso para eliminarlo.")}};

function memberAccessLabel(m){return m?.authUid?"Activo":m?.email?"Pendiente de activación":"Sin acceso"}
function refreshMemberAdminPreview(){
  const id=$("#memberEditId").value,m=id?member(id):null,name=$("#memberName").value.trim()||m?.name||"Nuevo miembro";
  $("#memberAdminPreviewName").textContent=name;$("#memberAdminAccessText").textContent=memberAccessLabel(m);
  const fake={...(m||{}),name};$("#memberAdminAvatarPreview").outerHTML=memberAvatar(fake,"profile-preview-avatar").replace('class="avatar','id="memberAdminAvatarPreview" class="avatar');
}
function openNewMemberAdmin(){
  if(!isOwner())return;$("#memberForm").reset();$("#memberEditId").value="";$("#memberSheetTitle").textContent="Agregar miembro";
  $("#memberResetPassword").classList.add("hidden");$("#memberEditAvatar").classList.add("hidden");refreshMemberAdminPreview();openSheet("#memberSheet")
}
function openMemberAdminEditor(id){
  if(!isOwner())return;const m=member(id);$("#memberForm").reset();$("#memberEditId").value=id;$("#memberName").value=m.name||"";$("#memberEmail").value=m.email||"";
  $("#memberSheetTitle").textContent="Editar usuario";$("#memberResetPassword").classList.toggle("hidden",!m.email);$("#memberEditAvatar").classList.remove("hidden");refreshMemberAdminPreview();openSheet("#memberSheet")
}
$("#inviteBtn").onclick=openNewMemberAdmin;
$("#memberName")?.addEventListener("input",refreshMemberAdminPreview);
$("#saveMemberTop")?.addEventListener("click",()=>$("#memberForm").requestSubmit());
$("#memberEditAvatar")?.addEventListener("click",()=>{const id=$("#memberEditId").value;if(id){closeSheets();setTimeout(()=>openProfileEditor(id),100)}});
$("#memberResetPassword")?.addEventListener("click",async()=>{const email=$("#memberEmail").value.trim().toLowerCase();if(!email){toast("Primero agrega un email.");return}try{await sendPasswordResetEmail(auth,email);toast("Enlace de restablecimiento enviado ✓")}catch(e){console.error(e);toast("No se pudo enviar. Verifica que esa cuenta ya esté activa.")}});
$("#memberForm").onsubmit=async e=>{
  e.preventDefault();if(!isOwner())return;
  const id=$("#memberEditId").value,name=$("#memberName").value.trim(),email=$("#memberEmail").value.trim().toLowerCase();
  if(!name){toast("Ingresa un nombre.");return}
  try{
    if(id){
      const m=member(id),oldEmail=(m.email||"").toLowerCase();
      // Auth email cannot be silently changed from the browser for another signed-in user.
      // For an already-active account, keep authUid and update the household contact/invite email only.
      await setDoc(doc(db,"households",householdId,"members",id),{name,email:email||null,inviteStatus:m.authUid?"active":email?"pending":"none",updatedAt:serverTimestamp()},{merge:true});
      if(oldEmail&&oldEmail!==email&&!m.authUid){try{await deleteDoc(doc(db,"invites",emailKey(oldEmail)))}catch{}}
      if(email&&!m.authUid)await setDoc(doc(db,"invites",emailKey(email)),{email,householdId,memberId:id,householdName:household.name||"Mi Casa",invitedBy:me.uid,createdAt:serverTimestamp()},{merge:true});
      closeSheets();toast(m.authUid&&oldEmail!==email?"Usuario actualizado. El email de acceso activo debe cambiarlo el usuario o un backend Admin.":"Usuario actualizado ✓");
    }else{
      const duplicate=members.find(m=>email&&String(m.email||"").toLowerCase()===email);
      if(duplicate){toast("Ese email ya pertenece a un miembro.");return}
      const mref=doc(collection(db,"households",householdId,"members"));
      await setDoc(mref,{name,email:email||null,role:"member",authUid:null,inviteStatus:email?"pending":"none",createdAt:serverTimestamp()});
      if(email)await setDoc(doc(db,"invites",emailKey(email)),{email,householdId,memberId:mref.id,householdName:household.name||"Mi Casa",invitedBy:me.uid,createdAt:serverTimestamp()},{merge:true});
      closeSheets();toast(email?"Miembro agregado · acceso preparado ✓":"Miembro agregado ✓");
    }
  }catch(e){console.error(e);toast("No se pudo guardar el usuario. Revisa las reglas V9.3.")}
};
$(".memberCancel")?.addEventListener("click",closeSheets);

let profileDraft={avatarData:null,avatarPreset:"initials",accentColor:"#4a90e2"};
function openProfileEditor(id){
  const m=member(id);if(!(isOwner()||m.authUid===me?.uid)){toast("No puedes editar este perfil.");return}
  profileDraft={avatarData:m.avatarData||null,avatarPreset:m.avatarPreset||"initials",accentColor:m.accentColor||"#4a90e2"};
  $("#profileEditMemberId").value=id;$("#profileEditName").textContent=m.name;renderProfileDraft(m);openSheet("#profileEditSheet")
}
function renderProfileDraft(m=member($("#profileEditMemberId").value)){
  const fake={...m,...profileDraft};$("#profileAvatarPreview").outerHTML=memberAvatar(fake,"profile-preview-avatar").replace('class="avatar','id="profileAvatarPreview" class="avatar');
  $$("#avatarPresetPicker button").forEach(b=>b.classList.toggle("selected",b.dataset.preset===profileDraft.avatarPreset&&!profileDraft.avatarData));
  $$("#profileColorPicker button").forEach(b=>b.classList.toggle("selected",b.dataset.color===profileDraft.accentColor));
}
async function compressProfileImage(file){
  return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const size=320,c=document.createElement("canvas");c.width=size;c.height=size;const ctx=c.getContext("2d"),s=Math.min(img.width,img.height),sx=(img.width-s)/2,sy=(img.height-s)/2;ctx.drawImage(img,sx,sy,s,s,0,0,size,size);resolve(c.toDataURL("image/jpeg",.76))};img.src=reader.result};reader.readAsDataURL(file)})
}
$("#profilePhotoInput")?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>8*1024*1024){toast("La foto es demasiado grande.");return}try{profileDraft.avatarData=await compressProfileImage(f);profileDraft.avatarPreset="initials";renderProfileDraft()}catch{toast("No pudimos preparar esa foto.")}});
$$("#avatarPresetPicker button").forEach(b=>b.onclick=()=>{profileDraft.avatarData=null;profileDraft.avatarPreset=b.dataset.preset;renderProfileDraft()});
$$("#profileColorPicker button").forEach(b=>{b.style.background=b.dataset.color;b.onclick=()=>{profileDraft.accentColor=b.dataset.color;renderProfileDraft()}});
async function saveProfileCustomization(){
  const id=$("#profileEditMemberId").value,m=member(id);if(!(isOwner()||m.authUid===me?.uid))return;
  try{await updateDoc(doc(db,"households",householdId,"members",id),{avatarData:profileDraft.avatarData||null,avatarPreset:profileDraft.avatarPreset||"initials",accentColor:profileDraft.accentColor||"#4a90e2",profileUpdatedAt:serverTimestamp()});closeSheets();toast("Perfil actualizado ✨")}catch(e){console.error(e);toast("No se pudo guardar. Revisa las reglas de perfil.")}
}
$("#profileEditForm")?.addEventListener("submit",e=>{e.preventDefault();saveProfileCustomization()});$("#saveProfileTop")?.addEventListener("click",saveProfileCustomization);$(".profileEditCancel")?.addEventListener("click",closeSheets);
$("#mobileProfileBtn")?.addEventListener("click",()=>{const mm=myMember();if(mm)openMemberDetail(mm.id)});
function openBudgets(){if(!isOwner()){toast("Solo el Owner puede cambiar presupuestos.");return}const s=budgetSettings();$("#globalBudgetInput").value=s.globalLimit||"";$("#weeklyBudgetInput").value=s.weeklyLimit||"";$("#rolloverBudgetInput").checked=!!s.rollover;$("#budgetRows").innerHTML=CATS.map(c=>`<label><span>${esc(c)}</span><input class="budget-input" data-cat="${esc(c)}" inputmode="decimal" placeholder="Sin límite" value="${budgets[`${activeMonth}_${c}`]?.limit||""}"></label>`).join("");openSheet("#budgetSheet")}
$("#quickBudget").onclick=()=>{if(isOwner())openBudgets();else{const mm=myMember();if(mm)openMemberDetail(mm.id)}};$("#editBudgetsBtn").onclick=openBudgets;$("#saveBudgetsTop").onclick=()=>$("#budgetForm").requestSubmit();
$("#budgetForm").onsubmit=async e=>{e.preventDefault();try{await Promise.all($$(".budget-input").map(i=>setDoc(doc(db,"households",householdId,"budgets",`${activeMonth}_${i.dataset.cat}`),{month:activeMonth,category:i.dataset.cat,limit:Number(i.value||0),updatedAt:serverTimestamp()},{merge:true})));await setDoc(doc(db,"households",householdId,"budgets",`${activeMonth}__settings`),{month:activeMonth,globalLimit:Number($("#globalBudgetInput").value||0),weeklyLimit:Number($("#weeklyBudgetInput").value||0),rollover:$("#rolloverBudgetInput").checked,updatedAt:serverTimestamp()},{merge:true});closeSheets();toast("Presupuesto inteligente guardado ✓")}catch(e){console.error(e);toast("No se pudieron guardar.")}};

$("#addRecurringBtn").onclick=()=>{$("#recurringForm").reset();$("#recurringDay").value=1;fillMemberControls();openSheet("#recurringSheet")};
$("#recurringForm").onsubmit=async e=>{e.preventDefault();try{await addDoc(collection(db,"households",householdId,"recurring"),{name:$("#recurringName").value.trim(),amount:Number($("#recurringAmount").value),day:Number($("#recurringDay").value),category:$("#recurringCategory").value,payerId:$("#recurringPayer").value,active:true,createdAt:serverTimestamp()});closeSheets();toast("Pago recurrente guardado ✓")}catch(e){console.error(e);toast("No se pudo guardar.")}};

function renderCalendar(){
  const [y,m]=activeMonth.split("-").map(Number),days=new Date(y,m,0).getDate(),first=new Date(y,m-1,1).getDay();
  const exByDay={},recByDay={};
  monthExpenses().forEach(e=>{const d=Number(String(e.date||"").slice(8,10));(exByDay[d]??=[]).push(e)});
  recurrings.filter(r=>r.active).forEach(r=>{const d=Math.max(1,Math.min(days,Number(r.day)||1));(recByDay[d]??=[]).push(r)});
  const todayKey=today(),isThisMonth=todayKey.slice(0,7)===activeMonth,todayDay=Number(todayKey.slice(8,10));
  const ml=$("#calendarMonthLabel");if(ml)ml.textContent=cap(monthLabel(activeMonth));
  $("#statementMonth").textContent=cap(monthLabel(activeMonth));$("#monthEyebrow").textContent=monthLabel(activeMonth).toUpperCase();
  let html=`<div class="cal-head">${["D","L","M","M","J","V","S"].map(x=>`<b>${x}</b>`).join("")}</div><div class="cal-grid">${"<span></span>".repeat(first)}`;
  for(let d=1;d<=days;d++){
    const ex=exByDay[d]||[],rec=recByDay[d]||[],dayTotal=ex.reduce((s,e)=>s+Number(e.amount||0),0),dots=[...new Set(ex.map(e=>categoryClass(e.category)))].slice(0,3);
    html+=`<button type="button" class="cal-day ${isThisMonth&&d===todayDay?"today":""} ${ex.length||rec.length?"has-events":""}" data-day="${d}"><b>${d}</b>${dayTotal?`<i>${money(dayTotal)}</i>`:""}${rec.slice(0,1).map(r=>`<em>↻ ${esc(r.name)}</em>`).join("")}<span class="calendar-dots">${dots.map(x=>`<u class="${x}"></u>`).join("")}${rec.length?`<u class="rec"></u>`:""}</span></button>`;
  }
  html+=`</div>`;$("#financialCalendar").innerHTML=html;
  $$("#financialCalendar .cal-day").forEach(b=>{const day=Number(b.dataset.day);b.onclick=()=>{if(b.dataset.longPressed==="1"){b.dataset.longPressed="";return}openDayDetail(day)};bindLongPress(b,()=>{b.dataset.longPressed="1";openExpense();$("#expenseDate").value=`${activeMonth}-${String(day).padStart(2,"0")}`;showLivePill("Gasto preparado para ese día","＋")})});
  const active=recurrings.filter(r=>r.active).sort((a,b)=>a.day-b.day);
  $("#recurringList").innerHTML=active.length?active.map(r=>`<div class="recurring-row"><div class="cat-icon subs">↻</div><div><b>${esc(r.name)}</b><small>Día ${r.day} · ${esc(r.category)}</small></div><strong>${money(r.amount)}</strong>${isOwner()?`<button class="text-btn delete-recurring" data-id="${esc(r.id)}">×</button>`:""}</div>`).join(""):`<div class="month-empty-state"><span>↻</span><b>Sin pagos recurrentes</b><small>Agrega renta, internet, teléfono o suscripciones para verlos también en el calendario.</small></div>`;
  $$(".delete-recurring").forEach(b=>b.onclick=async()=>{if(confirm("¿Eliminar este recurrente?"))await deleteDoc(doc(db,"households",householdId,"recurring",b.dataset.id))});
}

$("#closeMonthBtn").onclick=async()=>{
  if(!isOwner())return;
  const existing=closings[activeMonth];
  if(existing){if(!confirm("¿Reabrir este mes? Quedará registrado."))return;try{await setDoc(doc(db,"households",householdId,"monthlyClosings",activeMonth),{status:"open",reopenedBy:me.uid,reopenedAt:serverTimestamp()},{merge:true});toast("Mes reabierto")}catch(e){toast("No se pudo reabrir.")}return}
  openMonthCloseSummary();
};





function setupSnapCarousel(el){if(!el||el.dataset.snapReady)return;el.dataset.snapReady="1";let raf=0;const update=()=>{raf=0;const r=el.getBoundingClientRect(),cx=r.left+r.width/2;[...el.children].forEach(card=>{const cr=card.getBoundingClientRect(),cc=cr.left+cr.width/2;card.classList.toggle("is-centered",Math.abs(cc-cx)<cr.width*.55)})};el.addEventListener("scroll",()=>{if(!raf)raf=requestAnimationFrame(update)},{passive:true});requestAnimationFrame(update)}
function bindSwipeGesture(el,onLeft,onRight){if(!el||el.dataset.swipeReady)return;el.dataset.swipeReady="1";let sx=0,sy=0,dx=0,active=false;el.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse")return;sx=e.clientX;sy=e.clientY;dx=0;active=true;el.style.transition="none"});el.addEventListener("pointermove",e=>{if(!active)return;const x=e.clientX-sx,y=e.clientY-sy;if(Math.abs(x)>Math.abs(y)&&Math.abs(x)>8){dx=Math.max(-92,Math.min(92,x));el.style.transform=`translateX(${dx*.48}px)`;el.classList.add("is-swiping")}});el.addEventListener("pointerup",()=>{if(!active)return;active=false;el.style.transition="transform .22s cubic-bezier(.2,.8,.2,1)";el.style.transform="";el.classList.remove("is-swiping");if(Math.abs(dx)>68){el.dataset.swiped="1";if(dx<0&&onLeft)onLeft();if(dx>0&&onRight)onRight();setTimeout(()=>el.dataset.swiped="",260)}});el.addEventListener("click",e=>{if(el.dataset.swiped==="1"){e.preventDefault();e.stopImmediatePropagation()}},true)}
function bindExpenseGesture(el,e){bindSwipeGesture(el,()=>{openExpense(e);showLivePill("Editar gasto","✎")},()=>duplicateExpense(e))}
function bindLongPress(el,callback){if(!el||el.dataset.longReady)return;el.dataset.longReady="1";let timer=null,sx=0,sy=0;const clear=()=>{clearTimeout(timer);timer=null};el.addEventListener("pointerdown",e=>{sx=e.clientX;sy=e.clientY;clear();timer=setTimeout(()=>{timer=null;callback?.();navigator.vibrate?.(12)},480)});el.addEventListener("pointermove",e=>{if(Math.abs(e.clientX-sx)>10||Math.abs(e.clientY-sy)>10)clear()});el.addEventListener("pointerup",clear);el.addEventListener("pointercancel",clear)}
function duplicateExpense(e){openExpense(e);$("#expenseId").value="";$("#expenseSheetTitle").textContent="Duplicar gasto";$("#deleteExpense").classList.add("hidden");showLivePill("Copia lista para guardar","＋")}
function openTransactionActions(e){if(!e)return;$("#transactionActionsContent").innerHTML=`<button type="button" data-action="edit"><span class="qa-icon blue">✎</span><div><b>Editar</b><small>Cambiar los datos del gasto</small></div></button><button type="button" data-action="duplicate"><span class="qa-icon mint">＋</span><div><b>Duplicar</b><small>Crear uno similar</small></div></button><button type="button" data-action="coverage"><span class="qa-icon lilac">♡</span><div><b>${e.useCoverage===true?"Desactivar":"Aplicar"} cobertura familiar</b><small>Recalcular responsabilidad familiar</small></div></button>${expenseSettlementOptions(e).length?`<button type="button" data-action="settle-expense"><span class="qa-icon mint">✓</span><div><b>Registrar pago de esta cuenta</b><small>Saldar total o parcialmente una participación específica</small></div></button>`:""}${expenseAttachments(e).length?`<button type="button" data-action="receipt"><span class="qa-icon lilac">▧</span><div><b>Ver comprobante</b><small>${expenseAttachments(e).length} archivo(s)</small></div></button>`:""}`;$$("#transactionActionsContent [data-action]").forEach(b=>b.onclick=async()=>{const a=b.dataset.action;if(a==="coverage"){try{const next=e.useCoverage!==true;await updateDoc(doc(db,"households",householdId,"expenses",e.id),{useCoverage:next,updatedAt:serverTimestamp()});closeSheets();toast(next?"Cobertura familiar aplicada ✓":"Cobertura desactivada ✓")}catch(err){console.error(err);toast("No se pudo actualizar la cobertura.")}return}if(a==="settle-expense"){const opts=expenseSettlementOptions(e);if(!opts.length){closeSheets();toast("Esta cuenta ya está saldada.");return}const first=opts[0];openSettlementPayment({...first,maxAmount:first.amount,expenseId:e.id,description:e.description});return}closeSheets();if(a==="edit")openExpense(e);if(a==="duplicate")duplicateExpense(e);if(a==="receipt")openAttachmentViewer(expenseAttachments(e),0)});openSheet("#transactionActionsSheet","compact")}
function openQuickActions(){openSheet("#quickActionsSheet","compact")}
$("#qaExpense")?.addEventListener("click",()=>{closeSheets();openExpense()});
$("#qaSettle")?.addEventListener("click",()=>{closeSheets();go("balances")});
$("#qaReceipt")?.addEventListener("click",()=>{closeSheets();openExpense();setTimeout(()=>$("#expenseReceipt")?.click(),260)});
$("#qaRecurring")?.addEventListener("click",()=>{closeSheets();$("#recurringForm").reset();$("#recurringDay").value=1;fillMemberControls();openSheet("#recurringSheet")});
$("#qaCloseMonth")?.addEventListener("click",()=>{closeSheets();openMonthCloseSummary()});

function initPullToRefresh(){let start=0,dy=0,tracking=false;const indicator=$("#pullRefresh");window.addEventListener("touchstart",e=>{if(window.scrollY<=0&&!activeSheet){start=e.touches[0].clientY;tracking=true;dy=0}},{passive:true});window.addEventListener("touchmove",e=>{if(!tracking)return;dy=e.touches[0].clientY-start;if(dy>0&&dy<120){indicator?.classList.add("show");if(indicator)indicator.style.transform=`translate(-50%, ${Math.min(54,dy*.45)}px)`}},{passive:true});window.addEventListener("touchend",()=>{if(!tracking)return;tracking=false;if(dy>78){renderAll();showLivePill("Mi Casa actualizada","↻")}indicator?.classList.remove("show");if(indicator)indicator.style.transform=""},{passive:true})}
initPullToRefresh();

// Disable page zoom on iOS while keeping document preview interaction separate.
document.addEventListener("gesturestart",e=>{if(!e.target.closest("#attachmentViewerStage"))e.preventDefault()},{passive:false});

function renderIntelligence(){
 const spent=totalsFor(monthExpenses()),forecast=forecastMonthTotal(),limit=globalBudgetLimit(),safe=safeToSpendAmount(),elapsed=daysElapsedInActiveMonth();
 $("#forecastAmount")&&($("#forecastAmount").textContent=money(forecast));$("#forecastTitle")&&($("#forecastTitle").textContent=limit?(forecast<=limit?"Cierre proyectado dentro del plan":"Cierre proyectado sobre el plan"):"Cierre estimado según tu ritmo");$("#forecastCopy")&&($("#forecastCopy").textContent=limit?`${forecast<=limit?"Podrían cerrar dentro de":"La proyección supera"} ${money(limit)}. Basado en ${elapsed||1} días.`:`Basado en ${elapsed||1} días de actividad.`);if($("#forecastTrack"))$("#forecastTrack").style.width=`${limit?Math.min(100,forecast/limit*100):Math.min(100,(elapsed/daysInMonth())*100)}%`;
 $("#safeToSpend")&&($("#safeToSpend").textContent=safe==null?"—":money(safe)+"/día");$("#safeSpendCopy")&&($("#safeSpendCopy").textContent=safe==null?"Configura un presupuesto global para activar esta guía.":`Quedan ${money(Math.max(0,limit-spent))} para el resto del mes.`);
 const h=financialHealth();$("#healthScore")&&($("#healthScore").textContent=h.score);$("#healthLabel")&&($("#healthLabel").textContent=h.label);$("#healthCopy")&&($("#healthCopy").textContent=h.reasons.join(" · "));$("#healthRing")?.style.setProperty("--health",`${h.score*3.6}deg`);
 const week=currentWeekExpenses(),wt=totalsFor(week),top=topCategoryFor(week),largest=[...week].sort((a,b)=>Number(b.amount)-Number(a.amount))[0],wl=weeklyBudgetLimit(),nr=nextRecurringSummary();
 $("#weeklyRecapGrid")&&($("#weeklyRecapGrid").innerHTML=`<div><small>Gasto semanal</small><b>${money(wt)}</b><em>${wl?`${Math.round(wt/wl*100)}% de ${money(wl)}`:"Últimos 7 días"}</em></div><div><small>Espacio principal</small><b>${top?esc(top[0]):"—"}</b><em>${top?money(top[1]):"Sin movimientos"}</em></div><div><small>Mayor gasto</small><b>${largest?money(largest.amount):"—"}</b><em>${largest?esc(largest.description):"Sin movimientos"}</em></div><div><small>Próximo recurrente</small><b>${esc(nr.title)}</b><em>${esc(nr.sub)}</em></div>`);
}
function goalCard(g){const t=Number(g.targetAmount||0),c=Number(g.currentAmount||0),pct=t?Math.min(100,c/t*100):0;return `<button type="button" class="goal-card" data-goal="${esc(g.id)}"><div class="goal-icon">${esc(g.icon||"★")}</div><div class="goal-main"><span>${esc(g.name)}</span><b>${money(c)} <small>de ${money(t)}</small></b><div class="goal-progress"><i style="width:${pct}%"></i></div><em>${Math.round(pct)}%${g.targetDate?` · ${esc(g.targetDate)}`:""}</em></div></button>`}
function renderGoals(){const s=[...goals].sort((a,b)=>String(a.targetDate||"9999").localeCompare(String(b.targetDate||"9999")));$("#homeGoals")&&($("#homeGoals").innerHTML=s.length?s.slice(0,3).map(goalCard).join(""):`<div class="empty smart-empty"><b>Una meta cambia el enfoque</b>Crea un objetivo como vacaciones, muebles o fondo de emergencia.</div>`);$("#goalsGrid")&&($("#goalsGrid").innerHTML=s.length?s.map(goalCard).join(""):`<div class="empty"><b>Sin metas todavía</b>El Owner puede crear el primer objetivo familiar.</div>`);$$("[data-goal]").forEach(b=>b.onclick=()=>openGoalEditor(goals.find(g=>g.id===b.dataset.goal)))}
function openGoalEditor(g=null){if(!isOwner()){toast("Solo el Owner puede administrar metas.");return}$("#goalId").value=g?.id||"";$("#goalName").value=g?.name||"";$("#goalTarget").value=g?.targetAmount||"";$("#goalCurrent").value=g?.currentAmount||"";$("#goalDate").value=g?.targetDate||"";$("#goalIcon").value=g?.icon||"★";$("#deleteGoalBtn").classList.toggle("hidden",!g);openSheet("#goalSheet")}
async function saveGoal(){const data={name:$("#goalName").value.trim(),targetAmount:Number($("#goalTarget").value||0),currentAmount:Number($("#goalCurrent").value||0),targetDate:$("#goalDate").value||"",icon:$("#goalIcon").value||"★",updatedAt:serverTimestamp()};if(!data.name||data.targetAmount<=0){toast("Completa nombre y monto.");return}try{const id=$("#goalId").value;if(id)await setDoc(doc(db,"households",householdId,"goals",id),data,{merge:true});else await addDoc(collection(db,"households",householdId,"goals"),{...data,createdAt:serverTimestamp()});closeSheets();toast("Meta guardada ✨")}catch(e){console.error(e);toast("No se pudo guardar la meta.")}}
$("#addGoalBtn")?.addEventListener("click",()=>openGoalEditor());$(".goalCancel")?.addEventListener("click",closeSheets);$("#saveGoalTop")?.addEventListener("click",saveGoal);$("#goalForm")?.addEventListener("submit",e=>{e.preventDefault();saveGoal()});$("#deleteGoalBtn")?.addEventListener("click",async()=>{const id=$("#goalId").value;if(id&&confirm("¿Eliminar esta meta?")){await deleteDoc(doc(db,"households",householdId,"goals",id));closeSheets()}});
function renderSubscriptions(){const a=recurrings.filter(r=>r.active),m=a.reduce((s,r)=>s+Number(r.amount||0),0);$("#subscriptionMonthly")&&($("#subscriptionMonthly").textContent=money(m));$("#subscriptionYearly")&&($("#subscriptionYearly").textContent=money(m*12));$("#subscriptionCards")&&($("#subscriptionCards").innerHTML=a.length?a.map(r=>`<article class="subscription-card"><div class="subscription-icon ${categoryClass(r.category)}">${categoryIcon(r.category)}</div><div><b>${esc(r.name)}</b><small>${esc(r.category)} · día ${r.day}</small></div><strong>${money(r.amount)}<small>/mes</small></strong></article>`).join(""):`<div class="empty"><b>Sin compromisos fijos</b>Agrega recurrentes para ver tu costo mensual y anual.</div>`)}
function renderAutomations(){if(!$("#automationList"))return;$("#automationList").innerHTML=automationRules.length?automationRules.map(r=>`<div class="automation-row"><span class="automation-state">✦</span><div><b>${esc(automationLabel(r))}</b><small>Activa</small></div><button class="text-btn delete-automation" data-id="${esc(r.id)}">×</button></div>`).join(""):`<div class="empty"><b>Sin reglas personalizadas</b>Agrega reglas para adaptar los avisos.</div>`;$$(".delete-automation").forEach(b=>b.onclick=async()=>{if(confirm("¿Eliminar esta regla?"))await deleteDoc(doc(db,"households",householdId,"automationRules",b.dataset.id))})}
function openAutomation(){if(!isOwner())return;$("#automationForm").reset();openSheet("#automationSheet")}
$("#addAutomationBtn")?.addEventListener("click",openAutomation);$("#adminAutomations")?.addEventListener("click",()=>{go("family");setTimeout(openAutomation,120)});$(".automationCancel")?.addEventListener("click",closeSheets);$("#automationForm")?.addEventListener("submit",async e=>{e.preventDefault();try{await addDoc(collection(db,"households",householdId,"automationRules"),{type:$("#automationType").value,category:$("#automationCategory").value||"",threshold:Number($("#automationThreshold").value||0),enabled:true,createdAt:serverTimestamp()});closeSheets();toast("Regla activada ✨")}catch(err){console.error(err);toast("No se pudo guardar la regla.")}});
function openCompare(){const cur=monthExpenses(activeMonth),pk=prevMonthKey(activeMonth),prev=monthExpenses(pk),ct=totalsFor(cur),pt=totalsFor(prev),cc=catsFor(cur),pc=catsFor(prev),cats=new Set([...Object.keys(cc),...Object.keys(pc)]),diff=ct-pt,pct=pt?diff/pt*100:null;$("#compareContent").innerHTML=`<div class="compare-hero"><div><small>${cap(monthLabel(activeMonth))}</small><strong>${money(ct)}</strong></div><span>vs.</span><div><small>${cap(monthLabel(pk))}</small><strong>${money(pt)}</strong></div></div><div class="compare-delta ${diff>0?"up":"down"}"><b>${pct==null?"Primera comparación":`${pct>0?"+":""}${pct.toFixed(1)}%`}</b><span>${diff>0?"más gasto":"menos gasto"} ${pt?`· ${money(Math.abs(diff))}`:""}</span></div><div class="profile-section-title"><span>CATEGORÍAS</span><h3>Dónde cambió el mes</h3></div><div class="compare-list">${[...cats].map(c=>{const a=cc[c]||0,b=pc[c]||0,d=a-b;return `<div class="compare-row"><span>${categoryIcon(c)} ${esc(c)}</span><b>${money(a)}</b><small>${d?`${d>0?"+":""}${money(d)}`:"sin cambio"}</small></div>`}).join("")||'<div class="empty">Sin datos suficientes.</div>'}</div>`;openSheet("#compareSheet")}
$("#openCompareBtn")?.addEventListener("click",openCompare);$("#adminCompare")?.addEventListener("click",openCompare);$(".compareCancel")?.addEventListener("click",closeSheets);
function globalSearch(q){q=(q||"").trim().toLowerCase();if(!q)return[];const num=Number(q.replace(/[$,]/g,"")),out=[];expenses.forEach(e=>{if(`${e.description} ${e.category} ${e.date} ${member(e.payerId).name}`.toLowerCase().includes(q)||(!Number.isNaN(num)&&num>0&&Math.abs(Number(e.amount)-num)<.01))out.push({type:"expense",title:e.description,sub:`${member(e.payerId).name} · ${money(e.amount)} · ${e.date}`,id:e.id})});members.forEach(m=>{if(`${m.name} ${m.email||""}`.toLowerCase().includes(q))out.push({type:"member",title:m.name,sub:"Perfil familiar",id:m.id})});recurrings.forEach(r=>{if(`${r.name} ${r.category}`.toLowerCase().includes(q))out.push({type:"recurring",title:r.name,sub:`Recurrente · ${money(r.amount)} · día ${r.day}`,id:r.id})});goals.forEach(g=>{if(g.name.toLowerCase().includes(q))out.push({type:"goal",title:g.name,sub:`Meta · ${money(g.currentAmount||0)} de ${money(g.targetAmount||0)}`,id:g.id})});expenses.forEach(e=>expenseAttachments(e).forEach((a,i)=>{if(`${a.name||""} ${e.description}`.toLowerCase().includes(q)||(q==="pdf"&&attachmentKind(a)==="pdf"))out.push({type:"receipt",title:a.name||"Comprobante",sub:`${e.description} · ${e.date}`,id:e.id,att:i})}));return out.slice(0,40)}
function renderGlobalSearch(){const q=$("#globalSearchInput").value,items=globalSearch(q);$("#globalSearchResults").innerHTML=q?(items.length?items.map((x,i)=>`<button type="button" class="global-search-item" data-result="${i}"><span>${x.type==="expense"?"$":x.type==="member"?"◎":x.type==="recurring"?"↻":x.type==="goal"?"★":"▧"}</span><div><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></div><em>→</em></button>`).join(""):`<div class="empty"><b>Sin resultados</b>Prueba con persona, categoría, monto o archivo.</div>`):`<div class="search-suggestions"><button data-search-chip="AT&T">AT&T</button><button data-search-chip="Comida">Comida</button><button data-search-chip="PDF">PDF</button><button data-search-chip="Alberto">Alberto</button></div>`;$$(".global-search-item").forEach((el,i)=>el.onclick=()=>{const x=items[i];closeSheets();if(x.type==="expense")openExpense(expenses.find(e=>e.id===x.id));else if(x.type==="member")openMemberDetail(x.id);else if(x.type==="goal")openGoalEditor(goals.find(g=>g.id===x.id));else if(x.type==="receipt"){const e=expenses.find(e=>e.id===x.id);openAttachmentViewer(expenseAttachments(e),x.att)}else go("month")});$$("[data-search-chip]").forEach(b=>b.onclick=()=>{$("#globalSearchInput").value=b.dataset.searchChip;renderGlobalSearch()})}
function openGlobalSearch(){openSheet("#globalSearchSheet");renderGlobalSearch();setTimeout(()=>$("#globalSearchInput")?.focus(),180)}
$("#globalSearchBtn")?.addEventListener("click",openGlobalSearch);$("#mobileSearchBtn")?.addEventListener("click",openGlobalSearch);$(".searchCancel")?.addEventListener("click",closeSheets);$("#globalSearchInput")?.addEventListener("input",renderGlobalSearch);$("#adminBudgetAdvanced")?.addEventListener("click",openBudgets);
function openSpaceDetail(cat){
  const ex=rangeExpenses().filter(e=>e.category===cat),total=totalsFor(ex),lim=Number(budgets[`${activeMonth}_${cat}`]?.limit||0),pct=lim?Math.round(total/lim*100):null;
  $("#spaceDetailTitle").textContent=cat;
  $("#spaceDetailContent").innerHTML=`<div class="space-detail-hero ${categoryClass(cat)}"><span>${categoryIcon(cat)}</span><div><small>${rangeLabel()}</small><strong>${money(total)}</strong><p>${lim?`${pct}% de un límite de ${money(lim)}`:`${ex.length} movimientos en este período`}</p></div></div>${lim?`<div class="space-detail-progress"><i style="width:${Math.min(100,pct)}%"></i></div>`:""}<div class="profile-section-title"><span>MOVIMIENTOS</span><h3>${ex.length?`${ex.length} gastos`:"Sin gastos"}</h3></div><div class="feed premium-feed">${ex.length?ex.slice(0,12).map(feedHTML).join(""):`<div class="empty">No hay movimientos en ${esc(cat)} para este período.</div>`}</div>`;
  $("#spaceDetailContent").querySelectorAll(".feed-item[data-id]").forEach(el=>el.onclick=()=>openExpense(expenses.find(x=>x.id===el.dataset.id)));
  openSheet("#spaceDetailSheet");
}
$(".spaceDetailCancel")?.addEventListener("click",closeSheets);

function openDayDetail(day){
  const date=`${activeMonth}-${String(day).padStart(2,"0")}`,ex=expenses.filter(e=>e.date===date),rec=recurrings.filter(r=>r.active&&Number(r.day)===day);
  $("#dayDetailTitle").textContent=new Intl.DateTimeFormat(uiLang==="en"?"en-US":"es-US",{weekday:"long",month:"long",day:"numeric"}).format(new Date(date+"T12:00:00"));
  $("#dayDetailContent").innerHTML=`<div class="day-summary"><span>${ex.length} gastos</span><strong>${money(totalsFor(ex))}</strong></div>${rec.length?`<div class="day-recurring"><span>PRÓXIMOS / RECURRENTES</span>${rec.map(r=>`<div><b>↻ ${esc(r.name)}</b><strong>${money(r.amount)}</strong></div>`).join("")}</div>`:""}<div class="feed premium-feed">${ex.length?ex.map(feedHTML).join(""):`<div class="empty"><b>Día libre</b>No hay gastos registrados en esta fecha.</div>`}</div>`;
  $("#dayDetailContent").querySelectorAll(".feed-item[data-id]").forEach(el=>el.onclick=()=>openExpense(expenses.find(x=>x.id===el.dataset.id)));
  openSheet("#dayDetailSheet");
}
$(".dayDetailCancel")?.addEventListener("click",closeSheets);
$("#prevMonthBtn")?.addEventListener("click",()=>{activeMonth=addMonths(activeMonth,-1);renderAll()});
$("#nextMonthBtn")?.addEventListener("click",()=>{activeMonth=addMonths(activeMonth,1);renderAll()});
$("#calendarMonthLabel")?.addEventListener("click",()=>{activeMonth=nowMonth();renderAll()});
let touchStartX=0;
$("#financialCalendar")?.addEventListener("touchstart",e=>touchStartX=e.changedTouches[0].clientX,{passive:true});
$("#financialCalendar")?.addEventListener("touchend",e=>{const dx=e.changedTouches[0].clientX-touchStartX;if(Math.abs(dx)>70){activeMonth=addMonths(activeMonth,dx>0?-1:1);renderAll()}},{passive:true});

function renderVault(){
  const search=($("#vaultSearch")?.value||"").toLowerCase(),mid=$("#vaultMember")?.value||"",cat=$("#vaultCategory")?.value||"";
  const all=[];expenses.forEach(e=>expenseAttachments(e).forEach((a,i)=>all.push({a,e,i})));
  const filtered=all.filter(x=>(!search||`${x.e.description} ${x.a.name}`.toLowerCase().includes(search))&&(!mid||x.e.payerId===mid||(x.e.participantIds||[]).includes(mid))&&(!cat||x.e.category===cat));
  $("#vaultFileCount").textContent=all.length;$("#vaultExpenseCount").textContent=receiptExpenseCount();$("#vaultMonthCount").textContent=all.filter(x=>monthKey(x.e.date)===activeMonth).length;
  $("#vaultMember").innerHTML=`<option value="">Todas las personas</option>`+members.map(m=>`<option value="${esc(m.id)}" ${m.id===mid?"selected":""}>${esc(m.name)}</option>`).join("");
  $("#vaultGrid").innerHTML=filtered.length?filtered.map((x,n)=>{const kind=attachmentKind(x.a),visual=kind==="image"&&x.a.data?`<img loading="lazy" src="${x.a.data}" alt="">`:`<span class="vault-file-icon ${kind}">${kind==="pdf"?"PDF":"▧"}</span>`;return `<button type="button" class="vault-item" data-exp="${esc(x.e.id)}" data-att="${x.i}">${visual}<span><b>${esc(x.a.name||"Comprobante")}</b><small>${esc(x.e.description)} · ${esc(x.e.date)}</small><em>${esc(member(x.e.payerId).name)} · ${esc(x.e.category)}</em></span></button>`}).join(""):`<div class="empty"><b>Sin comprobantes</b>No encontramos archivos con esos filtros.</div>`;
  $$(".vault-item").forEach(el=>el.onclick=()=>{const e=expenses.find(x=>x.id===el.dataset.exp);openAttachmentViewer(expenseAttachments(e),Number(el.dataset.att))});
}
$("#vaultSearch")?.addEventListener("input",renderVault);$("#vaultMember")?.addEventListener("change",renderVault);$("#vaultCategory")?.addEventListener("change",renderVault);
$("#activityVault")?.addEventListener("click",()=>go("vault"));$("#openVaultFromHome")?.addEventListener("click",()=>go("vault"));$("#vaultAddExpense")?.addEventListener("click",()=>openExpense());

function buildNotifications(){
  const list=[],now=new Date(),day=now.getDate();
  const total=totalsFor(monthExpenses());
  CATS.forEach(c=>{const lim=Number(budgets[`${activeMonth}_${c}`]?.limit||0),spent=Number(catTotals()[c]||0);if(lim&&spent/lim>=.8)list.push({type:spent>lim?"alert":"budget",title:spent>lim?`${c} superó el presupuesto`:`${c} llegó al ${Math.round(spent/lim*100)}%`,sub:`${money(spent)} de ${money(lim)}`,time:`${activeMonth}-01`})});
  recurrings.filter(r=>r.active&&Number(r.day)>=day&&Number(r.day)<=day+3).forEach(r=>list.push({type:"recurring",title:`${r.name} se acerca`,sub:`Día ${r.day} · ${money(r.amount)}`,time:`${activeMonth}-${String(r.day).padStart(2,"0")}`}));
  expenses.slice(0,4).forEach(e=>list.push({type:"expense",title:`Nuevo gasto: ${e.description}`,sub:`${member(e.payerId).name} · ${money(e.amount)}`,time:e.date}));
  automationRules.filter(r=>r.enabled!==false).forEach(r=>{if(r.type==="largeExpense"){const hit=expenses.find(e=>(!r.category||e.category===r.category)&&Number(e.amount)>=Number(r.threshold||100));if(hit)list.push({type:"alert",title:"Regla: gasto grande",sub:`${hit.description} · ${money(hit.amount)}`,time:hit.date})}if(r.type==="missingReceipt"){const hit=expenses.find(e=>(!r.category||e.category===r.category)&&Number(e.amount)>=Number(r.threshold||100)&&!expenseAttachments(e).length);if(hit)list.push({type:"alert",title:"Falta comprobante",sub:`${hit.description} · ${money(hit.amount)}`,time:hit.date})}if(r.type==="budget80"){(r.category?[r.category]:CATS).forEach(c=>{const lim=Number(budgets[`${activeMonth}_${c}`]?.limit||0),spent=Number(catTotals()[c]||0);if(lim&&spent/lim>=.8)list.push({type:"budget",title:`Regla: ${c} al ${Math.round(spent/lim*100)}%`,sub:`${money(spent)} de ${money(lim)}`,time:`${activeMonth}-28`})})}if(r.type==="recurringSoon"){const a=Number(r.threshold||3),d=new Date().getDate();recurrings.filter(x=>x.active&&Number(x.day)>=d&&Number(x.day)<=d+a).forEach(x=>list.push({type:"recurring",title:`Regla: ${x.name} se acerca`,sub:`Día ${x.day} · ${money(x.amount)}`,time:`${activeMonth}-${String(x.day).padStart(2,"0")}`}))}});
  settlements.filter(s=>s.status==="paid").slice(0,3).forEach(s=>list.push({type:"paid",title:`Pago registrado`,sub:`${member(s.from).name} → ${member(s.to).name} · ${money(s.amount)}`,time:s.month+"-28"}));
  if(!list.length)list.push({type:"ok",title:"Mi Casa está al día",sub:"No hay avisos importantes ahora.",time:today()});
  return list.sort((a,b)=>String(b.time).localeCompare(String(a.time)));
}
function renderNotifications(){
  const list=buildNotifications(),seen=localStorage.getItem("miCasaNotificationsSeen")||"",unread=list.filter(x=>x.time>seen).length;
  ["#notifBadge","#mobileNotifBadge"].forEach(sel=>{const b=$(sel);if(b){b.textContent=unread;b.classList.toggle("hidden",!unread)}});
  if($("#notificationList"))$("#notificationList").innerHTML=list.map(n=>`<div class="notification-row ${n.type}"><span>${n.type==="budget"?"◔":n.type==="alert"?"!":n.type==="recurring"?"↻":n.type==="paid"?"✓":n.type==="ok"?"✓":"＋"}</span><div><b>${esc(n.title)}</b><small>${esc(n.sub)}</small></div></div>`).join("");
}
function openNotifications(){renderNotifications();openSheet("#notificationSheet")}
$("#notifBtn")?.addEventListener("click",openNotifications);$("#mobileNotifBtn")?.addEventListener("click",openNotifications);$(".notificationCancel")?.addEventListener("click",closeSheets);
$("#markNotificationsRead")?.addEventListener("click",()=>{localStorage.setItem("miCasaNotificationsSeen",today());renderNotifications();toast("Avisos marcados como leídos")});

function openMonthCloseSummary(){
  const ex=monthExpenses(),total=totalsFor(ex),cats=catTotals(),top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0],{paid}=calc(),payer=Object.entries(paid).sort((a,b)=>b[1]-a[1])[0],pending=settlementPlan();
  $("#monthCloseContent").innerHTML=`<div class="close-month-hero"><span>${cap(monthLabel(activeMonth))}</span><strong>${money(total)}</strong><small>${ex.length} gastos registrados</small></div><div class="close-month-grid"><div><small>Categoría principal</small><b>${top?`${esc(top[0])} · ${money(top[1])}`:"Sin gastos"}</b></div><div><small>Quien adelantó más</small><b>${payer?`${esc(member(payer[0]).name)} · ${money(payer[1])}`:"—"}</b></div><div><small>Saldos pendientes</small><b>${pending.length}</b></div><div><small>Comprobantes</small><b>${ex.reduce((n,e)=>n+expenseAttachments(e).length,0)}</b></div></div>${pending.length?`<div class="close-warning">Hay ${pending.length} transferencia${pending.length===1?"":"s"} pendiente${pending.length===1?"":"s"}. Puedes cerrar el mes igualmente.</div>`:`<div class="close-success">✓ Todos los saldos están resueltos.</div>`}<button class="primary wide" id="confirmCloseMonth">Cerrar ${cap(monthLabel(activeMonth))}</button>`;
  $("#confirmCloseMonth").onclick=async()=>{try{await setDoc(doc(db,"households",householdId,"monthlyClosings",activeMonth),{status:"closed",closedBy:me.uid,closedAt:serverTimestamp(),total},{merge:true});closeSheets();toast("Mes cerrado ✓")}catch(e){console.error(e);toast("No se pudo cerrar el mes.")}};
  openSheet("#monthCloseSheet");
}
$(".closeSummaryCancel")?.addEventListener("click",closeSheets);

function applyHomeRange(range){
  homeRange=range;$$("[data-home-range]").forEach(b=>b.classList.toggle("active",b.dataset.homeRange===range));renderAll()
}
$$("[data-home-range]").forEach(b=>b.addEventListener("click",()=>applyHomeRange(b.dataset.homeRange)));
function go(view){
  currentView=view;
  if(view==="admin"&&!isOwner()){view="home";toast(uiLang==="en"?"This section is only available to the Owner.":"Esta sección es solo para el Owner.")}
  $$(".page").forEach(p=>p.classList.remove("active","page-enter"));const target=$("#"+view+"Page");if(!target){view="home"}const page=$("#"+view+"Page");page.classList.add("active","page-enter");setTimeout(()=>page.classList.remove("page-enter"),320);$$("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  const titles=uiLang==="en"?{home:`Good morning, ${(me?.displayName||"").split(" ")[0]||"family"} 👋`,activity:"Expenses",bills:"Bills",balances:"Balances",month:"Calendar",family:"My Home",admin:"Administration",vault:"Receipts"}:{home:`Buenos días, ${(me?.displayName||"").split(" ")[0]||"familia"} 👋`,activity:"Gastos",bills:"Cuentas",balances:"Saldos",month:"Calendario",family:"Mi Casa",admin:"Administración",vault:"Comprobantes"};
  $("#pageTitle").textContent=titles[view]||"Mi Casa";applyLanguage();
  if(allDataReady()){requestAnimationFrame(()=>{if(view==="month")renderCalendar();if(view==="family"){const c=settledBalanceData();renderMembers(c.paid,c.share,c.balances)}if(view==="activity")renderActivity();if(view==="bills")renderBills();if(view==="vault")renderVault()})}
  window.scrollTo({top:0,behavior:"auto"})
}
$$("[data-view]").forEach(b=>b.onclick=()=>go(b.dataset.view));$$("[data-jump]").forEach(b=>b.onclick=()=>{const v=b.dataset.jump;go(v)});
$("#profileBtn").onclick=()=>{const mm=myMember();if(mm)openMemberDetail(mm.id)};

// --- Bilingual UI (ES / EN) ---
const EN={
"Inicio":"Home","Actividad":"Activity","Gastos":"Expenses","Cuentas":"Bills","Saldos":"Balances","Mes":"Month","Miembros":"Members","Admin":"Admin",
"Nuevo gasto":"New expense","Gastos del mes":"Monthly spending","movimientos":"transactions","Sin comparación aún":"No comparison yet",
"Te deben":"Owed to you","Tú debes":"You owe","Balance personal":"Personal balance","Presupuesto usado":"Budget used",
"Agregar gasto":"Add expense","Registra un pago":"Record a payment","Saldar":"Settle up","Quién paga a quién":"Who pays whom","ESTADO DE MI CASA":"MY HOME STATUS","Todo lo importante de la familia, en un solo lugar.":"Everything that matters to your family, in one place.","Gastos del mes":"Monthly spending","Presupuesto familiar":"Family budget","NUESTRA CASA":"OUR HOME","La familia este mes":"The family this month","Administrar":"Manage","PRESUPUESTO":"BUDGET","En qué estamos gastando":"Where we are spending","Ver límites":"View limits","PARA TI":"FOR YOU","Lo importante de Mi Casa":"What matters at home","RESUMEN":"SUMMARY","La casa al día":"Home at a glance","HISTORIA DE LA CASA":"HOME HISTORY","Actividad reciente":"Recent activity","Abrir original":"Open original","Anterior":"Previous","Siguiente":"Next",
"Presupuestos":"Budgets","Control por categoría":"Category control","Calendario y cierre":"Calendar & close",
"Lo importante este mes":"This month at a glance","Balances":"Balances","Ver miembros":"View members","PENDIENTES":"PENDING",
"Ver todos":"View all","ESTE MES":"THIS MONTH","En qué gastamos":"Where we spent","Recientes":"Recent","Ver todo":"View all",
"MOVIMIENTOS":"TRANSACTIONS","Todas las categorías":"All categories","Deudas simplificadas":"Simplified debts",
"Reducimos los cruces para dejar la menor cantidad posible de transferencias.":"We simplify debts to minimize the number of transfers.",
"HISTORIAL":"HISTORY","Pagos registrados":"Recorded payments","ESTADO DE CUENTA":"MONTHLY STATEMENT","Reporte PDF":"PDF Report",
"Cerrar mes":"Close month","Calendario":"Calendar","Mi Casa":"My Home","Tu familia, de un vistazo":"Your family at a glance","¿Qué quieres hacer?":"What would you like to do?","Nuevo gasto":"New expense","Registrar pago":"Record payment","Subir comprobante":"Upload receipt","Pago recurrente":"Recurring payment","CALENDARIO":"CALENDAR","Compromisos del mes":"Monthly commitments","Recurrente":"Recurring",
"PRÓXIMOS":"UPCOMING","Pagos recurrentes":"Recurring payments","Resumen por persona":"Summary by person",
"MI CASA":"MY HOME","Toca un miembro para abrir su perfil financiero.":"Tap a member to open their financial profile.",
"Agregar miembro":"Add member","Administración":"Administration","Controla acceso, recuperación de cuenta y estructura del hogar.":"Manage access, account recovery, and household structure.",
"Seguridad":"Security","Las contraseñas nunca son visibles. Puedes enviar un enlace seguro de restablecimiento.":"Passwords are never visible. You can send a secure reset link.",
"Cancelar":"Cancel","Guardar":"Save","¿En qué se gastó?":"What was it for?","Fecha":"Date","Categoría":"Category","Pagó":"Paid by",
"¿Para quién fue?":"Who was it for?","Comprobante":"Receipt","Nota":"Note","Cerrar":"Close","Perfil financiero":"Financial profile",
"Casa":"Home","Comida":"Food","Servicios":"Utilities","Teléfono":"Phone","Transporte":"Transportation","Salud":"Health","Suscripciones":"Subscriptions","Otros":"Other","Hoy":"Today","Esta semana":"This week","Este mes":"This month","Comprobantes":"Receipts","Centro de avisos":"Notifications","Marcar leído":"Mark read","Bóveda de comprobantes":"Receipt vault","Cerrar mes":"Close month"
};
function translateText(root=document.body){if(uiLang!=="en")return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const raw=n.nodeValue,trim=raw.trim();if(!trim)continue;let out=EN[trim];if(!out){for(const [es,en] of Object.entries(EN)){if(trim.startsWith(es+" ")){out=en+trim.slice(es.length);break}}}if(out)n.nodeValue=raw.replace(trim,out)}document.querySelectorAll("input[placeholder]").forEach(el=>{const p=el.placeholder;if(EN[p])el.placeholder=EN[p]});document.documentElement.lang="en"}
function applyLanguage(){if(uiLang==="en")translateText();const b=$("#languageToggle");if(b)b.textContent=uiLang==="es"?"ES / EN":"EN / ES"}
$("#languageToggle")?.addEventListener("click",()=>{uiLang=uiLang==="es"?"en":"es";localStorage.setItem("miCasaLanguage",uiLang);location.reload()});
const langObserver=new MutationObserver(()=>{if(uiLang==="en")translateText()});langObserver.observe(document.body,{childList:true,subtree:true});

// --- PDF reports: global household + individual member ---
let reportType="global";
function reportLabels(lang){
 const en=lang==="en";
 return en?{
  globalTitle:"Mi Casa · Household Report",memberTitle:"Mi Casa · Personal Statement",period:"Period",total:"Total spending",transactions:"transactions",
  overview:"Household overview",categories:"Spending by category",people:"Summary by person",person:"Person",paid:"Paid",share:"Share",balance:"Balance",
  transfers:"Who pays whom",from:"From",to:"To",pending:"Pending amount",settled:"Recorded payments",date:"Date",expenses:"Expenses",desc:"Description",
  cat:"Category",payer:"Paid by",amount:"Amount",participants:"Participants",receipts:"Receipts",none:"None",noExpenses:"No expenses recorded",
  personalSummary:"Personal summary",yourPaid:"Amount paid",yourShare:"Your share",youReceive:"To receive",youOwe:"To pay",obligations:"Money to pay / receive",
  direction:"Status",payTo:"Pays",receiveFrom:"Receives from",personalExpenses:"Expenses involving this person",personalPayments:"Recorded transfers involving this person",
  role:"Role",closed:"Closed month",open:"Open month",generated:"Generated by Mi Casa",attachments:"attachments"
 }:{
  globalTitle:"Mi Casa · Reporte global",memberTitle:"Mi Casa · Estado individual",period:"Período",total:"Gastos totales",transactions:"gastos",
  overview:"Resumen del hogar",categories:"Gastos por categoría",people:"Resumen por persona",person:"Persona",paid:"Pagó",share:"Su parte",balance:"Balance",
  transfers:"Quién paga a quién",from:"De",to:"A",pending:"Monto pendiente",settled:"Pagos registrados",date:"Fecha",expenses:"Gastos",desc:"Descripción",
  cat:"Categoría",payer:"Pagó",amount:"Monto",participants:"Participantes",receipts:"Comprobantes",none:"Ninguno",noExpenses:"No hay gastos registrados",
  personalSummary:"Resumen personal",yourPaid:"Total pagado",yourShare:"Su parte",youReceive:"Debe recibir",youOwe:"Debe pagar",obligations:"Dinero que debe pagar / recibir",
  direction:"Estado",payTo:"Paga a",receiveFrom:"Recibe de",personalExpenses:"Gastos donde participa",personalPayments:"Transferencias registradas de esta persona",
  role:"Rol",closed:"Mes cerrado",open:"Mes abierto",generated:"Generado por Mi Casa",attachments:"comprobantes"
 };
}
function reportBaseStyles(){
 return `*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#142033;margin:0;background:#fff;font-size:12px}.page{padding:34px 38px}.cover{background:linear-gradient(135deg,#e9f7ff,#eefaf5);border-radius:28px;padding:28px;margin-bottom:24px}.brand{font-size:10px;letter-spacing:.2em;color:#6c8193;font-weight:800}.cover h1{font-size:28px;margin:8px 0 4px}.period{color:#718096}.big-total{font-size:42px;font-weight:850;letter-spacing:-.04em;margin:22px 0 4px}.cover-meta{display:flex;gap:18px;flex-wrap:wrap;color:#6f7d8c}.section{margin:24px 0}.section h2{font-size:17px;margin:0 0 12px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.metric{border:1px solid #e5ebf0;border-radius:16px;padding:12px;background:#fbfcfd}.metric span{display:block;font-size:9px;color:#778596;text-transform:uppercase;letter-spacing:.08em}.metric b{display:block;font-size:18px;margin-top:5px}.metric small{display:block;color:#7c8996;margin-top:3px}.category-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.category-row{border:1px solid #e7ecf0;border-radius:13px;padding:10px;display:flex;justify-content:space-between}.category-row span{color:#647487}.transfer{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;border:1px solid #e5ebf0;border-radius:15px;padding:11px;margin:7px 0}.transfer .arrow{text-align:center;color:#718096}.transfer .arrow b{display:block;color:#142033;font-size:15px}.right{text-align:right}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{padding:9px 7px;border-bottom:1px solid #e6ebef;text-align:left;vertical-align:top}th{font-size:9px;text-transform:uppercase;color:#728092;letter-spacing:.06em}.num{text-align:right;white-space:nowrap}.positive{color:#34865f}.negative{color:#c4545c}.neutral{color:#728092}.personal-hero{display:grid;grid-template-columns:70px 1fr;gap:16px;align-items:center}.avatar{width:66px;height:66px;border-radius:50%;background:#e8f3fd;display:grid;place-items:center;font-size:22px;font-weight:800;color:#347dc0;border:4px solid #fff;box-shadow:0 6px 20px rgba(40,70,90,.08)}.footer-note{color:#8a96a3;font-size:9px;margin-top:25px;text-align:center}.pill{display:inline-block;padding:5px 9px;border-radius:999px;background:#eef4f8;color:#526b80;font-size:9px}.receipt-count{font-size:9px;color:#7c8996}@media print{body{margin:0}.page{padding:12mm 13mm}.cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}.metric,.category-row,.transfer{break-inside:avoid}@page{size:letter;margin:8mm}}`;
}

function reportReceiptImages(e){
  return expenseAttachments(e).filter(a=>String(a.type||"").startsWith("image/")&&a.data)
    .map((a,i)=>`<figure class="receipt-card"><div class="receipt-frame"><img src="${a.data}" alt="Comprobante ${i+1}"></div><figcaption><b>${esc(e.description)}</b><span>${esc(e.date)} · ${money(e.amount)}</span><small>${esc(a.name||`Comprobante ${i+1}`)}</small></figcaption></figure>`).join("");
}
function reportExpenseRows(list,en=false){
  return `<table class="report-table"><thead><tr><th>${en?"Date":"Fecha"}</th><th>${en?"Description":"Descripción"}</th><th>${en?"Category":"Categoría"}</th><th>${en?"Paid by":"Pagó"}</th><th>${en?"Participants":"Participantes"}</th><th class="num">${en?"Amount":"Monto"}</th></tr></thead><tbody>${list.map(e=>`<tr><td>${esc(e.date)}</td><td><b>${esc(e.description)}</b></td><td>${esc(e.category||"Otros")}</td><td>${e.payerId?esc(member(e.payerId).name):(en?"Pending":"Pendiente")}</td><td>${(e.participantIds||[]).map(id=>esc(member(id).name)).join(", ")}</td><td class="num">${money(e.amount)}</td></tr>`).join("")}</tbody></table>`;
}
function proReportShell(body,title,subtitle,en=false){
return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:Letter;margin:15mm 13mm 16mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#14243a;background:#fff;font-size:10px;line-height:1.42}.report{width:100%}.cover{padding:2mm 0 6mm;border-bottom:2px solid #173956;margin-bottom:6mm;display:flex;justify-content:space-between;align-items:flex-end;gap:18px}.brand{display:flex;gap:10px;align-items:center}.brandmark{width:39px;height:39px;border-radius:12px;background:#173956;color:#fff;display:grid;place-items:center;font-weight:900;font-size:16px}.brand small{display:block;letter-spacing:.16em;color:#7c8b9a;font-size:7px;font-weight:800}.brand h1{font-size:20px;margin:1px 0 0}.meta{text-align:right;color:#728294}.meta b{display:block;color:#173956;font-size:10px}h2{font-size:14px;margin:0 0 8px}.section{margin:0 0 6mm}.keep{break-inside:avoid;page-break-inside:avoid}.page-break{break-before:page;page-break-before:always}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.metric{border:1px solid #dfe7ee;border-radius:12px;padding:10px;min-height:62px;break-inside:avoid}.metric span{display:block;color:#74869a;font-size:7px;text-transform:uppercase;letter-spacing:.07em;font-weight:800}.metric b{display:block;font-size:15px;margin-top:4px}.metric small{color:#7d8b99}.transfer-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.transfer{border:1px solid #dfe7ee;border-radius:12px;padding:10px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:9px;break-inside:avoid}.transfer .to{text-align:right}.transfer .amount{text-align:center}.transfer .amount b{font-size:13px;display:block}.transfer small{display:block;color:#8492a0;font-size:7px}.report-table{width:100%;border-collapse:collapse}.report-table thead{display:table-header-group}.report-table tr{break-inside:avoid;page-break-inside:avoid}.report-table th{font-size:7px;text-transform:uppercase;letter-spacing:.07em;text-align:left;color:#687a8c;border-bottom:1.5px solid #cfdbe5;padding:7px 5px}.report-table td{padding:7px 5px;border-bottom:1px solid #e5ebf0;vertical-align:top}.report-table .num{text-align:right;white-space:nowrap}.positive{color:#287452}.negative{color:#a24c4c}.category-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.category{display:flex;justify-content:space-between;border:1px solid #e0e7ed;border-radius:10px;padding:8px 10px;break-inside:avoid}.category span{color:#66798c}.report-empty{border:1px dashed #d4dfe7;border-radius:11px;padding:13px;color:#7d8c99;text-align:center}.receipt-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;align-items:start}.receipt-card{margin:0;border:1px solid #dfe7ee;border-radius:13px;padding:8px;break-inside:avoid;page-break-inside:avoid}.receipt-frame{height:245px;display:flex;align-items:center;justify-content:center;background:#f5f7f9;border-radius:9px;overflow:hidden}.receipt-frame img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}.receipt-card figcaption{padding:7px 2px 1px}.receipt-card figcaption b,.receipt-card figcaption span,.receipt-card figcaption small{display:block}.receipt-card figcaption span{color:#53677a;margin-top:2px}.receipt-card figcaption small{color:#8997a4;margin-top:2px}.footer{margin-top:6mm;padding-top:4mm;border-top:1px solid #e1e8ee;color:#8492a0;font-size:7px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><main class="report"><header class="cover"><div class="brand"><div class="brandmark">⌂</div><div><small>MI CASA · FAMILY FINANCE</small><h1>${esc(title)}</h1></div></div><div class="meta"><b>${esc(subtitle)}</b>${new Date().toLocaleDateString(en?"en-US":"es-US",{year:"numeric",month:"long",day:"numeric"})}</div></header>${body}<div class="footer">${en?"Generated by Mi Casa · Household financial report":"Generado por Mi Casa · Reporte financiero del hogar"} · ${esc(monthLabel(activeMonth))}</div></main></body></html>`;
}
function globalReportHTML(en=false){
 const settled=settledBalanceData(),{paid,share,balances,paymentsOut,paymentsIn}=settled,ex=monthExpenses().slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))),plan=settlementPlan(),cats={};
 const paidEx=ex.filter(e=>e.paymentStatus!=="pending"&&e.payerId);paidEx.forEach(e=>cats[e.category]=(cats[e.category]||0)+Number(e.amount||0));
 const total=paidEx.reduce((s,e)=>s+Number(e.amount||0),0),pendingEx=ex.filter(e=>e.paymentStatus==="pending"||!e.payerId),pending=pendingEx.reduce((s,e)=>s+Number(e.amount||0),0),receiptCount=ex.reduce((s,e)=>s+expenseAttachments(e).filter(a=>String(a.type||"").startsWith("image/")&&a.data).length,0);
 const transfers=plan.length?`<div class="transfer-grid">${plan.map(t=>`<div class="transfer"><div><b>${esc(member(t.from).name)}</b><small>${en?"pays":"paga"}</small></div><div class="amount">→<b>${money(t.amount)}</b></div><div class="to"><b>${esc(member(t.to).name)}</b><small>${en?"receives":"recibe"}</small></div></div>`).join("")}</div>`:`<div class="report-empty">${en?"No transfers required":"No hay transferencias pendientes"}</div>`;
 const people=`<table class="report-table"><thead><tr><th>${en?"Person":"Persona"}</th><th class="num">${en?"Paid expenses":"Pagó gastos"}</th><th class="num">${en?"Responsibility":"Su parte"}</th><th class="num">${en?"Payments made":"Pagos hechos"}</th><th class="num">${en?"Current balance":"Saldo actual"}</th></tr></thead><tbody>${members.map(m=>`<tr><td><b>${esc(m.name)}</b></td><td class="num">${money(paid[m.id]||0)}</td><td class="num">${money(share[m.id]||0)}</td><td class="num">${money(paymentsOut[m.id]||0)}</td><td class="num ${(balances[m.id]||0)>=0?"positive":"negative"}">${(balances[m.id]||0)>=0?"+":""}${money(balances[m.id]||0)}</td></tr>`).join("")}</tbody></table>`;
 const categories=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<div class="category"><span>${esc(c||"Otros")}</span><b>${money(v)}</b></div>`).join("");
 const receipts=ex.map(reportReceiptImages).join("")||`<div class="report-empty">${en?"No image receipts attached":"No hay imágenes de comprobantes adjuntas"}</div>`;
 const body=`<section class="section keep"><div class="metrics"><div class="metric"><span>${en?"Paid expenses":"Gastos pagados"}</span><b>${money(total)}</b><small>${paidEx.length} ${en?"expenses":"gastos"}</small></div><div class="metric"><span>${en?"Pending bills":"Cuentas pendientes"}</span><b>${money(pending)}</b><small>${pendingEx.length} ${en?"unpaid":"sin pagar"}</small></div><div class="metric"><span>${en?"Payments recorded":"Pagos registrados"}</span><b>${money(settlements.filter(s=>s.month===activeMonth&&s.status==="paid").reduce((sum,s)=>sum+Number(s.amount||0),0))}</b><small>${en?"applied to balances":"aplicados a saldos"}</small></div><div class="metric"><span>${en?"Transfers":"Transferencias"}</span><b>${plan.length}</b><small>${en?"still pending":"aún pendientes"}</small></div></div></section><section class="section keep"><h2>${en?"Who pays whom":"Quién paga a quién"}</h2>${transfers}</section><section class="section"><h2>${en?"Summary by person":"Resumen por persona"}</h2>${people}</section><section class="section keep"><h2>${en?"Spending by category":"Gastos por categoría"}</h2><div class="category-grid">${categories||`<div class="report-empty">${en?"No paid expenses":"Sin gastos pagados"}</div>`}</div></section><section class="section"><h2>${en?"Pending bills":"Cuentas pendientes de pago"}</h2>${pendingEx.length?reportExpenseRows(pendingEx,en):`<div class="report-empty">${en?"No pending bills":"No hay cuentas pendientes"}</div>`}</section><section class="section page-break"><h2>${en?"Expense detail":"Detalle completo de gastos"}</h2>${reportExpenseRows(ex,en)}</section><section class="section page-break"><h2>${en?"Receipts & invoices":"Comprobantes y facturas"}</h2><div class="receipt-grid">${receipts}</div></section>`;
 return proReportShell(body,en?"Household Report":"Reporte global",monthLabel(activeMonth),en);
}
function memberReportHTML(memberId,en=false){
 const m=member(memberId),{paid,share,balances,paymentsOut,paymentsIn}=settledBalanceData(),all=monthExpenses().filter(e=>e.payerId===memberId||(e.participantIds||[]).includes(memberId)).sort((a,b)=>String(a.date).localeCompare(String(b.date))),plan=settlementPlan(),mine=plan.filter(t=>t.from===memberId||t.to===memberId);
 const transfers=mine.length?`<div class="transfer-grid">${mine.map(t=>`<div class="transfer"><div><b>${esc(member(t.from).name)}</b><small>${en?"pays":"paga"}</small></div><div class="amount">→<b>${money(t.amount)}</b></div><div class="to"><b>${esc(member(t.to).name)}</b><small>${en?"receives":"recibe"}</small></div></div>`).join("")}</div>`:`<div class="report-empty">${en?"No pending transfers":"No tiene transferencias pendientes"}</div>`;
 const receipts=all.map(reportReceiptImages).join("")||`<div class="report-empty">${en?"No image receipts attached":"No hay imágenes de comprobantes adjuntas"}</div>`;
 const body=`<section class="section keep"><div class="metrics"><div class="metric"><span>${en?"Paid":"Pagó"}</span><b>${money(paid[memberId]||0)}</b></div><div class="metric"><span>${en?"Responsibility":"Su parte"}</span><b>${money(share[memberId]||0)}</b></div><div class="metric"><span>${en?"Payments made":"Pagos hechos"}</span><b>${money(paymentsOut[memberId]||0)}</b></div><div class="metric"><span>${en?"Current balance":"Saldo actual"}</span><b class="${(balances[memberId]||0)>=0?"positive":"negative"}">${(balances[memberId]||0)>=0?"+":""}${money(balances[memberId]||0)}</b></div></div></section><section class="section keep"><h2>${en?"Who pays whom":"Quién paga a quién"}</h2>${transfers}</section><section class="section"><h2>${en?"Expense detail":"Detalle de gastos"}</h2>${reportExpenseRows(all,en)}</section><section class="section page-break"><h2>${en?"Receipts & invoices":"Comprobantes y facturas"}</h2><div class="receipt-grid">${receipts}</div></section>`;
 return proReportShell(body,en?`${m.name} · Member Report`:`${m.name} · Reporte individual`,monthLabel(activeMonth),en);
}

function reportHTML(lang){const en=lang==="en";return reportType==="member"?memberReportHTML($("#reportMemberSelect").value,en):globalReportHTML(en)}
function printReportIn(lang){if(reportType==="member"&&!$("#reportMemberSelect").value){toast(uiLang==="en"?"Select a person.":"Selecciona una persona.");return}const w=window.open("","_blank");if(!w){toast(uiLang==="en"?"Allow pop-ups to generate the PDF.":"Permite ventanas emergentes para generar el PDF.");return}w.document.open();w.document.write(reportHTML(lang));w.document.close()}
function prepareReportModal(type="global",memberId=""){
 reportType=type;
 $("#reportMemberSelect").innerHTML=members.map(m=>`<option value="${esc(m.id)}" ${m.id===memberId?"selected":""}>${esc(m.name)}</option>`).join("");
 $$(".report-type").forEach(b=>b.classList.toggle("active",b.dataset.reportType===type));
 $("#reportMemberWrap").classList.toggle("hidden",type!=="member");
 $("#reportPreviewNote").textContent=type==="member"?"Incluye cuánto pagó, su parte, cuánto debe o recibe, a quién tiene que pagarle o quién debe devolverle dinero, sus transferencias y sus gastos.":"Incluye resumen mensual, categorías, balances de todos, quién paga a quién, pagos registrados, gastos y comprobantes.";
 $("#reportLanguageModal").classList.remove("hidden");
}
$("#printReport").onclick=()=>prepareReportModal("global");
$$(".report-type").forEach(b=>b.onclick=()=>{reportType=b.dataset.reportType;$$(".report-type").forEach(x=>x.classList.toggle("active",x===b));$("#reportMemberWrap").classList.toggle("hidden",reportType!=="member");$("#reportPreviewNote").textContent=reportType==="member"?"Incluye cuánto pagó, su parte, cuánto debe o recibe, a quién tiene que pagarle o quién debe devolverle dinero, sus transferencias y sus gastos.":"Incluye resumen mensual, categorías, balances de todos, quién paga a quién, pagos registrados, gastos y comprobantes."});
$("#reportLanguageCancel").onclick=()=>$("#reportLanguageModal").classList.add("hidden");
$("#reportSpanish").onclick=()=>{$("#reportLanguageModal").classList.add("hidden");printReportIn("es")};
$("#reportEnglish").onclick=()=>{$("#reportLanguageModal").classList.add("hidden");printReportIn("en")};
applyLanguage();

if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(console.warn));
