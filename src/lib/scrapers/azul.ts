import type { Page } from "playwright";

interface ScraperParams {
  page: Page;
  origem: string;
  destino: string;
  dataIda: string;
}

export async function scrapeAzul({
  page,
  origem,
  destino,
  dataIda,
}: ScraperParams): Promise<number | null> {
  console.log(
    `[AZUL] Iniciando busca direta para o trecho: ${origem} -> ${destino}`,
  );

  // Ajuste de URL para o padrão atualizado de SPA da Azul (evita o Erro 404)
  const urlAzul = `https://www.voeazul.com.br/br/pt/botoes/resultado-pesquisa?origem=${origem}&destino=${destino}&dataIda1=${dataIda}&somenteIda=true&adultos=1&criancas=0&bebes=0`;

  try {
    await page.goto(urlAzul, { waitUntil: "load", timeout: 50000 });
    console.log(
      `[AZUL] Aguardando a carga dos pacotes de tarifas assíncronos...`,
    );
    await page.waitForTimeout(14000);
  } catch (err) {
    console.error("[AZUL] Erro controlado durante navegação:", err);
  }

  return null;
}
