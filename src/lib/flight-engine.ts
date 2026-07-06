import { supabase } from "./supabase";

interface DispatchParams {
  origem: string;
  destino: string;
  dataIda: string;
  flightId: string; // ID do card criado na tabela public.flights
  origemSkyId?: string;
  origemEntityId?: string;
  destinoSkyId?: string;
  destinoEntityId?: string;
}

interface EngineResult {
  status: "cached" | "queued";
  preco: number | null;
  jobId?: string;
}

/**
 * Motor Central de Despacho de Buscas de Voos
 * Coordena a leitura de cache e criação de jobs em fila para o Scraper Worker
 */
export async function dispatchFlightSearch({
  origem,
  destino,
  dataIda,
  flightId,
  origemSkyId,
  origemEntityId,
  destinoSkyId,
  destinoEntityId,
}: DispatchParams): Promise<EngineResult> {
  const oUpper = origem.toUpperCase();
  const dUpper = destino.toUpperCase();

  console.log(
    `[Flight Engine] Processando requisição de busca para ${oUpper} ✈ ${dUpper} na data ${dataIda}`,
  );

  try {
    // 1. ESTRATÉGIA DE CACHE: Procura se algum outro job idêntico já coletou preços nas últimas 2 horas
    const duasHorasAtras = new Date(
      Date.now() - 2 * 60 * 60 * 1000,
    ).toISOString();

    const { data: cachedJob, error: cacheError } = await supabase
      .from("flight_jobs")
      .select("resultado")
      .eq("origem", oUpper)
      .eq("destino", dUpper)
      .eq("data_ida", dataIda)
      .eq("status", "concluido")
      .gt("created_at", duasHorasAtras)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!cacheError && cachedJob && cachedJob.resultado) {
      const resultadoJson = cachedJob.resultado as { preco?: number };
      if (resultadoJson.preco) {
        console.log(
          `[Flight Engine] 🎯 Cache válido localizado! Tarifa poupada: R$ ${resultadoJson.preco}`,
        );

        // Sincroniza imediatamente o card principal com o valor do cache
        await supabase
          .from("flights")
          .update({ preco_atual: resultadoJson.preco })
          .eq("id", flightId);

        return {
          status: "cached",
          preco: resultadoJson.preco,
        };
      }
    }

    // 2. FILA DE EXECUÇÃO: Se não há cache válido, cria o Job ligando as pontas das tabelas
    console.log(
      `[Flight Engine] ⏳ Sem cache recente. Injetando novo Job Pendente na fila...`,
    );

    const { data: newJob, error: jobError } = await supabase
      .from("flight_jobs")
      .insert([
        {
          flight_id: flightId, // Injeta o relacionamento UUID oficial para o Worker não dar undefined
          origem: oUpper,
          destino: dUpper,
          data_ida: dataIda,
          status: "pendente",
          // Metadados colhidos reativamente na caixa de predição do modal
          origem_sky_id: origemSkyId || `${oUpper}-sky`,
          origem_entity_id: origemEntityId || null,
          destino_sky_id: destinoSkyId || `${dUpper}-sky`,
          destino_entity_id: destinoEntityId || null,
        },
      ])
      .select()
      .single();

    if (jobError) {
      console.error(
        `[Flight Engine] ❌ Falha crítica ao inserir na tabela flight_jobs:`,
        jobError.message,
      );
      throw new Error(jobError.message);
    }

    console.log(
      `[Flight Engine] 🚀 Job criado com sucesso absoluto na tabela! ID: ${newJob.id}`,
    );

    return {
      status: "queued",
      preco: null,
      jobId: newJob.id,
    };
  } catch (error) {
    console.error(
      `[Flight Engine] Erro fatal no fluxo da Engine central:`,
      error,
    );
    throw error;
  }
}
