/* Painel da equipe: cargos dos usuários (só ADM) e todas as rifas (ADM e gerentes) */
import { $, el, estado, aviso, api, post, mostrarView, CARGOS, dataBR, ehEquipe } from "./util.js";
import { mascarar } from "./mascaras.js";
import { abrirRifa, excluirRifa, carregarRifas } from "./rifas.js";

const STATUS = { aberta: "Aberta", encerrada: "Encerrada", sorteada: "Sorteada" };
const VIS = { publica: "Pública", privada: "Privada" };

function linhaUsuario(u) {
  const linha = el("div", "item"),
    quem = el("div"),
    sel = el("select"),
    salvar = el("button", "btn suave", "Salvar");
  quem.append(
    el("strong", "", u.nome + (u.eu ? " (você)" : "")),
    el("p", "mut peq", `${mascarar("doc", u.cpf_cnpj)} · ${u.email || "sem e-mail"}`),
  );
  Object.entries(CARGOS).forEach(([valor, nome]) => sel.add(new Option(nome, valor)));
  sel.value = u.cargo;
  sel.disabled = salvar.disabled = u.eu;
  salvar.type = "button";
  salvar.onclick = async () => {
    try {
      await post("/api/admin/cargo", { cpf_cnpj: u.cpf_cnpj, cargo: sel.value });
      aviso(`${u.nome} agora é ${CARGOS[sel.value]}.`);
    } catch (err) {
      aviso(err.message);
    }
  };
  const controles = el("div", "botoes");
  controles.append(sel, salvar);
  linha.append(quem, controles);
  return linha;
}

function linhaRifa(r) {
  const linha = el("div", "item"),
    quem = el("div"),
    controles = el("div", "botoes");
  const data = r.data_sorteio ? " · sorteio " + dataBR(r.data_sorteio) : "";
  quem.append(
    el("strong", "", r.titulo),
    el(
      "p",
      "mut peq",
      `${r.organizador} · ${VIS[r.visibilidade]} · ${STATUS[r.status]} · ${r.vendidos}/${r.qtd_numeros} vendidos${data}`,
    ),
  );
  const abrir = el("button", "btn suave", "Abrir"),
    copiar = el("button", "btn suave", "Copiar link"),
    alternar = el(
      "button",
      "btn suave",
      r.visibilidade === "publica" ? "Tornar privada" : "Tornar pública",
    ),
    excluir = el("button", "btn suave perigo-txt", "Excluir");
  [abrir, copiar, alternar, excluir].forEach((b) => (b.type = "button"));
  abrir.onclick = () => abrirRifa(r.codigo);
  copiar.onclick = () =>
    navigator.clipboard.writeText(`${location.origin}/?rifa=${encodeURIComponent(r.codigo)}`).then(
      () => aviso("Link copiado!"),
      () => aviso("Não foi possível copiar."),
    );
  alternar.onclick = async () => {
    try {
      const nova = r.visibilidade === "publica" ? "privada" : "publica";
      await post("/api/rifas/visibilidade", { codigo: r.codigo, visibilidade: nova });
      aviso(`Rifa agora é ${VIS[nova].toLowerCase()}.`);
      abrirAdmin(false);
    } catch (err) {
      aviso(err.message);
    }
  };
  excluir.onclick = async () => {
    if (await excluirRifa(r)) abrirAdmin(false);
  };
  controles.append(abrir, copiar, alternar, excluir);
  linha.append(quem, controles);
  return linha;
}

function preencher(box, itens, montar, vazio) {
  box.replaceChildren();
  if (!itens.length) return box.append(el("p", "mut", vazio));
  itens.forEach((i) => box.append(montar(i)));
}

export async function abrirAdmin(empurrar = true) {
  if (!ehEquipe()) return aviso("Área exclusiva da equipe.");
  const adm = estado.usuario.cargo === "adm";
  try {
    const [usuarios, rifas] = await Promise.all([
      adm ? api("/api/admin/usuarios") : Promise.resolve([]),
      api("/api/admin/rifas"),
    ]);
    $("aUsuariosPainel").hidden = !adm;
    preencher($("aUsuarios"), usuarios, linhaUsuario, "Nenhum usuário.");
    preencher($("aRifas"), rifas, linhaRifa, "Nenhuma rifa criada.");
    if (empurrar) history.pushState({}, "", "/?admin=1");
    document.title = "Painel · Rifa Online";
    mostrarView("viewAdmin");
    carregarRifas();
  } catch (err) {
    aviso(err.message);
  }
}
