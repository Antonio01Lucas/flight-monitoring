import { supabase } from "./supabase";

interface SearchFlightParams {
  origem: string;
  destino: string;
  dataIda: string;
}

/**
 * Engine Central de Despacho: Decide inteligentemente se utiliza um preço
 * recente salvo no banco de dados (Cache) ou se acorda o Scraper criando um Job.
 */
export async function dispatchFlightSearch({
  origem,
  destino,
  dataIda,
}: SearchFlightParams) {
  const origemUpper = origem.toUpperCase();
  const destinoUpper = destino.toUpperCase();

  try {
    // 1. REGRA DE CACHE: Busca se esse voo já foi atualizado recentemente (ex: nas últimas 2 horas)
    const { data: existingFlight } = await supabase
      .from("flights")
      .select("updated_at, preco_atual")
      .eq("origem", origemUpper)
      .eq("destino", destinoUpper)
      .maybeSingle(); // Usamos maybeSingle para evitar erros se a rota for inédita

    if (existingFlight && existingFlight.updated_at) {
      const diffInHours =
        (new Date().getTime() - new Date(existingFlight.updated_at).getTime()) /
        (1000 * 60 * 60);

      // Se foi atualizado há menos de 2 horas, reaproveita o preço para poupar o robô
      if (diffInHours < 2 && existingFlight.preco_atual) {
        console.log(
          `[Engine] Preço recente encontrado para ${origemUpper} -> ${destinoUpper}. Usando Cache.`,
        );
        return { status: "cached", preco: existingFlight.preco_atual };
      }
    }

    // 2. DISPARO DE TAREFA: Se o preço for antigo ou inexistente, joga na fila de Jobs para o Worker rodar
    console.log(
      `[Engine] Preço inexistente ou expirado. Criando Job para ${origemUpper} -> ${destinoUpper}...`,
    );

    const { data: newJob, error: jobError } = await supabase
      .from("flight_jobs")
      .insert([
        {
          origem: origemUpper,
          destino: destinoUpper,
          data_ida: dataIda,
          status: "pendente",
        },
      ])
      .select()
      .single();

    if (jobError) throw jobError;

    return { status: "queued", jobId: newJob.id };
  } catch (error) {
    console.error("[Engine] Erro crítico no fluxo de despacho de voos:", error);
    throw error;
  }
}
