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

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n||0));
const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const initials = n => String(n||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("");
const today = () => new Date().toISOString().slice(0,10);
const monthKey = d => (d||today()).slice(0,7);
const currentMonth = monthKey();
const monthLabel = (key=currentMonth) => { const [y,m]=key.split("-").map(Number); return new Intl.DateTimeFormat("es-US",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,1))); };
let me=null, householdId=null, household=null, members=[], expenses=[], unsubs=[];
const emailKey = e => encodeURIComponent(String(e||"").trim().toLowerCase());
const isOwner = () => !!(me && household && household.ownerId===me.uid);

function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2300)}
function authError(err){ const map={"auth/email-already-in-use":"Ese email ya tiene una cuenta.","auth/invalid-credential":"Email o contraseña incorrectos.","auth/weak-password":"La contraseña necesita al menos 6 caracteres.","auth/invalid-email":"Revisa el email."}; $("#authError").textContent=map[err.code]||err.message||"Ocurrió un error."; }
function showOnly(id){["authView","setupView","appView"].forEach(x=>$("#"+x).classList.toggle("hidden",x!==id))}
function clearSubs(){unsubs.forEach(f=>f());unsubs=[]}

$("#loginTab").onclick=()=>{$("#loginTab").classList.add("active");$("#registerTab").classList.remove("active");$("#loginForm").classList.remove("hidden");$("#registerForm").classList.add("hidden");$("#authError").textContent=""}
$("#registerTab").onclick=()=>{$("#registerTab").classList.add("active");$("#loginTab").classList.remove("active");$("#registerForm").classList.remove("hidden");$("#loginForm").classList.add("hidden");$("#authError").textContent=""}
$("#loginForm").onsubmit=async e=>{e.preventDefault();$("#authError").textContent="";try{await signInWithEmailAndPassword(auth,$("#loginEmail").value.trim(),$("#loginPassword").value)}catch(err){authError(err)}}
$("#registerForm").onsubmit=async e=>{e.preventDefault();$("#authError").textContent="";try{const name=$("#registerName").value.trim();const c=await createUserWithEmailAndPassword(auth,$("#registerEmail").value.trim(),$("#registerPassword").value);await updateProfile(c.user,{displayName:name});await setDoc(doc(db,"users",c.user.uid),{name,email:c.user.email,householdId:null,createdAt:serverTimestamp()});}catch(err){authError(err)}}
$("#setupLogout").onclick=()=>signOut(auth);$("#logoutBtn").onclick=()=>signOut(auth);

$("#forgotPassword").onclick=async()=>{
  const email=$("#loginEmail").value.trim();
  if(!email){$("#authError").textContent="Escribe primero tu email.";return}
  try{await sendPasswordResetEmail(auth,email);$("#authError").textContent="Te enviamos un enlace para crear una nueva contraseña."}
  catch(err){authError(err)}
};

async function claimMyInvite(){
  if(!me?.email){toast("Tu cuenta necesita un email.");return false}
  const ref=doc(db,"invites",emailKey(me.email));
  const snap=await getDoc(ref);
  if(!snap.exists()){toast("No encontramos una invitación para "+me.email);return false}
  const inv=snap.data();
  if(String(inv.email||"").toLowerCase()!==me.email.toLowerCase()){toast("La invitación no coincide con tu email.");return false}

  const memberRef=doc(db,"households",inv.householdId,"members",inv.memberId);
  await setDoc(memberRef,{
    authUid:me.uid,
    email:me.email,
    inviteStatus:"active",
    joinedAt:serverTimestamp()
  },{merge:true});
  await setDoc(doc(db,"users",me.uid),{
    name:me.displayName||me.email.split("@")[0],
    email:me.email,
    householdId:inv.householdId,
    memberId:inv.memberId,
    joinedAt:serverTimestamp()
  },{merge:true});
  await deleteDoc(ref);
  householdId=inv.householdId;
  await startApp();
  toast("¡Ya entraste a Mi Casa! ✓");
  return true;
}
$("#claimInviteBtn").onclick=async()=>{try{await claimMyInvite()}catch(err){console.error("CLAIM_INVITE",err);toast("No se pudo aceptar la invitación.")}};

onAuthStateChanged(auth, async user=>{
  clearSubs(); me=user; householdId=null; household=null; members=[]; expenses=[];
  if(!user){showOnly("authView");return}
  try{
    const uref=doc(db,"users",user.uid); let us=await getDoc(uref);
    if(!us.exists()){await setDoc(uref,{name:user.displayName||user.email.split("@")[0],email:user.email,householdId:null,createdAt:serverTimestamp()});us=await getDoc(uref)}
    householdId=us.data().householdId||null;
    if(!householdId){
      try{if(await claimMyInvite())return}catch(invErr){console.warn("AUTO_CLAIM_INVITE",invErr)}
      showOnly("setupView");return
    }
    startApp();
  }catch(err){console.error(err);toast("No pudimos cargar tu cuenta.");}
});

$("#houseForm").onsubmit=async e=>{
  e.preventDefault();
  if(!me)return;

  const name=$("#houseName").value.trim()||"Mi Casa";
  const button=$("#houseForm button[type='submit']");
  const originalText=button?.textContent||"Crear Mi Casa";

  try{
    if(button){button.disabled=true;button.textContent="Creando…";}

    // V3.2: el ID del hogar inicial es el UID del owner.
    // Así el bootstrap puede validarse únicamente con request.auth,
    // sin depender de lecturas de documentos que aún no existen.
    const hid=me.uid;
    const href=doc(db,"households",hid);

    await setDoc(href,{
      name,
      ownerId:me.uid,
      createdAt:serverTimestamp()
    },{merge:true});

    await setDoc(
      doc(db,"households",hid,"members",me.uid),
      {
        name:me.displayName||me.email.split("@")[0],
        email:me.email,
        role:"owner",
        authUid:me.uid,
        createdAt:serverTimestamp()
      },
      {merge:true}
    );

    await setDoc(
      doc(db,"users",me.uid),
      {
        name:me.displayName||me.email.split("@")[0],
        email:me.email,
        householdId:hid
      },
      {merge:true}
    );

    householdId=hid;
    await startApp();
    toast("Tu hogar está listo ✓");
  }catch(err){
    console.error("CREATE_HOUSEHOLD_ERROR",err?.code,err?.message,err);
    toast(err?.code==="permission-denied"
      ?"Firestore sigue usando reglas antiguas. Publica FIREBASE_RULES.txt."
      :"No se pudo crear el hogar.");
  }finally{
    if(button){button.disabled=false;button.textContent=originalText;}
  }
}

async function startApp(){
  showOnly("appView");
  const h=await getDoc(doc(db,"households",householdId)); if(!h.exists()){toast("No encontramos el hogar.");return}
  household={id:h.id,...h.data()};
  $("#sideHouse").textContent=household.name||"Mi Casa";
  $("#sideName").textContent=me.displayName||me.email;
  $("#sideAvatar").textContent=initials(me.displayName||me.email);
  $("#adminNav").classList.toggle("hidden",!isOwner());
  $$(".owner-only").forEach(x=>x.classList.toggle("hidden",!isOwner()));
  $(".side-user small").textContent=isOwner()?"Owner":"Member";
  $("#monthEyebrow").textContent=monthLabel().toUpperCase();
  $("#statementMonth").textContent=monthLabel().replace(/^./,c=>c.toUpperCase());
  unsubs.push(onSnapshot(collection(db,"households",householdId,"members"),snap=>{members=snap.docs.map(d=>({id:d.id,...d.data()}));renderAll()}));
  const q=query(collection(db,"households",householdId,"expenses"),orderBy("date","desc"));
  unsubs.push(onSnapshot(q,snap=>{expenses=snap.docs.map(d=>({id:d.id,...d.data()}));renderAll()},err=>{console.error(err);toast("No pudimos sincronizar los gastos.")}));
}

function monthExpenses(){return expenses.filter(x=>monthKey(x.date)===currentMonth)}
function calc(){
  const paid={},share={}; members.forEach(m=>{paid[m.id]=0;share[m.id]=0});
  for(const e of monthExpenses()){
    paid[e.payerId]=(paid[e.payerId]||0)+Number(e.amount||0);
    const ids=e.participantIds||[]; if(!ids.length)continue;
    const each=Number(e.amount||0)/ids.length; ids.forEach(id=>share[id]=(share[id]||0)+each);
  }
  const balances={};members.forEach(m=>balances[m.id]=(paid[m.id]||0)-(share[m.id]||0));
  return {paid,share,balances};
}
function settlementPlan(){
  const {balances}=calc();
  let debt=Object.entries(balances).filter(([,v])=>v<-.005).map(([id,v])=>({id,a:-v})).sort((a,b)=>b.a-a.a);
  let cred=Object.entries(balances).filter(([,v])=>v>.005).map(([id,v])=>({id,a:v})).sort((a,b)=>b.a-a.a);
  const out=[];let i=0,j=0;
  while(i<debt.length&&j<cred.length){let a=Math.min(debt[i].a,cred[j].a);out.push({from:debt[i].id,to:cred[j].id,amount:a});debt[i].a-=a;cred[j].a-=a;if(debt[i].a<.005)i++;if(cred[j].a<.005)j++}
  return out;
}
const member=id=>members.find(m=>m.id===id)||{name:"Miembro"};

function renderAll(){
  if(!me||!householdId)return;
  const mex=monthExpenses(),total=mex.reduce((s,e)=>s+Number(e.amount||0),0),{paid,share,balances}=calc();
  const myBal=balances[me.uid]||0;
  $("#monthTotal").textContent=money(total);$("#movementCount").textContent=`${mex.length} ${mex.length===1?"movimiento":"movimientos"}`;
  $("#owedToMe").textContent=money(Math.max(0,myBal));$("#iOwe").textContent=money(Math.max(0,-myBal));
  $("#statementTotal").textContent=money(total);$("#statementMeta").textContent=`${mex.length} gastos · Mes abierto`;

  $("#peopleStrip").innerHTML=members.map(m=>`<div class="person-card"><div class="avatar">${esc(initials(m.name))}</div><b>${esc(m.name)}</b><small>Pagó ${money(paid[m.id]||0)}</small><small class="${balances[m.id]>0.005?"balance-positive":balances[m.id]<-.005?"balance-negative":""}">${balances[m.id]>0.005?"Recibe "+money(balances[m.id]):balances[m.id]<-.005?"Debe "+money(-balances[m.id]):"Saldado"}</small></div>`).join("");

  const plan=settlementPlan();
  const planHTML=plan.length?plan.slice(0,3).map(p=>settleHTML(p)).join(""):`<div class="empty"><b>Todo saldado ✓</b>No hay pagos pendientes.</div>`;
  $("#settlementPreview").innerHTML=planHTML;
  $("#settlementList").innerHTML=plan.length?plan.map(p=>settleHTML(p)).join(""):`<div class="empty"><b>Todo saldado ✓</b>No hay pagos pendientes este mes.</div>`;

  const cats={};mex.forEach(e=>cats[e.category]=(cats[e.category]||0)+Number(e.amount||0));
  const entries=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  $("#categoryList").innerHTML=entries.length?entries.slice(0,5).map(([k,v])=>`<div class="category-row"><b>${esc(k)}</b><span>${money(v)}</span><div class="category-track"><div class="category-fill" style="width:${total?Math.max(5,v/total*100):0}%"></div></div></div>`).join(""):`<div class="empty"><b>Sin categorías</b>Agrega tu primer gasto.</div>`;

  const feed=expenses.length?expenses.map(feedHTML).join(""):`<div class="empty"><b>No hay gastos todavía</b>Toca “Nuevo gasto” para comenzar.</div>`;
  $("#activityList").innerHTML=feed;$("#recentList").innerHTML=expenses.length?expenses.slice(0,5).map(feedHTML).join(""):`<div class="empty"><b>No hay gastos todavía</b>Toca “Nuevo gasto” para comenzar.</div>`;
  $$(".feed-item[data-id]").forEach(el=>el.onclick=()=>openExpense(expenses.find(x=>x.id===el.dataset.id)));

  $("#membersList").innerHTML=members.map(m=>{
    const status=m.authUid?"Activo":m.email?"Invitación pendiente":"Sin acceso";
    return `<div class="member-row"><div class="avatar">${esc(initials(m.name))}</div><div><b>${esc(m.name)}</b><small>${esc(m.email||"Sin email")} · ${status}</small></div><span class="role-pill">${esc(m.role||"member")}</span></div>`
  }).join("");
  if($("#adminUsers")) $("#adminUsers").innerHTML=isOwner()?members.map(m=>{
    const status=m.authUid?"Activo":m.email?"Pendiente":"Sin acceso";
    return `<div class="member-row admin-user" data-member="${esc(m.id)}"><div class="avatar">${esc(initials(m.name))}</div><div class="member-main"><b>${esc(m.name)}</b><small>${esc(m.email||"Sin email")} · ${status}</small></div><div class="admin-actions">${m.email?`<button class="secondary mini reset-access" data-email="${esc(m.email)}">Restablecer contraseña</button>`:""}${m.id!==me.uid?`<button class="danger mini remove-member" data-member="${esc(m.id)}">Eliminar</button>`:""}</div></div>`
  }).join(""):`<div class="empty"><b>Solo el Owner</b>Esta sección está reservada para el administrador.</div>`;
  $$(".reset-access").forEach(b=>b.onclick=async ev=>{ev.stopPropagation();try{await sendPasswordResetEmail(auth,b.dataset.email);toast("Enlace de contraseña enviado ✓")}catch(err){console.error(err);toast("No se pudo enviar el restablecimiento.")}});
  $$(".remove-member").forEach(b=>b.onclick=async ev=>{ev.stopPropagation();if(!confirm("¿Quitar este miembro de Mi Casa?"))return;try{await deleteDoc(doc(db,"households",householdId,"members",b.dataset.member));toast("Miembro eliminado")}catch(err){console.error(err);toast("No se pudo eliminar.")}});
  $("#monthPeople").innerHTML=members.map(m=>`<div class="settle-row"><div class="settle-person"><div class="avatar">${esc(initials(m.name))}</div><div><b>${esc(m.name)}</b><small>Pagó ${money(paid[m.id]||0)}</small></div></div><span></span><div class="settle-person right"><div><b>${balances[m.id]>=0?"Recibe":"Debe"} ${money(Math.abs(balances[m.id]||0))}</b><small>Parte ${money(share[m.id]||0)}</small></div></div></div>`).join("");
  fillMemberControls();
}
function settleHTML(p){return `<div class="settle-row"><div class="settle-person"><div class="avatar">${esc(initials(member(p.from).name))}</div><div><b>${esc(member(p.from).name)}</b><small>paga</small></div></div><div class="settle-arrow">→<b>${money(p.amount)}</b></div><div class="settle-person right"><div><b>${esc(member(p.to).name)}</b><small>recibe</small></div><div class="avatar">${esc(initials(member(p.to).name))}</div></div></div>`}
function feedHTML(e){const icons={Casa:"⌂",Comida:"●",Servicios:"⚡",Teléfono:"◫",Transporte:"◆",Salud:"✚",Otros:"•"};return `<div class="feed-item" data-id="${esc(e.id)}"><div class="cat-icon">${icons[e.category]||"•"}</div><div class="feed-copy"><b>${esc(e.description)}</b><small>${esc(member(e.payerId).name)} pagó · ${(e.participantIds||[]).length} participantes · ${esc(e.date)}</small></div><div class="feed-amount"><b>${money(e.amount)}</b><small>${esc(e.category||"Otros")}</small></div></div>`}

function fillMemberControls(){
  $("#expensePayer").innerHTML=members.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");
  $("#participantPicker").innerHTML=members.map(m=>`<button type="button" class="participant selected" data-id="${esc(m.id)}"><span class="avatar">${esc(initials(m.name))}</span>${esc(m.name)}</button>`).join("");
  $$("#participantPicker .participant").forEach(b=>b.onclick=()=>{b.classList.toggle("selected");updatePerPerson()});
}
function updatePerPerson(){const n=$$("#participantPicker .participant.selected").length,a=parseFloat($("#expenseAmount").value)||0;$("#perPerson").textContent=n?`${money(a/n)} c/u`:"Selecciona personas"}
$("#expenseAmount").addEventListener("input",updatePerPerson);

function openSheet(id){$("#overlay").classList.remove("hidden");$(id).classList.remove("hidden")}
function closeSheets(){$("#overlay").classList.add("hidden");$$(".sheet").forEach(x=>x.classList.add("hidden"))}
$("#overlay").onclick=closeSheets;$$(".sheetCancel").forEach(b=>b.onclick=closeSheets);$$(".memberCancel").forEach(b=>b.onclick=closeSheets);

function openExpense(e=null){
  if(!members.length){toast("Primero agrega miembros.");return}
  $("#expenseForm").reset();$("#expenseId").value=e?.id||"";$("#expenseSheetTitle").textContent=e?"Editar gasto":"Nuevo gasto";$("#deleteExpense").classList.toggle("hidden",!e);
  $("#expenseDate").value=e?.date||today();$("#expenseAmount").value=e?.amount||"";$("#expenseDescription").value=e?.description||"";$("#expenseCategory").value=e?.category||"Casa";$("#expensePayer").value=e?.payerId||me.uid;$("#expenseNotes").value=e?.notes||"";
  $$("#participantPicker .participant").forEach(b=>b.classList.toggle("selected",e?(e.participantIds||[]).includes(b.dataset.id):true));
  updatePerPerson();openSheet("#expenseSheet");setTimeout(()=>$("#expenseAmount").focus(),150)
}
["#newExpenseBtn","#quickExpense","#activityAdd","#mobileAdd"].forEach(id=>$(id).onclick=()=>openExpense());
$("#saveExpenseTop").onclick=()=>$("#expenseForm").requestSubmit();
$("#expenseForm").onsubmit=async e=>{
  e.preventDefault();const amount=parseFloat($("#expenseAmount").value),ids=$$("#participantPicker .participant.selected").map(x=>x.dataset.id);
  if(!(amount>0)){toast("Ingresa un monto válido.");return}if(!ids.length){toast("Selecciona al menos una persona.");return}
  const data={amount,description:$("#expenseDescription").value.trim(),date:$("#expenseDate").value,category:$("#expenseCategory").value,payerId:$("#expensePayer").value,participantIds:ids,notes:$("#expenseNotes").value.trim(),updatedAt:serverTimestamp()};
  try{const id=$("#expenseId").value;if(id)await setDoc(doc(db,"households",householdId,"expenses",id),data,{merge:true});else await addDoc(collection(db,"households",householdId,"expenses"),{...data,createdBy:me.uid,createdAt:serverTimestamp()});closeSheets();toast(id?"Gasto actualizado ✓":"Gasto agregado ✓")}catch(err){console.error(err);toast("No se pudo guardar el gasto.")}
}
$("#deleteExpense").onclick=async()=>{const id=$("#expenseId").value;if(!id||!confirm("¿Eliminar este gasto?"))return;try{await deleteDoc(doc(db,"households",householdId,"expenses",id));closeSheets();toast("Gasto eliminado")}catch(err){console.error(err);toast("No tienes permiso para eliminarlo.")}}

$("#inviteBtn").onclick=()=>{$("#memberForm").reset();openSheet("#memberSheet")};
$("#memberForm").onsubmit=async e=>{
  e.preventDefault();
  if(!isOwner()){toast("Solo el Owner puede administrar miembros.");return}
  const name=$("#memberName").value.trim();
  const email=$("#memberEmail").value.trim().toLowerCase();
  try{
    const mref=doc(collection(db,"households",householdId,"members"));
    await setDoc(mref,{name,email:email||null,role:"member",authUid:null,inviteStatus:email?"pending":"none",createdAt:serverTimestamp()});
    if(email){
      await setDoc(doc(db,"invites",emailKey(email)),{
        email,
        householdId,
        memberId:mref.id,
        householdName:household?.name||"Mi Casa",
        invitedBy:me.uid,
        createdAt:serverTimestamp()
      });
    }
    closeSheets();
    toast(email?"Invitación preparada ✓":"Miembro agregado ✓");
  }catch(err){console.error(err);toast("No se pudo agregar/invitar.")}
}

function go(view){
  $$(".page").forEach(p=>p.classList.remove("active"));$("#"+view+"Page").classList.add("active");
  $$("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  const titles={home:`Buenos días, ${(me?.displayName||"").split(" ")[0]} 👋`,activity:"Actividad",balances:"Saldos",month:"Estado del mes",members:"Miembros",admin:"Administración"};
  $("#pageTitle").textContent=titles[view]||"Mi Casa";window.scrollTo({top:0,behavior:"smooth"});
}
$$("[data-view]").forEach(b=>b.onclick=()=>go(b.dataset.view));$$("[data-jump]").forEach(b=>b.onclick=()=>go(b.dataset.jump));
$("#profileBtn").onclick=()=>go("members");
$("#printReport").onclick=()=>window.print();

if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(console.warn));
