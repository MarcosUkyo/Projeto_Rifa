"""Rifas: criação, edição, acesso por link, compra, sorteio e exclusão."""

import hashlib
import io
import re
import secrets
import sqlite3
import time
from datetime import date, datetime

from flask import Blueprint, abort, jsonify, request, send_from_directory
from PIL import Image

from . import DADOS
from . import validacao as v
from .auth import TENTATIVAS, bloqueado
from .db import db, novo_codigo
from .sessao import erro, logado, pode_gerenciar

bp = Blueprint("rifas", __name__)
UPLOADS = DADOS / "uploads"
Image.MAX_IMAGE_PIXELS = 25_000_000  # proteção contra "bomba de descompressão"

SQL_BASE = """
    SELECT r.titulo, r.codigo, r.resumo, r.premio, r.valor_numero, r.qtd_numeros, r.imagem,
           r.data_sorteio, r.numero_sorteado, r.sorteada_em, r.visibilidade, r.organizador AS org_doc,
           c.nome AS organizador,
           (SELECT COUNT(*) FROM bilhete b WHERE b.rifa_titulo = r.titulo) AS vendidos
    FROM rifa r JOIN cliente c ON c.cpf_cnpj = r.organizador
"""
CAMPOS_PUBLICOS = (
    "titulo codigo resumo premio valor_numero qtd_numeros imagem data_sorteio "
    "numero_sorteado sorteada_em visibilidade organizador vendidos"
).split()


# ---------- apoio ----------
def _abreviar(nome):
    partes = nome.split()
    return f"{partes[0]} {partes[-1][0]}." if len(partes) > 1 else partes[0]


def _status(r):
    if r["sorteada_em"]:
        return "sorteada"
    if r["data_sorteio"] and date.today().isoformat() > r["data_sorteio"]:
        return "encerrada"
    return "aberta"


def _publico(r):
    """Dicionário seguro para o navegador (sem CPF/CNPJ de ninguém)."""
    status, gerencia = _status(r), pode_gerenciar(r["org_doc"])
    hoje = date.today().isoformat()
    d = {k: r[k] for k in CAMPOS_PUBLICOS}
    d.update(
        status=status,
        vendas_abertas=status == "aberta",
        pode_gerenciar=gerencia,
        pode_sortear=gerencia
        and status != "sorteada"
        and r["vendidos"] > 0
        and (not r["data_sorteio"] or hoje >= r["data_sorteio"]),
        papel="organizador" if r["org_doc"] == logado() else "participante",
    )
    if status == "sorteada":
        g = (
            db()
            .execute(
                "SELECT c.nome FROM bilhete b JOIN cliente c ON c.cpf_cnpj = b.cpf_cnpj "
                "WHERE b.rifa_titulo = ? AND b.numero = ?",
                (r["titulo"], r["numero_sorteado"]),
            )
            .fetchone()
        )
        d["ganhador"] = _abreviar(g["nome"]) if g else ""
    return d


def _buscar(codigo):
    if not isinstance(codigo, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,40}", codigo):
        return None
    return db().execute(SQL_BASE + " WHERE r.codigo = ?", (codigo,)).fetchone()


def _gerenciavel(codigo):
    """(rifa, None) se o usuário pode gerenciar; senão (None, resposta de erro)."""
    if not logado():
        return None, erro("Entre na sua conta.", 401)
    r = _buscar(codigo)
    if not r:
        return None, erro("Rifa não encontrada.", 404)
    if not pode_gerenciar(r["org_doc"]):
        return None, erro("Você não tem permissão para gerenciar esta rifa.", 403)
    return r, None


def _salvar_imagem(arquivo):
    """Valida, reencoda (remove EXIF/payloads) e grava com nome = hash do conteúdo."""
    try:
        img = Image.open(arquivo.stream)
        if img.format not in ("JPEG", "PNG", "WEBP"):
            return None
        img.load()
        img = img.convert("RGBA")
    except Exception:
        return None
    fundo = Image.new("RGB", img.size, "white")
    fundo.paste(img, mask=img.split()[3])
    fundo.thumbnail((1200, 1200))
    buf = io.BytesIO()
    fundo.save(buf, "JPEG", quality=85, optimize=True)
    dados = buf.getvalue()
    nome = hashlib.sha256(dados).hexdigest()[:32] + ".jpg"
    (UPLOADS / nome).write_bytes(dados)
    return nome


def _apagar_imagem_orfa(nome):
    if nome and not db().execute("SELECT 1 FROM rifa WHERE imagem = ?", (nome,)).fetchone():
        (UPLOADS / nome).unlink(missing_ok=True)


def _validar(f, atual=None):
    """Valida o formulário (criar ou editar). Devolve (dados, mensagem_de_erro)."""
    resumo = v.texto_longo(f.get("resumo"), 10, 500)
    premio = v.texto_curto(f.get("premio"), 2, 100)
    data = v.data_sorteio(f.get("data_sorteio"), atual["data_sorteio"] if atual else None)
    qtd = v.quantidade(f.get("qtd_numeros")) if f.get("qtd_numeros") else None
    valor = v.valor_reais(f.get("valor_numero")) if f.get("valor_numero") else None
    if atual:  # campos desabilitados no formulário não são enviados: ficam como estão
        qtd = qtd or atual["qtd_numeros"]
        valor = valor or atual["valor_numero"]
    vis = f.get("visibilidade") or (atual["visibilidade"] if atual else "privada")
    if vis not in ("publica", "privada"):
        return None, "Tipo de rifa inválido."
    if not resumo:
        return None, "O resumo deve ter de 10 a 500 caracteres."
    if not premio:
        return None, "Prêmio inválido (2 a 100 caracteres, sem símbolos especiais)."
    if not data:
        return None, "Informe a data do sorteio (de hoje até 2 anos à frente)."
    if not qtd:
        return None, "Quantidade inválida: use 80, 100, 120... até 200."
    if not valor:
        return None, "Valor por número inválido (até R$ 10.000,00)."
    return dict(resumo=resumo, premio=premio, data=data, qtd=qtd, valor=valor, vis=vis), None


# ---------- imagens ----------
@bp.get("/uploads/<nome>")
def upload(nome):
    if not re.fullmatch(r"[0-9a-f]{32}\.jpg", nome):
        abort(404)
    return send_from_directory(UPLOADS, nome, max_age=86400)


# ---------- consulta ----------
@bp.get("/api/rifas")
def minhas_rifas():
    """Só as rifas que o usuário organiza ou em que já comprou números."""
    doc = logado() or ""
    linhas = db().execute(
        SQL_BASE + " WHERE r.organizador = ? OR EXISTS (SELECT 1 FROM bilhete b "
        "WHERE b.rifa_titulo = r.titulo AND b.cpf_cnpj = ?) ORDER BY r.rowid DESC",
        (doc, doc),
    )
    return jsonify([_publico(r) for r in linhas.fetchall()])


@bp.get("/api/rifa")
def ver_rifa():
    """Acesso pelo link: quem tem o código vê a rifa (comprar exige login)."""
    chave = ("codigo", request.remote_addr)
    if bloqueado(chave, limite=20):
        return erro("Muitas tentativas. Aguarde alguns minutos.", 429)
    r = _buscar(request.args.get("codigo", ""))
    if not r:
        TENTATIVAS[chave].append(time.time())
        return erro("Rifa não encontrada. Confira o link.", 404)
    linhas = (
        db()
        .execute("SELECT numero, cpf_cnpj FROM bilhete WHERE rifa_titulo = ?", (r["titulo"],))
        .fetchall()
    )
    return jsonify(
        rifa=_publico(r),
        vendidos=[l["numero"] for l in linhas],  # não expõe quem comprou
        meus=[l["numero"] for l in linhas if logado() and l["cpf_cnpj"] == logado()],
    )


@bp.get("/api/publicas")
def publicas():
    """Rifas públicas: qualquer pessoa vê (comprar exige login). As abertas vêm primeiro."""
    linhas = db().execute(
        SQL_BASE + " WHERE r.visibilidade = 'publica' "
        "ORDER BY (r.sorteada_em IS NOT NULL), r.rowid DESC LIMIT 60"
    )
    return jsonify([_publico(r) for r in linhas.fetchall()])


@bp.post("/api/rifas/visibilidade")
def mudar_visibilidade():
    d = request.get_json(silent=True) or {}
    r, resp = _gerenciavel(d.get("codigo"))
    if resp:
        return resp
    if d.get("visibilidade") not in ("publica", "privada"):
        return erro("Tipo de rifa inválido.")
    with db() as c:
        c.execute(
            "UPDATE rifa SET visibilidade = ? WHERE titulo = ?", (d["visibilidade"], r["titulo"])
        )
    return jsonify(ok=True)


# ---------- criar e editar ----------
@bp.post("/api/rifas")
def criar():
    if not logado():
        return erro("Entre na sua conta para criar uma rifa.", 401)
    f = request.form
    titulo = v.texto_curto(f.get("titulo"), 3, 60)
    if not titulo:
        return erro("Título inválido (3 a 60 caracteres, sem símbolos especiais).")
    dados, msg = _validar(f)
    if msg:
        return erro(msg)
    imagem = None
    arquivo = request.files.get("imagem")
    if arquivo and arquivo.filename:
        imagem = _salvar_imagem(arquivo)
        if not imagem:
            return erro("Imagem inválida. Envie JPG, PNG ou WEBP.")
    codigo = novo_codigo()
    try:
        with db() as c:
            c.execute(
                "INSERT INTO rifa (titulo, resumo, premio, valor_numero, qtd_numeros, imagem, "
                "organizador, codigo, data_sorteio, visibilidade) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    titulo,
                    dados["resumo"],
                    dados["premio"],
                    dados["valor"],
                    dados["qtd"],
                    imagem,
                    logado(),
                    codigo,
                    dados["data"],
                    dados["vis"],
                ),
            )
    except sqlite3.IntegrityError:
        return erro("Já existe uma rifa com esse título.", 409)
    return jsonify(ok=True, codigo=codigo), 201


@bp.post("/api/rifas/editar")
def editar():
    r, resp = _gerenciavel(request.form.get("codigo"))
    if resp:
        return resp
    if r["sorteada_em"]:
        return erro("Uma rifa já sorteada não pode ser editada.", 409)
    dados, msg = _validar(request.form, r)
    if msg:
        return erro(msg)
    if r["vendidos"] > 0 and (
        dados["valor"] != r["valor_numero"] or dados["qtd"] != r["qtd_numeros"]
    ):
        return erro("Valor e quantidade de números não mudam depois da primeira venda.", 409)
    imagem = r["imagem"]
    if request.form.get("remover_imagem") == "1":
        imagem = None
    arquivo = request.files.get("imagem")
    if arquivo and arquivo.filename:
        imagem = _salvar_imagem(arquivo)
        if not imagem:
            return erro("Imagem inválida. Envie JPG, PNG ou WEBP.")
    with db() as c:
        c.execute(
            "UPDATE rifa SET resumo = ?, premio = ?, data_sorteio = ?, valor_numero = ?, "
            "qtd_numeros = ?, imagem = ?, visibilidade = ? WHERE titulo = ?",
            (
                dados["resumo"],
                dados["premio"],
                dados["data"],
                dados["valor"],
                dados["qtd"],
                imagem,
                dados["vis"],
                r["titulo"],
            ),
        )
    if imagem != r["imagem"]:
        _apagar_imagem_orfa(r["imagem"])
    return jsonify(ok=True)


# ---------- compra ----------
@bp.post("/api/comprar")
def comprar():
    if not logado():
        return erro("Entre na sua conta para comprar.", 401)
    d = request.get_json(silent=True) or {}
    numeros = d.get("numeros")
    if (
        not isinstance(numeros, list)
        or not 0 < len(numeros) <= 200
        or not all(type(n) is int for n in numeros)
    ):
        return erro("Escolha ao menos um número.")
    r = _buscar(d.get("rifa"))
    if not r:
        return erro("Rifa não encontrada.", 404)
    if _status(r) != "aberta":
        return erro("As vendas desta rifa estão encerradas.", 409)
    if any(n < 1 or n > r["qtd_numeros"] for n in numeros):
        return erro("Número fora do intervalo da rifa.")
    try:
        with db() as c:  # transação: se um número já foi vendido, nada é gravado
            c.executemany(
                "INSERT INTO bilhete VALUES (?,?,?)",
                [(r["titulo"], n, logado()) for n in set(numeros)],
            )
    except sqlite3.IntegrityError:
        return erro("Algum número acabou de ser vendido. Atualize e tente de novo.", 409)
    return jsonify(ok=True), 201


# ---------- organizador ----------
@bp.get("/api/participantes")
def participantes():
    r, resp = _gerenciavel(request.args.get("rifa"))
    if resp:
        return resp
    linhas = (
        db()
        .execute(
            """SELECT c.cpf_cnpj, c.nome, c.telefone, c.email, b.numero
           FROM bilhete b JOIN cliente c ON c.cpf_cnpj = b.cpf_cnpj
           WHERE b.rifa_titulo = ? ORDER BY c.nome, b.numero""",
            (r["titulo"],),
        )
        .fetchall()
    )
    grupos = {}
    for l in linhas:
        g = grupos.setdefault(
            l["cpf_cnpj"],
            {
                "nome": l["nome"],
                "telefone": l["telefone"] or "",
                "email": l["email"] or "",
                "numeros": [],
            },
        )
        g["numeros"].append(l["numero"])
    lista = list(grupos.values())
    for g in lista:
        g["total"] = round(len(g["numeros"]) * r["valor_numero"], 2)
        g["ganhador"] = r["numero_sorteado"] in g["numeros"]
    return jsonify(participantes=lista)


@bp.post("/api/rifas/sortear")
def sortear():
    r, resp = _gerenciavel((request.get_json(silent=True) or {}).get("codigo"))
    if resp:
        return resp
    if r["sorteada_em"]:
        return erro("Esta rifa já foi sorteada.", 409)
    if r["data_sorteio"] and date.today().isoformat() < r["data_sorteio"]:
        y, m, d = r["data_sorteio"].split("-")
        return erro(f"O sorteio só pode ser feito a partir de {d}/{m}/{y}.", 409)
    vendidos = [
        l["numero"]
        for l in db().execute("SELECT numero FROM bilhete WHERE rifa_titulo = ?", (r["titulo"],))
    ]
    if not vendidos:
        return erro("Ainda não há números vendidos para sortear.", 409)
    escolhido = secrets.choice(vendidos)  # aleatório criptográfico: todos têm a mesma chance
    with db() as c:
        c.execute(
            "UPDATE rifa SET numero_sorteado = ?, sorteada_em = ? "
            "WHERE titulo = ? AND sorteada_em IS NULL",
            (escolhido, datetime.now().isoformat(timespec="seconds"), r["titulo"]),
        )
        if c.execute("SELECT changes()").fetchone()[0] != 1:
            return erro("Esta rifa já foi sorteada.", 409)
    return jsonify(rifa=_publico(_buscar(r["codigo"])))


@bp.post("/api/rifas/excluir")
def excluir():
    r, resp = _gerenciavel((request.get_json(silent=True) or {}).get("codigo"))
    if resp:
        return resp
    with db() as c:  # os bilhetes saem junto (ON DELETE CASCADE)
        c.execute("DELETE FROM rifa WHERE titulo = ?", (r["titulo"],))
    _apagar_imagem_orfa(r["imagem"])
    return jsonify(ok=True)
