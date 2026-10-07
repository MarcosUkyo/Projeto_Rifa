# 🎟️ Rifa Online

Site de rifas com cadastro/login, imagem, tema de cor, e download/compartilhamento
da rifa (PNG, JPG, PDF). HTML + CSS + JS puro, backend Flask + SQLite.

## Estrutura

```
rifa-online/
├── run.py                # inicia o servidor
├── requirements.txt
├── backend/              # servidor (nada daqui é público)
│   ├── __init__.py       # configuração, cabeçalhos de segurança, rotas das páginas
│   ├── auth.py           # cadastro, login, logout, "esqueci a senha"
│   ├── perfil.py         # dados da conta, trocar senha, excluir conta
│   ├── rifas.py          # rifas por link, criar/editar, compra, sorteio, excluir
│   ├── admin.py          # painel do ADM: cargos e todas as rifas
│   ├── validacao.py      # máscaras/validações do servidor
│   ├── emails.py         # envio de e-mail (SMTP)
│   ├── sessao.py         # ajudantes de sessão e resposta
│   ├── db.py             # conexão SQLite e migração
│   └── schema.sql        # tabelas + CHECKs
├── frontend/             # única pasta servida ao navegador
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── main.js       # ponto de entrada e rotas das telas
│       ├── conta.js      # login, cadastro, esqueci a senha
│       ├── rifas.js      # lista, tela da rifa, compra, painel do organizador
│       ├── perfil.js     # minha conta
│       ├── admin.js      # painel do ADM
│       ├── exportar.js   # imagem da rifa, PNG/JPG/PDF, compartilhar
│       ├── mascaras.js   # máscaras dos campos
│       ├── tema.js       # troca de cor
│       ├── util.js       # helpers, estado e chamadas à API
│       └── verificar.js  # avisa se abriram o HTML direto da pasta
└── data/                 # criada sozinha: banco, imagens, chave (fora do Git)
```

## Rodar

**Windows (PowerShell):**

```powershell
python -m pip install -r requirements.txt
python run.py        # abre http://localhost:5000
```

**Linux / macOS:**

```bash
python3 -m pip install -r requirements.txt
python3 run.py
```

Use `python -m pip` em vez de só `pip`: funciona mesmo quando o `pip.exe` está com o launcher quebrado.
Ambiente virtual é opcional (`python -m venv .venv`, depois `.venv\Scripts\Activate.ps1` no Windows
ou `source .venv/bin/activate` no Linux/macOS).

Não abra o `index.html` clicando duas vezes: o site precisa do servidor.
Pelo `localhost` o navegador não mostra nenhuma pasta do seu computador.

## Como funciona

### Cargos

| Cargo | Pode |
|---|---|
| **Participante** | Entrar numa rifa **pelo link**, comprar números, ver seus números e a conta |
| **Gerente** | Tudo do participante + criar rifas e, nas **suas** rifas: editar, ver participantes, sortear e excluir |
| **ADM** | Tudo do gerente em **qualquer** rifa + painel com todos os usuários (mudar cargos) e todas as rifas |

O **primeiro cadastro** do site vira ADM; os demais nascem participantes e o ADM promove quem for gerente.
Em produção, defina `RIFA_ADMIN_DOC` (CPF/CNPJ só com números): só esse documento nasce ADM.
Bancos antigos migram sozinhos: o primeiro usuário vira ADM e quem já criou rifas vira gerente.

### Rifa só por link

- Cada rifa ganha um código secreto no link (`/?rifa=CÓDIGO`). Não existe lista pública de rifas.
- Quem tem o link vê a rifa; para comprar precisa entrar ou se cadastrar.
- A tela inicial mostra só as rifas que a pessoa organiza ou em que já comprou números.
- Compartilhe o link pelos botões de WhatsApp, Facebook, Instagram ou "Copiar link".

### Data e sorteio

- Toda rifa tem **data de sorteio**. Depois dela, as vendas encerram.
- O organizador sorteia a partir dessa data, com pelo menos um número vendido. O sorteio usa aleatório
  criptográfico (`secrets`), vale uma vez só e encerra as vendas. Todos veem o número e o nome abreviado do ganhador.
- A imagem da rifa (PNG/JPG/PDF) mostra a data e, depois do sorteio, o ganhador.

### Editar

Resumo, prêmio, imagem e data podem mudar até o sorteio. Valor e quantidade de números só mudam
enquanto não houver venda. O título não muda (identifica a rifa).

### Outros recursos

- **Organizador** vê quem comprou (nome, telefone, e-mail e números). Os outros veem só os números vendidos
  e os próprios.
- **Minha conta:** editar dados, trocar a senha, ver minhas rifas e participações, excluir a conta.
- **Esqueci a senha:** o site envia um link (vale 30 minutos, uso único) para o e-mail cadastrado.

### E-mail

Sem configurar nada, o e-mail de teste aparece **no terminal** onde o `run.py` está rodando
(copie o link de lá). Para enviar de verdade, defina antes de iniciar:

```powershell
$env:RIFA_SMTP_HOST="smtp.gmail.com"
$env:RIFA_SMTP_USER="seu-email@gmail.com"
$env:RIFA_SMTP_PASSWORD="senha-de-app"
$env:RIFA_URL_BASE="https://seu-site.com"   # endereço que vai no link do e-mail
```

(Linux/macOS: `export RIFA_SMTP_HOST=...`). Variáveis opcionais: `RIFA_SMTP_PORT` (587) e `RIFA_SMTP_FROM`.

## Produção

```bash
pip install gunicorn
RIFA_HTTPS=1 RIFA_SECRET_KEY="uma-chave-longa-e-aleatoria" gunicorn run:app
```

Use sempre atrás de HTTPS. A pasta `data/` nunca deve ir para o GitHub (já está no `.gitignore`).

## Segurança

- Só `frontend/` é público; `backend/`, `data/` e `run.py` não são acessíveis pelo navegador
- Senhas com hash, cookie HttpOnly + SameSite, token CSRF em toda escrita, limite de tentativas de login
- Máscaras no navegador + validação no servidor + `CHECK` no banco (três camadas)
- Upload só JPG/PNG/WEBP, reencodado (remove EXIF/GPS) e salvo com nome = hash do conteúdo
- Link de redefinição guardado só como hash, com validade e uso único; a resposta de "esqueci a senha" não revela quem tem conta
- Rifas acessíveis só por código secreto (64 bits) com limite de tentativas; contatos só para organizador/ADM
- SQL parametrizado, CSP restritiva, sem bibliotecas externas no navegador, erros sem caminhos de pasta

## Licença

MIT
