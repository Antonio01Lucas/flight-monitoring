"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { dispatchFlightSearch } from "@/lib/flight-engine";

interface AirportSuggestion {
  iata: string;
  name: string;
  city: string;
  skyId: string;
  entityId: string;
}

export default function NewFlightPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Estados do Formulário
  const [origemInput, setOrigemInput] = useState("");
  const [destinoInput, setDestinoInput] = useState("");
  const [origemSelected, setOrigemSelected] =
    useState<AirportSuggestion | null>(null);
  const [destinoSelected, setDestinoSelected] =
    useState<AirportSuggestion | null>(null);
  const [precoAlvo, setPrecoAlvo] = useState("");
  const [dataIda, setDataIda] = useState("");

  // Visibilidade das caixas de sugestões
  const [showOrigemList, setShowOrigemList] = useState(false);
  const [showDestinoList, setShowDestinoList] = useState(false);

  // Estados que armazenam o retorno assíncrono da API
  const [origemSuggestions, setOrigemSuggestions] = useState<
    AirportSuggestion[]
  >([]);
  const [destinoSuggestions, setDestinoSuggestions] = useState<
    AirportSuggestion[]
  >([]);

  // DEBOUNCE ASSÍNCRONO PARA ORIGEM
  useEffect(() => {
    const query = origemInput.trim();
    if (
      query.length < 2 ||
      (origemSelected && origemInput.includes(origemSelected.skyId))
    ) {
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/airports?query=${encodeURIComponent(query)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setOrigemSuggestions(data);
        }
      } catch (err) {
        console.error("Erro na busca de origem:", err);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [origemInput, origemSelected]);

  // DEBOUNCE ASSÍNCRONO PARA DESTINO
  useEffect(() => {
    const query = destinoInput.trim();
    if (
      query.length < 2 ||
      (destinoSelected && destinoInput.includes(destinoSelected.skyId))
    ) {
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/airports?query=${encodeURIComponent(query)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setDestinoSuggestions(data);
        }
      } catch (err) {
        console.error("Erro na busca de destino:", err);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [destinoInput, destinoSelected]);

  // Enviar formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!origemSelected || !destinoSelected || !precoAlvo || !dataIda) {
      alert(
        "Por favor, selecione os aeroportos clicando nas sugestões da lista.",
      );
      return;
    }

    setLoading(true);

    try {
      const { data: flightCard, error: insertError } = await supabase
        .from("flights")
        .insert([
          {
            origem: origemSelected.iata.toUpperCase().substring(0, 3),
            destino: destinoSelected.iata.toUpperCase().substring(0, 3),
            preco_alvo: parseFloat(precoAlvo),
            data_ida: dataIda,
            preco_atual: null,
          },
        ])
        .select()
        .single();

      if (insertError || !flightCard) {
        throw new Error(
          insertError?.message || "Erro inesperado ao gerar card.",
        );
      }

      await dispatchFlightSearch({
        origem: origemSelected.iata,
        destino: destinoSelected.iata,
        dataIda: dataIda,
        flightId: flightCard.id,
        origemSkyId: origemSelected.skyId,
        destinoSkyId: destinoSelected.skyId,
        origemEntityId: origemSelected.entityId,
        destinoEntityId: destinoSelected.entityId,
      });

      router.push("/");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      alert("Erro no fluxo do motor: " + msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-8 flex flex-col items-center justify-center">
      <div className="w-full max-w-md bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">
            Monitorar Nova Rota (API Direta)
          </h1>
          <Link
            href="/"
            className="text-xs text-slate-400 hover:text-slate-200 transition"
          >
            Voltar
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* INPUT ORIGEM */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Origem
            </label>
            <input
              type="text"
              placeholder="Digite a cidade (Ex: São Paulo, Rio...)"
              value={origemInput}
              onFocus={() => setShowOrigemList(true)}
              onChange={(e) => {
                const val = e.target.value;
                setOrigemInput(val);
                if (origemSelected) setOrigemSelected(null);

                if (val.trim().length < 2) {
                  setOrigemSuggestions([]);
                } else {
                  setShowOrigemList(true);
                }
              }}
              className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none text-sm text-white"
              required
            />
            {showOrigemList && origemSuggestions.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg max-h-48 overflow-y-auto shadow-2xl divide-y divide-slate-800">
                {origemSuggestions.map((airport, index) => (
                  <li
                    key={`${airport.skyId}-${index}`}
                    onMouseDown={() => {
                      setOrigemSelected(airport);
                      setOrigemInput(`${airport.name} (${airport.iata})`);
                      setShowOrigemList(false);
                    }}
                    className="p-2.5 text-xs hover:bg-blue-600 text-slate-200 hover:text-white cursor-pointer transition-colors"
                  >
                    <span className="font-bold text-blue-400 mr-1">
                      [{airport.iata}]
                    </span>{" "}
                    {airport.name} {airport.city && `- ${airport.city}`}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* INPUT DESTINO */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Destino
            </label>
            <input
              type="text"
              placeholder="Digite a cidade de destino..."
              value={destinoInput}
              onFocus={() => setShowDestinoList(true)}
              onChange={(e) => {
                const val = e.target.value;
                setDestinoInput(val);
                if (destinoSelected) setDestinoSelected(null);

                if (val.trim().length < 2) {
                  setDestinoSuggestions([]);
                } else {
                  setShowDestinoList(true);
                }
              }}
              className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none text-sm text-white"
              required
            />
            {showDestinoList && destinoSuggestions.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg max-h-48 overflow-y-auto shadow-2xl divide-y divide-slate-800">
                {destinoSuggestions.map((airport, index) => (
                  <li
                    key={`${airport.skyId}-${index}`}
                    onMouseDown={() => {
                      setDestinoSelected(airport);
                      setDestinoInput(`${airport.name} (${airport.iata})`);
                      setShowDestinoList(false);
                    }}
                    className="p-2.5 text-xs hover:bg-blue-600 text-slate-200 hover:text-white cursor-pointer transition-colors"
                  >
                    <span className="font-bold text-blue-400 mr-1">
                      [{airport.iata}]
                    </span>{" "}
                    {airport.name} {airport.city && `- ${airport.city}`}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* PREÇO ALVO */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Preço Alvo (R$)
            </label>
            <input
              type="number"
              placeholder="Ex: 850"
              value={precoAlvo}
              onChange={(e) => setPrecoAlvo(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none text-sm text-white"
              required
            />
          </div>

          {/* DATA DE IDA */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Data de Ida
            </label>
            <input
              type="date"
              value={dataIda}
              onChange={(e) => setDataIda(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none text-sm text-white"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-slate-400 text-white font-medium p-2.5 rounded-lg transition-colors text-sm shadow-md"
          >
            {loading ? "Despachando para a Fila..." : "Iniciar Monitoramento"}
          </button>
        </form>
      </div>
    </main>
  );
}
