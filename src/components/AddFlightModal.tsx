"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom"; // O segredo para renderizar fora do fluxo do Modal
import { supabase } from "../lib/supabase";
import { useRouter } from "next/navigation";
import { dispatchFlightSearch } from "../lib/flight-engine";

interface AirportSuggestion {
  skyId: string;
  entityId: string;
  presentation?: {
    title?: string;
    suggestionTitle?: string;
    subtitle?: string;
  };
}

interface Flight {
  id: string;
  origem: string;
  destino: string;
  preco_alvo: number;
  preco_atual?: number | null;
  data_ida: string;
  data_volta?: string | null;
  origem_sky_id?: string;
  origem_entity_id?: string;
  destino_sky_id?: string;
  destino_entity_id?: string;
  created_at?: string;
}

interface AddFlightModalProps {
  onFlightAdded?: (newFlight: Flight) => void;
}

export default function AddFlightModal({ onFlightAdded }: AddFlightModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [inputOrigem, setInputOrigem] = useState("");
  const [inputDestino, setInputDestino] = useState("");

  const [sugestoesOrigem, setSugestoesOrigem] = useState<AirportSuggestion[]>(
    [],
  );
  const [sugestoesDestino, setSugestoesDestino] = useState<AirportSuggestion[]>(
    [],
  );

  const [origemSelecionada, setOrigemSelecionada] =
    useState<AirportSuggestion | null>(null);
  const [destinoSelecionado, setDestinoSelecionado] =
    useState<AirportSuggestion | null>(null);

  // Referências aos inputs para sabermos exatamente onde renderizar o dropdown flutuante na tela
  const inputOrigemRef = useRef<HTMLInputElement>(null);
  const inputDestinoRef = useRef<HTMLInputElement>(null);

  // Estados para guardar as coordenadas físicas exatas calculadas reativamente na tela
  const [coordsOrigem, setCoordsOrigem] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  const [coordsDestino, setCoordsDestino] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  // Monitora a Origem para calcular a posição sempre que a lista surgir
  useEffect(() => {
    if (sugestoesOrigem.length > 0 && inputOrigemRef.current) {
      const rect = inputOrigemRef.current.getBoundingClientRect();
      setCoordsOrigem({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [sugestoesOrigem]);

  // Monitora o Destino para calcular a posição sempre que a lista surgir
  useEffect(() => {
    if (sugestoesDestino.length > 0 && inputDestinoRef.current) {
      const rect = inputDestinoRef.current.getBoundingClientRect();
      setCoordsDestino({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [sugestoesDestino]);

  // Autocomplete Origem
  useEffect(() => {
    let ativo = true;
    if (inputOrigem.length < 2 || origemSelecionada) return;

    const delayDebounce = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/airports?query=${encodeURIComponent(inputOrigem)}`,
        );
        if (!response.ok) throw new Error("Erro proxy");
        const resultados = await response.json();
        if (ativo) setSugestoesOrigem(resultados || []);
      } catch (err) {
        console.error(err);
      }
    }, 400);

    return () => {
      ativo = false;
      clearTimeout(delayDebounce);
    };
  }, [inputOrigem, origemSelecionada]);

  // Autocomplete Destino
  useEffect(() => {
    let ativo = true;
    if (inputDestino.length < 2 || destinoSelecionado) return;

    const delayDebounce = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/airports?query=${encodeURIComponent(inputDestino)}`,
        );
        if (!response.ok) throw new Error("Erro proxy");
        const resultados = await response.json();
        if (ativo) setSugestoesDestino(resultados || []);
      } catch (err) {
        console.error(err);
      }
    }, 400);

    return () => {
      ativo = false;
      clearTimeout(delayDebounce);
    };
  }, [inputDestino, destinoSelecionado]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!origemSelecionada || !destinoSelecionado) {
      alert(
        "Por favor, selecione um aeroporto válido a partir da lista flutuante.",
      );
      return;
    }
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const sIdOrigem = origemSelecionada.skyId || "";
    const sIdDestino = destinoSelecionado.skyId || "";

    const flightData = {
      origem: sIdOrigem.replace("-sky", "").toUpperCase() || "IATA",
      destino: sIdDestino.replace("-sky", "").toUpperCase() || "IATA",
      origem_sky_id: sIdOrigem,
      origem_entity_id: origemSelecionada.entityId || "",
      destino_sky_id: sIdDestino,
      destino_entity_id: destinoSelecionado.entityId || "",
      preco_alvo: parseFloat(formData.get("preco_alvo") as string),
      data_ida: formData.get("data_ida") as string,
    };

    const { data: flight, error: flightError } = await supabase
      .from("flights")
      .insert([flightData])
      .select()
      .single();

    if (flightError) {
      alert("Erro ao salvar: " + flightError.message);
      setLoading(false);
      return;
    }

    try {
      await dispatchFlightSearch({
        origem: flight.origem,
        destino: flight.destino,
        dataIda: flight.data_ida,
        flightId: flight.id,
        origemSkyId: flight.origem_sky_id,
        origemEntityId: flight.origem_entity_id,
        destinoSkyId: flight.destino_sky_id,
        destinoEntityId: flight.destino_entity_id,
      });
    } catch (err) {
      console.error(err);
    }

    if (onFlightAdded) onFlightAdded(flight as Flight);

    setIsOpen(false);
    setInputOrigem("");
    setInputDestino("");
    setOrigemSelecionada(null);
    setDestinoSelecionado(null);
    setSugestoesOrigem([]);
    setSugestoesDestino([]);

    router.refresh();
    setLoading(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="bg-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-500 transition text-white"
      >
        + Adicionar Voo
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 text-white">
          <form
            onSubmit={handleSubmit}
            className="bg-slate-800 p-6 rounded-xl w-full max-w-md space-y-5 shadow-2xl relative"
          >
            <h2 className="text-xl font-bold border-b border-slate-700 pb-2">
              Nova Rota
            </h2>

            {/* SEÇÃO ORIGEM */}
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Origem
              </label>
              <input
                ref={inputOrigemRef} // Vincula a referência física
                placeholder="Ex: São Paulo ou GRU..."
                className="w-full p-2.5 rounded bg-slate-900 border border-slate-700 text-white uppercase focus:outline-none focus:border-blue-500 text-sm"
                value={inputOrigem}
                onChange={(e) => {
                  const valor = e.target.value;
                  setInputOrigem(valor);
                  if (origemSelecionada) setOrigemSelecionada(null);
                  if (valor.length < 2) setSugestoesOrigem([]);
                }}
                required
              />
            </div>

            {/* SEÇÃO DESTINO */}
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Destino
              </label>
              <input
                ref={inputDestinoRef} // Vincula a referência física
                placeholder="Ex: Paris ou CDG..."
                className="w-full p-2.5 rounded bg-slate-900 border border-slate-700 text-white uppercase focus:outline-none focus:border-blue-500 text-sm"
                value={inputDestino}
                onChange={(e) => {
                  const valor = e.target.value;
                  setInputDestino(valor);
                  if (destinoSelecionado) setDestinoSelecionado(null);
                  if (valor.length < 2) setSugestoesDestino([]);
                }}
                required
              />
            </div>

            {/* PREÇO ALVO */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Preço Alvo (R$)
              </label>
              <input
                name="preco_alvo"
                type="number"
                step="0.01"
                placeholder="Digite o preço máximo..."
                className="w-full p-2.5 rounded bg-slate-900 border border-slate-700 text-white focus:outline-none text-sm"
                required
              />
            </div>

            {/* DATA DE IDA */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Data de Partida
              </label>
              <input
                name="data_ida"
                type="date"
                min={new Date().toISOString().split("T")[0]}
                className="w-full p-2.5 rounded bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 text-sm"
                required
              />
            </div>

            {/* BOTÕES */}
            <div className="flex gap-3 pt-4 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 p-2.5 bg-slate-700 text-white rounded text-sm font-medium hover:bg-slate-600 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 p-2.5 bg-blue-600 text-white rounded font-bold text-sm disabled:opacity-50 hover:bg-blue-500 transition shadow-lg"
                disabled={loading}
              >
                {loading ? "Processando..." : "Salvar Rota"}
              </button>
            </div>
          </form>

          {/* 🚀 PORTAL 1: DROPDOWN FLUTUANTE DE ORIGEM RENDERIZADO DIRETAMENTE NO BODY */}
          {sugestoesOrigem.length > 0 &&
            !origemSelecionada &&
            typeof document !== "undefined" &&
            createPortal(
              <ul
                className="fixed bg-slate-950 border border-slate-700 rounded-md shadow-2xl overflow-y-auto max-h-48 z-99999 text-white divide-y divide-slate-800"
                style={{
                  top: coordsOrigem.top,
                  left: coordsOrigem.left,
                  width: coordsOrigem.width,
                }}
              >
                {sugestoesOrigem.map((item, index) => {
                  const titulo =
                    item.presentation?.suggestionTitle ||
                    item.presentation?.title ||
                    item.skyId ||
                    "Desconhecido";
                  const subtitulo =
                    item.presentation?.subtitle || `Código: ${item.skyId}`;
                  return (
                    <div
                      key={`ori-${item.entityId || index}-${index}`}
                      className="w-full text-left p-3 hover:bg-blue-600 cursor-pointer text-xs transition-colors flex flex-col gap-0.5 bg-slate-900"
                      onMouseDown={(e) => {
                        e.preventDefault(); // Impede fechamentos precoces
                        setOrigemSelecionada(item);
                        setInputOrigem(titulo);
                        setSugestoesOrigem([]);
                      }}
                    >
                      <span className="font-bold text-white text-sm">
                        {titulo}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        {subtitulo}
                      </span>
                    </div>
                  );
                })}
              </ul>,
              document.body,
            )}

          {/* 🚀 PORTAL 2: DROPDOWN FLUTUANTE DE DESTINO RENDERIZADO DIRETAMENTE NO BODY */}
          {sugestoesDestino.length > 0 &&
            !destinoSelecionado &&
            typeof document !== "undefined" &&
            createPortal(
              <ul
                className="fixed bg-slate-950 border border-slate-700 rounded-md shadow-2xl overflow-y-auto max-h-48 z-99999 text-white divide-y divide-slate-800"
                style={{
                  top: coordsDestino.top,
                  left: coordsDestino.left,
                  width: coordsDestino.width,
                }}
              >
                {sugestoesDestino.map((item, index) => {
                  const titulo =
                    item.presentation?.suggestionTitle ||
                    item.presentation?.title ||
                    item.skyId ||
                    "Desconhecido";
                  const subtitulo =
                    item.presentation?.subtitle || `Código: ${item.skyId}`;
                  return (
                    <div
                      key={`dest-${item.entityId || index}-${index}`}
                      className="w-full text-left p-3 hover:bg-blue-600 cursor-pointer text-xs transition-colors flex flex-col gap-0.5 bg-slate-900"
                      onMouseDown={(e) => {
                        e.preventDefault(); // Impede fechamentos precoces
                        setDestinoSelecionado(item);
                        setInputDestino(titulo);
                        setSugestoesDestino([]);
                      }}
                    >
                      <span className="font-bold text-white text-sm">
                        {titulo}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        {subtitulo}
                      </span>
                    </div>
                  );
                })}
              </ul>,
              document.body,
            )}
        </div>
      )}
    </>
  );
}
