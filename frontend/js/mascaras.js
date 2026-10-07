/* Máscaras dos campos: o navegador só deixa digitar o que o servidor aceita. */
const soDigitos = (s) => s.replace(/\D/g, "");

function mascDoc(s) {
  const d = soDigitos(s).slice(0, 14);
  const p = (i, j) => d.slice(i, j);
  if (d.length <= 11) {
    return (
      [p(0, 3), p(3, 6), p(6, 9)].filter(Boolean).join(".") + (d.length > 9 ? "-" + p(9, 11) : "")
    );
  }
  return `${p(0, 2)}.${p(2, 5)}.${p(5, 8)}/${p(8, 12)}` + (d.length > 12 ? "-" + p(12, 14) : "");
}

function mascTelefone(s) {
  const d = soDigitos(s).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  const meio = d.length > 10 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, meio)}` + (d.length > meio ? "-" + d.slice(meio) : "");
}

function mascValor(s) {
  const centavos = soDigitos(s).replace(/^0+/, "").slice(0, 6);
  if (!centavos) return "";
  const n = centavos.padStart(3, "0");
  return "R$ " + Number(n.slice(0, -2)).toLocaleString("pt-BR") + "," + n.slice(-2);
}

const mascNome = (s) =>
  s
    .replace(/[^\p{L}\s'.-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/, "")
    .slice(0, 100);

const mascTexto = (s) =>
  s
    .replace(/[^\p{L}\p{N}\s.,!?:;()'’"&%+/#@-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/, "");

const mascResumo = (s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

const mascEmail = (s) => s.toLowerCase().replace(/\s/g, "").slice(0, 120);

const REGRAS = {
  doc: mascDoc,
  telefone: mascTelefone,
  valor: mascValor,
  nome: mascNome,
  texto: mascTexto,
  resumo: mascResumo,
  email: mascEmail,
};

/** Aplica a máscara a um valor vindo do servidor (ex.: telefone) */
export const mascarar = (tipo, valor) => REGRAS[tipo](valor || "");

/** Liga a máscara em todo campo com data-mascara="...". */
export function aplicarMascaras() {
  document.querySelectorAll("[data-mascara]").forEach((campo) => {
    const regra = REGRAS[campo.dataset.mascara];
    campo.addEventListener("input", () => {
      campo.value = regra(campo.value);
    });
  });
}

/** "R$ 5,50" -> "5.50" (valor que o servidor espera) */
export const valorEmReais = (s) => (Number(soDigitos(s)) / 100).toFixed(2);
