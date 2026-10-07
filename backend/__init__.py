"""Rifa Online: fábrica da aplicação Flask (licença MIT)."""

import hmac
import os
import secrets
from datetime import timedelta
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory, session
from werkzeug.exceptions import HTTPException

RAIZ = Path(__file__).resolve().parent.parent
FRONTEND = RAIZ / "frontend"  # única pasta pública
DADOS = RAIZ / "data"  # banco, uploads e chave: nunca são servidos
HTTPS = os.environ.get("RIFA_HTTPS") == "1"

MENSAGENS = {
    403: "Sessão inválida. Recarregue a página.",
    404: "Não encontrado.",
    405: "Método não permitido.",
    413: "Arquivo muito grande (máx. 4 MB).",
}


def _chave_secreta():
    if os.environ.get("RIFA_SECRET_KEY"):
        return os.environ["RIFA_SECRET_KEY"]
    arquivo = DADOS / ".secret_key"
    if not arquivo.exists():
        arquivo.write_text(secrets.token_hex(32))
        try:
            arquivo.chmod(0o600)
        except OSError:
            pass
    return arquivo.read_text().strip()


def _paginas(app):
    @app.get("/")
    def index():
        return send_from_directory(FRONTEND, "index.html")

    @app.get("/<any(css,js):pasta>/<path:nome>")
    def estatico(pasta, nome):
        if not nome.endswith((".css", ".js")):
            abort(404)
        return send_from_directory(FRONTEND / pasta, nome)


def _seguranca(app):
    @app.after_request
    def cabecalhos(resp):
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data: blob:; object-src 'none'; "
            "base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
        )
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "same-origin"
        if HTTPS:
            resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.before_request
    def checar_csrf():
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            enviado = request.headers.get("X-CSRF-Token", "")
            if not session.get("csrf") or not hmac.compare_digest(enviado, session["csrf"]):
                abort(403)

    @app.errorhandler(Exception)
    def erro_geral(e):
        if isinstance(e, HTTPException):
            return jsonify(erro=MENSAGENS.get(e.code, "Não foi possível concluir.")), e.code
        app.logger.exception("Erro interno")  # o detalhe fica só no terminal
        return jsonify(erro="Erro interno. Tente novamente."), 500


def create_app():
    (DADOS / "uploads").mkdir(parents=True, exist_ok=True)
    app = Flask(__name__, static_folder=None)
    app.config.update(
        SECRET_KEY=_chave_secreta(),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=HTTPS,
        PERMANENT_SESSION_LIFETIME=timedelta(days=7),
        MAX_CONTENT_LENGTH=4 * 1024 * 1024,
    )
    from . import admin, auth, db, perfil, rifas

    db.init_app(app)
    app.register_blueprint(auth.bp)
    app.register_blueprint(admin.bp)
    app.register_blueprint(perfil.bp)
    app.register_blueprint(rifas.bp)
    _paginas(app)
    _seguranca(app)
    return app
