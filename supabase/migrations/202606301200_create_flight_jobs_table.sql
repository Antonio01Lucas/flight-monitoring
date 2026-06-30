CREATE TABLE public.flight_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  status text NOT NULL DEFAULT 'pendente', -- pendente, processando, concluido, erro
  origem text NOT NULL,
  destino text NOT NULL,
  data_ida date NOT NULL,
  resultado jsonb, -- aqui salvaremos os preços encontrados
  CONSTRAINT flight_jobs_pkey PRIMARY KEY (id)
);

-- Ativar o Realtime para esta tabela
ALTER PUBLICATION supabase_realtime ADD TABLE public.flight_jobs;