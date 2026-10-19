/* Mi Casa · aviso de versión nueva (V10) */
(() => {
  if (!("serviceWorker" in navigator)) return;
  // Si la página no tenía service worker al abrir, es la primera instalación: no hay "versión nueva" que anunciar.
  const hadController = !!navigator.serviceWorker.controller;
  let noticeShown = false;
  function showNotice() {
    if (!hadController || noticeShown || document.getElementById("mi-casa-update-notice")) return; noticeShown = true;
    const box = document.createElement("div"); box.id = "mi-casa-update-notice"; box.setAttribute("role", "status");
    box.innerHTML = '<div><b>Hay una versión nueva de Mi Casa</b><small>Actualiza para usarla.</small></div><button type="button">Actualizar</button>';
    box.style.cssText = "position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:99999;background:#4A2545;color:#FFF6EC;padding:12px 12px 12px 16px;border-radius:18px;box-shadow:0 18px 50px rgba(43,30,42,.35);font:600 14px -apple-system,system-ui,sans-serif;display:flex;align-items:center;gap:16px;max-width:calc(100vw - 24px)";
    box.querySelector("div").style.cssText = "display:grid;gap:2px"; box.querySelector("small").style.cssText = "font-weight:400;opacity:.8";
    box.querySelector("button").style.cssText = "border:0;border-radius:12px;min-height:40px;padding:0 14px;background:#E8A33D;color:#2B1E2A;font-weight:800;cursor:pointer;white-space:nowrap";
    box.querySelector("button").onclick = () => location.reload(); document.body.appendChild(box);
  }
  navigator.serviceWorker.addEventListener("message", e => { if (e.data?.type === "MI_CASA_UPDATED") showNotice(); });
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" });
      await reg.update(); setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch (e) { console.warn("Update check failed", e); }
  });
})();
