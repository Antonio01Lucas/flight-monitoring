import type { Page } from "playwright";

interface ScraperParams {
  page: Page;
  origem: string;
  destino: string;
  dataIda: string;
}

export async function scrapeGol({
  page,
  origem,
  destino,
}: ScraperParams): Promise<number | null> {
  console.log(`[GOL] Abrindo home para simulação: ${origem} -> ${destino}`);

  try {
    // 1. Entra na Home oficial para gerar a sessão de cookies válidos
    await page.goto("https://www.voegol.com.br", {
      waitUntil: "load",
      timeout: 50000,
    });
    await page.waitForTimeout(4000);

    // 2. Preenche a Origem e força o clique na sugestão
    const inputOrigem = page
      .locator('input[id*="origin"], input[placeholder*="Origem"]')
      .first();
    if (await inputOrigem.isVisible()) {
      await inputOrigem.click();
      await page.keyboard.type(origem, { delay: 150 });
      await page.waitForTimeout(2000);

      // Mira no elemento de sugestão que aparece flutuando na tela
      const sugestaoOrigem = page
        .locator('ul[role="listbox"] li, [role="option"], .m-list-cta__item')
        .first();
      if (await sugestaoOrigem.isVisible()) {
        await sugestaoOrigem.click();
      } else {
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
      }
      await page.waitForTimeout(1000);
    }

    // 3. Preenche o Destino e força o clique na sugestão
    const inputDestino = page
      .locator('input[id*="destination"], input[placeholder*="Destino"]')
      .first();
    if (await inputDestino.isVisible()) {
      await inputDestino.click();
      await page.keyboard.type(destino, { delay: 150 });
      await page.waitForTimeout(2000);

      const s集中Destino = page
        .locator('ul[role="listbox"] li, [role="option"], .m-list-cta__item')
        .first();
      if (await s集中Destino.isVisible()) {
        await s集中Destino.click();
      } else {
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
      }
      await page.waitForTimeout(1000);
    }

    // 4. Dispara a submissão nativa focando estritamente no botão de busca e ignorando modais internos
    console.log(`[GOL] Enviando formulário de busca principal...`);

    // O seletor :not(.gol-apply-button) garante que o robô nunca vai tentar clicar no botão "Aplicar"
    const btnBuscar = page
      .locator(
        'button[type="submit"]:not(.gol-apply-button):has-text("Buscar"), button[data-testid*="search"]:not(.gol-apply-button)',
      )
      .first();

    // Forçamos o clique contornando overlays de publicidade
    await btnBuscar.click({ force: true });

    // Aguarda o disparo e transição de tela
    await page.waitForTimeout(12000);
  } catch (err) {
    console.error("[GOL] Falha ao injetar dados na automação visual:", err);
  }

  return null;
}
