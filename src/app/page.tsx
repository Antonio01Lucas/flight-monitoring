// src/app/page.tsx
import { supabase } from "@/lib/supabase";
import AddFlightModal from "@/components/AddFlightModal"; // Importe o seu componente

export default async function Home() {
  const { data: flights } = await supabase
    .from("flights")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen p-8 bg-slate-950 text-white">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Monitoramento de Voos</h1>
        <AddFlightModal /> {/* Modal já integrado! */}
      </div>

      <div className="grid gap-4">
        {flights?.map((flight: any) => (
          <div
            key={flight.id}
            className="p-4 bg-slate-900 rounded-lg border border-slate-800"
          >
            <h2 className="font-bold">
              {flight.origem} ➔ {flight.destino}
            </h2>
            <p className="text-slate-400">Preço Alvo: R$ {flight.preco_alvo}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
