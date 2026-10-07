"""Envio de e-mail. Sem SMTP configurado, o texto aparece só no terminal (modo teste)."""

import os
import smtplib
from email.message import EmailMessage


def enviar(destino, assunto, texto):
    host = os.environ.get("RIFA_SMTP_HOST")
    if not host:
        if os.environ.get("RIFA_HTTPS") == "1":
            raise RuntimeError("Configure RIFA_SMTP_HOST para enviar e-mails em produção.")
        print(f"\n[E-MAIL DE TESTE] para: {destino}\n{assunto}\n\n{texto}\n")
        return
    usuario = os.environ.get("RIFA_SMTP_USER", "")
    msg = EmailMessage()
    msg["From"] = os.environ.get("RIFA_SMTP_FROM", usuario)
    msg["To"] = destino
    msg["Subject"] = assunto
    msg.set_content(texto)
    with smtplib.SMTP(host, int(os.environ.get("RIFA_SMTP_PORT", 587)), timeout=10) as smtp:
        smtp.starttls()
        if usuario:
            smtp.login(usuario, os.environ.get("RIFA_SMTP_PASSWORD", ""))
        smtp.send_message(msg)
