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
