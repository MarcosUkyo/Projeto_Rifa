"""Conexão com o SQLite e migração de bancos antigos."""

import os
import re
import secrets
import sqlite3
from pathlib import Path

from flask import g

from . import DADOS

ARQUIVO = DADOS / "rifa.db"
SCHEMA = Path(__file__).with_name("schema.sql")

# Colunas que bancos antigos ainda não têm (mesmas definições do schema.sql)
COLUNAS_NOVAS = [
    (
        "cliente",
        "email",
        "TEXT CHECK (email IS NULL OR (length(email) BETWEEN 6 AND 120 AND email = lower(email) "
        "AND email GLOB '*?@?*.??*' AND email NOT GLOB '*[^a-z0-9@._%+-]*'))",
    ),
    (
        "cliente",
        "cargo",
        "TEXT NOT NULL DEFAULT 'participante' CHECK (cargo IN ('adm', 'gerente', 'participante'))",
    ),
    (
        "rifa",
        "codigo",
        "TEXT CHECK (codigo IS NULL OR (length(codigo) BETWEEN 8 AND 40 "
        "AND codigo NOT GLOB '*[^A-Za-z0-9_-]*'))",
    ),
    (
        "rifa",
        "data_sorteio",
        "TEXT CHECK (data_sorteio IS NULL "
        "OR data_sorteio GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')",
    ),
    ("rifa", "numero_sorteado", "INTEGER CHECK (numero_sorteado IS NULL OR numero_sorteado >= 1)"),
    ("rifa", "sorteada_em", "TEXT"),
]


def novo_codigo():
    return secrets.token_urlsafe(8)  # ~64 bits: impossível de adivinhar


def db():
    if "db" not in g:
        g.db = sqlite3.connect(ARQUIVO)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def _fechar(_):
    conn = g.pop("db", None)
    if conn:
        conn.close()


def _migrar(conn):
    adicionadas = set()
    for tabela, coluna, definicao in COLUNAS_NOVAS:
        colunas = [linha[1] for linha in conn.execute(f"PRAGMA table_info({tabela})")]
        if coluna not in colunas:
            conn.execute(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {definicao}")
            adicionadas.add(coluna)
    for (titulo,) in conn.execute("SELECT titulo FROM rifa WHERE codigo IS NULL").fetchall():
        conn.execute("UPDATE rifa SET codigo = ? WHERE titulo = ?", (novo_codigo(), titulo))
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_cliente_email ON cliente (email)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_rifa_codigo ON rifa (codigo)")
    if "cargo" in adicionadas:  # banco antigo: define quem é ADM e quem é gerente
        alvo = re.sub(r"\D", "", os.environ.get("RIFA_ADMIN_DOC", ""))
        if alvo:
            conn.execute("UPDATE cliente SET cargo = 'adm' WHERE cpf_cnpj = ?", (alvo,))
        else:
            conn.execute(
                "UPDATE cliente SET cargo = 'adm' WHERE rowid = (SELECT min(rowid) FROM cliente)"
            )
        conn.execute(
            "UPDATE cliente SET cargo = 'gerente' "
            "WHERE cargo = 'participante' AND cpf_cnpj IN (SELECT organizador FROM rifa)"
        )


def init_app(app):
    app.teardown_appcontext(_fechar)
    with sqlite3.connect(ARQUIVO) as conn:
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        _migrar(conn)
