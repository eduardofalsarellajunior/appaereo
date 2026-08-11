import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Página de validação da Fase 1: dispara a Edge Function `buscar-tarifa-fase1`
// e lista o histórico de preço já gravado para a rota candidata fixa (GRU -> NRT).
//
// TODO(Fase 5): isto vira parte do dashboard completo (lista de intenções,
// gráfico Recharts por rota candidata, comparação com milhas, alertas).
export default function TesteFase1() {
  const [historico, setHistorico] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(null)

  async function carregarHistorico() {
    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      setErro(error.message)
      return
    }
    setHistorico(data ?? [])
  }

  useEffect(() => {
    carregarHistorico()
  }, [])

  async function buscarTarifaAgora() {
    setCarregando(true)
    setErro(null)
    try {
      const { data, error } = await supabase.functions.invoke('buscar-tarifa-fase1')
      if (error) throw error
      if (data?.erro) throw new Error(data.erro)
      await carregarHistorico()
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Radar de Voos — teste Fase 1</h1>
      <p>
        Rota candidata fixa: <strong>GRU → NRT</strong> (economy). Intenção de teste: BR → Japão.
      </p>

      <button onClick={buscarTarifaAgora} disabled={carregando}>
        {carregando ? 'Buscando...' : 'Buscar tarifa agora (Duffel)'}
      </button>

      {erro && <p style={{ color: 'crimson' }}>Erro: {erro}</p>}

      <h2>Histórico de preços</h2>
      {historico.length === 0 ? (
        <p>Nenhuma consulta registrada ainda.</p>
      ) : (
        <ul>
          {historico.map((h) => (
            <li key={h.id}>
              {h.data_consulta} — {h.preco} {h.moeda} ({h.cia_aerea ?? 'cia não identificada'})
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
