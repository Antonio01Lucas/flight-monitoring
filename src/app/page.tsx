"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AddFlightModal from "@/components/AddFlightModal";
import FlightCard from "@/components/FlightCard";

// Definimos o que é um "Flight" para o TypeScript parar de reclamar
interface Flight {
  id: string;
  origem: string;
  destino: string;
  preco_alvo: number;
  preco_atual?: number | null;
  data_ida: string;
}

export default function Home() {
  const [flights, setFlights] = useState<Flight[]>([]);

  useEffect(() => {
    async function fetchFlights() {
      const { data } = await supabase.from("flights").select("*");
      if (data) setFlights(data as Flight[]);
    }
    fetchFlights();
  }, []);

  // ... resto do seu código

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Radar de Voos ✈️</h1>
          <AddFlightModal
            onFlightAdded={(newFlight) => setFlights([newFlight, ...flights])}
          />
        </header>

        <div className="grid gap-4">
          {flights.map((flight) => (
            <FlightCard key={flight.id} {...flight} />
          ))}
        </div>
      </div>
    </main>
  );
}
