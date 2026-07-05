"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import AddFlightModal from "../components/AddFlightModal";

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
  const router = useRouter();

  // Função isolada para buscar os voos atualizados do banco de dados
  const fetchFlights = useCallback(async () => {
    const { data } = await supabase
      .from("flights")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setFlights(data as Flight[]);
  }, []);

  // 1. Carrega os voos iniciais assim que a página abre (Corrigido para evitar renderizações em cascata)
  // 1. Carrega os voos iniciais assim que a página abre (Array de dependências limpo: [])
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
  }, []); // <--- Aqui precisa ser fixo e vazio para o carregamento inicial

  // 2. Escuta a Fila de Jobs em tempo real (Array de dependências constante: [router, fetchFlights])
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
          console.log("Fila de Jobs atualizada no banco!", payload);

          // ISOLAMENTO RESILIENTE: Executa a busca em uma microtarefa separada
          // contornando o fechamento precoce de canais de mensagens do navegador
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
  }, [router, fetchFlights]); // <--- Aqui mantém as duas dependências do listener de eventos

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Monitoramento de Voos</h1>
        <AddFlightModal
          onFlightAdded={() => {
            fetchFlights();
            router.refresh();
          }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {flights.map((flight) => (
          <div
            key={flight.id}
            className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-2"
          >
            <div className="flex justify-between font-bold text-lg">
              <span>
                {flight.origem} ✈ {flight.destino}
              </span>
              <span className="text-green-400">R$ {flight.preco_alvo}</span>
            </div>
            <p className="text-sm text-slate-400">
              Data de Ida: {flight.data_ida}
            </p>
            <div className="pt-2 border-t border-slate-700 flex justify-between text-sm">
              <span>Preço Atual:</span>
              <span className="font-semibold text-blue-400">
                {flight.preco_atual
                  ? `R$ ${flight.preco_atual}`
                  : "Aguardando scraper..."}
              </span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
