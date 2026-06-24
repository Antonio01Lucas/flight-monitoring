// src/components/FlightCard.tsx
import React from "react";

interface FlightCardProps {
  origem: string;
  destino: string;
  preco_alvo: number;
  preco_atual?: number | null;
  data_ida: string;
}

export default function FlightCard({
  origem,
  destino,
  preco_alvo,
  preco_atual,
  data_ida,
}: FlightCardProps) {
  const isMetaAtingida = preco_atual && preco_atual <= preco_alvo;

  return (
    <div
      className={`p-6 rounded-xl border ${isMetaAtingida ? "border-green-500 bg-green-500/10" : "border-slate-700 bg-slate-800"}`}
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold">
            {origem} ➔ {destino}
          </h3>
          <p className="text-slate-400 text-sm">
            Data: {new Date(data_ida).toLocaleDateString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-400">Meta: R$ {preco_alvo}</p>
          <p
            className={`text-2xl font-bold ${isMetaAtingida ? "text-green-400" : "text-white"}`}
          >
            {preco_atual ? `R$ ${preco_atual}` : "Aguardando..."}
          </p>
        </div>
      </div>
    </div>
  );
}
