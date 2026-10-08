export const $ = (id) => document.getElementById(id);
export const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};
export const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const slug = (t) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "rifa";

/* Estado compartilhado entre os módulos */
export const estado = {
  csrf: "",
  usuario: null,
  rifas: [],
  atual: null,
  vendidos: new Set(),
  meus: new Set(),
  escolhidos: new Set(),
};

let timerAviso;
export function aviso(texto) {
  const m = $("msg");
  m.textContent = texto;
  m.classList.add("on");
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => m.classList.remove("on"), 3200);
}
export async function api(url, opts = {}) {
  const init = {
    method: opts.json || opts.form ? "POST" : "GET",
    headers: { "X-CSRF-Token": estado.csrf },
    credentials: "same-origin",
  };
  if (opts.json) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.json);
  }
  if (opts.form) init.body = opts.form;
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || "Erro inesperado");
  return d;
}

export const post = (url, json = {}) => api(url, { json });

/** Mostra só uma das telas (.view) */
export function mostrarView(id) {
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== id));
  window.scrollTo(0, 0);
}

/** Avisa os módulos que o login/logout mudou */
export const emitirSessao = () => document.dispatchEvent(new Event("sessao"));

/** Janela de confirmação. Devolve null se cancelou, ou { senha } se confirmou. */
export function confirmar(texto, pedirSenha = false) {
  const dlg = $("dlgConfirma");
  $("cfTexto").textContent = texto;
  $("cfSenhaBox").hidden = !pedirSenha;
  $("cfSenha").value = "";
  dlg.returnValue = "";
  dlg.showModal();
  return new Promise((resolver) =>
    dlg.addEventListener(
      "close",
      () => resolver(dlg.returnValue === "ok" ? { senha: $("cfSenha").value } : null),
      { once: true },
    ),
  );
}

export const CARGOS = { adm: "ADM", gerente: "Gerente", participante: "Participante" };

/** "2026-10-08" -> "08/10/2026" */
export const dataBR = (iso) => iso.split("-").reverse().join("/");

/** ADM (dono do site) e gerentes (apoio) */
export const ehEquipe = () => ["adm", "gerente"].includes(estado.usuario?.cargo);
