// Motor 3 — detecção de distorção de preço + envio de e-mail.
//
// Chamado pelo Motor 2 logo após gravar novos preços/milhas para uma rota
// candidata (ver motor2-monitoramento-diario). Duas regras (seção 8 da
// especificação), aplicadas tanto ao preço em dinheiro quanto ao custo
// equivalente em milhas de cada programa:
//   - Queda relativa: preço atual caiu mais de 25% vs. mediana dos últimos
//     dias (mínimo de 3 amostras de histórico; com menos que isso, não dá
//     pra falar em "baseline" e a regra não dispara).
//   - Tarifa de erro: preço atual está abaixo do `piso_absoluto` da rota
//     (coluna manual, nullable — sem valor definido, essa regra não dispara).
//
// TODO(Fase 4+): a terceira heurística da especificação ("cabine superior
// custa igual ou menos que cabine inferior") exigiria o Motor 2 buscar mais
// de uma cabine por rota — hoje ele busca só a cabine da intenção. Fica para
// quando isso for necessário de verdade.
//
// E-mail via Resend, só se RESEND_API_KEY estiver configurada — sem a chave,
// o alerta é gravado em `alertas_disparados` normalmente, com
// enviado_email = false.
//
// Deploy: supabase functions deploy motor3-deteccao-distorcao
// Secrets necessários: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Opcionais: RESEND_API_KEY, ALERT_EMAIL_TO, ALERT_EMAIL_FROM, APP_URL

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const ALERT_EMAIL_TO = Deno.env.get('ALERT_EMAIL_TO') ?? 'eduardo@inepadconsulting.com.br'
const ALERT_EMAIL_FROM = Deno.env.get('ALERT_EMAIL_FROM') ?? 'onboarding@resend.dev'
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const QUEDA_RELATIVA_MINIMA = 0.25
const MIN_AMOSTRAS_BASELINE = 3

function mediana(valores) {
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 0 ? (ordenados[meio - 1] + ordenados[meio]) / 2 : ordenados[meio]
}

// Verifica queda relativa numa série [{ valor, ... }], mais recente primeiro.
function detectarQuedaRelativa(serie) {
  if (serie.length < MIN_AMOSTRAS_BASELINE + 1) return null
  const [atual, ...baseline] = serie
  const base = mediana(baseline.map((b) => b.valor))
  if (base <= 0) return null
  const quedaPct = (base - atual.valor) / base
  if (quedaPct >= QUEDA_RELATIVA_MINIMA) {
    return { atual: atual.valor, baseline: base, quedaPct }
  }
  return null
}

async function enviarEmailAlerta(alerta, rotaCandidataId) {
  if (!RESEND_API_KEY) return false

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: ALERT_EMAIL_FROM,
      to: ALERT_EMAIL_TO,
      subject: `Radar de Voos: ${alerta.tipo} detectada`,
      html: `
        <p><strong>${alerta.motivo}</strong></p>
        <p>Valor atual: ${alerta.valor_referencia}</p>
        <p>Baseline histórico: ${alerta.valor_baseline}</p>
        <p>Rota candidata: ${rotaCandidataId}</p>
        <p><a href="${APP_URL}">Ver no painel</a></p>
      `,
    }),
  })

  return resp.ok
}

async function registrarAlerta(supabase, rotaCandidataId, tipo, motivo, valorReferencia, valorBaseline) {
  const alerta = {
    rota_candidata_id: rotaCandidataId,
    tipo,
    motivo,
    valor_referencia: valorReferencia,
    valor_baseline: valorBaseline,
    enviado_email: false,
  }

  const enviado = await enviarEmailAlerta(alerta, rotaCandidataId)
  alerta.enviado_email = enviado

  const { data, error } = await supabase.from('alertas_disparados').insert(alerta).select().single()
  if (error) throw error
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ erro: 'Faltam secrets: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY' }, 500)
  }

  try {
    const { rota_candidata_id } = await req.json()
    if (!rota_candidata_id) {
      return jsonResponse({ erro: 'Informe rota_candidata_id no corpo da requisição' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const alertasDisparados = []

    const { data: rota, error: erroRota } = await supabase
      .from('rotas_candidatas')
      .select('id, piso_absoluto')
      .eq('id', rota_candidata_id)
      .single()
    if (erroRota) throw erroRota

    // --- Preço em dinheiro ---
    const { data: precos, error: erroPrecos } = await supabase
      .from('price_history')
      .select('preco, created_at')
      .eq('rota_candidata_id', rota_candidata_id)
      .order('created_at', { ascending: false })
      .limit(91)
    if (erroPrecos) throw erroPrecos

    if (precos && precos.length > 0) {
      const atual = precos[0].preco

      if (rota.piso_absoluto != null && atual <= rota.piso_absoluto) {
        alertasDisparados.push(
          await registrarAlerta(
            supabase,
            rota_candidata_id,
            'tarifa_erro',
            `Preço em dinheiro (${atual}) está no ou abaixo do piso absoluto definido (${rota.piso_absoluto})`,
            atual,
            rota.piso_absoluto
          )
        )
      }

      const serie = precos.map((p) => ({ valor: Number(p.preco) }))
      const queda = detectarQuedaRelativa(serie)
      if (queda) {
        alertasDisparados.push(
          await registrarAlerta(
            supabase,
            rota_candidata_id,
            'queda_preco',
            `Preço em dinheiro caiu ${(queda.quedaPct * 100).toFixed(1)}% vs. mediana histórica`,
            queda.atual,
            queda.baseline
          )
        )
      }
    }

    // --- Custo equivalente em milhas, por programa ---
    const { data: milhas, error: erroMilhas } = await supabase
      .from('mileage_history')
      .select('programa, milhas_necessarias, taxas_embarque, created_at')
      .eq('rota_candidata_id', rota_candidata_id)
      .order('created_at', { ascending: false })
      .limit(500)
    if (erroMilhas) throw erroMilhas

    if (milhas && milhas.length > 0) {
      const { data: conversoes, error: erroConversoes } = await supabase.from('mileage_conversion').select('*')
      if (erroConversoes) throw erroConversoes
      const valorPor1000 = Object.fromEntries((conversoes ?? []).map((c) => [c.programa, Number(c.valor_por_1000_milhas_brl)]))

      const porPrograma = Object.groupBy ? Object.groupBy(milhas, (m) => m.programa) : {}
      if (!Object.groupBy) {
        for (const m of milhas) {
          porPrograma[m.programa] ??= []
          porPrograma[m.programa].push(m)
        }
      }

      for (const [programa, registros] of Object.entries(porPrograma)) {
        const valorRef = valorPor1000[programa]
        if (!valorRef) continue // sem conversão cadastrada para esse programa, não dá pra comparar em BRL

        const serie = registros
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .map((m) => ({
            valor: (Number(m.milhas_necessarias) / 1000) * valorRef + Number(m.taxas_embarque ?? 0),
          }))

        const queda = detectarQuedaRelativa(serie)
        if (queda) {
          alertasDisparados.push(
            await registrarAlerta(
              supabase,
              rota_candidata_id,
              'milhas_vantajosas',
              `Custo equivalente em milhas (${programa}) caiu ${(queda.quedaPct * 100).toFixed(1)}% vs. mediana histórica`,
              queda.atual,
              queda.baseline
            )
          )
        }
      }
    }

    return jsonResponse({ ok: true, alertas_disparados: alertasDisparados.length, alertas: alertasDisparados })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : JSON.stringify(err)
    return jsonResponse({ erro: mensagem }, 500)
  }
})
