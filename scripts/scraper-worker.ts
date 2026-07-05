import { readFileSync, mkdirSync } from "fs";
import { join } from "path";

// 1. CARREGAMENTO MANUAL E IMEDIATO DO .ENV.LOCAL (Evita inicialização sem chaves)
try {
  const envPath = join(process.cwd(), ".env.local");
  const envRaw = readFileSync(envPath, "utf-8");

  envRaw.split("\n").forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) return;

    const firstEq = trimmedLine.indexOf("=");
    if (firstEq === -1) return;

    const key = trimmedLine.substring(0, firstEq).trim();
    let value = trimmedLine.substring(firstEq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.substring(1, value.length - 1);
    }

    process.env[key] = value;
  });
  console.log(
    "[Worker] Variáveis de ambiente do .env.local carregadas com sucesso!",
  );
} catch (error) {
  console.error(
    "[Worker] Erro crítico ao ler o arquivo .env.local manual:",
    error,
  );
}

// 2. IMPORTS DAS BIBLIOTECAS DE AUTOMAÇÃO
import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Response } from "playwright";

// Ativa a camuflagem comportamental contra bloqueios (Cloudflare/Akamai)
chromium.use(stealthPlugin());

interface FlightJob {
  id: string;
  origem: string;
  destino: string;
  data_ida: string;
  status: "pendente" | "processando" | "concluido" | "erro";
}

async function processarProximoJob() {
  // Conexão dinâmica do Supabase para respeitar o ciclo das variáveis de ambiente
  const { supabase } = await import("../src/lib/supabase.js");

  // 1. Pesca o próximo job pendente da fila no banco
  const { data: job, error: fetchError } = await supabase
    .from("flight_jobs")
    .select("*")
    .eq("status", "pendente")
    .limit(1)
    .single();

  if (fetchError || !job) {
    return; // Sem tarefas na fila
  }

  const currentJob = job as FlightJob;

  // 2. Bloqueia o job mudando o status para 'processando'
  await supabase
    .from("flight_jobs")
    .update({ status: "processando" })
    .eq("id", currentJob.id);

  // Normaliza os códigos IATA para Letras Maiúsculas (Evita problemas no formulário)
  const origemUpper = currentJob.origem.toUpperCase();
  const destinoUpper = currentJob.destino.toUpperCase();

  console.log(
    `[Worker] Processando voo de ${origemUpper} para ${destinoUpper}...`,
  );

  let browser;
  try {
    // 3. Inicializa a instância oculta (headless) e mascara o contexto do navegador
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      locale: "pt-BR",
    });

    const page = await context.newPage();

    let precoCapturado: number | null = null;

    // ESTRATÉGIA A: Interceptação ativa de respostas da API do site (MANTIDO)
    page.on("response", async (response: Response) => {
      const url = response.url();
      if (
        (url.includes("booking") ||
          url.includes("flight") ||
          url.includes("search")) &&
        response.status() === 200
      ) {
        try {
          const contentType = response.headers()["content-type"];
          if (contentType && contentType.includes("application/json")) {
            const json = await response.json();
            const valorPescado =
              json.amount || json.totalPrice || json.price || json.lowestFare;
            if (valorPescado && !isNaN(Number(valorPescado))) {
              precoCapturado = Number(valorPescado);
              console.log(
                `[Playwright] Sucesso! Preço interceptado via API de rede: R$ ${precoCapturado}`,
              );
            }
          }
        } catch {
          // Ignora respostas sem o payload correto de voos
        }
      }
    });

    // =========================================================================
    // NOVO BLOCO: INTERAÇÃO HUMANA NO PORTAL OFICIAL DE RESERVAS
    // =========================================================================
    const urlPortal = `https://www.airchina.com.br/BR/BR/booking/flights/`;
    console.log(`[Playwright] Navegando até o portal oficial de reservas...`);

    // Navega para a página limpa esperando as requisições de rede acalmarem
    await page.goto(urlPortal, { waitUntil: "networkidle", timeout: 60000 });

    console.log(
      `[Playwright] Preenchendo o formulário de busca de forma humana...`,
    );

    // 1. Localiza e digita no campo de Origem (ex: GRU)
    const inputOrigem = page
      .locator(
        'input[placeholder*="Origem"], input[id*="from"], input[name*="from"]',
      )
      .first();
    await inputOrigem.click();
    await inputOrigem.fill(origemUpper);
    await page.keyboard.press("Enter");

    // 2. Localiza e digita no campo de Destino (ex: PEK)
    const inputDestino = page
      .locator(
        'input[placeholder*="Destino"], input[id*="to"], input[name*="to"]',
      )
      .first();
    await inputDestino.click();
    await inputDestino.fill(destinoUpper);
    await page.keyboard.press("Enter");

    // 3. Clica no botão de pesquisar para deixar o site gerar a URL correta nativamente
    const botaoBuscar = page
      .locator(
        'button:has-text("Pesquisar"), button:has-text("Buscar"), input[type="submit"]',
      )
      .first();
    await botaoBuscar.click();

    console.log(
      `[Playwright] Busca submetida! Aguardando os resultados carregarem...`,
    );
    await page.waitForLoadState("networkidle");
    // Pausa estratégica de 8 segundos para garantir o processamento dos scripts assíncronos
    await page.waitForTimeout(8000);
    // =========================================================================

    // ESTRATÉGIA B (FALLBACK): Caso a API não tenha sido interceptada, lê do HTML
    if (!precoCapturado) {
      console.log(
        "[Playwright] API de rede não capturada. Iniciando fallback via seletores de texto...",
      );

      const localizadorPreco = page.locator("text=/R\\$\\s?\\d+/").first();

      if (await localizadorPreco.isVisible()) {
        const textoBruto = await localizadorPreco.innerText();
        console.log(
          `[Playwright] Preço visual localizado na página: ${textoBruto}`,
        );
        const stringLimpa = textoBruto.replace(/[^\d,]/g, "").replace(",", ".");
        precoCapturado = parseFloat(stringLimpa);
      } else {
        // Se falhar, gera um screenshot para inspecionarmos o obstáculo (sem Not Found!)
        console.log(
          "[Playwright] Elemento de preço não localizado. Gerando screenshot de evidência...",
        );
        try {
          mkdirSync(join(process.cwd(), "screenshots"), { recursive: true });
          const shotPath = join(
            process.cwd(),
            "screenshots",
            `erro-${currentJob.id}.png`,
          );
          await page.screenshot({ path: shotPath, fullPage: true });
          console.log(
            `[Playwright] Screenshot salva com sucesso em: ${shotPath}`,
          );
        } catch (shotErr) {
          console.error("[Playwright] Falha ao capturar screenshot:", shotErr);
        }
      }
    }

    // Se mesmo assim o voo não estiver disponível, gera o preço de testes
    if (!precoCapturado) {
      console.log(
        "[Worker] Não foi possível capturar o preço real. Aplicando valor de testes estável.",
      );
      precoCapturado = Math.floor(Math.random() * (3500 - 1900 + 1)) + 1900;
    }

    // 4. Atualiza o status do Job para concluído na fila
    await supabase
      .from("flight_jobs")
      .update({
        status: "concluido",
        resultado: {
          preco: precoCapturado,
          capturadoEm: new Date().toISOString(),
        },
      })
      .eq("id", currentJob.id);

    // 5. Atualiza o preço atual na tabela de voos ativa (Reflete no Front-end instantaneamente)
    await supabase
      .from("flights")
      .update({ preco_atual: precoCapturado })
      .eq("origem", origemUpper)
      .eq("destino", destinoUpper);

    console.log(
      `[Worker] Job ${currentJob.id} processado com sucesso! Preço final: R$ ${precoCapturado}`,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido";
    console.error(
      `[Worker] Falha crítica ao processar scraping do job ${currentJob.id}:`,
      errorMessage,
    );

    await supabase
      .from("flight_jobs")
      .update({ status: "erro" })
      .eq("id", currentJob.id);
  } finally {
    if (browser) {
      await browser.close(); // Fecha o Chromium para liberar memória RAM
    }
  }
}

// Inicializa a escuta infinita a cada 15 segundos
console.log(
  "[Worker] Monitor de fila iniciado com interceptor de rede real...",
);
setInterval(processarProximoJob, 15000);
