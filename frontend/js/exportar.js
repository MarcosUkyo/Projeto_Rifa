import { $, el, brl, slug, estado, aviso, dataBR } from "./util.js";

export const linkRifa = () => `${location.origin}/?rifa=${encodeURIComponent(estado.atual.codigo)}`;

const carregarImg = (src) =>
  new Promise((ok, no) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = no;
    i.src = src;
  });
function quebrar(ctx, texto, larg, max) {
  const linhas = [];
  let cur = "";
  for (const p of texto.split(/\s+/)) {
    const t = cur ? cur + " " + p : p;
    if (ctx.measureText(t).width > larg && cur) {
      linhas.push(cur);
      cur = p;
    } else cur = t;
  }
  if (cur) linhas.push(cur);
  if (linhas.length > max) {
    linhas.length = max;
    linhas[max - 1] = linhas[max - 1].replace(/\s*\S*$/, "…");
  }
  return linhas;
}
async function gerarCanvas() {
  const r = estado.atual,
    W = 1080,
    M = 60,
    IW = W - 2 * M,
    F = "system-ui, -apple-system, 'Segoe UI', sans-serif";
  const css = getComputedStyle(document.documentElement);
  const cor = css.getPropertyValue("--cor").trim(),
    corTxt = css.getPropertyValue("--cor-texto").trim();
  const img = r.imagem ? await carregarImg("/uploads/" + r.imagem).catch(() => null) : null;
  const m = document.createElement("canvas").getContext("2d");
  m.font = `bold 64px ${F}`;
  const tl = quebrar(m, r.titulo, IW, 3);
  m.font = `bold 38px ${F}`;
  const pl = quebrar(m, "🎁 " + r.premio, IW, 2);
  m.font = `32px ${F}`;
  const rl = quebrar(m, r.resumo, IW, 6);
  const cols = r.qtd_numeros <= 100 ? 10 : 20,
    gap = cols === 10 ? 8 : 4;
  const cel = Math.floor((IW - gap * (cols - 1)) / cols),
    linhas = r.qtd_numeros / cols;
  const statusTxt = r.sorteada_em
    ? `🏆 Sorteado: nº ${String(r.numero_sorteado).padStart(3, "0")} — ${r.ganhador}`
    : r.data_sorteio
      ? `📅 Sorteio em ${dataBR(r.data_sorteio)}`
      : "";
  const hTopo = 50 + tl.length * 76 + 30,
    hImg = img ? 570 : 0;
  const hInfo = 20 + pl.length * 50 + 10 + rl.length * 44 + 20 + 60 + (statusTxt ? 50 : 0);
  const H = hTopo + hImg + hInfo + linhas * (cel + gap) + 130;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.fillRect(0, 0, W, H);
  x.fillStyle = cor;
  x.fillRect(0, 0, W, hTopo);
  x.textBaseline = "top";
  x.textAlign = "center";
  x.fillStyle = corTxt;
  x.font = `bold 64px ${F}`;
  tl.forEach((l, i) => x.fillText(l, W / 2, 50 + i * 76));
  if (img) {
    const y0 = hTopo + 30,
      esc = Math.max(IW / img.width, 540 / img.height),
      sw = IW / esc,
      sh = 540 / esc;
    x.save();
    x.beginPath();
    x.roundRect(M, y0, IW, 540, 28);
    x.clip();
    x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, M, y0, IW, 540);
    x.restore();
  }
  let y = hTopo + hImg + 20;
  x.textAlign = "left";
  x.fillStyle = "#1f1b2e";
  x.font = `bold 38px ${F}`;
  pl.forEach((l) => {
    x.fillText(l, M, y);
    y += 50;
  });
  y += 10;
  x.fillStyle = "#4a4658";
  x.font = `32px ${F}`;
  rl.forEach((l) => {
    x.fillText(l, M, y);
    y += 44;
  });
  y += 20;
  x.fillStyle = cor;
  x.font = `bold 36px ${F}`;
  x.fillText(
    `${brl(r.valor_numero)} por número  •  ${estado.vendidos.size}/${r.qtd_numeros} vendidos`,
    M,
    y,
  );
  if (statusTxt) {
    y += 50;
    x.fillStyle = "#1f1b2e";
    x.font = `bold 34px ${F}`;
    x.fillText(statusTxt, M, y);
  }
  const gy = hTopo + hImg + hInfo;
  x.textAlign = "center";
  x.font = `bold ${Math.round(cel * 0.36)}px ${F}`;
  x.lineWidth = 3;
  for (let i = 0; i < r.qtd_numeros; i++) {
    const px = M + (i % cols) * (cel + gap),
      py = gy + Math.floor(i / cols) * (cel + gap),
      vend = estado.vendidos.has(i + 1);
    x.beginPath();
    x.roundRect(px, py, cel, cel, cel > 60 ? 16 : 8);
    if (vend) {
      x.fillStyle = "#dcdce4";
      x.fill();
    } else {
      x.strokeStyle = cor;
      x.stroke();
    }
    x.fillStyle = vend ? "#8b8b99" : "#1f1b2e";
    x.textBaseline = "middle";
    x.fillText(String(i + 1).padStart(3, "0"), px + cel / 2, py + cel / 2 + 1);
  }
  x.textBaseline = "top";
  x.fillStyle = "#6e6a7c";
  x.font = `28px ${F}`;
  x.fillText("Escolha seu número em " + location.host, W / 2, H - 80);
  return c;
}
const blobDe = (c, tipo) => new Promise((ok) => c.toBlob(ok, tipo, 0.92));
function salvar(blob, nome) {
  const a = el("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
// PDF de 1 página com a imagem JPEG (sem bibliotecas externas)
function jpegParaPdf(jpeg, w, h) {
  const pw = 595,
    ph = Math.round((595 * h) / w),
    enc = new TextEncoder(),
    partes = [],
    pos = [];
  let tam = 0;
  const add = (v) => {
    const b = typeof v === "string" ? enc.encode(v) : v;
    partes.push(b);
    tam += b.length;
  };
  const obj = (n, corpo) => {
    pos[n] = tam;
    add(`${n} 0 obj\n${corpo}\nendobj\n`);
  };
  add("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
  );
  const cont = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(4, `<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`);
  pos[5] = tam;
  add(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  add(jpeg);
  add("\nendstream\nendobj\n");
  const xref = tam;
  let t = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) t += String(pos[i]).padStart(10, "0") + " 00000 n \n";
  add(t + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(partes, { type: "application/pdf" });
}
async function baixar(fmt) {
  try {
    const c = await gerarCanvas(),
      nome = slug(estado.atual.titulo);
    if (fmt === "pdf") {
      const b = await blobDe(c, "image/jpeg");
      salvar(jpegParaPdf(new Uint8Array(await b.arrayBuffer()), c.width, c.height), nome + ".pdf");
    } else salvar(await blobDe(c, fmt === "png" ? "image/png" : "image/jpeg"), `${nome}.${fmt}`);
  } catch {
    aviso("Não foi possível gerar a imagem.");
  }
}
document
  .querySelectorAll("[data-baixar]")
  .forEach((b) => (b.onclick = () => baixar(b.dataset.baixar)));

const texto = () => `🎟️ ${estado.atual.titulo} — escolha seu número: ${linkRifa()}`;
if (navigator.share) $("btnNativo").hidden = false;
$("btnNativo").onclick = async () => {
  try {
    const blob = await blobDe(await gerarCanvas(), "image/png");
    const f = new File([blob], slug(estado.atual.titulo) + ".png", { type: "image/png" });
    const dados = { title: estado.atual.titulo, text: texto() };
    if (navigator.canShare?.({ files: [f] })) dados.files = [f];
    await navigator.share(dados);
  } catch (e) {
    if (e.name !== "AbortError") aviso("Não foi possível compartilhar.");
  }
};
$("btnWhats").onclick = () =>
  window.open("https://wa.me/?text=" + encodeURIComponent(texto()), "_blank", "noopener");
$("btnFace").onclick = () =>
  window.open(
    "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(linkRifa()),
    "_blank",
    "noopener",
  );
$("btnInsta").onclick = async () => {
  await baixar("png");
  aviso("Imagem baixada. Publique no feed ou nos stories do Instagram.");
};
$("btnCopiar").onclick = () =>
  navigator.clipboard.writeText(linkRifa()).then(
    () => aviso("Link copiado!"),
    () => aviso("Copie o link da barra do navegador."),
  );
