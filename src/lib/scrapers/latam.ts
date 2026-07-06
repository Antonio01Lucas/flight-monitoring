import type { Page } from "playwright";

interface ScraperParams {
  page: Page;
  origem: string;
  destino: string;
  dataIda: string;
}

export async function scrapeLatam({
  page,
  origem,
  destino,
  dataIda,
}: ScraperParams): Promise<number | null> {
  console.log(
    `[LATAM] Abrindo portal de ofertas para o trecho: ${origem} -> ${destino}`,
  );

  const urlDirect = `https://www.latamairlines.com/br/pt/voos/index.html?origin=${origem}&outbound=${dataIda}&destination=${destino}&flightCode=&adt=1&chd=0&inf=0&cabin=Economy&trip=OW`;

  try {
    await page.goto(urlDirect, { waitUntil: "load", timeout: 50000 });
    console.log(
      `[LATAM] Aguardando carregamento dos cartões de preço na tela...`,
    );

    // Tempo confortável para os cartões montarem seu HTML reativo
    await page.waitForTimeout(14000);

    // Dom Scraping de Segurança (Caso a API de rede venha mascarada)
    const seletorPreco = page
      .locator(
        'span[class*="PriceAmount"], .display-value, span[class*="price"]',
      )
      .first();
    if (await seletorPreco.isVisible()) {
      const textoPreco = await seletorPreco.innerText();
      const apenasNumeros = textoPreco.replace(/[^\d,]/g, "").replace(",", ".");
      const valorScrapado = parseFloat(apenasNumeros);

      if (valorScrapado && !isNaN(valorScrapado)) {
        console.log(
          `[LATAM] 🎯 Sucesso via DOM Scraping! Preço extraído da tela: R$ ${valorScrapado}`,
        );
        return valorScrapado;
      }
    }
  } catch (err) {
    console.error("[LATAM] Erro controlado durante varredura:", err);
  }

  return null;
}
