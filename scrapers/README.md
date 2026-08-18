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
navegador:

1. **Nunca cole usuário/senha no chat.** Configure em `scrapers/.env` (copie de
   `scrapers/.env.example`) — esse arquivo já está no `.gitignore`, nunca é commitado.
2. Rode o login interativo **uma vez** (abre uma janela de navegador de verdade —
   resolva o código de 2FA ali normalmente, depois aperte Enter no terminal):
   ```bash
   node --env-file=scrapers/.env scrapers/smiles/login-interativo.mjs
   ```
   Isso salva `scrapers/smiles/smiles.session.json` (também no `.gitignore` — equivale
   a estar logado, tão sensível quanto a senha).
3. A partir daí, rode a busca normalmente — ela detecta a sessão salva sozinha:
   ```bash
   node scrapers/smiles/buscar-milhas.mjs GRU NRT 2026-10-15
   ```
4. Quando a sessão expirar (o site vai parecer deslogado de novo), repita o passo 2.
