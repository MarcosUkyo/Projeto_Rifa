"""Ajudantes de resposta, sessão e permissões."""

import secrets

from flask import g, jsonify, session

from .db import db


def erro(msg, codigo=400):
    return jsonify(erro=msg), codigo


def usuario():
    """Usuário logado (consultado no banco a cada requisição) ou None."""
    if "usuario" not in g:
        doc = session.get("doc")
        g.usuario = None
        if doc:
            g.usuario = (
                db()
                .execute("SELECT cpf_cnpj, nome, cargo FROM cliente WHERE cpf_cnpj = ?", (doc,))
                .fetchone()
            )
    return g.usuario


def logado():
    u = usuario()
    return u["cpf_cnpj"] if u else None


def pode_gerenciar(organizador):
    """Cada usuário gerencia as rifas que criou; ADM e gerentes gerenciam qualquer rifa."""
    u = usuario()
    return bool(u and (u["cargo"] in ("adm", "gerente") or u["cpf_cnpj"] == organizador))


def abrir_sessao(doc, nome, cargo):
    session.clear()
    session.permanent = True
    session["doc"] = doc
    session["csrf"] = secrets.token_hex(16)  # novo token a cada login
    return jsonify(csrf=session["csrf"], usuario={"nome": nome, "cargo": cargo})


def encerrar_sessao():
    session.clear()
    session["csrf"] = secrets.token_hex(16)
    return jsonify(csrf=session["csrf"])
