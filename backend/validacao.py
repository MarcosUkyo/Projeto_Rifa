"""Máscaras do servidor: limpa e valida tudo antes de chegar ao banco."""

import re
from datetime import date, timedelta

CONTROLE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
TEXTO = re.compile(r"[\w\s.,!?:;()'’\"&%+/#@-]+")
NOME = re.compile(r"[^\W\d_](?:[^\W\d_]|[ '.-])+")  # só letras, espaço, ' . -
TELEFONE = re.compile(r"[1-9]\d9?\d{8}")  # DDD + 8 ou 9 dígitos
VALOR = re.compile(r"\d{1,5}(?:[.,]\d{1,2})?")
EMAIL = re.compile(r"[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}")
QUANTIDADES = range(80, 201, 20)  # 80, 100, 120 ... 200


def _linha(valor):
    return re.sub(r"\s+", " ", CONTROLE.sub("", str(valor or ""))).strip()


def texto_curto(valor, minimo, maximo):
    s = _linha(valor)
    return s if minimo <= len(s) <= maximo and TEXTO.fullmatch(s) else None


def texto_longo(valor, minimo, maximo):
    s = CONTROLE.sub("", str(valor or "")).replace("\r\n", "\n").strip()
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s if minimo <= len(s) <= maximo else None


def nome(valor):
    s = _linha(valor)
    return s if 2 <= len(s) <= 100 and NOME.fullmatch(s) else None


def telefone(valor):
    """'' se vazio, só dígitos se válido, None se inválido."""
    bruto = str(valor or "").strip()
    if not bruto:
        return ""
    if re.search(r"[^\d\s()+-]", bruto):  # letras e símbolos: recusa
        return None
    d = re.sub(r"\D", "", bruto)
    return d if TELEFONE.fullmatch(d) else None


def valor_reais(valor):
    s = str(valor or "").strip()
    if not VALOR.fullmatch(s):
        return None
    v = round(float(s.replace(",", ".")), 2)
    return v if 0 < v <= 10000 else None


def quantidade(valor):
    s = str(valor or "")
    return int(s) if re.fullmatch(r"\d{1,3}", s) and int(s) in QUANTIDADES else None


def _cpf_ok(d):
    for n in (9, 10):
        soma = sum(int(d[i]) * (n + 1 - i) for i in range(n))
        if int(d[n]) != (soma * 10 % 11) % 10:
            return False
    return True


def _cnpj_ok(d):
    for n in (12, 13):
        pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2][-n:]
        resto = sum(int(d[i]) * p for i, p in enumerate(pesos)) % 11
        if int(d[n]) != (0 if resto < 2 else 11 - resto):
            return False
    return True


def documento(valor):
    """CPF/CNPJ só com dígitos (conferindo os dígitos verificadores) ou None."""
    bruto = str(valor or "").strip()
    d = re.sub(r"\D", "", bruto)
    if re.search(r"[^\d.\-/\s]", bruto) or len(set(d)) <= 1:
        return None
    if (len(d) == 11 and _cpf_ok(d)) or (len(d) == 14 and _cnpj_ok(d)):
        return d
    return None


def email(valor):
    s = str(valor or "").strip().lower()
    return s if len(s) <= 120 and EMAIL.fullmatch(s) else None


def senha(valor):
    return valor if isinstance(valor, str) and 8 <= len(valor) <= 128 else None


CARGOS = ("adm", "gerente", "participante")


def data_sorteio(valor, atual=None):
    """'AAAA-MM-DD' de hoje até 2 anos à frente (ou a data que já estava gravada)."""
    s = str(valor or "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return None
    try:
        d = date.fromisoformat(s)
    except ValueError:
        return None
    if s == atual:
        return s
    hoje = date.today()
    return s if hoje <= d <= hoje + timedelta(days=730) else None
