import assert from "node:assert/strict";
import pg from "pg";

const connectionString =
  process.env.LOCAL_DATABASE_URL ?? process.env.LOCAL_POSTGRES_URL;
if (!connectionString) throw new Error("LOCAL_DATABASE_URL or LOCAL_POSTGRES_URL is required");

const pool = new pg.Pool({ connectionString });
try {
  const historical = await pool.query(`
    SELECT period, channel, vat_rate, tx_count, gross_total, net_total, vat_total
    FROM public.vw_monthly_vat
    WHERE period IN ('2026-01', '2026-02', '2026-03')
      AND channel IN ('shopify_webshop', 'shopify_winkel')
    ORDER BY period, channel, vat_rate
  `);

  for (const period of ["2026-01", "2026-02", "2026-03"]) {
    for (const channel of ["shopify_webshop", "shopify_winkel"]) {
      const rows = historical.rows.filter(
        (row) => row.period === period && row.channel === channel,
      );
      assert(rows.length > 0, `Missing historical VAT rows for ${period} ${channel}`);
      assert(
        rows.some((row) => Number(row.net_total) > 0),
        `Historical VAT is still zero for ${period} ${channel}`,
      );
    }
  }

  const reconciliation = await pool.query(`
    WITH vat AS (
      SELECT period, channel, sum(net_total) AS net, sum(vat_total) AS vat, sum(gross_total) AS gross
      FROM public.vw_monthly_vat
      WHERE period IN ('2026-01', '2026-02', '2026-03')
        AND channel IN ('shopify_webshop', 'shopify_winkel')
      GROUP BY 1, 2
    )
    SELECT
      c.period,
      c.channel,
      abs(c.net_total - v.net) AS net_difference,
      abs(c.vat_total - v.vat) AS vat_difference,
      abs(c.gross_total - v.gross) AS gross_difference
    FROM public.vw_monthly_channel c
    JOIN vat v USING (period, channel)
  `);

  for (const row of reconciliation.rows) {
    assert(Number(row.net_difference) < 0.01, `Net mismatch for ${row.period} ${row.channel}`);
    assert(Number(row.vat_difference) < 0.01, `VAT mismatch for ${row.period} ${row.channel}`);
    assert(Number(row.gross_difference) < 0.01, `Gross mismatch for ${row.period} ${row.channel}`);
  }

  const aprilView = await pool.query(`
    SELECT channel, vat_rate, tx_count, gross_total, net_total, vat_total
    FROM public.vw_monthly_vat
    WHERE period = '2026-04'
      AND channel IN ('shopify_webshop', 'shopify_winkel')
    ORDER BY channel, vat_rate
  `);
  const aprilTransactions = await pool.query(`
    SELECT
      channel,
      vat_rate,
      count(*)::int AS tx_count,
      sum(amount_gross) AS gross_total,
      sum(COALESCE(amount_net, amount_gross - COALESCE(vat_amount, 0), 0)) AS net_total,
      sum(vat_amount) AS vat_total
    FROM public.transactions
    WHERE status = 'paid'
      AND parse_status = 'ok'
      AND include_in_revenue
      AND vat_rate IS NOT NULL
      AND paid_at >= '2026-04-01 00:00:00 Europe/Amsterdam'::timestamptz
      AND paid_at < '2026-05-01 00:00:00 Europe/Amsterdam'::timestamptz
      AND channel IN ('shopify_webshop', 'shopify_winkel')
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);
  assert.deepEqual(aprilView.rows, aprilTransactions.rows, "April was double counted or replaced");

  console.log(
    `Historical Shopify VAT verified: ${historical.rowCount} rate rows, ` +
      `${reconciliation.rowCount} reconciled month/channel totals; April remains transaction-backed.`,
  );
} finally {
  await pool.end();
}
