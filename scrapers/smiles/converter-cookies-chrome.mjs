// Converte um export de cookies do Chrome (extensão Cookie-Editor, formato JSON)
// pro formato de sessão que o Playwright entende (storageState).
//
// Nada aqui passa pelo chat — tudo roda local, lendo e escrevendo só arquivos
// no seu computador.
//
// Uso:
//   1. No Chrome, logado no smiles.com.br, abra a extensão Cookie-Editor.
//   2. Export -> Copy to clipboard (formato JSON).
//   3. Cole o conteúdo num arquivo scrapers/smiles/cookies-chrome-export.json
//   4. node scrapers/smiles/converter-cookies-chrome.mjs

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENTRADA = path.join(__dirname, 'cookies-chrome-export.json')
const SAIDA = path.join(__dirname, 'smiles.session.json')

function mapearSameSite(valor) {
  const mapa = { no_restriction: 'None', lax: 'Lax', strict: 'Strict' }
  return mapa[String(valor).toLowerCase()] ?? 'Lax'
}

const bruto = JSON.parse(await readFile(ENTRADA, 'utf8'))

const cookies = bruto.map((c) => ({
  name: c.name,
  value: c.value,
  domain: c.domain,
  path: c.path ?? '/',
  expires: c.session ? -1 : Math.floor(c.expirationDate ?? -1),
  httpOnly: Boolean(c.httpOnly),
  secure: Boolean(c.secure),
  sameSite: mapearSameSite(c.sameSite),
}))

await writeFile(SAIDA, JSON.stringify({ cookies, origins: [] }, null, 2))

console.log(`${cookies.length} cookies convertidos.`)
console.log(`Sessão salva em ${SAIDA}`)
console.log('\nPode apagar scrapers/smiles/cookies-chrome-export.json agora (já não precisa mais dele).')
console.log('Teste com: node scrapers/smiles/buscar-milhas.mjs GRU NRT 2026-10-15')
