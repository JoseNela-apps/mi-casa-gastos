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
import { getFirestore, doc, getDoc, setDoc, addDoc, deleteDoc, collection, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

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
  unsubs.push(onSnapshot(collection(db,"households",householdId,"members"),s=>{members=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()}));
  unsubs.push(onSnapshot(query(collection(db,"households",householdId,"expenses"),orderBy("date","desc")),s=>{expenses=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()}));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"settlements"),s=>{settlements=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()}));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"budgets"),s=>{budgets={};s.docs.forEach(d=>budgets[d.id]=d.data());renderAll()}));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"recurring"),s=>{recurrings=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()}));
  unsubs.push(onSnapshot(collection(db,"households",householdId,"monthlyClosings"),s=>{closings={};s.docs.forEach(d=>closings[d.id]=d.data());renderAll()}));
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
  $("#statementTotal").textContent=money(total);
  const closed=!!closings[activeMonth];$("#statementMeta").textContent=`${mex.length} gastos · ${closed?"Mes cerrado":"Mes abierto"}`;$("#closeMonthBtn").textContent=closed?"Reabrir mes":"Cerrar mes";

  const prevTotal=monthExpenses(prevMonthKey(activeMonth)).reduce((s,e)=>s+Number(e.amount||0),0);
  $("#monthTrend").textContent=prevTotal?`${total<=prevTotal?"↓":"↑"} ${Math.abs((total-prevTotal)/prevTotal*100).toFixed(0)}% vs. mes anterior`:"Primer mes con datos";
  const tb=totalBudget(),pct=tb?Math.min(100,total/tb*100):0;$("#budgetUsed").textContent=tb?`${Math.round(pct)}% · ${money(total)} / ${money(tb)}`:"Sin presupuesto";$("#budgetProgress").style.width=`${pct}%`;

  renderInsights(total,prevTotal,paid,balances);
  $("#peopleStrip").innerHTML=members.map(m=>`<button class="person-card" data-person="${esc(m.id)}"><div class="avatar">${esc(initials(m.name))}</div><b>${esc(m.name)}</b><small>Pagó ${money(paid[m.id]||0)}</small><small class="${balances[m.id]>0.005?"balance-positive":balances[m.id]<-.005?"balance-negative":""}">${balances[m.id]>0.005?"Recibe "+money(balances[m.id]):balances[m.id]<-.005?"Debe "+money(-balances[m.id]):"Saldado"}</small></button>`).join("");
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
  $("#categoryList").innerHTML=entries.length?entries.slice(0,6).map(([k,v])=>{const lim=Number(budgets[`${activeMonth}_${k}`]?.limit||0),p=lim?Math.min(100,v/lim*100):total?Math.max(5,v/total*100):0;return `<div class="category-row"><div class="cat-line"><b>${esc(k)}</b><span>${money(v)}${lim?` / ${money(lim)}`:""}</span></div><div class="category-track"><div class="category-fill ${lim&&v>lim?"over":""}" style="width:${p}%"></div></div></div>`}).join(""):`<div class="empty"><b>Sin categorías</b>Agrega tu primer gasto.</div>`;
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
  $("#membersList").innerHTML=members.map(m=>`<button class="member-row clickable-member" data-person="${esc(m.id)}"><div class="avatar">${esc(initials(m.name))}</div><div><b>${esc(m.name)}</b><small>${esc(m.email||"Sin email")} · ${m.authUid?"Activo":m.email?"Pendiente":"Sin acceso"}</small></div><span class="role-pill">${esc(m.role||"member")}</span></button>`).join("");
  $$(".clickable-member").forEach(b=>b.onclick=()=>openMemberDetail(b.dataset.person));
  $("#adminUsers").innerHTML=isOwner()?members.map(m=>`<div class="member-row admin-user"><div class="avatar">${esc(initials(m.name))}</div><div class="member-main"><b>${esc(m.name)}</b><small>${esc(m.email||"Sin email")} · ${m.authUid?"Activo":m.email?"Pendiente":"Sin acceso"}</small></div><div class="admin-actions">${m.email?`<button class="secondary mini reset-access" data-email="${esc(m.email)}">Restablecer contraseña</button>`:""}${m.authUid!==me.uid?`<button class="danger mini remove-member" data-member="${esc(m.id)}">Eliminar</button>`:""}</div></div>`).join(""):`<div class="empty"><b>Solo el Owner</b>Esta sección está reservada para el administrador.</div>`;
  $$(".reset-access").forEach(b=>b.onclick=async()=>{try{await sendPasswordResetEmail(auth,b.dataset.email);toast("Enlace enviado ✓")}catch(e){toast("No se pudo enviar.")}});
  $$(".remove-member").forEach(b=>b.onclick=async()=>{if(!confirm("¿Quitar este miembro del hogar?"))return;try{await deleteDoc(doc(db,"households",householdId,"members",b.dataset.member));toast("Miembro eliminado")}catch(e){toast("No se pudo eliminar.")}});
  $("#monthPeople").innerHTML=members.map(m=>`<div class="settle-row"><div class="settle-person"><div class="avatar">${esc(initials(m.name))}</div><div><b>${esc(m.name)}</b><small>Pagó ${money(paid[m.id]||0)}</small></div></div><span></span><div class="settle-person right"><div><b>${balances[m.id]>=0?"Recibe":"Debe"} ${money(Math.abs(balances[m.id]||0))}</b><small>Parte ${money(share[m.id]||0)}</small></div></div></div>`).join("");
}
function openMemberDetail(id){
  const m=member(id),{paid,share,balances}=calc(),mine=monthExpenses().filter(e=>e.payerId===id||(e.participantIds||[]).includes(id)).slice(0,5);
  $("#memberDetailContent").innerHTML=`<div class="profile-hero"><div class="avatar xl">${esc(initials(m.name))}</div><div><h2>${esc(m.name)}</h2><p>${esc(m.email||"Miembro de la casa")}</p></div></div><div class="profile-stats"><div><small>Pagó</small><b>${money(paid[id]||0)}</b></div><div><small>Le corresponde</small><b>${money(share[id]||0)}</b></div><div><small>Balance</small><b>${balances[id]>=0?"+":""}${money(balances[id]||0)}</b></div></div><h3>Movimientos recientes</h3><div class="feed">${mine.length?mine.map(feedHTML).join(""):`<div class="empty">Sin movimientos este mes.</div>`}</div>`;
  openSheet("#memberDetailSheet");
}
function settleHTML(p,withButton=false,i=0){return `<div class="settle-row"><div class="settle-person"><div class="avatar">${esc(initials(member(p.from).name))}</div><div><b>${esc(member(p.from).name)}</b><small>paga</small></div></div><div class="settle-arrow">→<b>${money(p.amount)}</b>${withButton?`<button class="secondary mini mark-paid" data-index="${i}">Marcar pagado</button>`:""}</div><div class="settle-person right"><div><b>${esc(member(p.to).name)}</b><small>recibe</small></div><div class="avatar">${esc(initials(member(p.to).name))}</div></div></div>`}
async function markSettlement(i){const p=settlementPlan()[i];if(!p)return;try{await addDoc(collection(db,"households",householdId,"settlements"),{...p,month:activeMonth,status:"paid",method:"Transferencia",createdBy:me.uid,paidAt:serverTimestamp()});toast("Pago registrado ✓")}catch(e){console.error(e);toast("No se pudo registrar el pago.")}}
function feedHTML(e){const icons={Casa:"⌂",Comida:"●",Servicios:"⚡",Teléfono:"◫",Transporte:"◆",Salud:"✚",Suscripciones:"↻",Otros:"•"};return `<div class="feed-item" data-id="${esc(e.id)}"><div class="cat-icon">${icons[e.category]||"•"}</div><div class="feed-copy"><b>${esc(e.description)}</b><small>${esc(member(e.payerId).name)} pagó · ${(e.participantIds||[]).length} participantes · ${esc(e.date)}</small></div><div class="feed-amount"><b>${money(e.amount)}</b><small>${esc(e.category||"Otros")}${((e.attachments&&e.attachments.length)||e.receiptName)?" · 📎":""}</small></div></div>`}

function fillMemberControls(){
  const opts=members.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");$("#expensePayer").innerHTML=opts;$("#recurringPayer").innerHTML=opts;
  $("#participantPicker").innerHTML=members.map(m=>`<button type="button" class="participant selected" data-id="${esc(m.id)}"><span class="avatar">${esc(initials(m.name))}</span>${esc(m.name)}</button>`).join("");
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

function renderAttachmentPreview(){
  if(!attachmentCache.length){
    $("#receiptPreview").innerHTML=`<span>▧</span><div><b>Sin comprobantes</b><small>Puedes adjuntar varias fotos o PDFs.</small></div>`;
    return;
  }
  $("#receiptPreview").innerHTML=`<div class="attachment-list">${attachmentCache.map((a,i)=>`<div class="attachment-item"><span>📎</span><div><b>${esc(a.name||"Archivo")}</b><small>${esc(a.type||"archivo")}</small></div><button type="button" class="remove-attachment" data-index="${i}" title="Quitar">×</button></div>`).join("")}</div>`;
  $$(".remove-attachment").forEach(b=>b.onclick=()=>{attachmentCache.splice(Number(b.dataset.index),1);renderAttachmentPreview()});
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

function openBudgets(){if(!isOwner()){toast("Solo el Owner puede cambiar presupuestos.");return}$("#budgetRows").innerHTML=CATS.map(c=>`<label><span>${esc(c)}</span><input class="budget-input" data-cat="${esc(c)}" inputmode="decimal" placeholder="Sin límite" value="${budgets[`${activeMonth}_${c}`]?.limit||""}"></label>`).join("");openSheet("#budgetSheet")}
$("#quickBudget").onclick=openBudgets;$("#editBudgetsBtn").onclick=openBudgets;$("#saveBudgetsTop").onclick=()=>$("#budgetForm").requestSubmit();
$("#budgetForm").onsubmit=async e=>{e.preventDefault();try{await Promise.all($$(".budget-input").map(i=>setDoc(doc(db,"households",householdId,"budgets",`${activeMonth}_${i.dataset.cat}`),{month:activeMonth,category:i.dataset.cat,limit:Number(i.value||0),updatedAt:serverTimestamp()},{merge:true})));closeSheets();toast("Presupuestos guardados ✓")}catch(e){console.error(e);toast("No se pudieron guardar.")}};

$("#addRecurringBtn").onclick=()=>{$("#recurringForm").reset();$("#recurringDay").value=1;fillMemberControls();openSheet("#recurringSheet")};
$("#recurringForm").onsubmit=async e=>{e.preventDefault();try{await addDoc(collection(db,"households",householdId,"recurring"),{name:$("#recurringName").value.trim(),amount:Number($("#recurringAmount").value),day:Number($("#recurringDay").value),category:$("#recurringCategory").value,payerId:$("#recurringPayer").value,active:true,createdAt:serverTimestamp()});closeSheets();toast("Pago recurrente guardado ✓")}catch(e){console.error(e);toast("No se pudo guardar.")}};

function renderCalendar(){
  const [y,m]=activeMonth.split("-").map(Number),days=new Date(y,m,0).getDate(),first=new Date(y,m-1,1).getDay();
  let html=`<div class="cal-head">${["D","L","M","M","J","V","S"].map(x=>`<b>${x}</b>`).join("")}</div><div class="cal-grid">${"<span></span>".repeat(first)}`;
  for(let d=1;d<=days;d++){const ex=monthExpenses().filter(e=>Number(e.date.slice(8,10))===d),rec=recurrings.filter(r=>r.active&&Number(r.day)===d);html+=`<div class="cal-day"><b>${d}</b>${ex.slice(0,2).map(e=>`<i title="${esc(e.description)}">${money(e.amount)}</i>`).join("")}${rec.slice(0,2).map(r=>`<em title="${esc(r.name)}">${esc(r.name)}</em>`).join("")}</div>`}html+=`</div>`;$("#financialCalendar").innerHTML=html;
  $("#recurringList").innerHTML=recurrings.length?recurrings.sort((a,b)=>a.day-b.day).map(r=>`<div class="recurring-row"><div class="cat-icon">↻</div><div><b>${esc(r.name)}</b><small>Día ${r.day} · ${esc(r.category)}</small></div><strong>${money(r.amount)}</strong>${isOwner()?`<button class="text-btn delete-recurring" data-id="${esc(r.id)}">×</button>`:""}</div>`).join(""):`<div class="empty"><b>Sin recurrentes</b>Agrega servicios, hipoteca, suscripciones o teléfono.</div>`;
  $$(".delete-recurring").forEach(b=>b.onclick=async()=>{if(confirm("¿Eliminar este recurrente?"))await deleteDoc(doc(db,"households",householdId,"recurring",b.dataset.id))});
}

$("#closeMonthBtn").onclick=async()=>{if(!isOwner())return;const existing=closings[activeMonth];try{if(existing){if(!confirm("¿Reabrir este mes? Quedará registrado."))return;await setDoc(doc(db,"households",householdId,"monthlyClosings",activeMonth),{status:"open",reopenedBy:me.uid,reopenedAt:serverTimestamp()},{merge:true});toast("Mes reabierto")}else{if(settlementPlan().length&&!confirm("Aún hay saldos pendientes. ¿Cerrar de todas formas?"))return;await setDoc(doc(db,"households",householdId,"monthlyClosings",activeMonth),{status:"closed",closedBy:me.uid,closedAt:serverTimestamp(),total:monthExpenses().reduce((s,e)=>s+Number(e.amount||0),0)},{merge:true});toast("Mes cerrado ✓")}}catch(e){console.error(e);toast("No se pudo actualizar el cierre.")}};



function go(view){
  if((view==="members"||view==="admin")&&!isOwner()){view="home";toast(uiLang==="en"?"This section is only available to the Owner.":"Esta sección es solo para el Owner.")}
  $$(".page").forEach(p=>p.classList.remove("active"));$("#"+view+"Page").classList.add("active");$$("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  const titles=uiLang==="en"?{home:`Good morning, ${(me?.displayName||"").split(" ")[0]||"family"} 👋`,activity:"Activity",balances:"Balances",month:"Monthly statement",members:"Members",admin:"Administration"}:{home:`Buenos días, ${(me?.displayName||"").split(" ")[0]||"familia"} 👋`,activity:"Actividad",balances:"Saldos",month:"Estado del mes",members:"Miembros",admin:"Administración"};
  $("#pageTitle").textContent=titles[view]||"Mi Casa";applyLanguage();window.scrollTo({top:0,behavior:"smooth"})
}
$$("[data-view]").forEach(b=>b.onclick=()=>go(b.dataset.view));$$("[data-jump]").forEach(b=>b.onclick=()=>{const v=b.dataset.jump;if(v==="members"&&!isOwner())return;go(v)});
$("#profileBtn").onclick=()=>{const mm=myMember();if(mm)openMemberDetail(mm.id)};

// --- Bilingual UI (ES / EN) ---
const EN={
"Inicio":"Home","Actividad":"Activity","Saldos":"Balances","Mes":"Month","Miembros":"Members","Admin":"Admin",
"Nuevo gasto":"New expense","Gastos del mes":"Monthly spending","movimientos":"transactions","Sin comparación aún":"No comparison yet",
"Te deben":"Owed to you","Tú debes":"You owe","Balance personal":"Personal balance","Presupuesto usado":"Budget used",
"Agregar gasto":"Add expense","Registra un pago":"Record a payment","Saldar":"Settle up","Quién paga a quién":"Who pays whom",
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
