// Login no Smiles — etapa opcional, separada da busca, porque login é muito mais
// vigiado contra automação do que busca anônima (é onde companhias investem mais
// em anti-fraude). Se aparecer CAPTCHA ou verificação em 2 etapas, este módulo
// PARA e avisa em vez de tentar contornar — não existe forma automática segura
// de resolver isso, e não é o objetivo deste projeto.
//
// STATUS: primeira versão, não validada (mesma ressalva do buscar-milhas.mjs).

export async function loginSmiles(page, { usuario, senha }, { salvarDebug }) {
  await salvarDebug(page, 'login-00-antes')

  // TODO(calibrar): pode ser que já exista um botão "Entrar" na home em vez de ir
  // direto pra uma URL de login — se essa URL não existir mais, tentar clicar em
  // page.getByRole('link', { name: /entrar|login/i }) a partir da home antes.
  await page.goto('https://www.smiles.com.br/login', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(2000)
  await salvarDebug(page, 'login-01-pagina')

  const campoUsuario = page.getByPlaceholder(/cpf|e-mail|email/i).first()
  await campoUsuario.click()
  await campoUsuario.fill(usuario)
  await salvarDebug(page, 'login-02-usuario')

  const campoSenha = page.getByPlaceholder(/senha/i).first()
  await campoSenha.click()
  await campoSenha.fill(senha)
  await salvarDebug(page, 'login-03-senha')

  const botaoEntrar = page.getByRole('button', { name: /entrar|acessar|login/i }).first()
  await botaoEntrar.click()
  await page.waitForTimeout(4000)
  await salvarDebug(page, 'login-04-apos-clicar')

  // Detecção de CAPTCHA/2FA — se achar, para aqui e avisa. Não existe forma
  // automática segura de resolver isso, e tentar seria o tipo de coisa que gera
  // banimento de conta de verdade.
  const bloqueado = await page
    .locator(
      'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], text=/verifique que você não é um robô/i, text=/código de verificação/i, text=/enviamos um código/i, text=/código de acesso/i'
    )
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false)

  if (bloqueado) {
    await salvarDebug(page, 'login-05-BLOQUEADO-captcha-ou-2fa')
    throw new Error(
      'Login bloqueado por CAPTCHA ou verificação em 2 etapas — precisa ser feito manualmente. Veja scrapers/_debug/login-05-BLOQUEADO-captcha-ou-2fa.png'
    )
  }

  const erroLogin = await page
    .getByText(/senha incorreta|usuário ou senha inválidos|dados inválidos/i)
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false)

  if (erroLogin) {
    throw new Error('Site reportou usuário/senha inválidos — confira scrapers/.env')
  }

  await salvarDebug(page, 'login-06-concluido')
}
