// Scraper Smiles — busca disponibilidade em milhas simulando a busca manual no site.
//
// STATUS: primeira versão, NÃO validada contra o site real (escrita sem conseguir
// abrir smiles.com.br a partir do ambiente onde isso foi escrito). Espere que pelo
// menos uma etapa precise de ajuste de seletor — é por isso que cada etapa salva um
// print + o HTML da página em scrapers/_debug/, pra calibrar rápido.
//
// Uso (busca anônima):
//   npm install --save-dev playwright && npx playwright install chromium
//   node scrapers/smiles/buscar-milhas.mjs GRU NRT 2026-10-15
//
// Uso com login (pra pegar promoções de clube/cliente — ver scrapers/README.md
// sobre os riscos de automatizar login antes de configurar isso):
//   cp scrapers/.env.example scrapers/.env   # preencha SMILES_USUARIO/SMILES_SENHA
//   node --env-file=scrapers/.env scrapers/smiles/buscar-milhas.mjs GRU NRT 2026-10-15
//
// Se travar numa etapa, veja scrapers/_debug/<etapa>.png e .html, e me mande.

import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginSmiles } from './login.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEBUG_DIR = path.join(__dirname, '..', '_debug')

const [, , origem, destino, data] = process.argv
if (!origem || !destino || !data) {
  console.error('Uso: node scrapers/smiles/buscar-milhas.mjs ORIGEM DESTINO AAAA-MM-DD')
  process.exit(1)
}

async function salvarDebug(page, etapa) {
  await mkdir(DEBUG_DIR, { recursive: true })
  await page.screenshot({ path: path.join(DEBUG_DIR, `${etapa}.png`), fullPage: true }).catch(() => {})
  const html = await page.content().catch(() => '')
  await writeFile(path.join(DEBUG_DIR, `${etapa}.html`), html).catch(() => {})
}

async function etapa(page, nome, fn) {
  try {
    const resultado = await fn()
    await salvarDebug(page, nome)
    console.log(`[ok] ${nome}`)
    return resultado
  } catch (err) {
    await salvarDebug(page, `${nome}-ERRO`)
    console.error(`[falhou] ${nome}: ${err.message}`)
    console.error(`   -> veja scrapers/_debug/${nome}-ERRO.png e .html`)
    throw err
  }
}

// Converte AAAA-MM-DD para DD/MM/AAAA, formato comum em campos de data BR.
function dataBR(iso) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  viewport: { width: 1366, height: 900 },
  locale: 'pt-BR',
})

try {
  const { SMILES_USUARIO, SMILES_SENHA } = process.env
  if (SMILES_USUARIO && SMILES_SENHA) {
    console.log('[info] credenciais encontradas, fazendo login antes de buscar...')
    await loginSmiles(page, { usuario: SMILES_USUARIO, senha: SMILES_SENHA }, { salvarDebug })
    console.log('[ok] login')
  } else {
    console.log('[info] sem SMILES_USUARIO/SMILES_SENHA no ambiente — buscando anônimo (sem promoções de clube)')
  }

  await etapa(page, '01-home', async () => {
    await page.goto('https://www.smiles.com.br/', { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(2000) // deixa banners/cookies renderizarem antes de interagir
  })

  // TODO(calibrar): texto exato do botão de aceitar cookies pode variar.
  await etapa(page, '02-cookies', async () => {
    const aceitar = page.getByRole('button', { name: /aceitar|concordo|entendi/i })
    if (await aceitar.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await aceitar.first().click()
    }
  })

  // Popup promocional/newsletter costuma aparecer alguns segundos depois de
  // carregar a página (por isso o 02-cookies não pegou) e fica por cima de tudo
  // com id="popupOverlay", bloqueando qualquer clique. Tenta fechar de várias
  // formas; se nada funcionar, remove o overlay do DOM à força — ele só atrapalha,
  // não precisamos interagir com o conteúdo dele.
  await etapa(page, '03-fechar-popup', async () => {
    await page.waitForTimeout(2000) // dá tempo do popup terminar de aparecer

    await page.keyboard.press('Escape').catch(() => {})

    const fechar = page.locator(
      '#popupOverlay [aria-label="Fechar"], #popupOverlay .close, #popupOverlay [class*="close"], #popupOverlay button:has-text("Fechar"), #popupOverlay svg'
    )
    if (await fechar.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await fechar.first().click({ timeout: 5000 }).catch(() => {})
    }

    const aindaVisivel = await page
      .locator('#popupOverlay.show, #popupOverlay[class*="show"]')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)

    if (aindaVisivel) {
      await page.evaluate(() => document.getElementById('popupOverlay')?.remove())
    }
  })

  // TODO(calibrar): a busca da Smiles normalmente tem abas "Passagem" e um toggle
  // Dinheiro/Milhas — o seletor abaixo é uma tentativa por texto visível, mais
  // resistente a mudança de classe CSS do que um seletor tipo .btn-milhas.
  await etapa(page, '04-aba-milhas', async () => {
    const abaMilhas = page.getByText(/milhas/i).first()
    if (await abaMilhas.isVisible({ timeout: 5000 }).catch(() => false)) {
      await abaMilhas.click()
    }
  })

  await etapa(page, '05-origem', async () => {
    const campoOrigem = page.getByPlaceholder(/origem|de onde/i).first()
    await campoOrigem.click()
    await campoOrigem.fill(origem)
    await page.waitForTimeout(1500) // espera autocomplete
    await page.keyboard.press('Enter')
  })

  await etapa(page, '06-destino', async () => {
    const campoDestino = page.getByPlaceholder(/destino|para onde/i).first()
    await campoDestino.click()
    await campoDestino.fill(destino)
    await page.waitForTimeout(1500)
    await page.keyboard.press('Enter')
  })

  await etapa(page, '07-data', async () => {
    const campoData = page.getByPlaceholder(/data|ida/i).first()
    await campoData.click()
    await campoData.fill(dataBR(data))
    await page.keyboard.press('Escape')
  })

  await etapa(page, '08-buscar', async () => {
    const botaoBuscar = page.getByRole('button', { name: /buscar/i }).first()
    await botaoBuscar.click()
    await page.waitForTimeout(6000) // resultado de milhas costuma demorar mais que dinheiro
  })

  const resultados = await etapa(page, '09-resultado', async () => {
    // Sem seletor confiável ainda para os cards de resultado — captura todo texto
    // visível da área de resultado como ponto de partida pra eu calibrar depois.
    return page.evaluate(() => document.body.innerText.slice(0, 3000))
  })

  console.log('\n--- Amostra do texto da página de resultado (para calibração) ---\n')
  console.log(resultados)
  console.log('\nSe já der pra reconhecer preço/milhas nesse texto, me manda esse trecho que eu escrevo o parser certo.')
} finally {
  await browser.close()
}
