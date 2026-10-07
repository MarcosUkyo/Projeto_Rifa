/* Minha conta: dados, senha, minhas rifas, minhas participações, excluir conta */
import {
  $,
  el,
  estado,
  aviso,
  api,
  post,
  mostrarView,
  confirmar,
  emitirSessao,
  ehGestor,
  CARGOS,
} from "./util.js";
import { mascarar } from "./mascaras.js";
import { abrirRifa, excluirRifa, voltarLista } from "./rifas.js";
import { definirUsuario, pedirLogin } from "./conta.js";

const pad = (n) => String(n).padStart(3, "0");

function link(texto, aoClicar) {
  const b = el("button", "link", texto);
  b.type = "button";
  b.onclick = aoClicar;
  return b;
}

function itemRifa(r) {
  const linha = el("div", "item");
  const excluir = el("button", "btn suave perigo-txt", "Excluir");
  excluir.type = "button";
  excluir.onclick = async () => {
    if (await excluirRifa(r)) abrirPerfil(false);
  };
  linha.append(
    link(r.titulo, () => abrirRifa(r.codigo)),
    el("span", "mut peq", `${r.vendidos}/${r.qtd_numeros} vendidos`),
    excluir,
  );
  return linha;
}

function itemParticipacao(p) {
  const linha = el("div", "item"),
    chips = el("div", "chips");
  p.numeros.forEach((n) => chips.append(el("span", "chip", pad(n))));
  linha.append(
    link(p.titulo, () => abrirRifa(p.codigo)),
    chips,
  );
  return linha;
}

function preencher(box, itens, montar, vazio) {
  box.replaceChildren();
  if (!itens.length) return box.append(el("p", "mut", vazio));
  itens.forEach((i) => box.append(montar(i)));
}

export async function abrirPerfil(empurrar = true) {
  if (!estado.usuario) return pedirLogin();
  try {
    const p = await api("/api/perfil");
    $("pDoc").textContent = "Documento terminado em " + p.doc_final;
    $("pCargo").textContent = "Cargo: " + CARGOS[p.cargo];
    $("pNome").value = p.nome;
    $("pEmail").value = p.email;
    $("pTel").value = mascarar("telefone", p.telefone);
    $("pAvisoEmail").hidden = !!p.email;
    $("pRifasPainel").hidden = !ehGestor();
    preencher($("pRifas"), p.rifas, itemRifa, "Você ainda não criou rifas.");
    preencher($("pPart"), p.participacoes, itemParticipacao, "Você ainda não comprou números.");
    if (empurrar) history.pushState({}, "", "/?perfil=1");
    document.title = "Minha conta · Rifa Online";
    mostrarView("viewPerfil");
  } catch (err) {
    aviso(err.message);
  }
}

$("btnPerfil").onclick = () => abrirPerfil();
$("btnVoltarPerfil").onclick = () => voltarLista();

$("formPerfil").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const d = await post("/api/perfil", {
      nome: $("pNome").value,
      email: $("pEmail").value,
      telefone: $("pTel").value,
    });
    definirUsuario(estado.csrf, d.usuario);
    $("pAvisoEmail").hidden = true;
    aviso("Dados salvos!");
  } catch (err) {
    aviso(err.message);
  }
};

$("formSenha").onsubmit = async (e) => {
  e.preventDefault();
  if ($("pNova").value !== $("pNova2").value) return aviso("As senhas novas não são iguais.");
  try {
    await post("/api/perfil/senha", { atual: $("pAtual").value, nova: $("pNova").value });
    e.target.reset();
    aviso("Senha alterada!");
  } catch (err) {
    aviso(err.message);
  }
};

$("btnExcluirConta").onclick = async () => {
  const r = await confirmar(
    "Excluir sua conta apaga seus dados e as suas compras. Não dá para desfazer.",
    true,
  );
  if (!r) return;
  try {
    const d = await post("/api/perfil/excluir", { senha: r.senha });
    definirUsuario(d.csrf, null);
    aviso("Conta excluída.");
    emitirSessao();
  } catch (err) {
    aviso(err.message);
  }
};
