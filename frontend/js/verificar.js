/* Script comum (sem módulo): roda até quando o index.html é aberto pela pasta. */
if (location.protocol === "file:") {
  document.getElementById("avisoArquivo").hidden = false;
}
