/* Ponto de entrada: liga os módulos, carrega a sessão e escolhe a tela */
import { $, estado, api, aviso, mostrarView, ehEquipe } from "./util.js";
import { aplicarMascaras } from "./mascaras.js";
import "./tema.js";
import "./exportar.js";
import { definirUsuario, abrirRedefinicao } from "./conta.js";
import { carregarRifas, abrirRifa, voltarLista } from "./rifas.js";
import { abrirPerfil } from "./perfil.js";
import { abrirAdmin } from "./admin.js";

aplicarMascaras();

// fecha as janelas ao clicar fora delas ou no ×
document.querySelectorAll("dialog").forEach((d) => {
  d.addEventListener("click", (e) => {
    const r = d.getBoundingClientRect();
    const fora =
      e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (fora) d.close();
  });
  d.querySelectorAll("[data-fechar]").forEach((b) => (b.onclick = () => d.close()));
});

$("btnAdmin").onclick = () => abrirAdmin();
$("btnVoltarAdmin").onclick = () => voltarLista();

function rotear() {
  const q = new URLSearchParams(location.search);
  if (q.get("rifa")) return abrirRifa(q.get("rifa"), false);
  if (q.get("perfil") && estado.usuario) return abrirPerfil(false);
  if (q.get("admin") && ehEquipe()) return abrirAdmin(false);
  voltarLista(false);
}
addEventListener("popstate", rotear);

(async function iniciar() {
  try {
    const d = await api("/api/me");
    definirUsuario(d.csrf, d.usuario);
    await carregarRifas();
    const token = new URLSearchParams(location.search).get("redefinir");
    if (token) {
      history.replaceState({}, "", "/"); // tira o token da barra de endereço
      mostrarView("viewLista");
      abrirRedefinicao(token);
    } else {
      rotear();
    }
  } catch {
    aviso("Erro ao carregar. Recarregue a página.");
  }
})();
