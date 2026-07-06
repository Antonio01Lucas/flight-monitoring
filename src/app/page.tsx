"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabase";

interface Flight {
  id: string;
  origem: string;
  destino: string;
  preco_alvo: number;
  preco_atual: number | null;
  data_ida: string;
  data_volta: string | null;
  created_at: string;
}

export default function Page() {
  const [flights, setFlights] = useState<Flight[]>([]);
  // Estados para gerenciar a edição do Preço Alvo inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPrecoAlvo, setNewPrecoAlvo] = useState<string>("");

  const router = useRouter();

  // Função isolada para buscar os voos atualizados do banco de dados
  const fetchFlights = useCallback(async () => {
    const { data } = await supabase
      .from("flights")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setFlights(data as Flight[]);
  }, []);

  // 1. Carrega os voos iniciais assim que a página abre
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      const { data } = await supabase
        .from("flights")
        .select("*")
        .order("created_at", { ascending: false });

      if (data && isMounted) {
        setFlights(data as Flight[]);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Escuta a Fila de Jobs em tempo real
  useEffect(() => {
    const channel = supabase
      .channel("flight-jobs-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "flight_jobs",
        },
        (payload) => {
          console.log("Fila de Jobs updated_at no banco!", payload);

          setTimeout(async () => {
            try {
              await fetchFlights();
              router.refresh();
            } catch (err) {
              console.error("Erro reativo ao atualizar listagem de voos:", err);
            }
          }, 50);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, fetchFlights]);

  // Função para DELETAR um voo ativo (Delete)
  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente parar de monitorar este voo?")) return;

    const { error } = await supabase.from("flights").delete().eq("id", id);

    if (error) {
      alert("Erro ao deletar voo: " + error.message);
    } else {
      // Otimização de UI: Remove da tela instantaneamente
      setFlights((prev) => prev.filter((f) => f.id !== id));
      router.refresh();
    }
  };

  // Função para SALVAR a edição do Preço Alvo (Update)
  const handleUpdatePrecoAlvo = async (id: string) => {
    const valorNumerico = parseFloat(newPrecoAlvo);
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      alert("Por favor, insira um preço válido.");
      return;
    }

    const { error } = await supabase
      .from("flights")
      .update({ preco_alvo: valorNumerico })
      .eq("id", id);

    if (error) {
      alert("Erro ao atualizar preço alvo: " + error.message);
    } else {
      // Atualiza o estado local para refletir o novo valor na hora
      setFlights((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, preco_alvo: valorNumerico } : f,
        ),
      );
      setEditingId(null);
      router.refresh();
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Monitoramento de Voos</h1>
        <Link
          href="/flights/new"
          className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm shadow-md"
        >
          Adicionar Rota
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {flights.map((flight) => (
          <div
            key={flight.id}
            className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex justify-between items-start font-bold text-lg">
                <span>
                  {flight.origem} ✈ {flight.destino}
                </span>

                {/* Lógica Inline do UPDATE do Preço Alvo */}
                {editingId === flight.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={newPrecoAlvo}
                      onChange={(e) => setNewPrecoAlvo(e.target.value)}
                      className="w-20 p-1 text-sm rounded bg-slate-900 border border-blue-500 text-green-400 font-bold"
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdatePrecoAlvo(flight.id)}
                      className="text-xs bg-green-600 px-1.5 py-1 rounded hover:bg-green-500"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs bg-slate-700 px-1.5 py-1 rounded hover:bg-slate-600"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-green-400">
                      R$ {flight.preco_alvo}
                    </span>
                    <button
                      onClick={() => {
                        setEditingId(flight.id);
                        setNewPrecoAlvo(flight.preco_alvo.toString());
                      }}
                      className="text-xs text-slate-400 hover:text-blue-400 transition"
                      title="Editar preço alvo"
                    >
                      ✏️
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-400">
                Data de Ida: {flight.data_ida}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-700 space-y-3">
              <div className="flex justify-between text-sm">
                <span>Preço Atual:</span>
                <span className="font-semibold text-blue-400">
                  {flight.preco_atual
                    ? `R$ ${flight.preco_atual}`
                    : "Aguardando scraper..."}
                </span>
              </div>

              {/* Botão de DELETE na base do card */}
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => handleDelete(flight.id)}
                  className="text-xs bg-red-950/40 border border-red-900/60 text-red-400 px-2.5 py-1 rounded-md hover:bg-red-900/60 hover:text-red-200 transition"
                >
                  Parar Monitoramento
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
