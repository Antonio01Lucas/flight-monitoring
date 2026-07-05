"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useRouter } from "next/navigation";
// Importa o mecanismo inteligente de buscas da nossa Engine Central
import { dispatchFlightSearch } from "../lib/flight-engine";

interface Flight {
  id: string;
  origem: string;
  destino: string;
  preco_alvo: number;
  preco_atual?: number | null;
  data_ida: string;
  data_volta?: string | null;
  created_at?: string;
}

interface AddFlightModalProps {
  onFlightAdded?: (newFlight: Flight) => void;
}

export default function AddFlightModal({ onFlightAdded }: AddFlightModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const flightData = {
      origem: (formData.get("origem") as string).toUpperCase(),
      destino: (formData.get("destino") as string).toUpperCase(),
      preco_alvo: parseFloat(formData.get("preco_alvo") as string),
      data_ida: formData.get("data_ida") as string,
    };

    // 1. Salva o voo de interesse do usuário no banco de dados
    const { data: flight, error: flightError } = await supabase
      .from("flights")
      .insert([flightData])
      .select()
      .single();

    if (flightError) {
      alert("Erro ao salvar voo: " + flightError.message);
      setLoading(false);
      return;
    }

    try {
      // 2. Aciona a Engine: ela decidirá se lê do cache ou cria um Job na fila
      console.log(`[Modal] Despachando busca inteligente para o trecho...`);
      const engineResult = await dispatchFlightSearch({
        origem: flight.origem,
        destino: flight.destino,
        dataIda: flight.data_ida,
      });

      if (engineResult.status === "cached") {
        console.log(
          `[Modal] Preço instantâneo obtido via Cache: R$ ${engineResult.preco}`,
        );
      } else {
        console.log(
          `[Modal] Novo Job adicionado à fila. ID: ${engineResult.jobId}`,
        );
      }
    } catch (engineError) {
      // Tratamento resiliente: se a Engine falhar, não barramos a experiência do usuário
      console.error("[Modal] Falha ao acionar a engine de voos:", engineError);
    }

    if (onFlightAdded) onFlightAdded(flight as Flight);
    setIsOpen(false);
    router.refresh(); // Sincroniza a interface do Next.js
    setLoading(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="bg-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-500 transition"
      >
        + Adicionar Voo
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSubmit}
            className="bg-slate-800 p-6 rounded-xl w-full max-w-sm space-y-4"
          >
            <h2 className="text-xl font-bold">Nova Rota</h2>
            <input
              name="origem"
              placeholder="Origem (ex: GRU)"
              className="w-full p-2 rounded bg-slate-900 border border-slate-700 uppercase"
              maxLength={3}
              required
            />
            <input
              name="destino"
              placeholder="Destino (ex: PEK)"
              className="w-full p-2 rounded bg-slate-900 border border-slate-700 uppercase"
              maxLength={3}
              required
            />
            <input
              name="preco_alvo"
              type="number"
              placeholder="Preço Alvo (R$)"
              className="w-full p-2 rounded bg-slate-900 border border-slate-700"
              required
            />
            <input
              name="data_ida"
              type="date"
              className="w-full p-2 rounded bg-slate-900 border border-slate-700"
              required
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 p-2 bg-slate-700 rounded text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 p-2 bg-blue-600 rounded font-bold text-sm disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "Processando..." : "Salvar Rota"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
