"""Perfil: dados, troca de senha e exclusão da conta."""

import sqlite3
import time

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from . import validacao as v
from .auth import TENTATIVAS, bloqueado
from .db import db
from .sessao import encerrar_sessao, erro, logado, usuario

bp = Blueprint("perfil", __name__, url_prefix="/api/perfil")


@bp.before_request
def exigir_login():
    if not logado():
        return erro("Entre na sua conta.", 401)


def _senha_confere(senha):
    """Confere a senha do usuário logado, com limite de tentativas (None = bloqueado)."""
    chave = ("perfil", logado())
    if bloqueado(chave):
        return None
    linha = (
        db().execute("SELECT senha_hash FROM cliente WHERE cpf_cnpj = ?", (logado(),)).fetchone()
    )
    ok = isinstance(senha, str) and check_password_hash(linha["senha_hash"], senha[:128])
    if not ok:
        TENTATIVAS[chave].append(time.time())
    return ok


@bp.get("")
def ver():
    c = (
        db()
        .execute("SELECT nome, telefone, email, cargo FROM cliente WHERE cpf_cnpj = ?", (logado(),))
        .fetchone()
    )
    rifas = (
        db()
        .execute(
            """SELECT r.codigo, r.titulo, r.qtd_numeros, COUNT(b.numero) AS vendidos
           FROM rifa r LEFT JOIN bilhete b ON b.rifa_titulo = r.titulo
           WHERE r.organizador = ? GROUP BY r.titulo ORDER BY r.rowid DESC""",
            (logado(),),
        )
        .fetchall()
    )
    compras = (
        db()
        .execute(
            """SELECT r.codigo, r.titulo, b.numero FROM bilhete b JOIN rifa r ON r.titulo = b.rifa_titulo
           WHERE b.cpf_cnpj = ? ORDER BY r.titulo, b.numero""",
            (logado(),),
        )
        .fetchall()
    )
    grupos = {}
    for b in compras:
        g = grupos.setdefault(
            b["codigo"], {"codigo": b["codigo"], "titulo": b["titulo"], "numeros": []}
        )
        g["numeros"].append(b["numero"])
    return jsonify(
        nome=c["nome"],
        telefone=c["telefone"] or "",
        email=c["email"] or "",
        cargo=c["cargo"],
        doc_final=logado()[-3:],
        rifas=[dict(r) for r in rifas],
        participacoes=list(grupos.values()),
    )


@bp.post("")
def atualizar():
    d = request.get_json(silent=True) or {}
    nome, email, tel = v.nome(d.get("nome")), v.email(d.get("email")), v.telefone(d.get("telefone"))
    if not nome:
        return erro("Nome inválido. Use só letras (2 a 100).")
    if not email:
        return erro("E-mail inválido.")
    if tel is None:
        return erro("Telefone inválido. Use DDD + número.")
    try:
        with db() as c:
            c.execute(
                "UPDATE cliente SET nome = ?, email = ?, telefone = ? WHERE cpf_cnpj = ?",
                (nome, email, tel or None, logado()),
            )
    except sqlite3.IntegrityError:
        return erro("Este e-mail já está em uso por outra conta.", 409)
    return jsonify(ok=True, usuario={"nome": nome, "cargo": usuario()["cargo"]})


@bp.post("/senha")
def trocar_senha():
    d = request.get_json(silent=True) or {}
    nova = v.senha(d.get("nova"))
    if not nova:
        return erro("A nova senha deve ter de 8 a 128 caracteres.")
    conferiu = _senha_confere(d.get("atual"))
    if conferiu is None:
        return erro("Muitas tentativas. Aguarde 5 minutos.", 429)
    if not conferiu:
        return erro("Senha atual incorreta.")
    with db() as c:
        c.execute(
            "UPDATE cliente SET senha_hash = ? WHERE cpf_cnpj = ?",
            (generate_password_hash(nova), logado()),
        )
        c.execute("DELETE FROM redefinicao WHERE cpf_cnpj = ?", (logado(),))
    return jsonify(ok=True)


@bp.post("/excluir")
def excluir_conta():
    d = request.get_json(silent=True) or {}
    conferiu = _senha_confere(d.get("senha"))
    if conferiu is None:
        return erro("Muitas tentativas. Aguarde 5 minutos.", 429)
    if not conferiu:
        return erro("Senha incorreta.")
    if db().execute("SELECT 1 FROM rifa WHERE organizador = ?", (logado(),)).fetchone():
        return erro("Exclua as suas rifas antes de excluir a conta.", 409)
    with db() as c:
        c.execute("DELETE FROM bilhete WHERE cpf_cnpj = ?", (logado(),))
        c.execute("DELETE FROM cliente WHERE cpf_cnpj = ?", (logado(),))
    return encerrar_sessao()
