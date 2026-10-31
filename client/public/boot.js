// Before the bundle, as a standalone script: the CSP (`_headers`) doesn't allow inline scripts.
// The text in the language chosen last time.
try {
  if (JSON.parse(localStorage.getItem("sparedut.settings") || "{}").lang === "it")
    document.getElementById("loader-text").textContent = "Si carica il Duomo di Gemona…"
} catch {}
// If the bundle breaks on startup, say so instead of loading forever.
addEventListener("error", () => {
  const text = document.getElementById("loader-text")
  if (text) text.textContent = "Alc al è lât strucj · Qualcosa è andato storto: ricarica la pagina"
}, { once: true })
