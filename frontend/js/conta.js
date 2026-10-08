/* Login, cadastro, "esqueci a senha" e logout */
import { $, estado, aviso, post, emitirSessao, ehEquipe } from "./util.js";

let tokenRedefinicao = "";

function atualizarTopo() {
  const u = estado.usuario;
  $("btnPerfil").hidden = !u;
  $("btnSair").hidden = !u;
  $("btnEntrar").hidden = !!u;
  $("btnAdmin").hidden = !ehEquipe();
  $("btnAdmin").textContent = u?.cargo === "adm" ? "Painel ADM" : "Painel de apoio";
  if (u) $("btnPerfil").textContent = "Olá, " + u.nome.split(" ")[0];
}

export function definirUsuario(csrf, usuario) {
  estado.csrf = csrf;
  estado.usuario = usuario;
  atualizarTopo();
}

function mostrarAba(nome) {
  document
    .querySelectorAll("[data-aba]")
    .forEach((b) => b.classList.toggle("on", b.dataset.aba === nome));
  $("abas").hidden = nome === "esqueci";
  $("formLogin").hidden = nome !== "login";
  $("formCadastro").hidden = nome !== "cadastro";
  $("formEsqueci").hidden = nome !== "esqueci";
}

export function pedirLogin() {
  mostrarAba("login");
  $("dlgAuth").showModal();
}

export function abrirRedefinicao(token) {
  tokenRedefinicao = token;
  $("dlgRedefinir").showModal();
}

function entrou(d) {
  definirUsuario(d.csrf, d.usuario);
  $("dlgAuth").close();
  document.querySelectorAll("#dlgAuth form").forEach((f) => f.reset());
  aviso("Bem-vindo(a), " + d.usuario.nome.split(" ")[0] + "!");
  emitirSessao();
}

document
  .querySelectorAll("[data-aba]")
  .forEach((b) => (b.onclick = () => mostrarAba(b.dataset.aba)));
$("btnEntrar").onclick = pedirLogin;
$("btnEsqueci").onclick = () => mostrarAba("esqueci");
$("btnVoltarLogin").onclick = () => mostrarAba("login");

$("formLogin").onsubmit = async (e) => {
  e.preventDefault();
  try {
    entrou(await post("/api/login", { cpf_cnpj: $("lDoc").value, senha: $("lSenha").value }));
  } catch (err) {
    aviso(err.message);
  }
};

$("formCadastro").onsubmit = async (e) => {
  e.preventDefault();
  try {
    entrou(
      await post("/api/cadastro", {
        nome: $("cNome").value,
        cpf_cnpj: $("cDoc").value,
        email: $("cEmail").value,
        telefone: $("cTel").value,
        senha: $("cSenha").value,
      }),
    );
  } catch (err) {
    aviso(err.message);
  }
};

$("formEsqueci").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const d = await post("/api/esqueci", { cpf_cnpj: $("eDoc").value });
    aviso(d.mensagem);
    e.target.reset();
    mostrarAba("login");
  } catch (err) {
    aviso(err.message);
  }
};

$("formRedefinir").onsubmit = async (e) => {
  e.preventDefault();
  if ($("rSenha").value !== $("rSenha2").value) return aviso("As senhas não são iguais.");
  try {
    await post("/api/redefinir", { token: tokenRedefinicao, senha: $("rSenha").value });
    e.target.reset();
    $("dlgRedefinir").close();
    aviso("Senha alterada! Entre com a nova senha.");
    pedirLogin();
  } catch (err) {
    aviso(err.message);
  }
};

$("btnSair").onclick = async () => {
  const d = await post("/api/logout");
  definirUsuario(d.csrf, null);
  estado.escolhidos.clear();
  aviso("Você saiu da conta.");
  emitirSessao();
};
