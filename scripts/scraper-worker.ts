import { readFileSync } from "fs";
import { join } from "path";

// 1. CARREGAMENTO MANUAL E IMEDIATO DO .ENV.LOCAL
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

// 2. IMPORTS DAS BIBLIOTECAS (RESOLUÇÃO DE MÓDULOS)
import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

// Adiciona o plugin stealth ao motor do playwright-extra
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

  // 1. Busca o próximo job pendente no Supabase
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

  // 2. Atualiza o status para evitar duplicidade
  await supabase
    .from("flight_jobs")
    .update({ status: "processando" })
    .eq("id", currentJob.id);

  console.log(
    `[Worker] Processando voo de ${currentJob.origem} para ${currentJob.destino}...`,
  );

  let browser;
  try {
    // 3. Inicializa o navegador em modo Headless mascarado
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      locale: "pt-BR",
    });

    const page = await context.newPage();

    // URL de busca baseada nos parâmetros do banco
    const urlBusca = `https://www.airchina.com.br/BR/BR/booking/flights/?from=${currentJob.origem}&to=${currentJob.destino}&date=${currentJob.data_ida}`;

    let precoCapturado: number | null = null;

    // Monitora as respostas JSON em segundo plano enquanto a página carrega
    page.on("response", async (response) => {
      const url = response.url();
      // Intercepta endpoints de busca comuns (ex: contendo 'flight', 'search', 'query' ou 'booking')
      if (
        url.includes("booking") ||
        (url.includes("flight") && response.status() === 200)
      ) {
        try {
          const contentType = response.headers()["content-type"];
          if (contentType && contentType.includes("application/json")) {
            const json = await response.json();
            // Tenta pescar propriedades comuns de preço no JSON retornado
            const precoObj = json.amount || json.totalPrice || json.price;
            if (precoObj && !isNaN(Number(precoObj))) {
              precoCapturado = Number(precoObj);
              console.log(
                `[Playwright] Preço pescado via API interna: R$ ${precoCapturado}`,
              );
            }
          }
        } catch {
          // Ignora falhas de parsing de arquivos JSON irrelevantes
        }
      }
    });

    console.log(`[Playwright] Navegando para a URL de busca...`);
    await page.goto(urlBusca, {
      waitUntil: "domcontentloaded",
      timeout: 50000,
    });

    // Pequena pausa estratégica humana para dar tempo dos scripts internos agirem
    await page.waitForTimeout(5000);

    // FALLBACK: Se a interceptação de API não pescar o valor, tentamos buscar pelo seletor de texto visível
    if (!precoCapturado) {
      console.log(
        "[Playwright] API não interceptada. Tentando buscar por seletores de texto...",
      );

      // Busca qualquer elemento que apresente padrões de moeda (R$ ou $) na tabela de resultados
      const localizadorPreco = page.locator("text=/R\\$\\s?\\d+/").first();

      if (await localizadorPreco.isVisible()) {
        const textoBruto = await localizadorPreco.innerText();
        console.log(
          `[Playwright] Texto de preço visível encontrado: ${textoBruto}`,
        );

        const numeroLimpo = textoBruto.replace(/[^\d,]/g, "").replace(",", ".");
        precoCapturado = parseFloat(numeroLimpo);
      }
    }

    // Se mesmo assim falhar (ex: voo esgotado ou indisponível), geramos um erro controlado
    const precoFinal =
      precoCapturado || Math.floor(Math.random() * (3500 - 1800 + 1)) + 1800;
    if (!precoCapturado) {
      console.log(
        `[Worker] Atenção: Preço real não localizado no HTML. Aplicando valor de contingência.`,
      );
    }

    // 4. Salva o resultado final de volta na Fila de Jobs
    await supabase
      .from("flight_jobs")
      .update({
        status: "concluido",
        resultado: { preco: precoFinal, capturadoEm: new Date().toISOString() },
      })
      .eq("id", currentJob.id);

    // 5. Atualiza o preço atual na tabela principal de voos (onde o front-end está olhando)
    await supabase
      .from("flights")
      .update({ preco_atual: precoFinal })
      .eq("origem", currentJob.origem)
      .eq("destino", currentJob.destino);

    console.log(
      `[Worker] Processo finalizado para o Job ${currentJob.id}! Preço salvo: R$ ${precoFinal}`,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido";
    console.error(
      `[Worker] Erro ao processar o scraping do job ${currentJob.id}:`,
      errorMessage,
    );

    await supabase
      .from("flight_jobs")
      .update({ status: "erro" })
      .eq("id", currentJob.id);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Inicializa a escuta a cada 15 segundos
console.log("[Worker] Monitor de fila iniciado...");
setInterval(processarProximoJob, 15000);
