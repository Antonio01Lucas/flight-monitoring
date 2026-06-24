# ✈️ Flight Monitoring App

Um sistema automatizado de monitoramento de passagens aéreas construído para rastrear as melhores oportunidades de voos, focado em precisão, resiliência e alertas de preços alvo.

O objetivo primário deste projeto é monitorar rotas do Brasil (GIG/GRU) para a Itália (MXP/FCO) e encontrar passagens dentro do orçamento estipulado.

---

## 🚀 Arquitetura Técnica

O projeto utiliza uma stack moderna e serverless, garantindo alta performance e automação em segundo plano sem a necessidade de manter servidores ligados 24/7.

- **Frontend & Backend:** Next.js (App Router)
- **Banco de Dados & Autenticação:** Supabase (PostgreSQL + Row Level Security)
- **Hospedagem & Automação:** Vercel (Hospedagem + Vercel Cron Jobs)
- **Estilização:** Tailwind CSS
- **Integração de Dados:** API de Agregadores de Voos (ex: Tequila by Kiwi / Amadeus)
- **Notificações:** Resend (Disparo de e-mails transacionais)

---

## ⚙️ Funcionalidades Principais

- **Painel de Bordo (Dashboard):** Visualização em cards de todas as rotas monitoradas.
- **Rastreio Duplo:** Suporte para monitorar hubs diferentes simultaneamente (ex: Rio de Janeiro e São Paulo para o mesmo destino).
- **Automação Silenciosa (Cron Jobs):** Varreduras diárias automáticas de madrugada para atualizar o menor preço encontrado em cada rota.
- **Alerta por E-mail:** Disparo instantâneo de notificação para a caixa de entrada do usuário assim que o sistema detectar que uma passagem atingiu o Preço Alvo.
- **Indicador de Meta:** Destaque visual (verde) imediato na interface quando o preço atual da passagem for menor ou igual ao Preço Alvo.
- **Resiliência a Falhas:** Sistema de Try/Catch isolado por rota, garantindo que o bloqueio temporário de uma pesquisa não derrube toda a fila de atualização.

---

## 🗄️ Estrutura do Banco de Dados

A tabela principal `flights` no Supabase foi modelada para armazenar todas as informações cruciais para a tomada de decisão rápida.

| Coluna            | Tipo      | Descrição                                                     |
| :---------------- | :-------- | :------------------------------------------------------------ |
| `id`              | UUID      | Identificador único do card de monitoramento                  |
| `created_at`      | Timestamp | Data de criação do registro                                   |
| `origem`          | Text      | Código IATA do aeroporto de partida (ex: GIG, GRU)            |
| `destino`         | Text      | Código IATA do aeroporto de chegada (ex: MXP, FCO)            |
| `data_ida`        | Date      | Data programada para o voo de ida                             |
| `data_volta`      | Date      | Data programada para o voo de regresso                        |
| `preco_atual`     | Numeric   | Menor preço total encontrado na última varredura (R$)         |
| `preco_alvo`      | Numeric   | Preço máximo aceitável definido pelo usuário (R$)             |
| `conexoes_ida`    | Integer   | Quantidade de paradas/escalas no voo de ida                   |
| `conexoes_volta`  | Integer   | Quantidade de paradas/escalas no voo de volta                 |
| `companhia_aerea` | Text      | Nome da companhia aérea operando a rota principal             |
| `link_compra`     | Text      | URL direta para facilitar o checkout em caso de meta atingida |
| `user_id`         | UUID      | Relacionamento com o usuário dono do registro (Segurança RLS) |

---

## 🛠️ Como Executar o Projeto Localmente

1. Clone este repositório.
2. Instale as dependências executando `npm install`.
3. Preencha o arquivo `.env.local` com as chaves do Supabase e da API de voos.
4. Inicie o servidor de desenvolvimento com `npm run dev`.
5. Acesse `http://localhost:3000` no navegador.
