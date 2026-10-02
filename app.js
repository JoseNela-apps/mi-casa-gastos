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
let me=null,householdId=null,household=null,members=[],expenses=[],settlements=[],budgets={},recurrings=[],closings={},unsubs=[],activeMonth=nowMonth(),currentSplit="equal",attachmentCache=[];

const isOwner=()=>!!(me&&household&&household.ownerId===me.uid);
const myMember=()=>members.find(m=>m.authUid===me?.uid)||members.find(m=>m.id===me?.uid)||null;
const member=id=>members.find(m=>m.id===id)||{id,name:"Miembro"};
const PROFILE_COLORS=["#4a90e2","#55b78a","#8b7bd8","#ef9b68","#e77e9f","#4fa8b8"];
function memberAvatar(m,size=""){m=m||{};const style=`${m.accentColor?`--avatar-accent:${m.accentColor};`:""}`;if(m.avatarData)return `<span class="avatar ${size} has-photo" style="${style}"><img src="${m.avatarData}" alt="${esc(m.name||"Perfil")}"></span>`;if(m.avatarPreset&&m.avatarPreset!=="initials")return `<span class="avatar ${size} preset-avatar" style="${style}">${esc(m.avatarPreset)}</span>`;return `<span class="avatar ${size}" style="${style}">${esc(initials(m.name))}</span>`}
function categoryIcon(c){return {Casa:"⌂",Comida:"●",Servicios:"ϟ",Teléfono:"▣",Transporte:"◆",Salud:"＋",Suscripciones:"↻",Otros:"•"}[c]||"•"}
function categoryClass(c){return {Casa:"home",Comida:"food",Servicios:"utilities",Teléfono:"phone",Transporte:"transport",Salud:"health",Suscripciones:"subs",Otros:"other"}[c]||"other"}


function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2400)}
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
  $("#adminNav").classList.toggle("hidden",!isOwner());$("#membersNav")?.classList.toggle("hidden",!isOwner());$$(".owner-only").forEach(x=>x.classList.toggle("hidden",!isOwner()));$(".side-user small").textContent=isOwner()?"Owner":"Member";
  $("#monthEyebrow").textContent=monthLabel(activeMonth).toUpperCase();$("#statementMonth").textContent=cap(monthLabel(activeMonth));
  beginInitialLoad();
  unsubs.push(onSnapshot(collection(db,"households",householdId,"members"),s=>{members=s.docs.map(d=>({id:d.id,...d.data()}));markDataReady("members")},e=>streamFailed("members",e)));
  unsubs.push(onSnapshot(query(collection(db,"households",householdId,"expenses"),orderBy("date","desc")),s=>{expenses=s.docs.map(d=>({id:d.id,...d.data()}));markDataReady("expenses")},e=>streamFailed("expenses",e)));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"settlements"),s=>{settlements=s.docs.map(d=>({id:d.id,...d.data()}));markDataReady("settlements")},e=>streamFailed("settlements",e)));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"budgets"),s=>{budgets={};s.docs.forEach(d=>budgets[d.id]=d.data());markDataReady("budgets")},e=>streamFailed("budgets",e)));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"recurring"),s=>{recurrings=s.docs.map(d=>({id:d.id,...d.data()}));markDataReady("recurring")},e=>streamFailed("recurring",e)));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"monthlyClosings"),s=>{closings={};s.docs.forEach(d=>closings[d.id]=d.data());markDataReady("closings")},e=>streamFailed("closings",e)));
}


let renderTimer=null;
let dataReady={members:false,expenses:false,settlements:false,budgets:false,recurring:false,closings:false};
function beginInitialLoad(){
  dataReady={members:false,expenses:false,settlements:false,budgets:false,recurring:false,closings:false};
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
function prevMonthKey(key){const [y,m]=key.split("-").map(Number),d=new Date(Date.UTC(y,m-2,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`}
function expenseShares(e){
  if(e.shares&&Object.keys(e.shares).length)return e.shares;
  const ids=e.participantIds||[];if(!ids.length)return {};
  const each=Number(e.amount||0)/ids.length;return Object.fromEntries(ids.map(id=>[id,each]));
}
function calc(key=activeMonth){
  const paid={},share={};members.forEach(m=>{paid[m.id]=0;share[m.id]=0});
  for(const e of monthExpenses(key)){paid[e.payerId]=(paid[e.payerId]||0)+Number(e.amount||0);for(const [id,v] of Object.entries(expenseShares(e)))share[id]=(share[id]||0)+Number(v||0)}
  const balances={};members.forEach(m=>balances[m.id]=(paid[m.id]||0)-(share[m.id]||0));return{paid,share,balances};
}
function settlementPlan(){
  const {balances}=calc(),paidThisMonth=settlements.filter(s=>s.month===activeMonth&&s.status==="paid");
  const adjusted={...balances};paidThisMonth.forEach(s=>{adjusted[s.from]=(adjusted[s.from]||0)+Number(s.amount);adjusted[s.to]=(adjusted[s.to]||0)-Number(s.amount)});
  let debt=Object.entries(adjusted).filter(([,v])=>v<-.005).map(([id,v])=>({id,a:-v})).sort((a,b)=>b.a-a.a),cred=Object.entries(adjusted).filter(([,v])=>v>.005).map(([id,v])=>({id,a:v})).sort((a,b)=>b.a-a.a),out=[],i=0,j=0;
  while(i<debt.length&&j<cred.length){const a=Math.min(debt[i].a,cred[j].a);out.push({from:debt[i].id,to:cred[j].id,amount:a});debt[i].a-=a;cred[j].a-=a;if(debt[i].a<.005)i++;if(cred[j].a<.005)j++}return out;
}
function totalBudget(){return CATS.reduce((s,c)=>s+Number(budgets[`${activeMonth}_${c}`]?.limit||0),0)}
function catTotals(){const o={};monthExpenses().forEach(e=>o[e.category]=(o[e.category]||0)+Number(e.amount||0));return o}

function renderAll(){
  if(!householdId)return;
  const mex=monthExpenses(),total=mex.reduce((s,e)=>s+Number(e.amount||0),0),{paid,share,balances}=calc(),mine=myMember(),myBal=mine?balances[mine.id]||0:0;
  $("#monthTotal").textContent=money(total);$("#movementCount").textContent=`${mex.length} ${mex.length===1?"movimiento":"movimientos"}`;$("#owedToMe").textContent=money(Math.max(0,myBal));$("#iOwe").textContent=money(Math.max(0,-myBal));
  const familyStack=$("#familyAvatarStack");if(familyStack)familyStack.innerHTML=members.slice(0,6).map(m=>`<button class="hero-member-avatar" data-person="${esc(m.id)}" title="${esc(m.name)}">${memberAvatar(m,"hero-avatar")}</button>`).join("");
  $("#familyCount")&&($("#familyCount").textContent=`${members.length} personas en Mi Casa`);
  const mobileAvatar=$("#mobileProfileAvatar"),mmNow=myMember();if(mobileAvatar&&mmNow)mobileAvatar.innerHTML=memberAvatar(mmNow,"nav-avatar");
  const prevTotal=monthExpenses(prevMonthKey(activeMonth)).reduce((s,e)=>s+Number(e.amount||0),0);
  renderPremiumCharts(total,prevTotal);
  const status=$("#familyStatusMessage");if(status)status.textContent=total?`${members.length} personas · ${mex.length} movimientos registrados este mes.`:`${members.length} personas listas para organizar los gastos de la casa.`;
  const pulse=$("#familyPulse");if(pulse){const planNow=settlementPlan(),tbNow=totalBudget(),remain=tbNow-total;pulse.innerHTML=`<div class="pulse-row"><span>◎</span><div><b>${planNow.length?planNow.length+" pagos por resolver":"Todo saldado"}</b><small>${planNow.length?"Revisa Saldos para mantener la casa al día.":"No hay transferencias pendientes."}</small></div></div><div class="pulse-row"><span>⌂</span><div><b>${tbNow?(remain>=0?money(remain)+" disponibles":money(Math.abs(remain))+" sobre presupuesto"):"Presupuesto sin configurar"}</b><small>${tbNow?"Según los límites definidos para este mes.":"Puedes definir límites por categoría."}</small></div></div><div class="pulse-row"><span>▧</span><div><b>${expenses.filter(e=>((e.attachments&&e.attachments.length)||e.receiptData)).length} gastos con comprobante</b><small>Las fotos y PDFs pueden abrirse desde cada gasto.</small></div></div>`}
  $("#statementTotal").textContent=money(total);
  const closed=!!closings[activeMonth];$("#statementMeta").textContent=`${mex.length} gastos · ${closed?"Mes cerrado":"Mes abierto"}`;$("#closeMonthBtn").textContent=closed?"Reabrir mes":"Cerrar mes";

  $("#monthTrend").textContent=prevTotal?`${total<=prevTotal?"↓":"↑"} ${Math.abs((total-prevTotal)/prevTotal*100).toFixed(0)}% vs. mes anterior`:"Primer mes con datos";
  const tb=totalBudget(),pct=tb?Math.min(100,total/tb*100):0;$("#budgetUsed").textContent=tb?`${Math.round(pct)}% · ${money(total)} / ${money(tb)}`:"Sin presupuesto";$("#budgetProgress").style.width=`${pct}%`;

  renderInsights(total,prevTotal,paid,balances);
  $("#peopleStrip").innerHTML=members.map(m=>`<button class="premium-person" data-person="${esc(m.id)}">${memberAvatar(m,"lg")}<span><b>${esc(m.name)}</b><small>Pagó ${money(paid[m.id]||0)}</small></span><em class="${balances[m.id]>0.005?"positive":balances[m.id]<-.005?"negative":"neutral"}">${balances[m.id]>0.005?"+"+money(balances[m.id]):balances[m.id]<-.005?"−"+money(-balances[m.id]):"✓"}</em></button>`).join("");
  $$(".premium-person,.hero-member-avatar").forEach(b=>b.onclick=()=>openMemberDetail(b.dataset.person));
  $$(".person-card").forEach(b=>b.onclick=()=>openMemberDetail(b.dataset.person));

  const plan=settlementPlan();$("#settlementPreview").innerHTML=plan.length?plan.slice(0,3).map(settleHTML).join(""):`<div class="empty"><b>Todo saldado ✓</b>No hay pagos pendientes.</div>`;
  $("#settlementList").innerHTML=plan.length?plan.map((p,i)=>settleHTML(p,true,i)).join(""):`<div class="empty"><b>Todo saldado ✓</b>No hay pagos pendientes este mes.</div>`;
  $$(".mark-paid").forEach(b=>b.onclick=()=>markSettlement(Number(b.dataset.index)));
  const hist=settlements.filter(s=>s.month===activeMonth&&s.status==="paid").sort((a,b)=>(b.paidAt?.seconds||0)-(a.paidAt?.seconds||0));
  $("#settlementHistory").innerHTML=hist.length?hist.map(s=>`<div class="feed-item"><div class="cat-icon">✓</div><div class="feed-copy"><b>${esc(member(s.from).name)} → ${esc(member(s.to).name)}</b><small>${esc(s.method||"Pago")} · registrado</small></div><div class="feed-amount"><b>${money(s.amount)}</b><small>Pagado</small></div></div>`).join(""):`<div class="empty"><b>Sin pagos registrados</b>Los pagos marcados como pagados aparecerán aquí.</div>`;

  renderCategories(total);
  renderActivity();
  renderMembers(paid,share,balances);
  renderCalendar();
  fillMemberControls();
}


function renderPremiumCharts(total,prevTotal){
  const ex=monthExpenses(), daily={};ex.forEach(e=>{const d=Number(String(e.date||"").slice(-2));if(d)daily[d]=(daily[d]||0)+Number(e.amount||0)});
  const vals=Array.from({length:31},(_,i)=>daily[i+1]||0),max=Math.max(1,...vals),w=620,h=118;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1))*w},${h-(v/max)*(h-20)-8}`).join(" ");
  const chart=$("#heroSparkChart");if(chart)chart.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#77d9a7" stop-opacity=".36"/><stop offset="100%" stop-color="#77d9a7" stop-opacity="0"/></linearGradient></defs><polygon points="0,${h} ${pts} ${w},${h}" fill="url(#areaFill)"/><polyline points="${pts}" fill="none" stroke="#49a978" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const maxLabel=$("#heroChartMax");if(maxLabel)maxLabel.textContent=money(max);
  const now=new Date(),week=[0,0,0,0,0,0,0];ex.forEach(e=>{const d=new Date((e.date||today())+"T12:00:00");const diff=Math.floor((now-d)/(86400000));if(diff>=0&&diff<7)week[6-diff]+=Number(e.amount||0)});
  const wm=Math.max(1,...week),names=["L","M","M","J","V","S","D"],avg=week.reduce((a,b)=>a+b,0)/7;
  const bars=$("#weeklyBars");if(bars)bars.innerHTML=week.map((v,i)=>`<div class="week-col"><div class="week-track"><i class="${v>avg*1.45&&v>0?"high":""}" style="height:${Math.max(v?12:3,(v/wm)*100)}%"></i></div><b>${names[i]}</b><small>${v?money(v).replace(".00",""):""}</small></div>`).join("");
  const wt=$("#weekTotal");if(wt)wt.textContent=money(week.reduce((a,b)=>a+b,0));
  const cats=catTotals(),top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0],si=$("#smartInsight"),ss=$("#smartInsightSub");
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
function renderCategories(total){
  const cats=catTotals(),entries=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  $("#categoryList").innerHTML=entries.length?entries.slice(0,8).map(([k,v])=>{const lim=Number(budgets[`${activeMonth}_${k}`]?.limit||0),p=lim?Math.min(100,v/lim*100):total?Math.max(6,v/total*100):0;return `<article class="space-card ${categoryClass(k)}"><div class="space-icon">${categoryIcon(k)}</div><span>${esc(k)}</span><b>${money(v)}</b><small>${lim?`${Math.round(v/lim*100)}% de ${money(lim)}`:`${Math.round(v/(total||1)*100)}% del mes`}</small><div class="space-wave"><i style="width:${p}%"></i></div></article>`}).join(""):`<div class="empty premium-empty"><b>Tu casa está lista</b>Agrega el primer gasto para ver tus espacios financieros.</div>`;
}
function renderActivity(){
  const q=($("#activitySearch")?.value||"").toLowerCase(),cat=$("#activityCategory")?.value||"";
  const filtered=expenses.filter(e=>(!q||String(e.description).toLowerCase().includes(q))&&(!cat||e.category===cat));
  const empty=`<div class="empty"><b>No hay movimientos</b>No encontramos gastos con esos filtros.</div>`;
  $("#activityList").innerHTML=filtered.length?filtered.map(feedHTML).join(""):empty;$("#recentList").innerHTML=expenses.length?expenses.slice(0,5).map(feedHTML).join(""):`<div class="empty"><b>No hay gastos todavía</b>Toca “Nuevo gasto” para comenzar.</div>`;
  $$(".feed-item[data-id]").forEach(el=>el.onclick=()=>openExpense(expenses.find(x=>x.id===el.dataset.id)));
}
$("#activitySearch").addEventListener("input",renderActivity);$("#activityCategory").addEventListener("change",renderActivity);

function renderMembers(paid,share,balances){
  $("#membersList").innerHTML=members.map(m=>`<button class="member-row clickable-member" data-person="${esc(m.id)}">${memberAvatar(m)}<div><b>${esc(m.name)}</b><small>${esc(m.email||"Sin email")} · ${m.authUid?"Activo":m.email?"Pendiente":"Sin acceso"}</small></div><span class="role-pill">${esc(m.role||"member")}</span></button>`).join("");
  $$(".clickable-member").forEach(b=>b.onclick=()=>openMemberDetail(b.dataset.person));
  $("#adminUsers").innerHTML=isOwner()?members.map(m=>`<div class="member-row admin-user">${memberAvatar(m)}<div class="member-main"><b>${esc(m.name)}</b><small>${esc(m.email||"Sin email")} · ${m.authUid?"Activo":m.email?"Pendiente":"Sin acceso"}</small></div><div class="admin-actions">${m.email?`<button class="secondary mini reset-access" data-email="${esc(m.email)}">Restablecer contraseña</button>`:""}${m.authUid!==me.uid?`<button class="danger mini remove-member" data-member="${esc(m.id)}">Eliminar</button>`:""}</div></div>`).join(""):`<div class="empty"><b>Solo el Owner</b>Esta sección está reservada para el administrador.</div>`;
  $$(".reset-access").forEach(b=>b.onclick=async()=>{try{await sendPasswordResetEmail(auth,b.dataset.email);toast("Enlace enviado ✓")}catch(e){toast("No se pudo enviar.")}});
  $$(".remove-member").forEach(b=>b.onclick=async()=>{if(!confirm("¿Quitar este miembro del hogar?"))return;try{await deleteDoc(doc(db,"households",householdId,"members",b.dataset.member));toast("Miembro eliminado")}catch(e){toast("No se pudo eliminar.")}});
  $("#monthPeople").innerHTML=members.map(m=>`<div class="settle-row"><div class="settle-person">${memberAvatar(m)}<div><b>${esc(m.name)}</b><small>Pagó ${money(paid[m.id]||0)}</small></div></div><span></span><div class="settle-person right"><div><b>${balances[m.id]>=0?"Recibe":"Debe"} ${money(Math.abs(balances[m.id]||0))}</b><small>Parte ${money(share[m.id]||0)}</small></div></div></div>`).join("");
}
function openMemberDetail(id){
  const m=member(id),{paid,share,balances}=calc(),mine=monthExpenses().filter(e=>e.payerId===id||(e.participantIds||[]).includes(id)).slice(0,5),canEdit=isOwner()||m.authUid===me?.uid;
  $("#memberDetailContent").innerHTML=`<div class="premium-profile-hero"><div class="profile-cover" style="--profile-accent:${esc(m.accentColor||"#4a90e2")}"></div>${memberAvatar(m,"xl")}<div class="profile-title"><h2>${esc(m.name)}</h2><p>${esc(m.email||"Miembro de Mi Casa")}</p>${canEdit?`<button class="secondary mini edit-profile-btn" data-person="${esc(id)}">✦ Personalizar</button>`:""}</div></div><div class="profile-stats premium"><div><small>Pagó</small><b>${money(paid[id]||0)}</b></div><div><small>Su parte</small><b>${money(share[id]||0)}</b></div><div><small>Balance</small><b class="${balances[id]>=0?"balance-positive":"balance-negative"}">${balances[id]>=0?"+":""}${money(balances[id]||0)}</b></div></div><div class="profile-section-title"><span>ACTIVIDAD</span><h3>Movimientos recientes</h3></div><div class="feed premium-feed">${mine.length?mine.map(feedHTML).join(""):`<div class="empty">Sin movimientos este mes.</div>`}</div>`;
  $(".edit-profile-btn")?.addEventListener("click",()=>openProfileEditor(id));
  openSheet("#memberDetailSheet");
}
function settleHTML(p,withButton=false,i=0){const from=member(p.from),to=member(p.to);return `<div class="premium-settle-card"><div class="settle-face">${memberAvatar(from,"lg")}<b>${esc(from.name)}</b><small>paga</small></div><div class="settle-flow"><span>→</span><strong>${money(p.amount)}</strong>${withButton?`<button class="secondary mini mark-paid" data-index="${i}">Marcar pagado</button>`:""}</div><div class="settle-face">${memberAvatar(to,"lg")}<b>${esc(to.name)}</b><small>recibe</small></div></div>`}
async function markSettlement(i){const p=settlementPlan()[i];if(!p)return;try{await addDoc(collection(db,"households",householdId,"settlements"),{...p,month:activeMonth,status:"paid",method:"Transferencia",createdBy:me.uid,paidAt:serverTimestamp()});toast("Pago registrado ✓")}catch(e){console.error(e);toast("No se pudo registrar el pago.")}}
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
$("#expenseAmount").addEventListener("input",updatePerPerson);
$$(".split-tab").forEach(b=>b.onclick=()=>{currentSplit=b.dataset.split;$$(".split-tab").forEach(x=>x.classList.toggle("active",x===b));$("#splitHelp").textContent=currentSplit==="equal"?"Se divide por igual.":currentSplit==="amount"?"Define el monto exacto por persona.":"Define el porcentaje por persona.";renderCustomSplitRows();updatePerPerson()});

function openSheet(id){$("#overlay").classList.remove("hidden");$(id).classList.remove("hidden")}
function closeSheets(){$("#overlay").classList.add("hidden");$$(".sheet").forEach(x=>x.classList.add("hidden"))}
$("#overlay").onclick=closeSheets;$$(".sheetCancel,.memberCancel,.budgetCancel,.recurringCancel,.detailCancel").forEach(b=>b.onclick=closeSheets);

function openExpense(e=null){
  if(!members.length){toast("Primero agrega miembros.");return}
  $("#expenseForm").reset();attachmentCache=e?.attachments?[...e.attachments]:(e?.receiptData?[{name:e.receiptName||"Comprobante",type:e.receiptType||"",data:e.receiptData}]:[]);$("#expenseId").value=e?.id||"";$("#expenseSheetTitle").textContent=e?"Editar gasto":"Nuevo gasto";$("#deleteExpense").classList.toggle("hidden",!e);
  $("#expenseDate").value=e?.date||today();$("#expenseAmount").value=e?.amount||"";$("#expenseDescription").value=e?.description||"";$("#expenseCategory").value=e?.category||"Casa";$("#expensePayer").value=e?.payerId||myMember()?.id||members[0]?.id;$("#expenseNotes").value=e?.notes||"";
  currentSplit=e?.splitMode||"equal";$$(".split-tab").forEach(x=>x.classList.toggle("active",x.dataset.split===currentSplit));
  $$("#participantPicker .participant").forEach(b=>b.classList.toggle("selected",e?(e.participantIds||[]).includes(b.dataset.id):true));
  renderCustomSplitRows(e?.splitValues||{});updatePerPerson();
  renderAttachmentPreview();
  openSheet("#expenseSheet");setTimeout(()=>$("#expenseAmount").focus(),100)
}
["#newExpenseBtn","#quickExpense","#activityAdd","#mobileAdd"].forEach(id=>$(id).onclick=()=>openExpense());
$("#saveExpenseTop").onclick=()=>$("#expenseForm").requestSubmit();

let viewerItems=[],viewerIndex=0;
function attachmentKind(a){const t=String(a?.type||"").toLowerCase(),n=String(a?.name||"").toLowerCase();if(t.startsWith("image/")||/\.(png|jpe?g|gif|webp|heic)$/i.test(n))return"image";if(t==="application/pdf"||n.endsWith(".pdf"))return"pdf";return"file"}
function attachmentThumb(a,i,removable=true){const kind=attachmentKind(a),visual=kind==="image"&&a.data?`<img src="${a.data}" alt="">`:kind==="pdf"?`<span class="file-tile pdf">PDF</span>`:`<span class="file-tile">FILE</span>`;return `<div class="attachment-item previewable-attachment" data-preview-index="${i}">${visual}<div class="attachment-meta"><b>${esc(a.name||"Archivo")}</b><small>${kind==="image"?"Imagen":kind==="pdf"?"PDF":esc(a.type||"Archivo")} · Toca para previsualizar</small></div>${removable?`<button type="button" class="remove-attachment" data-index="${i}" title="Quitar">×</button>`:""}</div>`}
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
$("#expenseReceipt").addEventListener("change",async e=>{
  const files=[...(e.target.files||[])];
  if(!files.length)return;
  for(const f of files){
    if(f.size>350000){toast(`${f.name} pesa más de 350 KB y no se agregó.`);continue}
    const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)});
    attachmentCache.push({name:f.name,type:f.type||"archivo",size:f.size,data});
  }
  e.target.value="";
  renderAttachmentPreview();
});

$("#expenseForm").onsubmit=async e=>{
  e.preventDefault();const amount=parseFloat($("#expenseAmount").value),ids=selectedIds();if(!(amount>0)){toast("Ingresa un monto válido.");return}if(!ids.length){toast("Selecciona al menos una persona.");return}
  let shares={},splitValues={}; if(currentSplit==="equal"){ids.forEach(id=>shares[id]=amount/ids.length)}else{const vals={};$$(".split-input").forEach(i=>vals[i.dataset.id]=parseFloat(i.value)||0);splitValues=vals;if(currentSplit==="amount"){const sum=Object.values(vals).reduce((a,b)=>a+b,0);if(Math.abs(sum-amount)>.01){toast(`La división debe sumar ${money(amount)}.`);return}shares=vals}else{const sum=Object.values(vals).reduce((a,b)=>a+b,0);if(Math.abs(sum-100)>.05){toast("Los porcentajes deben sumar 100%.");return}ids.forEach(id=>shares[id]=amount*(vals[id]||0)/100)}}
  const data={amount,description:$("#expenseDescription").value.trim(),date:$("#expenseDate").value,category:$("#expenseCategory").value,payerId:$("#expensePayer").value,participantIds:ids,splitMode:currentSplit,splitValues,shares,notes:$("#expenseNotes").value.trim(),attachments:attachmentCache,receiptData:null,receiptName:null,receiptType:null,updatedAt:serverTimestamp()};
  try{const id=$("#expenseId").value;if(id)await setDoc(doc(db,"households",householdId,"expenses",id),data,{merge:true});else await addDoc(collection(db,"households",householdId,"expenses"),{...data,createdBy:me.uid,createdAt:serverTimestamp()});closeSheets();toast(id?"Gasto actualizado ✓":"Gasto agregado ✓")}catch(err){console.error(err);toast("No se pudo guardar el gasto.")}
};
$("#deleteExpense").onclick=async()=>{const id=$("#expenseId").value;if(!id||!confirm("¿Eliminar este gasto?"))return;try{await deleteDoc(doc(db,"households",householdId,"expenses",id));closeSheets();toast("Gasto eliminado")}catch(e){toast("No tienes permiso para eliminarlo.")}};

$("#inviteBtn").onclick=()=>{$("#memberForm").reset();openSheet("#memberSheet")};
$("#memberForm").onsubmit=async e=>{e.preventDefault();if(!isOwner())return;const name=$("#memberName").value.trim(),email=$("#memberEmail").value.trim().toLowerCase();try{const mref=doc(collection(db,"households",householdId,"members"));await setDoc(mref,{name,email:email||null,role:"member",authUid:null,inviteStatus:email?"pending":"none",createdAt:serverTimestamp()});if(email)await setDoc(doc(db,"invites",emailKey(email)),{email,householdId,memberId:mref.id,householdName:household.name||"Mi Casa",invitedBy:me.uid,createdAt:serverTimestamp()});closeSheets();toast(email?"Invitación preparada ✓":"Miembro agregado ✓")}catch(e){console.error(e);toast("No se pudo agregar.")}};


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
function openBudgets(){if(!isOwner()){toast("Solo el Owner puede cambiar presupuestos.");return}$("#budgetRows").innerHTML=CATS.map(c=>`<label><span>${esc(c)}</span><input class="budget-input" data-cat="${esc(c)}" inputmode="decimal" placeholder="Sin límite" value="${budgets[`${activeMonth}_${c}`]?.limit||""}"></label>`).join("");openSheet("#budgetSheet")}
$("#quickBudget").onclick=openBudgets;$("#editBudgetsBtn").onclick=openBudgets;$("#saveBudgetsTop").onclick=()=>$("#budgetForm").requestSubmit();
$("#budgetForm").onsubmit=async e=>{e.preventDefault();try{await Promise.all($$(".budget-input").map(i=>setDoc(doc(db,"households",householdId,"budgets",`${activeMonth}_${i.dataset.cat}`),{month:activeMonth,category:i.dataset.cat,limit:Number(i.value||0),updatedAt:serverTimestamp()},{merge:true})));closeSheets();toast("Presupuestos guardados ✓")}catch(e){console.error(e);toast("No se pudieron guardar.")}};

$("#addRecurringBtn").onclick=()=>{$("#recurringForm").reset();$("#recurringDay").value=1;fillMemberControls();openSheet("#recurringSheet")};
$("#recurringForm").onsubmit=async e=>{e.preventDefault();try{await addDoc(collection(db,"households",householdId,"recurring"),{name:$("#recurringName").value.trim(),amount:Number($("#recurringAmount").value),day:Number($("#recurringDay").value),category:$("#recurringCategory").value,payerId:$("#recurringPayer").value,active:true,createdAt:serverTimestamp()});closeSheets();toast("Pago recurrente guardado ✓")}catch(e){console.error(e);toast("No se pudo guardar.")}};

function renderCalendar(){
  const [y,m]=activeMonth.split("-").map(Number),days=new Date(y,m,0).getDate(),first=new Date(y,m-1,1).getDay();
  const exByDay={},recByDay={};
  monthExpenses().forEach(e=>{const d=Number(String(e.date||"").slice(8,10));(exByDay[d]??=[]).push(e)});
  recurrings.filter(r=>r.active).forEach(r=>{const d=Math.max(1,Math.min(days,Number(r.day)||1));(recByDay[d]??=[]).push(r)});
  const todayKey=today(),isThisMonth=todayKey.slice(0,7)===activeMonth,todayDay=Number(todayKey.slice(8,10));
  let html=`<div class="cal-head">${["D","L","M","M","J","V","S"].map(x=>`<b>${x}</b>`).join("")}</div><div class="cal-grid">${"<span></span>".repeat(first)}`;
  for(let d=1;d<=days;d++){
    const ex=exByDay[d]||[],rec=recByDay[d]||[],dayTotal=ex.reduce((s,e)=>s+Number(e.amount||0),0);
    html+=`<div class="cal-day ${isThisMonth&&d===todayDay?"today":""} ${ex.length||rec.length?"has-events":""}"><b>${d}</b>${dayTotal?`<i title="${ex.length} gasto${ex.length===1?"":"s"}">${money(dayTotal)}</i>`:""}${rec.slice(0,2).map(r=>`<em title="${esc(r.name)}">↻ ${esc(r.name)}</em>`).join("")}${(ex.length||rec.length)?`<span class="mobile-event-dot"></span>`:""}</div>`;
  }
  html+=`</div>`;
  $("#financialCalendar").innerHTML=html;
  const active=recurrings.filter(r=>r.active).sort((a,b)=>a.day-b.day);
  $("#recurringList").innerHTML=active.length?active.map(r=>`<div class="recurring-row"><div class="cat-icon subs">↻</div><div><b>${esc(r.name)}</b><small>Día ${r.day} · ${esc(r.category)}</small></div><strong>${money(r.amount)}</strong>${isOwner()?`<button class="text-btn delete-recurring" data-id="${esc(r.id)}">×</button>`:""}</div>`).join(""):`<div class="month-empty-state"><span>↻</span><b>Sin pagos recurrentes</b><small>Agrega renta, internet, teléfono o suscripciones para verlos también en el calendario.</small></div>`;
  $$(".delete-recurring").forEach(b=>b.onclick=async()=>{if(confirm("¿Eliminar este recurrente?"))await deleteDoc(doc(db,"households",householdId,"recurring",b.dataset.id))});
}

$("#closeMonthBtn").onclick=async()=>{if(!isOwner())return;const existing=closings[activeMonth];try{if(existing){if(!confirm("¿Reabrir este mes? Quedará registrado."))return;await setDoc(doc(db,"households",householdId,"monthlyClosings",activeMonth),{status:"open",reopenedBy:me.uid,reopenedAt:serverTimestamp()},{merge:true});toast("Mes reabierto")}else{if(settlementPlan().length&&!confirm("Aún hay saldos pendientes. ¿Cerrar de todas formas?"))return;await setDoc(doc(db,"households",householdId,"monthlyClosings",activeMonth),{status:"closed",closedBy:me.uid,closedAt:serverTimestamp(),total:monthExpenses().reduce((s,e)=>s+Number(e.amount||0),0)},{merge:true});toast("Mes cerrado ✓")}}catch(e){console.error(e);toast("No se pudo actualizar el cierre.")}};



function go(view){
  if((view==="members"||view==="admin")&&!isOwner()){view="home";toast(uiLang==="en"?"This section is only available to the Owner.":"Esta sección es solo para el Owner.")}
  $$(".page").forEach(p=>p.classList.remove("active"));$("#"+view+"Page").classList.add("active");$$("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  const titles=uiLang==="en"?{home:`Good morning, ${(me?.displayName||"").split(" ")[0]||"family"} 👋`,activity:"Activity",balances:"Balances",month:"Monthly statement",members:"Members",admin:"Administration"}:{home:`Buenos días, ${(me?.displayName||"").split(" ")[0]||"familia"} 👋`,activity:"Actividad",balances:"Saldos",month:"Estado del mes",members:"Miembros",admin:"Administración"};
  $("#pageTitle").textContent=titles[view]||"Mi Casa";applyLanguage();
  if(allDataReady()&&(view==="month"||view==="members")){requestAnimationFrame(()=>{if(view==="month")renderCalendar();if(view==="members"){const c=calc();renderMembers(c.paid,c.share,c.balances)}})}
  window.scrollTo({top:0,behavior:"auto"})
}
$$("[data-view]").forEach(b=>b.onclick=()=>go(b.dataset.view));$$("[data-jump]").forEach(b=>b.onclick=()=>{const v=b.dataset.jump;if(v==="members"&&!isOwner())return;go(v)});
$("#profileBtn").onclick=()=>{const mm=myMember();if(mm)openMemberDetail(mm.id)};

// --- Bilingual UI (ES / EN) ---
const EN={
"Inicio":"Home","Actividad":"Activity","Saldos":"Balances","Mes":"Month","Miembros":"Members","Admin":"Admin",
"Nuevo gasto":"New expense","Gastos del mes":"Monthly spending","movimientos":"transactions","Sin comparación aún":"No comparison yet",
"Te deben":"Owed to you","Tú debes":"You owe","Balance personal":"Personal balance","Presupuesto usado":"Budget used",
"Agregar gasto":"Add expense","Registra un pago":"Record a payment","Saldar":"Settle up","Quién paga a quién":"Who pays whom","ESTADO DE MI CASA":"MY HOME STATUS","Todo lo importante de la familia, en un solo lugar.":"Everything that matters to your family, in one place.","Gastos del mes":"Monthly spending","Presupuesto familiar":"Family budget","NUESTRA CASA":"OUR HOME","La familia este mes":"The family this month","Administrar":"Manage","PRESUPUESTO":"BUDGET","En qué estamos gastando":"Where we are spending","Ver límites":"View limits","PARA TI":"FOR YOU","Lo importante de Mi Casa":"What matters at home","RESUMEN":"SUMMARY","La casa al día":"Home at a glance","HISTORIA DE LA CASA":"HOME HISTORY","Actividad reciente":"Recent activity","Abrir original":"Open original","Anterior":"Previous","Siguiente":"Next",
"Presupuestos":"Budgets","Control por categoría":"Category control","Calendario y cierre":"Calendar & close",
"Lo importante este mes":"This month at a glance","Balances":"Balances","Ver miembros":"View members","PENDIENTES":"PENDING",
"Ver todos":"View all","ESTE MES":"THIS MONTH","En qué gastamos":"Where we spent","Recientes":"Recent","Ver todo":"View all",
"MOVIMIENTOS":"TRANSACTIONS","Todas las categorías":"All categories","Deudas simplificadas":"Simplified debts",
"Reducimos los cruces para dejar la menor cantidad posible de transferencias.":"We simplify debts to minimize the number of transfers.",
"HISTORIAL":"HISTORY","Pagos registrados":"Recorded payments","ESTADO DE CUENTA":"MONTHLY STATEMENT","Reporte PDF":"PDF Report",
"Cerrar mes":"Close month","CALENDARIO":"CALENDAR","Compromisos del mes":"Monthly commitments","Recurrente":"Recurring",
"PRÓXIMOS":"UPCOMING","Pagos recurrentes":"Recurring payments","Resumen por persona":"Summary by person",
"MI CASA":"MY HOME","Toca un miembro para abrir su perfil financiero.":"Tap a member to open their financial profile.",
"Agregar miembro":"Add member","Administración":"Administration","Controla acceso, recuperación de cuenta y estructura del hogar.":"Manage access, account recovery, and household structure.",
"Seguridad":"Security","Las contraseñas nunca son visibles. Puedes enviar un enlace seguro de restablecimiento.":"Passwords are never visible. You can send a secure reset link.",
"Cancelar":"Cancel","Guardar":"Save","¿En qué se gastó?":"What was it for?","Fecha":"Date","Categoría":"Category","Pagó":"Paid by",
"¿Para quién fue?":"Who was it for?","Comprobante":"Receipt","Nota":"Note","Cerrar":"Close","Perfil financiero":"Financial profile",
"Casa":"Home","Comida":"Food","Servicios":"Utilities","Teléfono":"Phone","Transporte":"Transportation","Salud":"Health","Suscripciones":"Subscriptions","Otros":"Other"
};
function translateText(root=document.body){if(uiLang!=="en")return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const raw=n.nodeValue,trim=raw.trim();if(!trim)continue;let out=EN[trim];if(!out){for(const [es,en] of Object.entries(EN)){if(trim.startsWith(es+" ")){out=en+trim.slice(es.length);break}}}if(out)n.nodeValue=raw.replace(trim,out)}document.querySelectorAll("input[placeholder]").forEach(el=>{const p=el.placeholder;if(EN[p])el.placeholder=EN[p]});document.documentElement.lang="en"}
function applyLanguage(){if(uiLang==="en")translateText();const b=$("#languageToggle");if(b)b.textContent=uiLang==="es"?"ES / EN":"EN / ES"}
$("#languageToggle")?.addEventListener("click",()=>{uiLang=uiLang==="es"?"en":"es";localStorage.setItem("miCasaLanguage",uiLang);location.reload()});
const langObserver=new MutationObserver(()=>{if(uiLang==="en")translateText()});langObserver.observe(document.body,{childList:true,subtree:true});

// --- PDF report with independent language choice ---
function reportHTML(lang){
 const en=lang==="en", ex=monthExpenses(), {paid,share,balances}=calc(), total=ex.reduce((a,e)=>a+Number(e.amount||0),0);
 const L=en?{title:"Mi Casa · Monthly Report",period:"Period",summary:"Summary",total:"Total spending",expenses:"Expenses",date:"Date",desc:"Description",cat:"Category",payer:"Paid by",amount:"Amount",people:"Summary by person",paid:"Paid",share:"Share",balance:"Balance",none:"No expenses recorded",attachments:"Attachments"}:{title:"Mi Casa · Reporte mensual",period:"Período",summary:"Resumen",total:"Gastos totales",expenses:"Gastos",date:"Fecha",desc:"Descripción",cat:"Categoría",payer:"Pagó",amount:"Monto",people:"Resumen por persona",paid:"Pagó",share:"Parte",balance:"Balance",none:"No hay gastos registrados",attachments:"Comprobantes"};
 const cat=x=>en?(EN[x]||x):x;
 const rows=ex.length?ex.map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(e.description)}</td><td>${esc(cat(e.category||"Otros"))}</td><td>${esc(member(e.payerId).name)}</td><td class="num">${money(e.amount)}</td></tr>`).join(""):`<tr><td colspan="5">${L.none}</td></tr>`;
 const prows=members.map(m=>`<tr><td>${esc(m.name)}</td><td class="num">${money(paid[m.id]||0)}</td><td class="num">${money(share[m.id]||0)}</td><td class="num">${money(balances[m.id]||0)}</td></tr>`).join("");
 return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${L.title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#142033;margin:42px}header{border-bottom:3px solid #173b5f;padding-bottom:20px;margin-bottom:28px}.brand{font-size:13px;letter-spacing:.18em;color:#65758b}.total{font-size:38px;font-weight:800;margin:8px 0}h1{margin:6px 0}h2{margin-top:34px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:11px 8px;border-bottom:1px solid #e4e9ef;text-align:left;font-size:13px}.num{text-align:right}th{font-size:11px;text-transform:uppercase;color:#6d7b8d}.meta{color:#6d7b8d}@media print{body{margin:20px}@page{size:auto;margin:14mm}}</style></head><body><header><div class="brand">MI CASA</div><h1>${L.title}</h1><div class="meta">${L.period}: ${esc(monthLabel(activeMonth))}</div><div class="total">${money(total)}</div><div class="meta">${ex.length} ${en?"transactions":"gastos"}</div></header><h2>${L.expenses}</h2><table><thead><tr><th>${L.date}</th><th>${L.desc}</th><th>${L.cat}</th><th>${L.payer}</th><th class="num">${L.amount}</th></tr></thead><tbody>${rows}</tbody></table><h2>${L.people}</h2><table><thead><tr><th>${en?"Person":"Persona"}</th><th class="num">${L.paid}</th><th class="num">${L.share}</th><th class="num">${L.balance}</th></tr></thead><tbody>${prows}</tbody></table><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`
}
function printReportIn(lang){const w=window.open("","_blank");if(!w){toast(uiLang==="en"?"Allow pop-ups to generate the PDF.":"Permite ventanas emergentes para generar el PDF.");return}w.document.open();w.document.write(reportHTML(lang));w.document.close()}
$("#printReport").onclick=()=>$("#reportLanguageModal").classList.remove("hidden");
$("#reportLanguageCancel").onclick=()=>$("#reportLanguageModal").classList.add("hidden");
$("#reportSpanish").onclick=()=>{$("#reportLanguageModal").classList.add("hidden");printReportIn("es")};
$("#reportEnglish").onclick=()=>{$("#reportLanguageModal").classList.add("hidden");printReportIn("en")};
applyLanguage();

if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(console.warn));
