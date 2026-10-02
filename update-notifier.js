/* Mi Casa · update notice */
(() => {
  if(!("serviceWorker" in navigator)) return;
  let noticeShown=false;
  function showNotice(){
    if(noticeShown||document.getElementById("mi-casa-update-notice"))return; noticeShown=true;
    const box=document.createElement("div"); box.id="mi-casa-update-notice";
    box.innerHTML='<div><b>✨ Nueva versión disponible</b><small>Mi Casa tiene mejoras listas.</small></div><button type="button">Actualizar ahora</button>';
    box.style.cssText="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;background:#173b5d;color:#fff;padding:13px 14px 13px 17px;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.24);font:600 13px system-ui,-apple-system,sans-serif;display:flex;align-items:center;gap:18px;max-width:calc(100vw - 28px)";
    box.querySelector("div").style.cssText="display:grid;gap:2px"; box.querySelector("small").style.cssText="font-weight:400;color:#d7e4eb";
    box.querySelector("button").style.cssText="border:0;border-radius:11px;padding:9px 12px;background:#fff;color:#173b5d;font-weight:800;cursor:pointer;white-space:nowrap";
    box.querySelector("button").onclick=()=>location.reload(); document.body.appendChild(box);
  }
  navigator.serviceWorker.addEventListener("message",e=>{if(e.data?.type==="MI_CASA_UPDATED")showNotice()});
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./service-worker.js",{updateViaCache:"none"});
      await reg.update(); setInterval(()=>reg.update().catch(()=>{}),60*60*1000);
    }catch(e){console.warn("Update check failed",e)}
  });
})();