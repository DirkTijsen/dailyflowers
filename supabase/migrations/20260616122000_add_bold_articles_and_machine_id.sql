ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS machine_id text;

CREATE UNIQUE INDEX IF NOT EXISTS machines_machine_id_unique
  ON public.machines (machine_id)
  WHERE machine_id IS NOT NULL AND machine_id <> '';

CREATE TABLE IF NOT EXISTS public.bold_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_number text NOT NULL UNIQUE,
  product_name text NOT NULL,
  price_gross numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2),
  active boolean NOT NULL DEFAULT true,
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bold_articles TO authenticated;
GRANT ALL ON public.bold_articles TO service_role;

ALTER TABLE public.bold_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bold_articles_select_auth" ON public.bold_articles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "bold_articles_write_auth" ON public.bold_articles
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS trg_bold_articles_updated_at ON public.bold_articles;
CREATE TRIGGER trg_bold_articles_updated_at
  BEFORE UPDATE ON public.bold_articles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
