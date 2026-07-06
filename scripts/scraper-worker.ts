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
} catch (error) {
  console.error(
    "[Orquestrador] Erro crítico ao ler o arquivo .env.local manual:",
    error,
  );
}

import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Response, Page } from "playwright";

// Importação das estratégias modulares de scraping e API
import { scrapeAirChina } from "../src/lib/scrapers/airchina";
import { scrapeLatam } from "../src/lib/scrapers/latam";
import { scrapeGol } from "../src/lib/scrapers/gol";
import { scrapeAzul } from "../src/lib/scrapers/azul";
import { buscarPrecoOficial } from "../src/lib/SkyScrapper";

chromium.use(stealthPlugin());

interface FlightJob {
  id: string;
  flight_id: string;
  origem: string;
  destino: string;
  data_ida: string;
  status: "pendente" | "processando" | "concluido" | "erro";
  origem_sky_id?: string;
  origem_entity_id?: string;
  destino_sky_id?: string;
  destino_entity_id?: string;
}

const AEROPORTOS_BR = [
  "GRU",
  "CGH",
  "GIG",
  "SDU",
  "BSB",
  "VCP",
  "CNF",
  "CWB",
  "POA",
  "REC",
  "SSA",
  "FOR",
  "GYN",
  "NVT",
  "FLN",
];

// Motor de Contingência Autônomo (Google Flights) Altamente Resiliente
async function scrapeGoogleFlightsFallback(
  origem: string,
  destino: string,
  dataIda: string,
  page: Page,
): Promise<number | null> {
  try {
    const targetUrl = `https://www.google.com/flights?hl=pt-BR#flt=${origem}.${destino}.${dataIda}`;
    console.log(`[Robô Backup] 🌐 Consultando Google Flights: ${targetUrl}`);

    // Aguarda a rede estabilizar para dar tempo ao script de hash do Google carregar os dados
    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 45000 });

    // Pequena folga garantida para que os cards de melhores voos sejam renderizados na interface
    await page.waitForTimeout(3000);

    // Seletor dinâmico que foca nos spans de texto contendo preços válidos na moeda local
    const textPriceSelector = 'span:has-text("R$")';
    await page.waitForSelector(textPriceSelector, { timeout: 20000 });

    // Captura todos os blocos contendo "R$" presentes nos cards reais de passagens
    const precosCapturados = await page.evaluate(() => {
      // Busca em elementos que comumente envelopam preços no Google Flights
      const elementos = Array.from(
        document.querySelectorAll('span, div, [data-gs], [role="link"] span'),
      );
      const valores: number[] = [];

      elementos.forEach((el) => {
        const texto = el.textContent || "";
        if (texto.includes("R$")) {
          // Extrai puramente os dígitos numéricos (ex: "R$ 1.250" vira 1250)
          const limpo = texto.replace(/[^\d]/g, "");
          const num = parseFloat(limpo);

          // Filtra possíveis ruídos de layout (como R$ 0 ou IDs numéricos gigantes de voo)
          if (!isNaN(num) && num > 150 && num < 60000) {
            valores.push(num);
          }
        }
      });

      return valores;
    });

    if (precosCapturados && precosCapturados.length > 0) {
      // Como o Google Flights ordena por "Melhores Voos (Mais baratos)" no topo, o menor valor capturado é a tarifa oficial
      const menorPreco = Math.min(...precosCapturados);
      console.log(
        `[Robô Backup] 🎯 Tarifa extraída do Google Flights: R$ ${menorPreco}`,
      );
      return menorPreco;
    } else {
      console.warn(
        `[Robô Backup] ⚠️ Nenhum padrão monetário "R$" contendo tarifas válidas foi localizado no DOM.`,
      );
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error(
      `[Robô Backup] ❌ Falha no scraping do Google Flights: ${errorMsg}`,
    );
  }
  return null;
}

async function extrairPrecoDeResponse(
  response: Response,
): Promise<number | null> {
  try {
    const url = response.url();
    if (
      url.includes("flight-offers") ||
      url.includes("air-offers") ||
      url.includes("b2c-flights") ||
      url.includes("flight-search") ||
      url.includes("api/v1/search") ||
      url.includes("voeazul") ||
      url.includes("booking/flights")
    ) {
      if (response.status() === 200) {
        const contentType = response.headers()["content-type"];
        if (contentType && contentType.includes("application/json")) {
          const json = await response.json();
          const oferta =
            json.offers?.[0] ||
            json.bundleOffers?.[0] ||
            json.flights?.[0] ||
            json.vendaDireta?.[0];
          const valor =
            oferta?.price?.total?.amount ||
            oferta?.amount ||
            json.amount ||
            json.totalPrice ||
            oferta?.precoMinimo;

          if (valor && !isNaN(Number(valor))) {
            return Number(valor);
          }
        }
      }
    }
  } catch {}
  return null;
}

async function processarProximoJob() {
  const { supabase } = await import("../src/lib/supabase.js");

  const { data: job, error: fetchError } = await supabase
    .from("flight_jobs")
    .select("*")
    .eq("status", "pendente")
    .limit(1)
    .maybeSingle();

  if (fetchError || !job) return;

  const currentJob = job as FlightJob;

  await supabase
    .from("flight_jobs")
    .update({ status: "processando" })
    .eq("id", currentJob.id);

  const origemUpper = currentJob.origem.toUpperCase();
  const destinoUpper = currentJob.destino.toUpperCase();

  console.log(
    `\n[Orquestrador] 🚀 Processando Job ${currentJob.id}: ${origemUpper} ✈ ${destinoUpper}`,
  );

  try {
    const precosEncontrados: number[] = [];
    let precoCapturado: number | null = null;

    if (
      AEROPORTOS_BR.includes(origemUpper) &&
      AEROPORTOS_BR.includes(destinoUpper)
    ) {
      console.log(
        `[Orquestrador] 🏎️ Rota Doméstica: Disparando motores em paralelo...`,
      );

      const tarefas = [
        // LATAM
        (async () => {
          let precoLocal: number | null = null;
          const browserLatam = await chromium.launch({ headless: true });
          const ctx = await browserLatam.newContext({
            userAgent:
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale: "pt-BR",
          });
          ctx.on("response", async (res: Response) => {
            const p = await extrairPrecoDeResponse(res);
            if (p) precoLocal = p;
          });
          const page = await ctx.newPage();
          try {
            const domPreco = await scrapeLatam({
              page,
              origem: origemUpper,
              destino: destinoUpper,
              dataIda: currentJob.data_ida,
            });
            if (domPreco) precoLocal = domPreco;

            if (!precoLocal) {
              precoLocal = await scrapeGoogleFlightsFallback(
                origemUpper,
                destinoUpper,
                currentJob.data_ida,
                page,
              );
            }
          } catch (err) {
            console.error(`[Orquestrador ❌ Falha LATAM]:`, err);
          } finally {
            await browserLatam.close();
          }
          return { cia: "LATAM", preco: precoLocal };
        })(),

        // GOL
        (async () => {
          let precoLocal: number | null = null;
          const browserGol = await chromium.launch({ headless: true });
          const ctx = await browserGol.newContext({
            userAgent:
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale: "pt-BR",
          });
          ctx.on("response", async (res: Response) => {
            const p = await extrairPrecoDeResponse(res);
            if (p) precoLocal = p;
          });
          const page = await ctx.newPage();
          try {
            const domPreco = await scrapeGol({
              page,
              origem: origemUpper,
              destino: destinoUpper,
              dataIda: currentJob.data_ida,
            });
            if (domPreco) precoLocal = domPreco;

            if (!precoLocal) {
              precoLocal = await scrapeGoogleFlightsFallback(
                origemUpper,
                destinoUpper,
                currentJob.data_ida,
                page,
              );
            }
          } catch (err) {
            console.error(`[Orquestrador ❌ Falha GOL]:`, err);
          } finally {
            await browserGol.close();
          }
          return { cia: "GOL", preco: precoLocal };
        })(),

        // AZUL
        (async () => {
          let precoLocal: number | null = null;
          const browserAzul = await chromium.launch({ headless: true });
          const ctx = await browserAzul.newContext({
            userAgent:
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale: "pt-BR",
          });
          ctx.on("response", async (res: Response) => {
            const p = await extrairPrecoDeResponse(res);
            if (p) precoLocal = p;
          });
          const page = await ctx.newPage();
          try {
            const domPreco = await scrapeAzul({
              page,
              origem: origemUpper,
              destino: destinoUpper,
              dataIda: currentJob.data_ida,
            });
            if (domPreco) precoLocal = domPreco;

            if (!precoLocal) {
              precoLocal = await scrapeGoogleFlightsFallback(
                origemUpper,
                destinoUpper,
                currentJob.data_ida,
                page,
              );
            }
          } catch (err) {
            console.error(`[Orquestrador ❌ Falha AZUL]:`, err);
          } finally {
            await browserAzul.close();
          }
          return { cia: "Azul", preco: precoLocal };
        })(),

        // API OFICIAL SKY-SCRAPPER V2
        (async () => {
          let precoLocal: number | null = null;
          try {
            precoLocal = await buscarPrecoOficial({
              origem: currentJob.origem_sky_id || origemUpper,
              destino: currentJob.destino_sky_id || destinoUpper,
              dataIda: currentJob.data_ida,
              origemEntityId: currentJob.origem_entity_id,
              destinoEntityId: currentJob.destino_entity_id,
            });
          } catch (err) {
            console.error(`[Orquestrador ❌ Falha API Skyscanner V2]:`, err);
          }
          return { cia: "API_Skyscanner", preco: precoLocal };
        })(),
      ];

      const resultados = await Promise.allSettled(tarefas);

      resultados.forEach((res) => {
        if (res.status === "fulfilled" && res.value.preco) {
          console.log(
            `[Comparador] Valor retornado por [${res.value.cia}]: R$ ${res.value.preco}`,
          );
          precosEncontrados.push(res.value.preco);
        }
      });

      if (precosEncontrados.length > 0) {
        precoCapturado = Math.min(...precosEncontrados);
        console.log(
          `[Orquestrador] 🏆 Menor tarifa encontrada: R$ ${precoCapturado}`,
        );
      }
    } else {
      console.log(`[Orquestrador] Rota Internacional. Iniciando Air China...`);
      const browserInternacional = await chromium.launch({ headless: true });
      const ctx = await browserInternacional.newContext({ locale: "pt-BR" });
      const page = await ctx.newPage();
      try {
        const resAirChina = await scrapeAirChina({
          page,
          origem: origemUpper,
          destino: destinoUpper,
          dataIda: currentJob.data_ida,
        });
        if (resAirChina) precoCapturado = resAirChina;

        if (!precoCapturado) {
          precoCapturado = await scrapeGoogleFlightsFallback(
            origemUpper,
            destinoUpper,
            currentJob.data_ida,
            page,
          );
        }
      } catch (Brass) {
        console.error(`[Orquestrador ❌ Falha Air China / Fallback]:`, Brass);
      } finally {
        await browserInternacional.close();
      }
    }

    if (precoCapturado) {
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

      if (currentJob.flight_id) {
        const { error: updateError } = await supabase
          .from("flights")
          .update({ preco_atual: precoCapturado })
          .eq("id", currentJob.flight_id);

        if (updateError) {
          console.error(
            `[Orquestrador] ❌ Erro ao atualizar a tabela flights:`,
            updateError.message,
          );
        } else {
          console.log(
            `[Orquestrador] 🎉 Sucesso absoluto! Card [${currentJob.flight_id}] sincronizado com R$ ${precoCapturado}`,
          );
        }
      } else {
        console.warn(
          `[Orquestrador] ⚠️ Job processado, mas a coluna flight_id estava vazia neste registro.`,
        );
      }
    } else {
      await supabase
        .from("flight_jobs")
        .update({ status: "erro" })
        .eq("id", currentJob.id);
      console.log(`[Orquestrador] X Fim da linha. Nenhuma tarifa localizada.`);
    }
  } catch (error) {
    console.error(`[Orquestrador] Falha fatal no job ${currentJob.id}:`, error);
    await supabase
      .from("flight_jobs")
      .update({ status: "erro" })
      .eq("id", currentJob.id);
  } finally {
    console.log(
      "[Orquestrador] Aguardando 15 segundos antes de checar a fila...",
    );
    setTimeout(checarFilaSegura, 15000);
  }
}

async function checarFilaSegura() {
  await processarProximoJob();
}

console.log(
  "[Orquestrador] Monitor Híbrido Paralelo Total com SkyScrapper V2 Ligado!",
);
checarFilaSegura();
