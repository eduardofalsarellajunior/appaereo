// Converte cookies do Chrome pro formato de sessão que o Playwright entende
// (storageState). Aceita dois formatos de entrada (usa o que encontrar primeiro):
//
//   scrapers/smiles/cookies-raw.txt
//     -> valor bruto do header "cookie:" copiado do DevTools (aba Network),
//        formato "nome1=valor1; nome2=valor2". Não tem domain/path/expiração
//        detalhados, então assume tudo pro domínio .smiles.com.br.
//
//   scrapers/smiles/cookies-chrome-export.json
//     -> export de uma extensão tipo Cookie-Editor (array JSON com domain,
//        path, expirationDate, etc. por cookie) — mais preciso, se disponível.
//
// Nada aqui passa pelo chat — tudo roda local, lendo e escrevendo só arquivos
// no seu computador.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENTRADA_RAW = path.join(__dirname, 'cookies-raw.txt')
const ENTRADA_JSON = path.join(__dirname, 'cookies-chrome-export.json')
const SAIDA = path.join(__dirname, 'smiles.session.json')

function mapearSameSite(valor) {
  const mapa = { no_restriction: 'None', lax: 'Lax', strict: 'Strict' }
  return mapa[String(valor).toLowerCase()] ?? 'Lax'
}

function converterDeJson(bruto) {
  return bruto.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path ?? '/',
    expires: c.session ? -1 : Math.floor(c.expirationDate ?? -1),
    httpOnly: Boolean(c.httpOnly),
    secure: Boolean(c.secure),
    sameSite: mapearSameSite(c.sameSite),
  }))
}

// "nome1=valor1; nome2=valor2" -> lista de cookies, todos assumidos como
// .smiles.com.br / path "/" / secure, já que o header não traz esses detalhes.
function converterDeRaw(texto) {
  return texto
    .trim()
    .split(';')
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const idx = par.indexOf('=')
      const name = par.slice(0, idx)
      const value = par.slice(idx + 1)
      return {
        name,
        value,
        domain: '.smiles.com.br',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180, // 180 dias, só uma validade razoável
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
      }
    })
}

let cookies
if (existsSync(ENTRADA_RAW)) {
  console.log(`Lendo ${ENTRADA_RAW}...`)
  cookies = converterDeRaw(await readFile(ENTRADA_RAW, 'utf8'))
} else if (existsSync(ENTRADA_JSON)) {
  console.log(`Lendo ${ENTRADA_JSON}...`)
  cookies = converterDeJson(JSON.parse(await readFile(ENTRADA_JSON, 'utf8')))
} else {
  console.error('Não achei scrapers/smiles/cookies-raw.txt nem cookies-chrome-export.json.')
  console.error('Veja scrapers/README.md pra saber como gerar um dos dois.')
  process.exit(1)
}

await writeFile(SAIDA, JSON.stringify({ cookies, origins: [] }, null, 2))

console.log(`${cookies.length} cookies convertidos.`)
console.log(`Sessão salva em ${SAIDA}`)
console.log('\nPode apagar o arquivo de cookies de origem agora (já não precisa mais dele).')
console.log('Teste com: node scrapers/smiles/buscar-milhas.mjs GRU NRT 2026-10-15')
