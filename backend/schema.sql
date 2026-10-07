-- Banco da Rifa (SQLite). Só chaves naturais, sem SK.
-- Os CHECKs repetem as regras do servidor: o banco se protege sozinho.
-- Atenção: bancos antigos ganham as colunas novas por migração (db.py, COLUNAS_NOVAS).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cliente (
    cpf_cnpj   TEXT PRIMARY KEY
               CHECK (length(cpf_cnpj) IN (11, 14) AND cpf_cnpj NOT GLOB '*[^0-9]*'),
    nome       TEXT NOT NULL
               CHECK (length(nome) BETWEEN 2 AND 100 AND nome NOT GLOB '*[0-9]*'),
    telefone   TEXT
               CHECK (telefone IS NULL
                      OR (length(telefone) IN (10, 11) AND telefone NOT GLOB '*[^0-9]*')),
    -- e-mail em minúsculas, usado para recuperar a senha
    email      TEXT
               CHECK (email IS NULL
                      OR (length(email) BETWEEN 6 AND 120 AND email = lower(email)
                          AND email GLOB '*?@?*.??*' AND email NOT GLOB '*[^a-z0-9@._%+-]*')),
    senha_hash TEXT NOT NULL,
    -- adm: tudo | gerente: cria e gerencia as próprias rifas | participante: participa por link
    cargo      TEXT NOT NULL DEFAULT 'participante'
               CHECK (cargo IN ('adm', 'gerente', 'participante'))
);

CREATE TABLE IF NOT EXISTS rifa (
    titulo          TEXT PRIMARY KEY
                    CHECK (length(titulo) BETWEEN 3 AND 60 AND titulo = trim(titulo)),
    resumo          TEXT NOT NULL CHECK (length(resumo) BETWEEN 10 AND 500),
    premio          TEXT NOT NULL CHECK (length(premio) BETWEEN 2 AND 100),
    valor_numero    REAL NOT NULL CHECK (valor_numero > 0 AND valor_numero <= 10000),
    -- só inteiros: 80, 100, 120, 140, 160, 180 ou 200
    qtd_numeros     INTEGER NOT NULL
                    CHECK (typeof(qtd_numeros) = 'integer'
                           AND qtd_numeros BETWEEN 80 AND 200
                           AND qtd_numeros % 20 = 0),
    imagem          TEXT CHECK (imagem IS NULL OR imagem GLOB '[0-9a-f]*.jpg'),
    organizador     TEXT NOT NULL REFERENCES cliente (cpf_cnpj),
    -- código secreto do link: a rifa só é acessada por quem recebeu o link
    codigo          TEXT CHECK (codigo IS NULL
                                OR (length(codigo) BETWEEN 8 AND 40
                                    AND codigo NOT GLOB '*[^A-Za-z0-9_-]*')),
    data_sorteio    TEXT CHECK (data_sorteio IS NULL
                                OR data_sorteio GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    numero_sorteado INTEGER CHECK (numero_sorteado IS NULL OR numero_sorteado >= 1),
    sorteada_em     TEXT
);

-- chave composta natural: um número só é vendido uma vez por rifa
CREATE TABLE IF NOT EXISTS bilhete (
    rifa_titulo TEXT    NOT NULL REFERENCES rifa (titulo) ON DELETE CASCADE,
    numero      INTEGER NOT NULL CHECK (numero >= 1),
    cpf_cnpj    TEXT    NOT NULL REFERENCES cliente (cpf_cnpj),
    PRIMARY KEY (rifa_titulo, numero)
);

-- link de "esqueci a senha": guarda só o hash do token, com validade
CREATE TABLE IF NOT EXISTS redefinicao (
    token_hash TEXT PRIMARY KEY,
    cpf_cnpj   TEXT NOT NULL REFERENCES cliente (cpf_cnpj) ON DELETE CASCADE,
    expira     INTEGER NOT NULL
);
