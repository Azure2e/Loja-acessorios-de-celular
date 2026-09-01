(function () {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  var refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then(function (reg) {
    function tick() { try { reg.update(); } catch (e) {} }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") tick();
    });
    setInterval(tick, 30 * 60 * 1000);
    if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
    reg.addEventListener("updatefound", function () {
      var sw = reg.installing;
      if (!sw) return;
      sw.addEventListener("statechange", function () {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          sw.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
  });
})();
