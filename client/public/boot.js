// Prima del bundle, come script a sé: la CSP (`_headers`) non ammette script inline.
// Il testo nella lingua scelta l'ultima volta.
try {
  if (JSON.parse(localStorage.getItem("sparedut.settings") || "{}").lang === "it")
    document.getElementById("loader-text").textContent = "Si carica il Duomo di Gemona…"
} catch {}
// Se il bundle si rompe all'avvio, lo si dice invece di caricare per sempre.
addEventListener("error", () => {
  const text = document.getElementById("loader-text")
  if (text) text.textContent = "Alc al è lât strucj · Qualcosa è andato storto: ricarica la pagina"
}, { once: true })
