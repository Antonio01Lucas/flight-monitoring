import type { Page } from "playwright";

interface ScraperParams {
  page: Page;
  origem: string;
  destino: string;
  dataIda: string; // Mantido no tipo para respeitar o contrato do Maestro
}

export async function scrapeAirChina({
  page,
  origem,
  destino,
}: ScraperParams): Promise<number | null> {
  console.log(
    `[Air China] Iniciando automação de formulário para rota internacional: ${origem} -> ${destino}`,
  );

  const urlPortal = `https://www.airchina.com.br/BR/BR/booking/flights/`;

  try {
    await page.goto(urlPortal, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(3000);

    // 1. Preenche a Origem
    const inputOrigem = page
      .locator(
        'input[placeholder*="Origem"], input[id*="from"], input[name*="from"]',
      )
      .first();
    await inputOrigem.click();
    await inputOrigem.fill(origem);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    // 2. Preenche o Destino
    const inputDestino = page
      .locator(
        'input[placeholder*="Destino"], input[id*="to"], input[name*="to"]',
      )
      .first();
    await inputDestino.click();
    await inputDestino.fill(destino);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    // 3. Submete o formulário
    console.log(`[Air China] Disparando pesquisa...`);
    const botaoBuscar = page
      .locator(
        'button:has-text("Pesquisar"), button:has-text("Buscar"), input[type="submit"]',
      )
      .first();
    await botaoBuscar.click();

    // Janela de tempo dedicada para os scripts da companhia e o interceptor mapearem o JSON
    await page.waitForTimeout(12000);
  } catch (err) {
    console.error("[Air China] Erro durante a automação do portal:", err);
  }

  return null;
}
