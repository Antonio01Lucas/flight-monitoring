import { NextResponse } from "next/server";

// Estrutura oficial baseada no JSON que você compartilhou
interface SkyscannerAirportItem {
  presentation: {
    title: string;
    suggestionTitle: string;
    subtitle: string;
  };
  navigation: {
    entityId: string;
    entityType: string;
    localizedName: string;
    relevantFlightParams?: {
      skyId: string;
      entityId: string;
      flightPlaceType: string;
      localizedName: string;
    };
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");

  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  try {
    // Montagem exata dos Query Params: query (obrigatório) e locale (opcional, configurado para pt-BR)
    const url = `https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport?query=${encodeURIComponent(query)}&locale=pt-BR`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key":
          process.env.NEXT_PUBLIC_RAPIDAPI_KEY ||
          process.env.RAPIDAPI_KEY ||
          "",
        "x-rapidapi-host": "sky-scrapper.p.rapidapi.com",
      },
      next: { revalidate: 86400 }, // Mantém o cache por 24 horas para poupar sua cota de requisições
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Erro na API externa" },
        { status: res.status },
      );
    }

    const data = await res.json();
    const items: SkyscannerAirportItem[] = data.data || [];

    // Mapeamento aplicando fallbacks seguros caso relevantFlightParams seja undefined (como em CITY)
    const airports = items.map((item) => {
      const flightParams = item.navigation?.relevantFlightParams;

      // Se não houver skyId por ser uma cidade genérica, tentamos extrair do título da sugestão ou usamos o entityId
      const fallbackSkyId =
        item.presentation?.suggestionTitle?.match(/\(([^)]+)\)/)?.[1] ||
        item.navigation?.entityId ||
        "";

      return {
        iata: flightParams?.skyId || fallbackSkyId,
        name:
          item.presentation?.suggestionTitle ||
          item.presentation?.title ||
          item.navigation?.localizedName ||
          "",
        city: item.presentation?.subtitle || "",
        skyId: flightParams?.skyId || fallbackSkyId,
        entityId: flightParams?.entityId || item.navigation?.entityId || "",
      };
    });

    return NextResponse.json(airports);
  } catch (error) {
    console.error("Erro ao buscar aeroportos na API:", error);
    return NextResponse.json([], { status: 500 });
  }
}
