export interface AirportSuggestion {
  skyId: string;
  entityId: string;
  presentation: {
    title: string;
    suggestionTitle: string;
    subtitle: string;
  };
}

interface SkyScrapperAirportItem {
  skyId: string;
  entityId: string;
  presentation?: {
    title?: string;
    suggestionTitle?: string;
    subtitle?: string;
  };
}

interface FlightParams {
  origem: string;
  destino: string;
  dataIda: string;
  origemEntityId?: string;
  destinoEntityId?: string;
}

const RAPIDAPI_HOST = "sky-scrapper.p.rapidapi.com";

/**
 * 1. ENDPOINT DE PREDIÇÃO (AUTOCOMPLETE)
 */
export async function buscarAeroportosPorTexto(
  query: string,
): Promise<AirportSuggestion[]> {
  const rapidApiKey =
    process.env.NEXT_PUBLIC_RAPIDAPI_KEY || process.env.RAPIDAPI_KEY;

  if (!query || query.length < 2) return [];
  if (!rapidApiKey) {
    console.error("[API Autocomplete] Erro: Chave da RapidAPI não encontrada.");
    return [];
  }

  try {
    const url = `https://${RAPIDAPI_HOST}/api/v1/flights/searchAirport?query=${encodeURIComponent(query)}&locale=pt-BR`;

    // Proteção estrita contra undefined ou nulo antes do replace
    const cleanKey = (rapidApiKey || "").replace(/[\r\n\s]/g, "");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": cleanKey,
        "x-rapidapi-host": RAPIDAPI_HOST,
      },
    });

    if (!response.ok) return [];

    const json = await response.json();

    if (json.status && json.data) {
      return json.data.map((item: SkyScrapperAirportItem) => ({
        skyId: item.skyId || "",
        entityId: item.entityId || "",
        presentation: {
          title: item.presentation?.title || "",
          suggestionTitle: item.presentation?.suggestionTitle || "",
          subtitle: item.presentation?.subtitle || "",
        },
      }));
    }
  } catch (error) {
    console.error(
      "[API Autocomplete] Erro ao buscar predição de aeroportos:",
      error,
    );
  }
  return [];
}

/**
 * 2. ENDPOINT DE BUSCA DE VOOS V2
 */
export async function buscarPrecoOficial({
  origem,
  destino,
  dataIda,
  origemEntityId,
  destinoEntityId,
}: FlightParams): Promise<number | null> {
  const rapidApiKey = process.env.RAPIDAPI_KEY;

  if (!rapidApiKey) {
    console.error(
      "[API Skyscanner V2] Erro: RAPIDAPI_KEY não configurada no .env.local",
    );
    return null;
  }

  const FALLBACK_ENTITIES: Record<string, string> = {
    SDU: "27539793",
    CGH: "27544008",
    GRU: "27544008",
    GIG: "27539793",
    BSB: "27536647",
    VCP: "27541170",
    CNF: "27536979",
    CWB: "27537617",
    POA: "27541484",
    REC: "27542735",
    SSA: "27543085",
    FOR: "27538562",
  };

  try {
    const oUpper = (origem || "").toUpperCase();
    const dUpper = (destino || "").toUpperCase();

    const finalOriginEntityId =
      origemEntityId || FALLBACK_ENTITIES[oUpper] || "27539793";
    const finalDestinEntityId =
      destinoEntityId || FALLBACK_ENTITIES[dUpper] || "27544008";

    const originSkyId = oUpper.includes("-sky") ? oUpper : `${oUpper}-sky`;
    const destinationSkyId = dUpper.includes("-sky") ? dUpper : `${dUpper}-sky`;

    const url = `https://${RAPIDAPI_HOST}/api/v2/flights/searchFlights?originSkyId=${originSkyId}&destinationSkyId=${destinationSkyId}&originEntityId=${finalOriginEntityId}&destinationEntityId=${finalDestinEntityId}&date=${dataIda}&cabinClass=economy&adults=1&sortBy=best&currency=BRL&market=en-US&countryCode=US`;

    console.log(`[API Skyscanner V2] Requisitando URL: ${url}`);

    // Proteção contra caracteres invisíveis ou undefined no process.env do script executado isoladamente
    const cleanKey = (rapidApiKey || "").replace(/[\r\n\s]/g, "");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": cleanKey,
        "x-rapidapi-host": RAPIDAPI_HOST,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 403) {
      console.error(
        `[API Skyscanner V2] Erro 403 persistente: Gateway rejeitou as credenciais enviadas.`,
      );
      return null;
    }

    if (!response.ok) {
      console.error(
        `[API Skyscanner V2] Provedor retornou código de erro: ${response.status}`,
      );
      return null;
    }

    const json = await response.json();

    if (json.status && json.data) {
      const itineraries = json.data.itineraries;
      const primeiroVoo = itineraries?.[0];

      const precoTotal =
        primeiroVoo?.price?.raw ||
        json.data.filterStats?.stopPrices?.one?.rawPrice;

      if (precoTotal) {
        const precoNum = Number(precoTotal);
        console.log(
          `[API Skyscanner V2] 🎉 Sucesso absoluto! Preço de mercado obtido: R$ ${precoNum}`,
        );
        return precoNum;
      }
    }

    console.log(
      `[API Skyscanner V2] Resposta recebida, mas nenhuma tarifa foi encontrada.`,
    );
  } catch (error) {
    console.error(
      "[API Skyscanner V2] Falha crítica de conexão HTTP com o hub RapidAPI:",
      error,
    );
  }

  return null;
}
