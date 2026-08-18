// Login interativo no Smiles — rode isso UMA VEZ (e de novo só quando a sessão
// expirar) para resolver login + 2FA manualmente, com o navegador visível.
// Salva a sessão autenticada (cookies) num arquivo local; a partir daí, o script
// de busca (buscar-milhas.mjs) reaproveita essa sessão sem precisar logar de novo.
//
// Por que não automatizar o código de 2FA: ele existe justamente pra impedir
// acesso automatizado à conta — contornar isso não é o objetivo deste projeto.
// Você digita o código manualmente, uma vez, na janela do navegador que abrir.
//
// Uso:
//   cp scrapers/.env.example scrapers/.env   # preencha SMILES_USUARIO/SMILES_SENHA
//   node --env-file=scrapers/.env scrapers/smiles/login-interativo.mjs

import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSION_PATH = path.join(__dirname, 'smiles.session.json')

const { SMILES_USUARIO, SMILES_SENHA } = process.env
if (!SMILES_USUARIO || !SMILES_SENHA) {
  console.error('Faltam SMILES_USUARIO/SMILES_SENHA. Rode com: node --env-file=scrapers/.env scrapers/smiles/login-interativo.mjs')
  process.exit(1)
}

// headless: false -> abre uma janela de navegador de verdade, pra você ver e
// interagir com a tela de 2FA quando ela aparecer.
const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' })

await page.goto('https://www.smiles.com.br/login', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(2000)

const campoUsuario = page.getByPlaceholder(/cpf|e-mail|email/i).first()
await campoUsuario.click()
await campoUsuario.fill(SMILES_USUARIO)

const campoSenha = page.getByPlaceholder(/senha/i).first()
await campoSenha.click()
await campoSenha.fill(SMILES_SENHA)

const botaoEntrar = page.getByRole('button', { name: /entrar|acessar|login/i }).first()
await botaoEntrar.click()

console.log('\nUsuário e senha preenchidos. Se aparecer pedido de código (WhatsApp/e-mail),')
console.log('resolva isso NA JANELA DO NAVEGADOR que abriu, normalmente.')
console.log('Quando terminar e estiver logado (ver a conta/menu do usuário na tela), volte')
console.log('aqui no terminal e aperte Enter.\n')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
await rl.question('Pressione Enter quando estiver logado no navegador... ')
rl.close()

await mkdir(path.dirname(SESSION_PATH), { recursive: true })
await page.context().storageState({ path: SESSION_PATH })

console.log(`\nSessão salva em ${SESSION_PATH}`)
console.log('Esse arquivo é sensível (equivale a estar logado) — já está no .gitignore, nunca commite.')
console.log('A partir de agora, rode a busca normalmente (sem --env-file, não precisa mais das credenciais):')
console.log('  node scrapers/smiles/buscar-milhas.mjs GRU NRT 2026-10-15')

await browser.close()
