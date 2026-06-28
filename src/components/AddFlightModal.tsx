"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation"; // Importe isso

interface AddFlightModalProps {
  onFlightAdded?: (newFlight: any) => void; // Tornamos opcional
}

export default function AddFlightModal({ onFlightAdded }: AddFlightModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter(); // Inicialize o router

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const flightData = {
      origem: formData.get("origem"),
      destino: formData.get("destino"),
      preco_alvo: parseFloat(formData.get("preco_alvo") as string),
      data_ida: formData.get("data_ida"),
    };

    const { data, error } = await supabase
      .from("flights")
      .insert([flightData])
      .select()
      .single();

    if (!error) {
      if (onFlightAdded) onFlightAdded(data);
      setIsOpen(false);
      router.refresh(); // <--- O MÁGICO: Isso atualiza o servidor automaticamente!
    } else {
      alert("Erro: " + error.message);
    }
    setLoading(false);
  };

  // ... (o restante do seu return permanece igual)
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="bg-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-500 transition"
      >
        + Adicionar Voo
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-slate-800 p-6 rounded-xl w-full max-w-sm space-y-4"
          >
            <h2 className="text-xl font-bold">Nova Rota</h2>
            <input
              name="origem"
              placeholder="Origem (ex: GIG)"
              className="w-full p-2 rounded bg-slate-900 border border-slate-700"
              required
            />
            <input
              name="destino"
              placeholder="Destino (ex: JFK)"
              className="w-full p-2 rounded bg-slate-900 border border-slate-700"
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
                className="flex-1 p-2 bg-slate-700 rounded"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 p-2 bg-blue-600 rounded font-bold"
                disabled={loading}
              >
                {loading ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
