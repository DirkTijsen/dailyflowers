
ALTER VIEW public.vw_monthly_channel SET (security_invoker = true);
ALTER VIEW public.vw_monthly_machine SET (security_invoker = true);
ALTER VIEW public.vw_monthly_vat SET (security_invoker = true);

DROP POLICY "machines_all_auth" ON public.machines;
DROP POLICY "vat_rates_all_auth" ON public.vat_rates;
DROP POLICY "tx_all_auth" ON public.transactions;
DROP POLICY "budgets_all_auth" ON public.budgets;
DROP POLICY "sync_all_auth" ON public.sync_state;

CREATE POLICY "machines_write_auth" ON public.machines FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "vat_rates_write_auth" ON public.vat_rates FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "tx_write_auth" ON public.transactions FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "budgets_write_auth" ON public.budgets FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sync_write_auth" ON public.sync_state FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
