// Validação manual da Fase 1: chama a API do Duffel para a rota fixa GRU -> NRT.
// Uso: DUFFEL_API_KEY=duffel_test_xxx node scripts/testar-duffel-fase1.mjs
//
// Mesma lógica da Edge Function em supabase/functions/buscar-tarifa-fase1/index.ts,
// só que roda localmente (sem gravar no banco) para confirmar que a chave/chamada funcionam.

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY

if (!DUFFEL_API_KEY) {
  console.error('Defina DUFFEL_API_KEY no ambiente antes de rodar este script.')
  process.exit(1)
}

const ROTA_FIXA = {
  origem: 'GRU',
  destino: 'NRT',
  cabine: 'economy',
  data_partida: '2026-10-15',
}

const resp = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${DUFFEL_API_KEY}`,
    'Content-Type': 'application/json',
    'Duffel-Version': 'v2',
    Accept: 'application/json',
  },
  body: JSON.stringify({
    data: {
      slices: [
        {
          origin: ROTA_FIXA.origem,
          destination: ROTA_FIXA.destino,
          departure_date: ROTA_FIXA.data_partida,
        },
      ],
      passengers: [{ type: 'adult' }],
      cabin_class: ROTA_FIXA.cabine,
    },
  }),
})

if (!resp.ok) {
  console.error(`Duffel respondeu ${resp.status}:`, await resp.text())
  process.exit(1)
}

const json = await resp.json()
const offers = json.data?.offers ?? []

console.log(`${offers.length} oferta(s) encontrada(s) para ${ROTA_FIXA.origem} -> ${ROTA_FIXA.destino} em ${ROTA_FIXA.data_partida}`)

if (offers.length > 0) {
  const maisBarata = offers.reduce((menor, oferta) =>
    Number(oferta.total_amount) < Number(menor.total_amount) ? oferta : menor
  )
  console.log('Mais barata:', {
    preco: maisBarata.total_amount,
    moeda: maisBarata.total_currency,
    cia_aerea: maisBarata.owner?.name,
    escalas: maisBarata.slices?.[0]?.segments?.length - 1,
  })
}
