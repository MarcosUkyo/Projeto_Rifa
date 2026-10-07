import { $, el } from "./util.js";

const PRESETS = ["#7c3aed", "#2563eb", "#059669", "#e11d48", "#ea580c", "#0f172a"];
function aplicarCor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) hex = PRESETS[0];
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const claro = (r * 299 + g * 587 + b * 114) / 1000 > 160;
  const raiz = document.documentElement.style;
  raiz.setProperty("--cor", hex);
  raiz.setProperty("--cor-texto", claro ? "#111" : "#fff");
  $("corSite").value = hex;
  try {
    localStorage.setItem("corSite", hex);
  } catch {}
}
PRESETS.forEach((c) => {
  const b = el("button", "sw");
  b.type = "button";
  b.title = c;
  b.setAttribute("aria-label", "Cor " + c);
  b.style.background = c;
  b.onclick = () => aplicarCor(c);
  $("cores").insertBefore(b, $("corSite"));
});
$("corSite").oninput = (e) => aplicarCor(e.target.value);
try {
  aplicarCor(localStorage.getItem("corSite") || PRESETS[0]);
} catch {
  aplicarCor(PRESETS[0]);
}
