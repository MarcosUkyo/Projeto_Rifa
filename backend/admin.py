"""Painel da equipe: o ADM (dono do site) e os gerentes (apoio)."""

from flask import Blueprint, jsonify, request

from . import validacao as v
from .db import db
from .rifas import SQL_BASE, _publico
from .sessao import erro, logado, usuario

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@bp.before_request
def so_equipe():
    u = usuario()
    if not u:
        return erro("Entre na sua conta.", 401)
    if u["cargo"] not in ("adm", "gerente"):
        return erro("Área exclusiva da equipe.", 403)


def _so_adm():
    """Resposta de erro se o usuário não for ADM; None se for."""
    if usuario()["cargo"] != "adm":
        return erro("Só o ADM gerencia usuários e cargos.", 403)


@bp.get("/usuarios")
def usuarios():
    if resp := _so_adm():
        return resp
    linhas = (
        db().execute("SELECT cpf_cnpj, nome, email, cargo FROM cliente ORDER BY nome").fetchall()
    )
    return jsonify([dict(l, eu=l["cpf_cnpj"] == logado()) for l in linhas])


@bp.post("/cargo")
def mudar_cargo():
    if resp := _so_adm():
        return resp
    d = request.get_json(silent=True) or {}
    doc, cargo = v.documento(d.get("cpf_cnpj")), d.get("cargo")
    if cargo not in v.CARGOS or not doc:
        return erro("Dados inválidos.")
    if doc == logado():
        return erro("Você não pode alterar o seu próprio cargo.", 409)
    with db() as c:
        c.execute("UPDATE cliente SET cargo = ? WHERE cpf_cnpj = ?", (cargo, doc))
        if c.execute("SELECT changes()").fetchone()[0] != 1:
            return erro("Usuário não encontrado.", 404)
    return jsonify(ok=True)


@bp.get("/rifas")
def todas_as_rifas():
    linhas = db().execute(SQL_BASE + " ORDER BY r.rowid DESC").fetchall()
    return jsonify([_publico(r) for r in linhas])
