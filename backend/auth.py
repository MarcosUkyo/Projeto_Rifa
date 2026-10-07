"""Cadastro, login, logout e recuperação de senha."""

import hashlib
import os
import re
import secrets
import sqlite3
import time
from collections import defaultdict

from flask import Blueprint, current_app, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from . import validacao as v
from .db import db
from .emails import enviar
from .sessao import abrir_sessao, encerrar_sessao, erro, usuario

bp = Blueprint("auth", __name__, url_prefix="/api")

TENTATIVAS = defaultdict(list)
PEDIDOS = defaultdict(list)
SENHA_FALSA = generate_password_hash("senha-falsa")  # tempo igual p/ CPF inexistente


def bloqueado(chave, limite=5):
    """True se a chave já falhou `limite` vezes nos últimos 5 minutos."""
    agora = time.time()
    TENTATIVAS[chave] = [t for t in TENTATIVAS[chave] if agora - t < 300]
    return len(TENTATIVAS[chave]) >= limite


def _cargo_inicial(doc):
    """Com RIFA_ADMIN_DOC definido, só esse documento nasce ADM.
    Sem a variável, o primeiro cadastro do site vira ADM; os demais, participantes."""
    alvo = re.sub(r"\D", "", os.environ.get("RIFA_ADMIN_DOC", ""))
    if alvo:
        return "adm" if doc == alvo else "participante"
    ja_tem = db().execute("SELECT 1 FROM cliente WHERE cargo = 'adm' LIMIT 1").fetchone()
    return "participante" if ja_tem else "adm"


@bp.get("/me")
def me():
    session.setdefault("csrf", secrets.token_hex(16))
    u = usuario()
    return jsonify(
        csrf=session["csrf"], usuario={"nome": u["nome"], "cargo": u["cargo"]} if u else None
    )


@bp.post("/cadastro")
def cadastro():
    d = request.get_json(silent=True) or {}
    doc, nome = v.documento(d.get("cpf_cnpj")), v.nome(d.get("nome"))
    tel, email, senha = (
        v.telefone(d.get("telefone")),
        v.email(d.get("email")),
        v.senha(d.get("senha")),
    )
    if not doc:
        return erro("CPF ou CNPJ inválido.")
    if not nome:
        return erro("Nome inválido. Use só letras (2 a 100).")
    if tel is None:
        return erro("Telefone inválido. Use DDD + número.")
    if not email:
        return erro("E-mail inválido.")
    if not senha:
        return erro("A senha deve ter de 8 a 128 caracteres.")
    cargo = _cargo_inicial(doc)
    try:
        with db() as c:
            c.execute(
                "INSERT INTO cliente (cpf_cnpj, nome, telefone, email, senha_hash, cargo) "
                "VALUES (?,?,?,?,?,?)",
                (doc, nome, tel or None, email, generate_password_hash(senha), cargo),
            )
    except sqlite3.IntegrityError:
        return erro("CPF/CNPJ ou e-mail já cadastrado. Tente entrar na sua conta.", 409)
    return abrir_sessao(doc, nome, cargo), 201


@bp.post("/login")
def login():
    d = request.get_json(silent=True) or {}
    doc = v.documento(d.get("cpf_cnpj")) or ""
    chave = (request.remote_addr, doc)
    if bloqueado(chave):
        return erro("Muitas tentativas. Aguarde 5 minutos.", 429)
    linha = (
        db()
        .execute("SELECT nome, senha_hash, cargo FROM cliente WHERE cpf_cnpj = ?", (doc,))
        .fetchone()
    )
    senha = d.get("senha") if isinstance(d.get("senha"), str) else ""
    ok = check_password_hash(linha["senha_hash"] if linha else SENHA_FALSA, senha[:128])
    if not (linha and ok):
        TENTATIVAS[chave].append(time.time())
        return erro("CPF/CNPJ ou senha incorretos.", 401)
    TENTATIVAS.pop(chave, None)
    return abrir_sessao(doc, linha["nome"], linha["cargo"])


@bp.post("/logout")
def logout():
    return encerrar_sessao()


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


@bp.post("/esqueci")
def esqueci():
    d = request.get_json(silent=True) or {}
    doc = v.documento(d.get("cpf_cnpj")) or ""
    chave, agora = (request.remote_addr, doc), time.time()
    PEDIDOS[chave] = [t for t in PEDIDOS[chave] if agora - t < 900]
    if len(PEDIDOS[chave]) >= 3:
        return erro("Muitos pedidos. Aguarde alguns minutos.", 429)
    PEDIDOS[chave].append(agora)
    linha = db().execute("SELECT nome, email FROM cliente WHERE cpf_cnpj = ?", (doc,)).fetchone()
    if linha and linha["email"]:
        token = secrets.token_urlsafe(32)
        with db() as c:
            c.execute("DELETE FROM redefinicao WHERE cpf_cnpj = ?", (doc,))
            c.execute(
                "INSERT INTO redefinicao VALUES (?,?,?)", (_hash(token), doc, int(agora) + 1800)
            )
        base = os.environ.get("RIFA_URL_BASE") or f"http://localhost:{os.environ.get('PORT', 5000)}"
        texto = (
            f"Olá, {linha['nome']}!\n\nPara criar uma nova senha, abra o link (vale por 30 minutos):\n"
            f"{base.rstrip('/')}/?redefinir={token}\n\nSe não foi você, ignore esta mensagem."
        )
        try:
            enviar(linha["email"], "Redefinir sua senha - Rifa Online", texto)
        except Exception:
            current_app.logger.exception("Falha ao enviar e-mail")
    # mesma resposta exista ou não o cadastro: não revela quem tem conta
    return jsonify(
        mensagem="Se houver cadastro com e-mail para esse documento, enviamos um link de redefinição."
    )


@bp.post("/redefinir")
def redefinir():
    d = request.get_json(silent=True) or {}
    token, senha = d.get("token"), v.senha(d.get("senha"))
    if not senha:
        return erro("A senha deve ter de 8 a 128 caracteres.")
    if not isinstance(token, str) or len(token) > 100:
        return erro("Link inválido ou expirado. Peça um novo.")
    linha = (
        db()
        .execute(
            "SELECT cpf_cnpj FROM redefinicao WHERE token_hash = ? AND expira > ?",
            (_hash(token), int(time.time())),
        )
        .fetchone()
    )
    if not linha:
        return erro("Link inválido ou expirado. Peça um novo.")
    with db() as c:
        c.execute(
            "UPDATE cliente SET senha_hash = ? WHERE cpf_cnpj = ?",
            (generate_password_hash(senha), linha["cpf_cnpj"]),
        )
        c.execute("DELETE FROM redefinicao WHERE cpf_cnpj = ?", (linha["cpf_cnpj"],))
    return jsonify(ok=True)
