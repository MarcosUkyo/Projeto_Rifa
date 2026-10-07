/* Lista, formulário (criar/editar), tela da rifa, compra, sorteio e painel do organizador */
import {
  $,
  el,
  brl,
  estado,
  aviso,
  api,
  post,
  mostrarView,
  confirmar,
  dataBR,
  ehGestor,
} from "./util.js";
import { mascarar, valorEmReais } from "./mascaras.js";
import { pedirLogin } from "./conta.js";

const pad = (n) => String(n).padStart(3, "0");
const pct = (a, b) => Math.round((a / b) * 100) + "%";
const ROTULO = { sorteada: "Sorteada", encerrada: "Vendas encerradas" };

function capa(r, cls = "") {
  if (!r.imagem) return el("div", "sem-foto " + cls, "🎟️");
  const i = el("img", cls);
  i.src = "/uploads/" + r.imagem;
  i.alt = r.titulo;
  i.loading = "lazy";
  return i;
}

export function voltarLista(empurrar = true) {
  if (empurrar) history.pushState({}, "", "/");
  document.title = "Rifa Online";
  estado.atual = null;
  mostrarView("viewLista");
}

/* ---------- Lista: só rifas que o usuário organiza ou em que participa ---------- */
export async function carregarRifas() {
  estado.rifas = await api("/api/rifas");
  const lista = $("lista");
  lista.replaceChildren();
  $("vazio").hidden = estado.rifas.length > 0;
  $("vazio").textContent = !estado.usuario
    ? "Para participar de uma rifa, abra o link que o organizador enviou."
    : ehGestor()
      ? "Você ainda não tem rifas. Crie uma ou abra o link de uma rifa que recebeu."
      : "Você ainda não participa de nenhuma rifa. Abra o link que o organizador enviou.";
  estado.rifas.forEach((r) => {
    const b = el("button", "bilhete");
    b.type = "button";
    const corpo = el("div", "corpo");
    corpo.append(el("h3", "", r.titulo), el("span", "mut", "Prêmio: " + r.premio));
    corpo.append(el("span", "selo", r.papel === "organizador" ? "Sua rifa" : "Participando"));
    if (r.status !== "aberta") corpo.append(el("span", "selo " + r.status, ROTULO[r.status]));
    const barra = el("div", "barra"),
      prog = el("span");
    prog.style.width = pct(r.vendidos, r.qtd_numeros);
    barra.append(prog);
    const pe = el("div", "pe");
    pe.append(
      barra,
      el(
        "span",
        "mut",
        `${brl(r.valor_numero)} por número · ${r.vendidos}/${r.qtd_numeros} vendidos`,
      ),
    );
    b.append(capa(r, "foto"), corpo, pe);
    b.onclick = () => abrirRifa(r.codigo);
    lista.append(b);
  });
}

/* ---------- Formulário: criar e editar ---------- */
let editando = null;
const hojeLocal = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

for (let q = 80; q <= 200; q += 20) $("cQtd").add(new Option(q + " números", q));

function abrirFormRifa(r = null) {
  editando = r;
  const f = $("formRifa");
  f.reset();
  $("previa").hidden = true;
  $("dlgRifaTitulo").textContent = r ? "Editar rifa" : "Criar rifa";
  $("btnSalvarRifa").textContent = r ? "Salvar alterações" : "Publicar rifa";
  const hoje = hojeLocal();
  f.titulo.readOnly = !!r;
  f.data_sorteio.min = r && r.data_sorteio && r.data_sorteio < hoje ? "" : hoje;
  const fixos = !!r && r.vendidos > 0;
  f.valor_numero.disabled = fixos;
  f.qtd_numeros.disabled = fixos;
  $("avisoFixos").hidden = !r;
  $("removerBox").hidden = !(r && r.imagem);
  if (r) {
    f.titulo.value = r.titulo;
    f.resumo.value = r.resumo;
    f.premio.value = r.premio;
    f.data_sorteio.value = r.data_sorteio || "";
    f.valor_numero.value = mascarar("valor", String(Math.round(r.valor_numero * 100)));
    f.qtd_numeros.value = String(r.qtd_numeros);
  }
  $("dlgRifa").showModal();
}

$("btnCriar").onclick = () => {
  if (estado.usuario) return abrirFormRifa();
  aviso("Entre na sua conta para criar uma rifa.");
  pedirLogin();
};
$("btnEditar").onclick = () => abrirFormRifa(estado.atual);

$("cImg").onchange = (e) => {
  const f = e.target.files[0];
  if (f && f.size > 4 * 1024 * 1024) {
    aviso("Imagem acima de 4 MB.");
    e.target.value = "";
  }
  const ok = e.target.files[0];
  $("previa").hidden = !ok;
  if (ok) $("previa").src = URL.createObjectURL(ok);
};

$("formRifa").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const form = new FormData(e.target);
    if (form.has("valor_numero")) form.set("valor_numero", valorEmReais(form.get("valor_numero")));
    let codigo;
    if (editando) {
      codigo = editando.codigo;
      form.set("codigo", codigo);
      await api("/api/rifas/editar", { form });
    } else {
      codigo = (await api("/api/rifas", { form })).codigo;
    }
    const foiEdicao = !!editando;
    $("dlgRifa").close();
    await carregarRifas();
    aviso(
      foiEdicao ? "Rifa atualizada!" : "Rifa publicada! Compartilhe o link com os participantes.",
    );
    abrirRifa(codigo, !foiEdicao);
  } catch (err) {
    aviso(err.message);
  }
};

/* ---------- Tela da rifa (acesso pelo link) ---------- */
function mostrarStatus(r) {
  const s = $("rStatus");
  s.className = "status " + r.status;
  if (r.status === "sorteada") {
    s.textContent = `🏆 Sorteio realizado: número ${pad(r.numero_sorteado)} — ganhador(a): ${r.ganhador}`;
  } else if (r.status === "encerrada") {
    s.textContent = `Vendas encerradas em ${dataBR(r.data_sorteio)}. Aguardando o sorteio.`;
  } else {
    s.textContent = r.data_sorteio ? `📅 Sorteio em ${dataBR(r.data_sorteio)}` : "";
  }
}

function mostrarPainelOrganizador(r) {
  $("painelOrg").hidden = !r.pode_gerenciar;
  $("btnSortear").hidden = !r.pode_sortear;
  $("btnEditar").hidden = r.status === "sorteada";
  const dica = $("dicaSorteio");
  dica.hidden = !(r.pode_gerenciar && r.status !== "sorteada" && !r.pode_sortear);
  dica.textContent =
    r.vendidos === 0
      ? "O sorteio fica disponível quando houver números vendidos."
      : "O sorteio libera em " + (r.data_sorteio ? dataBR(r.data_sorteio) : "") + ".";
  $("listaPart").replaceChildren();
}

export async function abrirRifa(codigo, empurrar = true) {
  try {
    const d = await api("/api/rifa?codigo=" + encodeURIComponent(codigo));
    const r = d.rifa;
    estado.atual = r;
    estado.vendidos = new Set(d.vendidos);
    estado.meus = new Set(d.meus);
    estado.escolhidos.clear();
    if (empurrar) history.pushState({}, "", "/?rifa=" + encodeURIComponent(r.codigo));
    $("capa").replaceChildren(capa(r));
    $("rTitulo").textContent = r.titulo;
    $("rOrg").textContent = "Organizada por " + r.organizador;
    $("rResumo").textContent = r.resumo;
    $("rPremio").textContent = "🎁 " + r.premio;
    $("rValor").textContent = brl(r.valor_numero) + " por número";
    $("rBarra").style.width = pct(estado.vendidos.size, r.qtd_numeros);
    $("rVend").textContent = `${estado.vendidos.size} de ${r.qtd_numeros} números vendidos`;
    mostrarStatus(r);
    mostrarPainelOrganizador(r);
    document.title = r.titulo + " · Rifa Online";
    mostrarView("viewRifa");
    desenharGrade();
  } catch (err) {
    aviso(err.message);
    voltarLista(false);
  }
}

function desenharGrade() {
  const r = estado.atual,
    grade = $("grade");
  grade.replaceChildren();
  for (let n = 1; n <= r.qtd_numeros; n++) {
    const vendido = estado.vendidos.has(n);
    const classes = ["num"];
    if (vendido) classes.push("ven");
    if (estado.meus.has(n)) classes.push("meu");
    if (estado.escolhidos.has(n)) classes.push("sel");
    if (n === r.numero_sorteado) classes.push("ganhou");
    const b = el("button", classes.join(" "), pad(n));
    b.type = "button";
    b.disabled = vendido || !r.vendas_abertas;
    if (estado.meus.has(n)) b.title = "Número comprado por você";
    b.setAttribute("aria-pressed", estado.escolhidos.has(n));
    b.onclick = () => {
      estado.escolhidos.has(n) ? estado.escolhidos.delete(n) : estado.escolhidos.add(n);
      desenharGrade();
    };
    grade.append(b);
  }
  $("compra").hidden = estado.escolhidos.size === 0;
  const lista = [...estado.escolhidos].sort((a, b) => a - b).join(", ");
  const total = brl(estado.escolhidos.size * r.valor_numero);
  $("resumoCompra").textContent = `${estado.escolhidos.size} número(s): ${lista} · ${total}`;
}

$("btnComprar").onclick = async () => {
  if (!estado.usuario) {
    aviso("Entre ou cadastre-se para comprar.");
    return pedirLogin();
  }
  const codigo = estado.atual.codigo;
  try {
    await post("/api/comprar", { rifa: codigo, numeros: [...estado.escolhidos] });
    aviso("Compra realizada! 🎉");
  } catch (err) {
    aviso(err.message);
  }
  await carregarRifas();
  await abrirRifa(codigo, false);
};

/* ---------- Painel do organizador ---------- */
async function verParticipantes() {
  try {
    const d = await api("/api/participantes?rifa=" + encodeURIComponent(estado.atual.codigo));
    const box = $("listaPart");
    box.replaceChildren();
    if (!d.participantes.length) return box.append(el("p", "mut", "Ninguém comprou ainda."));
    d.participantes.forEach((p) => {
      const linha = el("div", "part"),
        topo = el("div", "part-topo"),
        chips = el("div", "chips");
      topo.append(
        el("strong", "", (p.ganhador ? "🏆 " : "") + p.nome),
        el("span", "mut", `${p.numeros.length} número(s) · ${brl(p.total)}`),
      );
      const contato = [mascarar("telefone", p.telefone), p.email].filter(Boolean).join(" · ");
      p.numeros.forEach((n) => chips.append(el("span", "chip", pad(n))));
      linha.append(topo, el("p", "mut peq", contato || "Sem contato informado"), chips);
      box.append(linha);
    });
  } catch (err) {
    aviso(err.message);
  }
}
$("btnPart").onclick = verParticipantes;

$("btnSortear").onclick = async () => {
  const ok = await confirmar(
    "Sortear agora? O resultado não pode ser desfeito e as vendas serão encerradas.",
  );
  if (!ok) return;
  try {
    const d = await post("/api/rifas/sortear", { codigo: estado.atual.codigo });
    aviso(`🏆 Sorteado: número ${pad(d.rifa.numero_sorteado)} — ${d.rifa.ganhador}`);
    await carregarRifas();
    await abrirRifa(d.rifa.codigo, false);
  } catch (err) {
    aviso(err.message);
  }
};

$("btnExcluirRifa").onclick = () => excluirRifa(estado.atual);

/** Pede confirmação e exclui. `r` precisa de codigo, titulo e vendidos. Devolve true se excluiu. */
export async function excluirRifa(r) {
  const msg =
    r.vendidos > 0
      ? `A rifa "${r.titulo}" tem ${r.vendidos} número(s) vendido(s). Excluir apaga a rifa e essas compras. Não dá para desfazer.`
      : `Excluir a rifa "${r.titulo}"? Não dá para desfazer.`;
  if (!(await confirmar(msg))) return false;
  try {
    await post("/api/rifas/excluir", { codigo: r.codigo });
    aviso("Rifa excluída.");
    await carregarRifas();
    if (!$("viewRifa").hidden) voltarLista();
    return true;
  } catch (err) {
    aviso(err.message);
    return false;
  }
}

$("btnVoltar").onclick = () => voltarLista();

/* ---------- Login/logout: recarrega tudo ---------- */
document.addEventListener("sessao", async () => {
  const codigo = estado.atual?.codigo;
  await carregarRifas();
  if (!estado.usuario) return voltarLista(location.search !== ""); // saiu da conta: volta à lista
  if (codigo && !$("viewRifa").hidden) await abrirRifa(codigo, false);
});
