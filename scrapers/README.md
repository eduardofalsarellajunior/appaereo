# Scrapers (busca por simulação de navegador)

Abordagem alternativa/experimental à integração via API (Duffel/Seats.aero): em vez de
pagar por uma API, um navegador automatizado (Playwright) simula exatamente a busca
manual que você faz hoje nos sites das companhias/programas de milhas.

## Por que isso não vive em `supabase/functions/`

Edge Functions do Supabase (Deno) são leves e não sustentam um navegador Chromium de
verdade. Estes scripts precisam rodar em algo com navegador — sua máquina local, ou
futuramente um servidor Node dedicado (Fly.io, Railway, etc.), nunca no Supabase.

## Status: experimental, em calibração

Cada site tem seu próprio HTML, então cada scraper é um módulo separado que quebra
independentemente quando aquele site muda o layout — isso é esperado, não é bug do
projeto. **Não foi possível testar contra os sites reais a partir do ambiente onde
este código foi escrito** (sandbox sem acesso de navegador a domínios externos) — a
primeira versão de cada scraper é uma tentativa fundamentada, não uma validação.

## Fluxo de calibração (até funcionar de verdade)

1. Rode o script localmente: `node scrapers/smiles/buscar-milhas.mjs GRU NRT 2026-10-15`
2. Se travar, ele salva prints e o HTML da página em `scrapers/_debug/` a cada etapa.
3. Me manda o print/HTML da etapa que falhou (ou só descreva o que apareceu na tela).
4. Ajusto o seletor daquela etapa específica e você testa de novo.

## Requisitos locais

```bash
npm install --save-dev playwright
npx playwright install chromium
```

## Login (opcional, pra pegar promoções de clube/cliente)

Login revela preços que não aparecem pra visitante anônimo, mas é **muito mais
vigiado contra automação** do que busca anônima. Confirmado na prática: o Smiles pede
verificação em 2 etapas (código por WhatsApp ou e-mail) a cada tentativa de login — e
não vamos automatizar a leitura desse código, existe justamente pra impedir isso.

A solução é fazer login **uma vez, manualmente**, e reaproveitar a sessão autenticada
(cookies) nas buscas seguintes — o mesmo princípio de "lembrar este dispositivo" do
navegador.

**Atenção**: na prática, a própria tela de login do Smiles está atrás de proteção
anti-bot (erro genérico "vamos tentar novamente?" ao tentar logar via Playwright,
mesmo com senha certa — confirmado comparando com login manual no Chrome normal, que
funciona sem problema). Ou seja, `login-interativo.mjs` pode não funcionar. Duas
opções, tente na ordem:

**Opção A — login interativo (mais simples, se não for bloqueado):**
1. **Nunca cole usuário/senha no chat.** Configure em `scrapers/.env` (copie de
   `scrapers/.env.example`) — esse arquivo já está no `.gitignore`, nunca é commitado.
2. Rode o login interativo **uma vez** (abre uma janela de navegador de verdade —
   resolva o código de 2FA ali normalmente, depois aperte Enter no terminal):
   ```bash
   node --env-file=scrapers/.env scrapers/smiles/login-interativo.mjs
   ```
   Isso salva `scrapers/smiles/smiles.session.json` (também no `.gitignore` — equivale
   a estar logado, tão sensível quanto a senha).

**Opção B — importar a sessão do seu Chrome normal (contorna o bloqueio da opção A,
já que nunca passa pela tela de login automatizada). Duas formas, use a que for mais
fácil:**

*B1 — sem instalar nada, só o DevTools do Chrome:*
1. Logado em smiles.com.br, aperte **F12** → aba **Network**.
2. Aperte **F5** pra recarregar e capturar uma requisição nova.
3. Clique na primeira requisição pra `www.smiles.com.br` na lista.
4. Em **Headers** → **Request Headers**, ache a linha `cookie:` → copie só o valor
   (botão direito → Copy value, ou selecione manualmente depois de "cookie:").
5. Cole num arquivo local `scrapers/smiles/cookies-raw.txt` (nunca cole no chat).

*B2 — com uma extensão de cookies (se preferir e achar uma disponível: procure por
"Cookie-Editor", "EditThisCookie" ou similar na Chrome Web Store — o nome exato varia):*
1. Logado no smiles.com.br, abra a extensão → **Export** → **Copy to clipboard**
   (formato JSON).
2. Cole o conteúdo num arquivo local `scrapers/smiles/cookies-chrome-export.json`
   (nunca cole no chat).

**Depois de B1 ou B2**, converta pro formato do Playwright (o script detecta sozinho
qual dos dois arquivos você criou):
```bash
node scrapers/smiles/converter-cookies-chrome.mjs
```
Isso gera o mesmo `scrapers/smiles/smiles.session.json` da opção A.

Qualquer uma das duas opções, o resultado final é o mesmo arquivo. A partir daí, rode
a busca normalmente — ela detecta a sessão salva sozinha:
   ```bash
   node scrapers/smiles/buscar-milhas.mjs GRU NRT 2026-10-15
   ```
4. Quando a sessão expirar (o site vai parecer deslogado de novo), repita o passo 2.
