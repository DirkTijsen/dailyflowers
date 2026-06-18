import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";
import pg from "pg";
import {
  markSweepRunning,
  processMollieWebhook,
  processShopifyWebhook,
  runShopifyCashSweepFrom,
  runExactSweepFrom,
  runMollieSalesInvoicesSweepFrom,
  runShopifyPaymentsSweepFrom,
  runShopifySweep,
  runSweep,
} from "./sync.mjs";

const { Pool } = pg;

loadDotEnv(path.resolve(process.cwd(), ".env"));

const port = Number(process.env.PORT ?? process.env.LOCAL_SUPABASE_PORT ?? 54321);
const host =
  process.env.HOST ??
  process.env.LOCAL_SUPABASE_HOST ??
  (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const hostedRuntime = isHostedRuntime();
const databaseUrl =
  process.env.LOCAL_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/daily_flowers_local";
const jwtSecret = process.env.LOCAL_JWT_SECRET ?? "daily-flowers-local-jwt-secret-change-me";
const tokenTtlSeconds = Number(process.env.LOCAL_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 7);
const exactRunningStaleMinutes = Number(process.env.EXACT_RUNNING_STALE_MINUTES ?? 5);
const AFS_INVOICE_CC_EMAIL = "orders@dailyflowers.nl";
const pool = new Pool({ connectionString: databaseUrl });
const staticRoot = path.resolve(process.cwd(), "dist", "client");
const builtServerEntry = path.resolve(process.cwd(), "dist", "server", "server.js");
let builtAppServerPromise;
let cachedDailyFlowersLogoPdfImage;

const resources = {
  budgets: {
    table: "public.budgets",
    columns: ["id", "channel", "machine_id", "period", "amount", "created_at", "updated_at"],
    writable: true,
  },
  bold_articles: {
    table: "public.bold_articles",
    columns: [
      "id",
      "article_number",
      "product_name",
      "price_gross",
      "vat_rate",
      "active",
      "category",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  gl_accounts: {
    table: "public.gl_accounts",
    columns: [
      "id",
      "account_code",
      "account_name",
      "account_type",
      "statement_type",
      "debit_credit",
      "classification",
      "pl_section",
      "revenue_channel",
      "sort_order",
      "active",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  gl_transactions: {
    table: "public.gl_transactions",
    columns: [
      "id",
      "source",
      "external_id",
      "transaction_date",
      "account_id",
      "account_code",
      "description",
      "relation_name",
      "document_number",
      "amount",
      "debit_amount",
      "credit_amount",
      "import_batch_id",
      "raw_payload",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  pl_settings: {
    table: "public.pl_settings",
    columns: ["id", "revenue_cutoff_quarter", "created_at", "updated_at"],
    writable: true,
  },
  pl_budget_lines: {
    table: "public.pl_budget_lines",
    columns: [
      "id",
      "period",
      "budget_year",
      "section",
      "line_key",
      "line_label",
      "kind",
      "amount",
      "source_workbook",
      "source_sheet",
      "source_label",
      "sort_order",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  machines: {
    table: "public.machines",
    columns: [
      "id",
      "afs_number",
      "machine_id",
      "display_name",
      "active",
      "notes",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  afs_landlords: {
    table: "public.afs_landlords",
    columns: [
      "id",
      "name",
      "invoice_name",
      "email",
      "phone",
      "address_line1",
      "postal_code",
      "city",
      "country",
      "kvk_number",
      "vat_number",
      "iban",
      "notes",
      "active",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  afs_rental_agreements: {
    table: "public.afs_rental_agreements",
    columns: [
      "id",
      "machine_id",
      "landlord_id",
      "start_period",
      "end_period",
      "fixed_fee_net",
      "turnover_rate_percent",
      "turnover_threshold_net",
      "invoice_vat_rate",
      "invoice_reference",
      "status",
      "notes",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  afs_rental_invoices: {
    table: "public.afs_rental_invoices",
    columns: [
      "id",
      "period",
      "machine_id",
      "agreement_id",
      "landlord_id",
      "invoice_number",
      "invoice_date",
      "due_date",
      "turnover_net",
      "fixed_fee_net",
      "turnover_rate_percent",
      "turnover_threshold_net",
      "variable_fee_net",
      "subtotal_net",
      "vat_rate",
      "vat_amount",
      "total_gross",
      "status",
      "notes",
      "sent_at",
      "email_to",
      "email_subject",
      "email_last_error",
      "email_status",
      "queued_at",
      "sending_started_at",
      "email_body",
      "email_provider",
      "email_provider_message_id",
      "email_attempts",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  shopify_connections: {
    table: "public.shopify_connections",
    columns: [
      "id",
      "label",
      "shop_domain",
      "client_id",
      "access_token",
      "active",
      "last_synced_at",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  shopify_order_summaries: {
    table: "public.shopify_order_summaries",
    columns: [
      "id",
      "external_id",
      "order_name",
      "order_number",
      "source_name",
      "channel",
      "financial_status",
      "customer_id",
      "customer_name",
      "customer_email",
      "customer_phone",
      "customer_company",
      "processed_at",
      "created_at_shopify",
      "updated_at_shopify",
      "taxes_included",
      "line_original_total",
      "line_discounted_total",
      "line_discount_total",
      "line_tax_total",
      "subtotal_price",
      "current_subtotal_price",
      "total_discounts",
      "current_total_discounts",
      "total_shipping",
      "total_tax",
      "current_total_tax",
      "total_price",
      "current_total_price",
      "total_refunded",
      "net_payment",
      "raw_payload",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  shopify_payment_payouts: {
    table: "public.shopify_payment_payouts",
    columns: [
      "id",
      "connection_id",
      "shop_domain",
      "payout_id",
      "status",
      "payout_date",
      "currency",
      "amount",
      "charges_gross_amount",
      "charges_fee_amount",
      "refunds_gross_amount",
      "refunds_fee_amount",
      "adjustments_gross_amount",
      "adjustments_fee_amount",
      "reserved_funds_gross_amount",
      "reserved_funds_fee_amount",
      "retried_payouts_gross_amount",
      "retried_payouts_fee_amount",
      "external_trace_id",
      "raw_payload",
      "synced_at",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  shopify_payment_balance_transactions: {
    table: "public.shopify_payment_balance_transactions",
    columns: [
      "id",
      "connection_id",
      "shop_domain",
      "balance_transaction_id",
      "payout_id",
      "type",
      "test",
      "payout_status",
      "currency",
      "amount",
      "fee",
      "net",
      "source_id",
      "source_type",
      "source_order_id",
      "source_order_transaction_id",
      "processed_at",
      "order_name",
      "checkout_id",
      "payment_method_name",
      "card_brand",
      "card_source",
      "available_on",
      "presentment_amount",
      "presentment_currency",
      "vat_amount",
      "import_source",
      "import_batch_id",
      "raw_payload",
      "synced_at",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  shopify_cash_sessions: {
    table: "public.shopify_cash_sessions",
    columns: [
      "id",
      "connection_id",
      "shop_domain",
      "shopify_session_id",
      "location_id",
      "location_name",
      "session_start",
      "session_end",
      "register_id",
      "status",
      "discrepancy",
      "currency",
      "opening_balance",
      "closing_balance",
      "expected_balance",
      "expected_closing_balance",
      "total_cash_sales",
      "total_cash_refunds",
      "net_cash_sales",
      "total_adjustments",
      "import_source",
      "import_batch_id",
      "raw_payload",
      "synced_at",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  shopify_cash_session_transactions: {
    table: "public.shopify_cash_session_transactions",
    columns: [
      "id",
      "connection_id",
      "shop_domain",
      "shopify_session_id",
      "shopify_transaction_id",
      "location_id",
      "register_id",
      "order_id",
      "order_name",
      "kind",
      "status",
      "processed_at",
      "amount",
      "currency",
      "import_source",
      "raw_payload",
      "synced_at",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  shopify_order_transactions: {
    table: "public.shopify_order_transactions",
    columns: [
      "id",
      "connection_id",
      "shop_domain",
      "order_id",
      "order_name",
      "shopify_transaction_id",
      "kind",
      "status",
      "gateway",
      "formatted_gateway",
      "processed_at",
      "amount",
      "currency",
      "payment_id",
      "raw_payload",
      "synced_at",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  mollie_settings: {
    table: "public.mollie_settings",
    columns: ["id", "api_key", "active", "created_at", "updated_at"],
    writable: true,
  },
  mollie_settings_status: {
    table: "public.mollie_settings_status",
    columns: ["id", "active", "api_key_configured", "created_at", "updated_at"],
    writable: false,
  },
  mollie_transactions: {
    table: "public.mollie_transactions",
    columns: [
      "id",
      "payment_id",
      "mollie_created_at",
      "mollie_paid_at",
      "status",
      "amount_gross",
      "amount_net",
      "vat_amount",
      "vat_rate",
      "discount_amount",
      "description_raw",
      "legacy_bold_at",
      "parsed_afs_number",
      "parsed_article_number",
      "parsed_invoice_number",
      "parsed_paid_at",
      "machine_id",
      "parse_status",
      "parse_error_message",
      "sales_action",
      "sales_transaction_id",
      "raw_payload",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  mollie_sales_invoices: {
    table: "public.mollie_sales_invoices",
    columns: [
      "id",
      "sales_invoice_id",
      "reference",
      "status",
      "issued_at",
      "paid_at",
      "due_at",
      "profile_id",
      "customer_id",
      "recipient_name",
      "recipient_email",
      "currency",
      "amount_gross",
      "amount_net",
      "vat_amount",
      "discount_amount",
      "invoice_url",
      "raw_payload",
      "synced_at",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  vw_mollie_sales_invoices_monthly: {
    table: "public.vw_mollie_sales_invoices_monthly",
    columns: [
      "period",
      "invoice_count",
      "paid_count",
      "open_count",
      "gross_total",
      "net_total",
      "vat_total",
    ],
    writable: false,
  },
  users: {
    table: "(SELECT id, email, created_at FROM local_auth.users) AS users",
    columns: ["id", "email", "created_at"],
    writable: true,
  },
  vw_bold_mollie_monthly_reconciliation: {
    table: "public.vw_bold_mollie_monthly_reconciliation",
    columns: [
      "period",
      "sales_paid_count",
      "mollie_paid_count",
      "paid_count_diff",
      "sales_paid_gross",
      "mollie_paid_gross",
      "paid_gross_diff",
      "sales_all_count",
      "mollie_all_count",
      "all_count_diff",
      "sales_all_gross",
      "mollie_all_gross",
      "all_gross_diff",
      "mollie_parsed_count",
      "mollie_parse_error_count",
      "mollie_linked_sales_count",
      "mollie_added_sales_count",
      "mollie_existing_sales_count",
      "mollie_not_added_count",
      "matched_paid_count",
      "matched_paid_gross",
      "bold_unmatched_paid_count",
      "bold_unmatched_paid_gross",
      "mollie_unmatched_paid_count",
      "mollie_unmatched_paid_gross",
      "sales_zero_paid_count",
      "mollie_non_bold_paid_count",
      "mollie_non_bold_paid_gross",
      "mollie_outside_bold_paid_count",
      "mollie_outside_bold_paid_gross",
      "mollie_duplicate_candidate_count",
      "paid_reconciled",
    ],
    writable: false,
  },
  vw_bold_mollie_reconciliation_issues: {
    table: "public.vw_bold_mollie_reconciliation_issues",
    columns: [
      "issue_type",
      "period",
      "occurred_at",
      "amount_gross",
      "reference",
      "product_name",
      "machine_name",
      "payment_id",
      "sales_transaction_id",
      "description_raw",
      "duplicate_count",
    ],
    writable: false,
  },
  vw_shopify_payout_reconciliation: {
    table: "public.vw_shopify_payout_reconciliation",
    columns: [
      "period",
      "payout_row_id",
      "connection_id",
      "shop_domain",
      "payout_id",
      "payout_status",
      "payout_date",
      "currency",
      "payout_amount",
      "external_trace_id",
      "charges_gross_amount",
      "charges_fee_amount",
      "refunds_gross_amount",
      "refunds_fee_amount",
      "adjustments_gross_amount",
      "adjustments_fee_amount",
      "balance_tx_count",
      "charge_count",
      "refund_count",
      "adjustment_count",
      "payout_movement_count",
      "balance_gross_amount",
      "balance_fee_amount",
      "balance_net_amount",
      "payout_movement_amount",
      "payout_balance_diff",
      "order_reference_count",
      "matched_order_count",
      "missing_order_count",
      "exact_gl_transaction_id",
      "exact_transaction_date",
      "exact_account_code",
      "exact_description",
      "exact_relation_name",
      "exact_document_number",
      "exact_amount",
      "exact_raw_payload",
      "exact_candidate_count",
      "exact_amount_diff",
      "exact_match_status",
      "first_balance_processed_at",
      "last_balance_processed_at",
      "raw_payload",
      "synced_at",
    ],
    writable: false,
  },
  vw_shopify_payments_monthly_reconciliation: {
    table: "public.vw_shopify_payments_monthly_reconciliation",
    columns: [
      "period",
      "payout_count",
      "paid_payout_count",
      "exact_matched_payout_count",
      "exact_missing_payout_count",
      "payout_with_missing_orders_count",
      "payout_amount",
      "balance_gross_amount",
      "balance_fee_amount",
      "balance_net_amount",
      "payout_balance_diff",
      "exact_amount",
      "exact_amount_diff",
      "balance_tx_count",
      "charge_count",
      "refund_count",
      "adjustment_count",
      "order_reference_count",
      "matched_order_count",
      "missing_order_count",
    ],
    writable: false,
  },
  vw_shopify_order_payment_trace: {
    table: "public.vw_shopify_order_payment_trace",
    columns: [
      "balance_row_id",
      "shop_domain",
      "balance_transaction_id",
      "balance_type",
      "balance_processed_at",
      "period",
      "payout_id",
      "payout_status",
      "currency",
      "balance_amount",
      "balance_fee",
      "balance_net",
      "source_id",
      "source_type",
      "source_order_id",
      "source_order_transaction_id",
      "order_summary_id",
      "order_name",
      "order_number",
      "channel",
      "financial_status",
      "order_processed_at",
      "order_current_total_price",
      "order_total_price",
      "order_net_payment",
      "payout_row_id",
      "payout_date",
      "payout_current_status",
      "payout_amount",
      "exact_gl_transaction_id",
      "exact_transaction_date",
      "exact_account_code",
      "exact_description",
      "exact_relation_name",
      "exact_document_number",
      "exact_amount",
      "exact_raw_payload",
      "exact_match_status",
      "trace_status",
      "raw_payload",
      "synced_at",
    ],
    writable: false,
  },
  vw_shopify_payment_issues: {
    table: "public.vw_shopify_payment_issues",
    columns: [
      "issue_type",
      "period",
      "occurred_at",
      "amount",
      "order_name",
      "order_number",
      "payout_id",
      "balance_transaction_id",
      "source_order_id",
      "exact_gl_transaction_id",
      "exact_document_number",
      "exact_description",
      "note",
    ],
    writable: false,
  },
  vw_shopify_order_payment_coverage: {
    table: "public.vw_shopify_order_payment_coverage",
    columns: [
      "order_summary_id",
      "external_id",
      "order_name",
      "order_number",
      "channel",
      "source_name",
      "financial_status",
      "processed_at",
      "period",
      "order_amount",
      "paid_amount",
      "shopify_payments_amount",
      "cash_amount",
      "other_payment_amount",
      "payment_difference",
      "transaction_count",
      "payment_gateways",
      "last_payment_at",
      "payment_coverage_status",
    ],
    writable: false,
  },
  vw_shopify_order_payment_coverage_monthly: {
    table: "public.vw_shopify_order_payment_coverage_monthly",
    columns: [
      "period",
      "channel",
      "order_count",
      "paid_order_count",
      "open_order_count",
      "order_amount",
      "paid_amount",
      "shopify_payments_amount",
      "cash_amount",
      "other_payment_amount",
      "payment_difference",
      "no_transaction_count",
      "underpaid_count",
      "overpaid_count",
      "amount_covered_status_open_count",
    ],
    writable: false,
  },
  vw_shopify_order_payment_issues: {
    table: "public.vw_shopify_order_payment_issues",
    columns: [
      "issue_type",
      "period",
      "occurred_at",
      "order_amount",
      "paid_amount",
      "payment_difference",
      "order_name",
      "order_number",
      "channel",
      "financial_status",
      "payment_gateways",
      "transaction_count",
      "last_payment_at",
    ],
    writable: false,
  },
  vw_shopify_open_customer_orders: {
    table: "public.vw_shopify_open_customer_orders",
    columns: [
      "customer_key",
      "customer_label",
      "customer_id",
      "customer_name",
      "customer_email",
      "customer_phone",
      "customer_company",
      "period",
      "order_summary_id",
      "external_id",
      "order_name",
      "order_number",
      "channel",
      "source_name",
      "financial_status",
      "processed_at",
      "order_amount",
      "paid_amount",
      "open_amount",
      "payment_difference",
      "payment_coverage_status",
      "payment_gateways",
      "transaction_count",
      "last_payment_at",
    ],
    writable: false,
  },
  vw_shopify_open_by_customer: {
    table: "public.vw_shopify_open_by_customer",
    columns: [
      "customer_key",
      "customer_label",
      "customer_id",
      "customer_name",
      "customer_email",
      "customer_phone",
      "customer_company",
      "open_order_count",
      "open_amount",
      "oldest_order_at",
      "newest_order_at",
      "webshop_order_count",
      "webshop_open_amount",
      "winkel_order_count",
      "winkel_open_amount",
      "channels",
    ],
    writable: false,
  },
  vw_shopify_cash_exact_geldmaat: {
    table: "public.vw_shopify_cash_exact_geldmaat",
    columns: [
      "gl_transaction_id",
      "transaction_date",
      "period",
      "account_code",
      "description",
      "relation_name",
      "document_number",
      "exact_amount",
      "raw_payload",
      "exact_document_url",
    ],
    writable: false,
  },
  vw_shopify_cash_order_reconciliation: {
    table: "public.vw_shopify_cash_order_reconciliation",
    columns: [
      "order_summary_id",
      "external_id",
      "order_name",
      "order_number",
      "financial_status",
      "processed_at",
      "business_date",
      "period",
      "order_amount",
      "shopify_payment_tx_count",
      "shopify_payment_amount",
      "cash_transaction_count",
      "shopify_cash_transaction_amount",
      "fallback_cash_amount",
      "cash_amount",
      "cash_source",
      "cash_match_status",
      "cash_session_id",
      "location_id",
      "location_name",
      "register_id",
      "session_start",
      "session_end",
      "session_status",
    ],
    writable: false,
  },
  vw_shopify_cash_daily_reconciliation: {
    table: "public.vw_shopify_cash_daily_reconciliation",
    columns: [
      "business_date",
      "period",
      "cash_order_count",
      "cash_sales_amount",
      "pos_order_amount",
      "shopify_payment_amount",
      "shopify_cash_transaction_amount",
      "shopify_cash_transaction_order_count",
      "cash_orders_without_session",
      "session_count",
      "open_session_count",
      "discrepancy_amount",
      "exact_geldmaat_count",
      "exact_geldmaat_amount",
      "cash_minus_exact",
      "cash_after_discrepancy_minus_exact",
    ],
    writable: false,
  },
  vw_shopify_cash_monthly_reconciliation: {
    table: "public.vw_shopify_cash_monthly_reconciliation",
    columns: [
      "period",
      "cash_order_count",
      "cash_sales_amount",
      "pos_order_amount",
      "shopify_payment_amount",
      "shopify_cash_transaction_amount",
      "shopify_cash_transaction_order_count",
      "cash_orders_without_session",
      "session_count",
      "open_session_count",
      "discrepancy_amount",
      "exact_geldmaat_count",
      "exact_geldmaat_amount",
      "cash_minus_exact",
      "cash_after_discrepancy_minus_exact",
    ],
    writable: false,
  },
  sync_state: {
    table: "public.sync_state",
    columns: [
      "channel",
      "last_sweep_at",
      "last_sweep_status",
      "last_sweep_message",
      "records_processed",
      "updated_at",
    ],
    writable: true,
  },
  transactions: {
    table: "public.transactions",
    columns: [
      "id",
      "external_id",
      "source",
      "channel",
      "machine_id",
      "article_number",
      "product_name",
      "amount_gross",
      "amount_net",
      "vat_amount",
      "vat_rate",
      "discount_amount",
      "invoice_number",
      "status",
      "paid_at",
      "description_raw",
      "invoice_url",
      "raw_payload",
      "parse_status",
      "parse_error_message",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  vat_rates: {
    table: "public.vat_rates",
    columns: ["id", "rate", "label", "active", "created_at"],
    writable: true,
  },
  vw_monthly_channel: {
    table: "public.vw_monthly_channel",
    columns: ["period", "channel", "tx_count", "gross_total", "net_total", "vat_total"],
    writable: false,
  },
  vw_monthly_machine: {
    table: "public.vw_monthly_machine",
    columns: [
      "period",
      "channel",
      "machine_id",
      "display_name",
      "afs_number",
      "tx_count",
      "gross_total",
      "net_total",
      "vat_total",
    ],
    writable: false,
  },
  vw_monthly_vat: {
    table: "public.vw_monthly_vat",
    columns: ["period", "channel", "vat_rate", "tx_count", "gross_total", "net_total", "vat_total"],
    writable: false,
  },
  vw_monthly_revenue_actuals: {
    table: "public.vw_monthly_revenue_actuals",
    columns: ["period", "channel", "tx_count", "gross_total", "net_total", "vat_total"],
    writable: false,
  },
  vw_shopify_analytics_monthly: {
    table: "public.vw_shopify_analytics_monthly",
    columns: [
      "period",
      "order_count",
      "paid_order_count",
      "non_paid_order_count",
      "paid_line_gross",
      "paid_line_tax",
      "paid_line_net",
      "paid_current_total",
      "non_paid_current_total",
      "api_current_total",
      "shipping_total",
      "refunded_total",
      "discount_total",
      "current_tax_total",
      "tax_total",
      "line_original_total",
      "line_discounted_total",
      "line_discount_total",
      "line_tax_total",
      "status_summary",
    ],
    writable: false,
  },
  vw_gl_quarterly_account: {
    table: "public.vw_gl_quarterly_account",
    columns: [
      "quarter_key",
      "year",
      "quarter",
      "account_id",
      "account_code",
      "account_name",
      "pl_section",
      "revenue_channel",
      "sort_order",
      "entry_count",
      "amount",
    ],
    writable: false,
  },
  vw_gl_monthly_account: {
    table: "public.vw_gl_monthly_account",
    columns: [
      "period",
      "quarter_key",
      "year",
      "month",
      "account_id",
      "account_code",
      "account_name",
      "pl_section",
      "revenue_channel",
      "sort_order",
      "entry_count",
      "amount",
    ],
    writable: false,
  },
  vw_gl_yearly_status: {
    table: "public.vw_gl_yearly_status",
    columns: ["year", "transaction_count", "min_date", "max_date", "updated_through_date"],
    writable: false,
  },
  vw_gl_revenue_source_monthly: {
    table: "public.vw_gl_revenue_source_monthly",
    columns: ["period", "revenue_source", "tx_count", "net_total"],
    writable: false,
  },
  vw_sales_quarterly_channel: {
    table: "public.vw_sales_quarterly_channel",
    columns: [
      "quarter_key",
      "year",
      "quarter",
      "channel",
      "tx_count",
      "gross_total",
      "net_total",
      "vat_total",
    ],
    writable: false,
  },
};

const server = http.createServer(async (req, res) => {
  try {
    addCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `localhost:${port}`}`);

    if (url.pathname.startsWith("/auth/v1/")) {
      await handleAuth(req, res, url);
      return;
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      await handleRest(req, res, url);
      return;
    }

    if (url.pathname.startsWith("/functions/v1/")) {
      await handleFunction(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, {
      code: "LOCAL_SUPABASE_ERROR",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(`Daily Flowers app/API: http://${host}:${port}`);
  console.log(`Postgres: ${redactConnectionString(databaseUrl)}`);
  console.log("Shopify sync: client_credentials + GraphQL Admin API");
  if (!hostedRuntime) console.log("Dev login: admin@dailyflowers.local / dailyflowers");
});

async function handleAuth(req, res, url) {
  if (url.pathname === "/auth/v1/token" && req.method === "POST") {
    const grantType = url.searchParams.get("grant_type");
    if (grantType !== "password") {
      sendJson(res, 400, {
        error: "unsupported_grant_type",
        error_description: "Only password login is implemented locally.",
      });
      return;
    }

    const body = await readJson(req);
    const username = String(body.email ?? body.username ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    const user = await findLocalUser(username, password);

    if (!user) {
      sendJson(res, 400, {
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      });
      return;
    }

    sendJson(res, 200, makeSession(user));
    return;
  }

  if (url.pathname === "/auth/v1/user" && req.method === "GET") {
    const claims = verifyRequestClaims(req);
    if (!claims) {
      sendJson(res, 401, { message: "Invalid or missing access token" });
      return;
    }

    sendJson(res, 200, userFromClaims(claims));
    return;
  }

  if (url.pathname === "/auth/v1/logout" && req.method === "POST") {
    sendJson(res, 204, null);
    return;
  }

  sendJson(res, 404, { message: "Auth endpoint not implemented locally" });
}

async function handleRest(req, res, url) {
  const resourceName = decodeURIComponent(
    url.pathname.replace(/^\/rest\/v1\//, "").split("/")[0] ?? "",
  );
  const resource = resources[resourceName];

  if (!resource) {
    sendJson(res, 404, { code: "PGRST102", message: `Unknown local resource: ${resourceName}` });
    return;
  }

  if (resourceName === "users") {
    await handleUsersRest(req, res, url, resource);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await selectRows(req, res, url, resource);
    return;
  }

  if (!resource.writable) {
    sendJson(res, 405, { message: `${resourceName} is read-only` });
    return;
  }

  if (req.method === "POST") {
    await insertRows(req, res, url, resource);
    return;
  }

  if (req.method === "PATCH") {
    await updateRows(req, res, url, resource);
    return;
  }

  if (req.method === "DELETE") {
    await deleteRows(req, res, url, resource);
    return;
  }

  sendJson(res, 405, { message: "Method not allowed" });
}

const userWritableResource = {
  table: "local_auth.users",
  columns: ["id", "email", "password", "created_at"],
  writable: true,
};

async function handleUsersRest(req, res, url, publicResource) {
  if (req.method === "GET" || req.method === "HEAD") {
    await selectRows(req, res, url, publicResource);
    return;
  }

  if (req.method === "POST") {
    await insertUsers(req, res);
    return;
  }

  if (req.method === "PATCH") {
    await updateUsers(req, res, url);
    return;
  }

  if (req.method === "DELETE") {
    await deleteUsers(res, url);
    return;
  }

  sendJson(res, 405, { message: "Method not allowed" });
}

async function insertUsers(req, res) {
  const body = await readJson(req);
  const rows = Array.isArray(body) ? body : [body];
  const returned = [];

  for (const row of rows) {
    const email = normalizeUserEmail(row?.email ?? row?.username);
    const password = String(row?.password ?? "");
    if (!email || !password) {
      sendJson(res, 400, { message: "Gebruikersnaam en wachtwoord zijn verplicht" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO local_auth.users (email, password)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email, hashPassword(password)],
    );
    returned.push(...result.rows);
  }

  sendJson(res, 201, returned);
}

async function updateUsers(req, res, url) {
  const body = await readJson(req);
  const values = [];
  const setters = [];

  const hasUsername = Object.prototype.hasOwnProperty.call(body ?? {}, "username");
  const hasEmail = Object.prototype.hasOwnProperty.call(body ?? {}, "email");

  if (hasEmail || hasUsername) {
    const email = normalizeUserEmail(hasUsername ? body.username : body.email);
    if (!email) {
      sendJson(res, 400, { message: "Gebruikersnaam is verplicht" });
      return;
    }
    values.push(email);
    setters.push(`email = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(body ?? {}, "password")) {
    const password = String(body.password ?? "");
    if (!password) {
      sendJson(res, 400, { message: "Wachtwoord is verplicht" });
      return;
    }
    values.push(hashPassword(password));
    setters.push(`password = $${values.length}`);
  }

  if (setters.length === 0) {
    sendJson(res, 400, { message: "Geen wijzigingen opgegeven" });
    return;
  }

  const where = buildWhere(userWritableResource, url.searchParams, values);
  if (!where.clause) {
    sendJson(res, 400, { message: "Filter verplicht voor gebruikerswijziging" });
    return;
  }

  const result = await pool.query(
    `UPDATE local_auth.users SET ${setters.join(", ")}${where.clause} RETURNING id, email, created_at`,
    where.values,
  );
  sendJson(res, 200, result.rows);
}

async function deleteUsers(res, url) {
  const where = buildWhere(userWritableResource, url.searchParams);
  if (!where.clause) {
    sendJson(res, 400, { message: "Filter verplicht voor gebruikersverwijdering" });
    return;
  }

  const result = await pool.query(
    `DELETE FROM local_auth.users${where.clause} RETURNING id, email, created_at`,
    where.values,
  );
  sendJson(res, 200, result.rows);
}

async function handleFunction(req, res, url) {
  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed" });
    return;
  }

  const name = url.pathname.replace(/^\/functions\/v1\//, "");
  if (name === "daily-sweep") {
    await markSweepRunning(pool);
    runSweep(pool).catch((error) => console.error("local daily-sweep failed", error));
    sendJson(res, 202, {
      status: "started",
      local: true,
      message: "Sweep draait op de achtergrond. Status verschijnt onderaan het dashboard.",
    });
    return;
  }

  if (name === "shopify-order-payments-sync") {
    const since = url.searchParams.get("since");
    await pool.query(
      `
        INSERT INTO public.sync_state (channel, last_sweep_at, last_sweep_status, last_sweep_message, records_processed, updated_at)
        SELECT channel, now(), 'running', message, 0, now()
        FROM (
          VALUES
            ('shopify_webshop', 'Shopify orders sync gestart...'),
            ('shopify_winkel', 'Shopify orders sync gestart...'),
            ('shopify_payments', 'Shopify Payments sync gestart...'),
            ('shopify_cash', 'Shopify kassasessies sync gestart...')
        ) AS incoming(channel, message)
        ON CONFLICT (channel) DO UPDATE SET
          last_sweep_at = EXCLUDED.last_sweep_at,
          last_sweep_status = EXCLUDED.last_sweep_status,
          last_sweep_message = EXCLUDED.last_sweep_message,
          records_processed = EXCLUDED.records_processed,
          updated_at = now()
      `,
    );
    runShopifySweep(pool, since ? { sinceIso: since } : {}).catch((error) =>
      console.error("local shopify-order-payments-sync failed", error),
    );
    sendJson(res, 202, {
      status: "started",
      local: true,
      message: "Shopify orders en betalingen sync draaien op de achtergrond.",
    });
    return;
  }

  if (name === "shopify-payments-sync") {
    const since = url.searchParams.get("since");
    await pool.query(
      `
        INSERT INTO public.sync_state (channel, last_sweep_at, last_sweep_status, last_sweep_message, records_processed, updated_at)
        VALUES ('shopify_payments', now(), 'running', 'Shopify Payments sync gestart...', 0, now())
        ON CONFLICT (channel) DO UPDATE SET
          last_sweep_at = EXCLUDED.last_sweep_at,
          last_sweep_status = EXCLUDED.last_sweep_status,
          last_sweep_message = EXCLUDED.last_sweep_message,
          records_processed = EXCLUDED.records_processed,
          updated_at = now()
      `,
    );
    runShopifyPaymentsSweepFrom(pool, since).catch((error) =>
      console.error("local shopify-payments-sync failed", error),
    );
    sendJson(res, 202, {
      status: "started",
      local: true,
      message: "Shopify Payments sync draait op de achtergrond.",
    });
    return;
  }

  if (name === "shopify-cash-sync") {
    const since = url.searchParams.get("since");
    await pool.query(
      `
        INSERT INTO public.sync_state (channel, last_sweep_at, last_sweep_status, last_sweep_message, records_processed, updated_at)
        VALUES ('shopify_cash', now(), 'running', 'Shopify kassasessies sync gestart...', 0, now())
        ON CONFLICT (channel) DO UPDATE SET
          last_sweep_at = EXCLUDED.last_sweep_at,
          last_sweep_status = EXCLUDED.last_sweep_status,
          last_sweep_message = EXCLUDED.last_sweep_message,
          records_processed = EXCLUDED.records_processed,
          updated_at = now()
      `,
    );
    runShopifyCashSweepFrom(pool, since).catch((error) =>
      console.error("local shopify-cash-sync failed", error),
    );
    sendJson(res, 202, {
      status: "started",
      local: true,
      message: "Shopify kassasessies sync draait op de achtergrond.",
    });
    return;
  }

  if (name === "exact-sync") {
    const since = url.searchParams.get("since");
    const until = url.searchParams.get("until");
    const current = await pool.query(
      `
        SELECT last_sweep_status, updated_at
        FROM public.sync_state
        WHERE channel = 'exact_gl'
        LIMIT 1
      `,
    );
    const state = current.rows[0];
    const updatedAt = state?.updated_at ? new Date(state.updated_at).getTime() : 0;
    const isRecentRunning =
      state?.last_sweep_status === "running" &&
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt < exactRunningStaleMinutes * 60 * 1000;

    if (isRecentRunning) {
      sendJson(res, 202, {
        status: "already_running",
        local: true,
        message: "Exact sync draait al recent. Wacht op de volgende voortgangsupdate.",
      });
      return;
    }

    runExactSweepFrom(pool, since, { untilIso: until }).catch((error) =>
      console.error("local exact-sync failed", error),
    );
    sendJson(res, 202, {
      status: "started",
      local: true,
      message: "Exact sync draait op de achtergrond. Status verschijnt onderaan het dashboard.",
    });
    return;
  }

  if (name === "shopify-webhook") {
    const rawBody = await readRaw(req);
    await processShopifyWebhook(pool, rawBody, req.headers["x-shopify-hmac-sha256"] ?? null);
    sendJson(res, 200, { ok: true, local: true });
    return;
  }

  if (name === "mollie-webhook") {
    const paymentId = await readMolliePaymentId(req);
    await processMollieWebhook(pool, paymentId);
    sendJson(res, 200, { ok: true, local: true });
    return;
  }

  if (name === "mollie-sales-invoices-sync") {
    const since = url.searchParams.get("since");
    await pool.query(
      `
        INSERT INTO public.sync_state (channel, last_sweep_at, last_sweep_status, last_sweep_message, records_processed, updated_at)
        VALUES ('mollie_facturen', now(), 'running', 'Mollie facturen sync gestart...', 0, now())
        ON CONFLICT (channel) DO UPDATE SET
          last_sweep_at = EXCLUDED.last_sweep_at,
          last_sweep_status = EXCLUDED.last_sweep_status,
          last_sweep_message = EXCLUDED.last_sweep_message,
          records_processed = EXCLUDED.records_processed,
          updated_at = now()
      `,
    );
    runMollieSalesInvoicesSweepFrom(pool, since).catch((error) =>
      console.error("local mollie-sales-invoices-sync failed", error),
    );
    sendJson(res, 202, {
      status: "started",
      local: true,
      message: "Mollie facturen sync draait op de achtergrond.",
    });
    return;
  }

  if (name === "afs-rental-invoice") {
    await handleAfsRentalInvoiceFunction(req, res);
    return;
  }

  sendJson(res, 404, { message: `Function not implemented locally: ${name}` });
}

async function handleAfsRentalInvoiceFunction(req, res) {
  const body = await readJson(req);
  const action = String(body?.action ?? "");
  const invoiceId = String(body?.invoice_id ?? "");

  if (action === "gmail_status") {
    sendJson(res, 200, await gmailConnectionStatus());
    return;
  }

  if (action === "gmail_auth_url") {
    const redirectUri = normalizeGmailRedirectUri(body?.redirect_uri);
    const state = crypto.randomBytes(18).toString("hex");
    sendJson(res, 200, {
      auth_url: buildGmailAuthUrl({ redirectUri, state }),
      state,
      redirect_uri: redirectUri,
    });
    return;
  }

  if (action === "gmail_exchange_code") {
    const code = String(body?.code ?? "").trim();
    const redirectUri = normalizeGmailRedirectUri(body?.redirect_uri);
    if (!code) {
      sendJson(res, 400, { message: "OAuth code ontbreekt" });
      return;
    }

    const status = await exchangeGmailAuthorizationCode({ code, redirectUri });
    sendJson(res, 200, status);
    return;
  }

  if (action === "gmail_disconnect") {
    await disconnectGmail();
    sendJson(res, 200, await gmailConnectionStatus());
    return;
  }

  if (action === "queue_period") {
    const period = String(body?.period ?? "");
    if (!/^\d{4}-\d{2}$/.test(period)) {
      sendJson(res, 400, { message: "Periode moet het formaat YYYY-MM hebben" });
      return;
    }

    const result = await queueAfsRentalInvoices({ period });
    sendJson(res, 200, result);
    return;
  }

  if (action === "process_queue") {
    const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 100);
    const result = await processAfsRentalInvoiceQueue({ limit });
    sendJson(res, 200, result);
    return;
  }

  if (!invoiceId) {
    sendJson(res, 400, { message: "invoice_id is verplicht" });
    return;
  }

  if (action === "download_pdf") {
    const context = await loadAfsRentalInvoiceContext(invoiceId);
    if (!context) {
      sendJson(res, 404, { message: "Factuur niet gevonden" });
      return;
    }
    const missing = missingSelfBillingFields(context.landlord);
    if (missing.length > 0) {
      sendJson(res, 400, {
        message: `Verhuurdergegevens incompleet voor self-billing: ${missing.join(", ")}`,
      });
      return;
    }

    const pdf = buildAfsInvoicePdf(context);
    await markAfsInvoiceDocumentGenerated(invoiceId);
    sendJson(res, 200, {
      filename: `${safeFileName(context.invoice.invoice_number)}.pdf`,
      content_type: "application/pdf",
      base64: pdf.toString("base64"),
    });
    return;
  }

  if (action === "download_ubl") {
    const context = await loadAfsRentalInvoiceContext(invoiceId);
    if (!context) {
      sendJson(res, 404, { message: "Factuur niet gevonden" });
      return;
    }
    const missing = missingSelfBillingFields(context.landlord);
    if (missing.length > 0) {
      sendJson(res, 400, {
        message: `Verhuurdergegevens incompleet voor self-billing: ${missing.join(", ")}`,
      });
      return;
    }

    const ubl = buildAfsInvoiceUbl(context);
    await markAfsInvoiceDocumentGenerated(invoiceId);
    sendJson(res, 200, {
      filename: `${safeFileName(context.invoice.invoice_number)}.xml`,
      content_type: "application/xml",
      base64: Buffer.from(ubl, "utf8").toString("base64"),
    });
    return;
  }

  if (action === "queue_email") {
    const result = await queueAfsRentalInvoices({ invoiceIds: [invoiceId] });
    sendJson(res, 200, result);
    return;
  }

  sendJson(res, 400, { message: `Onbekende factuuractie: ${action || "-"}` });
}

async function selectRows(req, res, url, resource) {
  const select = parseSelect(url.searchParams.get("select") ?? "*");
  const { clause, values } = buildWhere(resource, url.searchParams);
  const order = buildOrder(resource, url.searchParams.getAll("order"));
  const range = getRange(req, url);
  const single = String(req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");
  const wantsCount = String(req.headers.prefer ?? "").includes("count=exact");

  const selectedColumns = selectSqlColumns(resource, select);
  let sql = `SELECT ${selectedColumns.sql} FROM ${resource.table}${clause}${order.sql}`;

  if (range.limit !== null) {
    values.push(range.limit);
    sql += ` LIMIT $${values.length}`;
  }
  if (range.offset !== null) {
    values.push(range.offset);
    sql += ` OFFSET $${values.length}`;
  }

  const result = await pool.query(sql, values);
  let rows = result.rows;
  if (select.nestedMachines) rows = await attachMachines(rows, select.machineColumns);
  if (selectedColumns.joinOnlyMachineId) {
    rows = rows.map(({ machine_id, ...row }) => row);
  }

  let count = null;
  if (wantsCount) {
    const countWhere = buildWhere(resource, url.searchParams);
    const countResult = await pool.query(
      `SELECT count(*)::int AS count FROM ${resource.table}${countWhere.clause}`,
      countWhere.values,
    );
    count = countResult.rows[0]?.count ?? 0;
  }

  const headers = {};
  if (wantsCount || range.limit !== null) {
    const start = range.offset ?? 0;
    const end = rows.length > 0 ? start + rows.length - 1 : start;
    headers["content-range"] = `${start}-${end}/${count ?? "*"}`;
  }

  if (req.method === "HEAD") {
    sendHead(res, 200, headers);
    return;
  }

  if (single) {
    if (rows.length !== 1) {
      sendJson(
        res,
        406,
        { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
        headers,
      );
      return;
    }
    sendJson(res, 200, rows[0], headers);
    return;
  }

  sendJson(res, range.limit !== null ? 206 : 200, rows, headers);
}

async function insertRows(req, res, url, resource) {
  const body = await readJson(req);
  const rows = Array.isArray(body) ? body : [body];
  const returned = [];
  const conflictColumns = parseConflictColumns(resource, url.searchParams.get("on_conflict"));
  const prefer = String(req.headers.prefer ?? "");
  const ignoreDuplicates = prefer.includes("resolution=ignore-duplicates");

  for (const row of rows) {
    const columns = Object.keys(row).filter((key) => resource.columns.includes(key));
    if (columns.length === 0) continue;

    const values = columns.map((column) => row[column]);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    const conflictSql = buildConflictSql(columns, conflictColumns, ignoreDuplicates);
    const sql = `INSERT INTO ${resource.table} (${columns.map(quoteIdent).join(", ")}) VALUES (${placeholders}) ${conflictSql} RETURNING *`;
    const result = await pool.query(sql, values);
    returned.push(...result.rows);
  }

  sendJson(res, 201, returned);
}

async function updateRows(req, res, url, resource) {
  const body = await readJson(req);
  const columns = Object.keys(body).filter((key) => resource.columns.includes(key));

  if (columns.length === 0) {
    sendJson(res, 400, { message: "No writable columns supplied" });
    return;
  }

  const values = columns.map((column) => body[column]);
  const setSql = columns.map((column, index) => `${quoteIdent(column)} = $${index + 1}`).join(", ");
  const where = buildWhere(resource, url.searchParams, values);
  const result = await pool.query(
    `UPDATE ${resource.table} SET ${setSql}${where.clause} RETURNING *`,
    where.values,
  );
  sendJson(res, 200, result.rows);
}

async function deleteRows(req, res, url, resource) {
  const where = buildWhere(resource, url.searchParams);
  const result = await pool.query(
    `DELETE FROM ${resource.table}${where.clause} RETURNING *`,
    where.values,
  );
  sendJson(res, 200, result.rows);
}

async function queueAfsRentalInvoices({ period = null, invoiceIds = null }) {
  const values = [];
  let where = "i.status <> 'canceled' AND COALESCE(i.email_status, 'not_queued') <> 'sent'";
  if (period) {
    values.push(period);
    where += ` AND i.period = $${values.length}`;
  }
  if (invoiceIds) {
    values.push(invoiceIds);
    where += ` AND i.id = ANY($${values.length}::uuid[])`;
  }

  const result = await pool.query(
    `
      SELECT
        i.id,
        i.period,
        i.invoice_number,
        l.email AS landlord_email,
        l.name AS landlord_name,
        l.invoice_name AS landlord_invoice_name
      FROM public.afs_rental_invoices i
      LEFT JOIN public.afs_landlords l ON l.id = i.landlord_id
      WHERE ${where}
      ORDER BY i.invoice_date, i.invoice_number
    `,
    values,
  );

  let queued = 0;
  let failed = 0;
  const errors = [];

  for (const invoice of result.rows) {
    const to = String(invoice.landlord_email ?? "").trim();
    const supplierName = invoice.landlord_invoice_name || invoice.landlord_name || "verhuurder";
    const subject = `Factuur ${invoice.invoice_number} - ${periodLabel(invoice.period)}`;
    const body = defaultInvoiceEmailBody({
      invoiceNumber: invoice.invoice_number,
      period: invoice.period,
      supplierName,
    });

    if (!to) {
      failed += 1;
      const message = "Geen e-mailadres bij verhuurder";
      errors.push(`${invoice.invoice_number}: ${message}`);
      await pool.query(
        `
          UPDATE public.afs_rental_invoices
          SET email_status = 'failed',
              email_last_error = $2,
              email_provider = 'gmail',
              updated_at = now()
          WHERE id = $1
        `,
        [invoice.id, message],
      );
      continue;
    }

    await pool.query(
      `
        UPDATE public.afs_rental_invoices
        SET email_status = 'queued',
            queued_at = now(),
            sending_started_at = NULL,
            email_to = $2,
            email_subject = $3,
            email_body = $4,
            email_provider = 'gmail',
            email_provider_message_id = NULL,
            email_last_error = NULL,
            updated_at = now()
        WHERE id = $1
      `,
      [invoice.id, to, subject, body],
    );
    queued += 1;
  }

  return {
    ok: true,
    found: result.rows.length,
    queued,
    failed,
    errors,
  };
}

async function processAfsRentalInvoiceQueue({ limit }) {
  const result = await pool.query(
    `
      SELECT id
      FROM public.afs_rental_invoices
      WHERE email_status = 'queued'
      ORDER BY queued_at NULLS FIRST, invoice_date, invoice_number
      LIMIT $1
    `,
    [limit],
  );

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const row of result.rows) {
    const claimed = await pool.query(
      `
        UPDATE public.afs_rental_invoices
        SET email_status = 'sending',
            sending_started_at = now(),
            email_attempts = email_attempts + 1,
            email_last_error = NULL,
            updated_at = now()
        WHERE id = $1
          AND email_status = 'queued'
        RETURNING id
      `,
      [row.id],
    );
    if (claimed.rowCount !== 1) continue;

    const context = await loadAfsRentalInvoiceContext(row.id);
    if (!context) {
      failed += 1;
      continue;
    }

    const to = context.invoice.email_to || context.landlord.email;
    const subject =
      context.invoice.email_subject ||
      `Factuur ${context.invoice.invoice_number} - ${periodLabel(context.invoice.period)}`;
    const message = context.invoice.email_body || defaultInvoiceEmailBody(context);

    try {
      const providerResult = await sendAfsRentalInvoiceEmail(context, { to, subject, message });
      await pool.query(
        `
          UPDATE public.afs_rental_invoices
          SET status = 'sent',
              email_status = 'sent',
              sent_at = now(),
              email_to = $2,
              email_subject = $3,
              email_body = $4,
              email_provider = 'gmail',
              email_provider_message_id = $5,
              email_last_error = NULL,
              updated_at = now()
          WHERE id = $1
        `,
        [row.id, to, subject, message, providerResult.id ?? null],
      );
      sent += 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await pool.query(
        `
          UPDATE public.afs_rental_invoices
          SET email_status = 'failed',
              email_last_error = $2,
              updated_at = now()
          WHERE id = $1
        `,
        [row.id, errorMessage],
      );
      errors.push(`${context.invoice.invoice_number}: ${errorMessage}`);
      failed += 1;
    }
  }

  return {
    ok: failed === 0,
    found: result.rows.length,
    sent,
    failed,
    errors,
  };
}

async function loadAfsRentalInvoiceContext(invoiceId) {
  const result = await pool.query(
    `
      SELECT
        i.*,
        m.display_name AS machine_display_name,
        m.afs_number AS machine_afs_number,
        m.machine_id AS machine_external_id,
        l.name AS landlord_name,
        l.invoice_name AS landlord_invoice_name,
        l.email AS landlord_email,
        l.phone AS landlord_phone,
        l.address_line1 AS landlord_address_line1,
        l.postal_code AS landlord_postal_code,
        l.city AS landlord_city,
        l.country AS landlord_country,
        l.kvk_number AS landlord_kvk_number,
        l.vat_number AS landlord_vat_number,
        l.iban AS landlord_iban
      FROM public.afs_rental_invoices i
      LEFT JOIN public.machines m ON m.id = i.machine_id
      LEFT JOIN public.afs_landlords l ON l.id = i.landlord_id
      WHERE i.id = $1
      LIMIT 1
    `,
    [invoiceId],
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    invoice: {
      id: row.id,
      period: row.period,
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      due_date: row.due_date,
      turnover_net: moneyNumber(row.turnover_net),
      fixed_fee_net: moneyNumber(row.fixed_fee_net),
      turnover_rate_percent: Number(row.turnover_rate_percent ?? 0),
      turnover_threshold_net: moneyNumber(row.turnover_threshold_net),
      variable_fee_net: moneyNumber(row.variable_fee_net),
      subtotal_net: moneyNumber(row.subtotal_net),
      vat_rate: Number(row.vat_rate ?? 0),
      vat_amount: moneyNumber(row.vat_amount),
      total_gross: moneyNumber(row.total_gross),
      notes: row.notes,
      email_to: row.email_to ?? "",
      email_subject: row.email_subject ?? "",
      email_body: row.email_body ?? "",
    },
    machine: {
      display_name: row.machine_display_name ?? "Onbekende AFS-machine",
      afs_number: row.machine_afs_number ?? "",
      machine_id: row.machine_external_id ?? "",
    },
    landlord: {
      name: row.landlord_name ?? "Onbekende verhuurder",
      invoice_name: row.landlord_invoice_name ?? row.landlord_name ?? "Onbekende verhuurder",
      email: row.landlord_email ?? "",
      phone: row.landlord_phone ?? "",
      address_line1: row.landlord_address_line1 ?? "",
      postal_code: row.landlord_postal_code ?? "",
      city: row.landlord_city ?? "",
      country: row.landlord_country ?? "NL",
      kvk_number: row.landlord_kvk_number ?? "",
      vat_number: row.landlord_vat_number ?? "",
      iban: row.landlord_iban ?? "",
    },
    customer: invoiceCustomerConfig(),
  };
}

async function markAfsInvoiceDocumentGenerated(invoiceId) {
  await pool.query(
    `
      UPDATE public.afs_rental_invoices
      SET updated_at = now()
      WHERE id = $1
    `,
    [invoiceId],
  );
}

function buildAfsInvoicePdf(context) {
  const { invoice, landlord, customer, machine } = context;
  const supplierName = landlord.invoice_name || landlord.name;
  const variableBase = Math.max(0, invoice.turnover_net - invoice.turnover_threshold_net);
  const logo = dailyFlowersLogoPdfImage();
  const logoLines = logo
    ? [{ type: "image", name: "Logo", x: 50, y: 742, w: 145, h: 25 }]
    : [{ text: "DAILY FLOWERS", size: 17, x: 50, y: 750, font: "bold" }];
  const lines = [
    { type: "rect", x: 0, y: 806, w: 595, h: 36, color: [23, 23, 23] },
    { type: "rect", x: 50, y: 781, w: 495, h: 7, color: [222, 165, 164] },
    ...logoLines,
    { text: "FACTUUR", size: 25, x: 390, y: 756, font: "bold" },
    { text: `Nr. ${invoice.invoice_number}`, size: 10, x: 391, y: 734 },
    {
      text: "Zelf-facturatie / self-billing",
      size: 8,
      x: 391,
      y: 718,
      font: "bold",
      color: [105, 105, 105],
    },
    {
      text: "Uitgereikt door afnemer namens leverancier",
      size: 7,
      x: 391,
      y: 705,
      color: [105, 105, 105],
    },
    { type: "rect", x: 50, y: 626, w: 220, h: 84, color: [248, 244, 244] },
    { type: "rect", x: 310, y: 626, w: 235, h: 84, color: [248, 244, 244] },
    { text: "VAN", size: 8, x: 64, y: 694, font: "bold", color: [105, 105, 105] },
    { text: supplierName, size: 10, x: 64, y: 678, font: "bold" },
    ...partyDetailsPdfLines(landlord, 64, 664, { includeIban: false }),
    { text: "AAN", size: 8, x: 324, y: 694, font: "bold", color: [105, 105, 105] },
    { text: customer.name, size: 10, x: 324, y: 678, font: "bold" },
    ...partyDetailsPdfLines(customer, 324, 664, { includeIban: false }),
    { text: "Factuurdatum", size: 8, x: 50, y: 610, color: [105, 105, 105] },
    { text: formatIsoDate(invoice.invoice_date), size: 10, x: 50, y: 594, font: "bold" },
    { text: "Vervaldatum", size: 8, x: 165, y: 610, color: [105, 105, 105] },
    { text: formatIsoDate(invoice.due_date), size: 10, x: 165, y: 594, font: "bold" },
    { text: "Periode", size: 8, x: 280, y: 610, color: [105, 105, 105] },
    { text: periodLabel(invoice.period), size: 10, x: 280, y: 594, font: "bold" },
    { text: "Machine", size: 8, x: 410, y: 610, color: [105, 105, 105] },
    { text: machine.display_name, size: 10, x: 410, y: 594, font: "bold" },
    {
      text: `AFS ${machine.afs_number || "-"}${machine.machine_id ? ` / ${machine.machine_id}` : ""}`,
      size: 8,
      x: 410,
      y: 580,
      color: [105, 105, 105],
    },
    { type: "rect", x: 50, y: 538, w: 495, h: 28, color: [23, 23, 23] },
    { text: "Omschrijving", size: 9, x: 64, y: 548, font: "bold", color: [255, 255, 255] },
    { text: "Bedrag ex btw", size: 9, x: 455, y: 548, font: "bold", color: [255, 255, 255] },
    { text: "Vaste huur AFS-machine", size: 10, x: 64, y: 514 },
    { text: formatMoney(invoice.fixed_fee_net), size: 10, x: 455, y: 514 },
    { type: "line", x1: 50, y1: 497, x2: 545, y2: 497, color: [230, 230, 230] },
    {
      text: `Variabele huur ${formatPercent(invoice.turnover_rate_percent)} over ${formatMoney(variableBase)}`,
      size: 10,
      x: 64,
      y: 476,
    },
    { text: formatMoney(invoice.variable_fee_net), size: 10, x: 455, y: 476 },
    {
      text: `Omzetbasis ex btw ${formatMoney(invoice.turnover_net)}`,
      size: 8,
      x: 64,
      y: 459,
      color: [105, 105, 105],
    },
    {
      text: `Drempel ex btw ${formatMoney(invoice.turnover_threshold_net)}`,
      size: 8,
      x: 64,
      y: 446,
      color: [105, 105, 105],
    },
    { type: "rect", x: 340, y: 337, w: 205, h: 86, color: [248, 244, 244] },
    { text: "Subtotaal ex btw", size: 10, x: 355, y: 400 },
    { text: formatMoney(invoice.subtotal_net), size: 10, x: 455, y: 400 },
    { text: `Btw ${formatPercent(invoice.vat_rate)}`, size: 10, x: 355, y: 380 },
    { text: formatMoney(invoice.vat_amount), size: 10, x: 455, y: 380 },
    { type: "line", x1: 355, y1: 364, x2: 530, y2: 364, color: [222, 165, 164] },
    { text: "Totaal incl btw", size: 12, x: 355, y: 345, font: "bold" },
    { text: formatMoney(invoice.total_gross), size: 12, x: 455, y: 345, font: "bold" },
    {
      text: "Factuur uitgereikt door afnemer namens leverancier (zelf-facturatie / self-billing).",
      size: 8,
      x: 50,
      y: 290,
      color: [105, 105, 105],
    },
    {
      text: `Het factuurtotaal wordt overgemaakt naar IBAN ${landlord.iban}.`,
      size: 8,
      x: 50,
      y: 150,
      color: [105, 105, 105],
    },
    { type: "line", x1: 50, y1: 116, x2: 545, y2: 116, color: [222, 165, 164] },
    {
      text: "dailyflowers.nl",
      size: 9,
      x: 50,
      y: 96,
      font: "bold",
      color: [23, 23, 23],
    },
    { text: invoice.notes ? `Notitie: ${invoice.notes}` : "", size: 8, x: 50, y: 250 },
  ].filter((line) => line.type || line.text);

  return createPdf(lines);
}

function buildAfsInvoiceUbl(context) {
  const { invoice, landlord, customer, machine } = context;
  const variableBase = Math.max(0, invoice.turnover_net - invoice.turnover_threshold_net);
  const lines = [
    {
      id: "1",
      name: "Vaste huur AFS-machine",
      description: `${machine.display_name} - ${periodLabel(invoice.period)}`,
      amount: invoice.fixed_fee_net,
    },
    {
      id: "2",
      name: `Variabele huur ${formatPercent(invoice.turnover_rate_percent)}`,
      description: `Omzetbasis ${formatMoney(invoice.turnover_net)}, drempel ${formatMoney(invoice.turnover_threshold_net)}, grondslag ${formatMoney(variableBase)}`,
      amount: invoice.variable_fee_net,
    },
  ].filter((line) => Math.abs(line.amount) > 0.004);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>${xmlEscape(invoice.invoice_number)}</cbc:ID>
  <cbc:IssueDate>${xmlEscape(dateOnly(invoice.invoice_date))}</cbc:IssueDate>
  ${invoice.due_date ? `<cbc:DueDate>${xmlEscape(dateOnly(invoice.due_date))}</cbc:DueDate>` : ""}
  <cbc:InvoiceTypeCode>389</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:Note>${xmlEscape(`Factuur uitgereikt door afnemer namens leverancier (zelf-facturatie / self-billing). AFS huur ${machine.display_name} - ${periodLabel(invoice.period)}`)}</cbc:Note>
  <cac:AccountingSupplierParty>
    ${ublParty(landlord)}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    ${ublParty(customer)}
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${xmlEscape(landlord.iban)}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${moneyXml(invoice.vat_amount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${moneyXml(invoice.subtotal_net)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${moneyXml(invoice.vat_amount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${numberXml(invoice.vat_rate)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${moneyXml(invoice.subtotal_net)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${moneyXml(invoice.subtotal_net)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${moneyXml(invoice.total_gross)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${moneyXml(invoice.total_gross)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines.map((line) => ublInvoiceLine(line, invoice.vat_rate)).join("\n")}
</Invoice>`;
}

async function sendAfsRentalInvoiceEmail(context, { to, subject, message }) {
  const missing = missingSelfBillingFields(context.landlord);
  if (missing.length > 0) {
    throw new Error(`Verhuurdergegevens incompleet voor self-billing: ${missing.join(", ")}`);
  }

  const settings = await loadAfsMailSettings();
  const from =
    process.env.GMAIL_FROM_EMAIL ?? settings.from_email ?? process.env.AFS_INVOICE_FROM_EMAIL;
  if (!from) throw new Error("GMAIL_FROM_EMAIL ontbreekt in de Railway environment variables");
  if (!to) throw new Error("Ontvanger e-mailadres ontbreekt");

  const pdf = buildAfsInvoicePdf(context);
  const ubl = buildAfsInvoiceUbl(context);
  const invoiceNumber = context.invoice.invoice_number;
  const html = invoiceEmailHtml(context, message);
  const raw = buildGmailRawMessage({
    from,
    to,
    cc: AFS_INVOICE_CC_EMAIL,
    replyTo: process.env.AFS_INVOICE_REPLY_TO_EMAIL ?? from,
    subject,
    html,
    attachments: [
      {
        filename: `${safeFileName(invoiceNumber)}.pdf`,
        contentType: "application/pdf",
        content: pdf,
      },
      {
        filename: `${safeFileName(invoiceNumber)}.xml`,
        contentType: "application/xml",
        content: Buffer.from(ubl, "utf8"),
      },
    ],
  });
  const accessToken = await getGmailAccessToken();

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  const responseText = await response.text();
  let responseJson = {};
  try {
    responseJson = responseText ? JSON.parse(responseText) : {};
  } catch {
    responseJson = { message: responseText };
  }

  if (!response.ok) {
    const message = responseJson?.error?.message ?? responseJson?.message ?? responseText;
    throw new Error(message || `Gmail fout ${response.status}`);
  }

  return responseJson;
}

async function getGmailAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const settings = await loadAfsMailSettings();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN ?? settings.gmail_refresh_token;
  if (!clientId) throw new Error("GMAIL_CLIENT_ID ontbreekt in de Railway environment variables");
  if (!clientSecret)
    throw new Error("GMAIL_CLIENT_SECRET ontbreekt in de Railway environment variables");
  if (!refreshToken) throw new Error("Gmail is nog niet gekoppeld op de AFS facturatie pagina");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const responseJson = await response.json().catch(() => ({}));
  if (!response.ok || !responseJson.access_token) {
    throw new Error(
      responseJson.error_description ?? responseJson.error ?? "Gmail token ophalen mislukt",
    );
  }
  return responseJson.access_token;
}

function buildGmailRawMessage({ from, to, cc, replyTo, subject, html, attachments }) {
  const boundary = `dailyflowers-${crypto.randomUUID()}`;
  const lines = [
    `From: ${mimeHeader(from)}`,
    `To: ${mimeHeader(to)}`,
    ...(cc ? [`Cc: ${mimeHeader(cc)}`] : []),
    `Reply-To: ${mimeHeader(replyTo)}`,
    `Subject: ${mimeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    chunkBase64(Buffer.from(html, "utf8").toString("base64")),
  ];

  for (const attachment of attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      chunkBase64(attachment.content.toString("base64")),
    );
  }

  lines.push(`--${boundary}--`, "");
  return base64Url(Buffer.from(lines.join("\r\n"), "utf8"));
}

function mimeHeader(value) {
  const text = String(value ?? "");
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function base64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function chunkBase64(value) {
  return String(value)
    .replace(/.{1,76}/g, "$&\r\n")
    .trim();
}

function buildGmailAuthUrl({ redirectUri, state }) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  if (!clientId) throw new Error("GMAIL_CLIENT_ID ontbreekt in de Railway environment variables");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.send");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeGmailAuthorizationCode({ code, redirectUri }) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId) throw new Error("GMAIL_CLIENT_ID ontbreekt in de Railway environment variables");
  if (!clientSecret)
    throw new Error("GMAIL_CLIENT_SECRET ontbreekt in de Railway environment variables");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const responseJson = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      responseJson.error_description ?? responseJson.error ?? "Gmail OAuth koppeling mislukt",
    );
  }

  const existing = await loadAfsMailSettings();
  const refreshToken = responseJson.refresh_token ?? existing.gmail_refresh_token;
  if (!refreshToken) {
    throw new Error(
      "Google gaf geen refresh token terug. Klik opnieuw op koppelen en geef expliciet toestemming.",
    );
  }

  const connectedEmail = responseJson.access_token
    ? await fetchGmailProfileEmail(responseJson.access_token).catch(() => "")
    : "";
  const fromEmail =
    process.env.GMAIL_FROM_EMAIL ??
    (connectedEmail ? `Daily Flowers <${connectedEmail}>` : (existing.from_email ?? ""));

  await pool.query(
    `
      INSERT INTO public.afs_invoice_mail_settings (
        id, provider, gmail_refresh_token, from_email, connected_email,
        connected_at, disconnected_at, last_error
      )
      VALUES ('gmail', 'gmail', $1, $2, $3, now(), NULL, NULL)
      ON CONFLICT (id) DO UPDATE SET
        gmail_refresh_token = EXCLUDED.gmail_refresh_token,
        from_email = EXCLUDED.from_email,
        connected_email = EXCLUDED.connected_email,
        connected_at = now(),
        disconnected_at = NULL,
        last_error = NULL
    `,
    [refreshToken, fromEmail || null, connectedEmail || null],
  );

  return gmailConnectionStatus();
}

async function fetchGmailProfileEmail(accessToken) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const responseJson = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(responseJson.error?.message ?? "Gmail profiel ophalen mislukt");
  return responseJson.emailAddress ?? "";
}

async function gmailConnectionStatus() {
  const settings = await loadAfsMailSettings();
  const envConnected = Boolean(process.env.GMAIL_REFRESH_TOKEN);
  const dbConnected = Boolean(settings.gmail_refresh_token);
  return {
    connected: envConnected || dbConnected,
    source: envConnected ? "env" : dbConnected ? "database" : null,
    from_email: process.env.GMAIL_FROM_EMAIL ?? settings.from_email ?? "",
    connected_email: settings.connected_email ?? "",
    connected_at: settings.connected_at ?? null,
    disconnected_at: settings.disconnected_at ?? null,
    last_error: settings.last_error ?? null,
    client_configured: Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET),
  };
}

async function disconnectGmail() {
  await pool.query(
    `
      INSERT INTO public.afs_invoice_mail_settings (
        id, provider, gmail_refresh_token, connected_at, disconnected_at
      )
      VALUES ('gmail', 'gmail', NULL, NULL, now())
      ON CONFLICT (id) DO UPDATE SET
        gmail_refresh_token = NULL,
        connected_at = NULL,
        disconnected_at = now(),
        last_error = NULL
    `,
  );
}

async function loadAfsMailSettings() {
  const result = await pool.query(
    `
      SELECT gmail_refresh_token, from_email, connected_email, connected_at,
             disconnected_at, last_error
      FROM public.afs_invoice_mail_settings
      WHERE id = 'gmail'
      LIMIT 1
    `,
  );
  return result.rows[0] ?? {};
}

function normalizeGmailRedirectUri(value) {
  const uri = String(value ?? process.env.GMAIL_REDIRECT_URI ?? "").trim();
  if (!uri) throw new Error("Gmail callback URL ontbreekt");
  const parsed = new URL(uri);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Gmail callback URL moet http(s) zijn");
  }
  return parsed.toString();
}

function invoiceCustomerConfig() {
  return {
    name: process.env.AFS_INVOICE_CUSTOMER_NAME ?? "Daily Flowers",
    email: process.env.AFS_INVOICE_CUSTOMER_EMAIL ?? "",
    phone: process.env.AFS_INVOICE_CUSTOMER_PHONE ?? "",
    address_line1: process.env.AFS_INVOICE_CUSTOMER_ADDRESS_LINE1 ?? "",
    postal_code: process.env.AFS_INVOICE_CUSTOMER_POSTAL_CODE ?? "",
    city: process.env.AFS_INVOICE_CUSTOMER_CITY ?? "",
    country: process.env.AFS_INVOICE_CUSTOMER_COUNTRY ?? "NL",
    kvk_number: process.env.AFS_INVOICE_CUSTOMER_KVK_NUMBER ?? "",
    vat_number: process.env.AFS_INVOICE_CUSTOMER_VAT_NUMBER ?? "",
    iban: "",
  };
}

function invoiceEmailHtml(context, customMessage) {
  const { invoice, landlord, machine } = context;
  const intro = customMessage || defaultInvoiceEmailBody(context);
  const paragraphs = intro
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return `
    <div style="margin:0; padding:28px; background:#ffffff; font-family: Arial, Helvetica, sans-serif; color:#171717;">
      <div style="max-width:620px;">
        <div style="font-size:20px; font-weight:700; letter-spacing:.08em; margin-bottom:22px;">DAILY FLOWERS</div>
        ${paragraphs.map((paragraph) => `<p style="font-size:14px; line-height:1.55; margin:0 0 14px;">${htmlEscape(paragraph).replace(/\n/g, "<br>")}</p>`).join("")}
        <table cellpadding="0" cellspacing="0" style="margin-top:22px; border-collapse:collapse; width:100%; font-size:13px;">
          <tr><td style="padding:9px 0; border-top:1px solid #ead1d1; color:#666;">Factuur</td><td style="padding:9px 0; border-top:1px solid #ead1d1; text-align:right;">${htmlEscape(invoice.invoice_number)}</td></tr>
          <tr><td style="padding:9px 0; border-top:1px solid #eee; color:#666;">Periode</td><td style="padding:9px 0; border-top:1px solid #eee; text-align:right;">${htmlEscape(periodLabel(invoice.period))}</td></tr>
          <tr><td style="padding:9px 0; border-top:1px solid #eee; color:#666;">Verhuurder</td><td style="padding:9px 0; border-top:1px solid #eee; text-align:right;">${htmlEscape(landlord.invoice_name || landlord.name)}</td></tr>
          <tr><td style="padding:11px 0; border-top:1px solid #171717; font-weight:700;">Totaal incl. btw</td><td style="padding:11px 0; border-top:1px solid #171717; text-align:right; font-weight:700;">${htmlEscape(formatMoney(invoice.total_gross))}</td></tr>
        </table>
        <p style="font-size:12px; line-height:1.5; color:#666; margin-top:22px;">De PDF-factuur en UBL zijn als bijlage toegevoegd.</p>
      </div>
    </div>
  `;
}

function defaultInvoiceEmailBody(context) {
  const invoiceNumber = context.invoice?.invoice_number ?? context.invoiceNumber ?? "";
  const period = context.invoice?.period ?? context.period ?? "";
  const machineName = context.machine?.display_name ? ` voor ${context.machine.display_name}` : "";
  return `Beste,

Bijgevoegd vind je factuur ${invoiceNumber} voor de AFS-huur${machineName} over ${periodLabel(period)}.

Met vriendelijke groet,
Daily Flowers`;
}

function ublParty(party) {
  const displayName = party.invoice_name || party.name;
  return `<cac:Party>
      <cbc:Name>${xmlEscape(displayName)}</cbc:Name>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlEscape(party.address_line1 ?? "")}</cbc:StreetName>
        <cbc:PostalZone>${xmlEscape(party.postal_code ?? "")}</cbc:PostalZone>
        <cbc:CityName>${xmlEscape(party.city ?? "")}</cbc:CityName>
        <cac:Country>
          <cbc:IdentificationCode>${xmlEscape(party.country || "NL")}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      ${
        party.vat_number
          ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>${xmlEscape(party.vat_number)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>`
          : ""
      }
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(displayName)}</cbc:RegistrationName>
        ${party.kvk_number ? `<cbc:CompanyID>${xmlEscape(party.kvk_number)}</cbc:CompanyID>` : ""}
      </cac:PartyLegalEntity>
      ${
        party.email
          ? `<cac:Contact>
        <cbc:ElectronicMail>${xmlEscape(party.email)}</cbc:ElectronicMail>
      </cac:Contact>`
          : ""
      }
    </cac:Party>`;
}

function ublInvoiceLine(line, vatRate) {
  return `  <cac:InvoiceLine>
    <cbc:ID>${xmlEscape(line.id)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">${moneyXml(line.amount)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>${xmlEscape(line.description)}</cbc:Description>
      <cbc:Name>${xmlEscape(line.name)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${numberXml(vatRate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="EUR">${moneyXml(line.amount)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
}

function createPdf(lines) {
  const logo = lines.some((line) => line.type === "image" && line.name === "Logo")
    ? dailyFlowersLogoPdfImage()
    : null;
  const content = lines.map(renderPdfCommand).join("\n");
  const stream = `${content}\n`;
  const logoMaskNumber = logo?.smask ? 7 : null;
  const logoNumber = logo ? (logoMaskNumber ? 8 : 7) : null;
  const xObjects = logoNumber ? `/XObject << /Logo ${logoNumber} 0 R >>` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> ${xObjects} >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  if (logo?.smask) objects.push(pdfImageObject(logo.smask));
  if (logo) objects.push(pdfImageObject(logo.image, logoMaskNumber));

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function renderPdfCommand(command) {
  if (command.type === "image") {
    return `q ${pdfNumber(command.w)} 0 0 ${pdfNumber(command.h)} ${pdfNumber(command.x)} ${pdfNumber(command.y)} cm /${command.name} Do Q`;
  }
  if (command.type === "rect") {
    const [r, g, b] = rgb(command.color);
    return `${r} ${g} ${b} rg ${command.x} ${command.y} ${command.w} ${command.h} re f`;
  }
  if (command.type === "line") {
    const [r, g, b] = rgb(command.color);
    return `${r} ${g} ${b} RG 0.7 w ${command.x1} ${command.y1} m ${command.x2} ${command.y2} l S`;
  }

  const size = Number(command.size ?? 10);
  const x = Number(command.x ?? 50);
  const y = Number(command.y ?? 750);
  const [r, g, b] = rgb(command.color);
  const font = command.font === "bold" ? "F2" : "F1";
  return `${r} ${g} ${b} rg BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(command.text)}) Tj ET`;
}

function pdfImageObject(image, smaskNumber = null) {
  const colorSpace =
    image.colorSpace === "Indexed"
      ? `[/Indexed /DeviceRGB ${image.maxPaletteIndex} <${image.palette.toString("hex")}>]`
      : image.colorSpace;
  const decodeParms = image.decodeParms
    ? `/DecodeParms << /Predictor ${image.decodeParms.predictor} /Colors ${image.decodeParms.colors} /BitsPerComponent ${image.decodeParms.bitsPerComponent} /Columns ${image.decodeParms.columns} >>`
    : "";
  const smask = smaskNumber ? `/SMask ${smaskNumber} 0 R` : "";
  return `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace ${colorSpace} /BitsPerComponent ${image.bitsPerComponent} /Filter /FlateDecode ${decodeParms} ${smask} /Length ${image.data.length} >>\nstream\n${image.data.toString("latin1")}\nendstream`;
}

function dailyFlowersLogoPdfImage() {
  if (cachedDailyFlowersLogoPdfImage !== undefined) return cachedDailyFlowersLogoPdfImage;
  const logoPath = path.resolve(process.cwd(), "local-supabase", "assets", "dailyflowers-logo.png");
  if (!fs.existsSync(logoPath)) {
    cachedDailyFlowersLogoPdfImage = null;
    return cachedDailyFlowersLogoPdfImage;
  }

  const png = readIndexedPng(fs.readFileSync(logoPath));
  const alpha = indexedPngAlphaMask(png);
  cachedDailyFlowersLogoPdfImage = {
    image: {
      width: png.width,
      height: png.height,
      colorSpace: "Indexed",
      maxPaletteIndex: Math.floor(png.palette.length / 3) - 1,
      palette: png.palette,
      bitsPerComponent: png.bitDepth,
      data: png.idat,
      decodeParms: {
        predictor: 15,
        colors: 1,
        bitsPerComponent: png.bitDepth,
        columns: png.width,
      },
    },
    smask: alpha
      ? {
          width: png.width,
          height: png.height,
          colorSpace: "/DeviceGray",
          bitsPerComponent: 8,
          data: alpha,
        }
      : null,
  };
  return cachedDailyFlowersLogoPdfImage;
}

function readIndexedPng(buffer) {
  if (buffer.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Logo PNG heeft geen geldige PNG header");
  }

  let offset = 8;
  const chunks = { idat: [] };
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.slice(offset + 4, offset + 8).toString("ascii");
    const data = buffer.slice(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      chunks.width = data.readUInt32BE(0);
      chunks.height = data.readUInt32BE(4);
      chunks.bitDepth = data[8];
      chunks.colorType = data[9];
      chunks.interlace = data[12];
    } else if (type === "PLTE") {
      chunks.palette = data;
    } else if (type === "tRNS") {
      chunks.transparency = data;
    } else if (type === "IDAT") {
      chunks.idat.push(data);
    }
    offset += 12 + length;
  }

  if (chunks.colorType !== 3 || chunks.bitDepth !== 8 || chunks.interlace !== 0) {
    throw new Error("Logo PNG moet een niet-geinterlacede indexed PNG met 8-bit palette zijn");
  }
  if (!chunks.palette || chunks.idat.length === 0) {
    throw new Error("Logo PNG mist palette of beelddata");
  }

  return {
    width: chunks.width,
    height: chunks.height,
    bitDepth: chunks.bitDepth,
    palette: chunks.palette,
    transparency: chunks.transparency ?? Buffer.alloc(0),
    idat: Buffer.concat(chunks.idat),
  };
}

function indexedPngAlphaMask(png) {
  if (!png.transparency.length) return null;
  const indices = decodeIndexedPngRows(png);
  const alpha = Buffer.alloc(png.width * png.height);
  let hasTransparency = false;

  for (let index = 0; index < indices.length; index += 1) {
    const paletteIndex = indices[index];
    const value = png.transparency[paletteIndex] ?? 255;
    alpha[index] = value;
    if (value !== 255) hasTransparency = true;
  }

  return hasTransparency ? zlib.deflateSync(alpha) : null;
}

function decodeIndexedPngRows(png) {
  const inflated = zlib.inflateSync(png.idat);
  const stride = png.width;
  const output = Buffer.alloc(png.width * png.height);
  let sourceOffset = 0;
  let targetOffset = 0;
  let previous = Buffer.alloc(stride);

  for (let row = 0; row < png.height; row += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const current = Buffer.from(inflated.slice(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;

    for (let column = 0; column < stride; column += 1) {
      const left = column > 0 ? current[column - 1] : 0;
      const up = previous[column] ?? 0;
      const upLeft = column > 0 ? previous[column - 1] : 0;
      if (filter === 1) current[column] = (current[column] + left) & 0xff;
      else if (filter === 2) current[column] = (current[column] + up) & 0xff;
      else if (filter === 3)
        current[column] = (current[column] + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) current[column] = (current[column] + paeth(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`Onbekend PNG-filter ${filter}`);
    }

    current.copy(output, targetOffset);
    targetOffset += stride;
    previous = current;
  }

  return output;
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left;
  return distanceUp <= distanceUpLeft ? up : upLeft;
}

function pdfNumber(value) {
  return Number(value)
    .toFixed(2)
    .replace(/\.?0+$/, "");
}

function rgb(value) {
  const [r, g, b] = value ?? [23, 23, 23];
  return [r / 255, g / 255, b / 255].map((part) => Number(part.toFixed(4)));
}

function partyDetailsPdfLines(party, x, startY, options = {}) {
  const { includeIban = false } = options;
  const lines = [
    party.address_line1,
    [party.postal_code, party.city].filter(Boolean).join(" "),
    party.country && party.country !== "NL" ? party.country : "",
    party.vat_number ? `Btw ${party.vat_number}` : "",
    party.kvk_number ? `KvK ${party.kvk_number}` : "",
    includeIban && party.iban ? `IBAN ${party.iban}` : "",
  ].filter(Boolean);
  return lines.slice(0, 5).map((text, index) => ({
    text,
    size: 7.5,
    x,
    y: startY - index * 11,
    color: [23, 23, 23],
  }));
}

function missingSelfBillingFields(landlord) {
  return [
    [landlord.name || landlord.invoice_name, "naam"],
    [landlord.address_line1, "adres"],
    [landlord.postal_code, "postcode"],
    [landlord.city, "plaats"],
    [landlord.vat_number, "btw-nummer"],
    [landlord.iban, "IBAN"],
  ]
    .filter(([value]) => !String(value ?? "").trim())
    .map(([, label]) => label);
}

function pdfEscape(value) {
  return asciiText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function asciiText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

function moneyNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function formatMoney(value) {
  return `EUR ${moneyNumber(value).toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function moneyXml(value) {
  return moneyNumber(value).toFixed(2);
}

function numberXml(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? String(parsed) : "0";
}

function formatPercent(value) {
  const parsed = Number(value ?? 0);
  return `${Number.isFinite(parsed) ? parsed.toLocaleString("nl-NL", { maximumFractionDigits: 2 }) : "0"}%`;
}

function periodLabel(period) {
  const [year, month] = String(period ?? "")
    .split("-")
    .map(Number);
  if (!year || !month) return String(period ?? "");
  return new Date(year, month - 1, 1).toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });
}

function formatIsoDate(value) {
  const date = dateOnly(value);
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return `${day}-${month}-${year}`;
}

function dateOnly(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function safeFileName(value) {
  return String(value ?? "factuur")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function htmlEscape(value) {
  return xmlEscape(value);
}

async function attachMachines(rows, machineColumns) {
  const ids = [...new Set(rows.map((row) => row.machine_id).filter(Boolean))];
  if (ids.length === 0) {
    return rows.map((row) => ({ ...row, machines: null }));
  }

  const columns = machineColumns.length > 0 ? machineColumns : ["display_name", "afs_number"];
  const select = ["id", ...columns.filter((column) => column !== "id")].map(quoteIdent).join(", ");
  const result = await pool.query(
    `SELECT ${select} FROM public.machines WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  const machines = new Map(result.rows.map((row) => [row.id, stripToColumns(row, columns)]));
  return rows.map((row) => ({
    ...row,
    machines: row.machine_id ? (machines.get(row.machine_id) ?? null) : null,
  }));
}

function parseSelect(selectValue) {
  const parts = splitTopLevel(selectValue);
  const baseColumns = [];
  let star = false;
  let nestedMachines = false;
  let machineColumns = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed === "*") {
      star = true;
      continue;
    }

    const machineMatch = /^machines\((.*)\)$/.exec(trimmed);
    if (machineMatch) {
      nestedMachines = true;
      machineColumns = splitTopLevel(machineMatch[1])
        .map((column) => column.trim())
        .filter(Boolean);
      continue;
    }

    baseColumns.push(trimmed);
  }

  return { baseColumns, machineColumns, nestedMachines, star };
}

function selectSqlColumns(resource, select) {
  if (select.star) return { sql: "*", joinOnlyMachineId: false };

  const columns = select.baseColumns.filter((column) => resource.columns.includes(column));
  let joinOnlyMachineId = false;

  if (
    select.nestedMachines &&
    resource.columns.includes("machine_id") &&
    !columns.includes("machine_id")
  ) {
    columns.push("machine_id");
    joinOnlyMachineId = true;
  }

  if (columns.length === 0) return { sql: "*", joinOnlyMachineId: false };
  return { sql: columns.map(quoteIdent).join(", "), joinOnlyMachineId };
}

function buildWhere(resource, searchParams, initialValues = []) {
  const values = [...initialValues];
  const clauses = [];
  const reserved = new Set(["select", "order", "limit", "offset", "on_conflict"]);

  for (const [key, value] of searchParams) {
    if (reserved.has(key)) continue;
    if (key === "or") {
      const orClause = parseOrFilter(resource, value, values);
      if (orClause) clauses.push(orClause);
      continue;
    }
    clauses.push(parseFilter(resource, key, value, values));
  }

  return {
    clause: clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function parseFilter(resource, key, value, values) {
  const columnSql = columnExpression(resource, key);

  if (value === "is.null") return `${columnSql} IS NULL`;
  if (value === "not.is.null") return `${columnSql} IS NOT NULL`;

  const inMatch = /^in\.\((.*)\)$/.exec(value);
  if (inMatch) {
    const items = parseList(inMatch[1]);
    if (items.length === 0) return "false";
    const placeholders = items.map((item) => {
      values.push(item);
      return `$${values.length}`;
    });
    return `${columnSql} IN (${placeholders.join(", ")})`;
  }

  const match = /^([a-z]+)\.(.*)$/s.exec(value);
  if (!match) throw new Error(`Unsupported filter value: ${value}`);

  const [, operator, raw] = match;
  values.push(raw);
  const placeholder = `$${values.length}`;

  switch (operator) {
    case "eq":
      return `${columnSql} = ${placeholder}`;
    case "neq":
      return `${columnSql} <> ${placeholder}`;
    case "gte":
      return `${columnSql} >= ${placeholder}`;
    case "lte":
      return `${columnSql} <= ${placeholder}`;
    case "gt":
      return `${columnSql} > ${placeholder}`;
    case "lt":
      return `${columnSql} < ${placeholder}`;
    case "ilike":
      return `${columnSql} ILIKE ${placeholder}`;
    default:
      throw new Error(`Unsupported filter operator: ${operator}`);
  }
}

function parseOrFilter(resource, value, values) {
  const trimmed = value.replace(/^\(/, "").replace(/\)$/, "");
  const clauses = splitTopLevel(trimmed)
    .map((part) => {
      const match = /^(.+?)\.([a-z]+)\.(.*)$/s.exec(part.trim());
      if (!match) return null;
      const [, key, operator, raw] = match;
      if (operator !== "ilike" && operator !== "eq")
        throw new Error(`Unsupported OR operator: ${operator}`);
      values.push(raw);
      const comparison = operator === "ilike" ? "ILIKE" : "=";
      return `${columnExpression(resource, key)} ${comparison} $${values.length}`;
    })
    .filter(Boolean);

  return clauses.length > 0 ? `(${clauses.join(" OR ")})` : "";
}

function columnExpression(resource, key) {
  const jsonMatch = /^([a-z_][a-z0-9_]*)->>([a-z_][a-z0-9_]*)$/i.exec(key);
  if (jsonMatch) {
    const [, column, jsonKey] = jsonMatch;
    if (!resource.columns.includes(column)) throw new Error(`Unknown column: ${column}`);
    return `${quoteIdent(column)} ->> '${jsonKey}'`;
  }

  if (!resource.columns.includes(key)) throw new Error(`Unknown column: ${key}`);
  return quoteIdent(key);
}

function buildOrder(resource, values) {
  const parts = values.flatMap((value) => splitTopLevel(value));
  const clauses = [];

  for (const part of parts) {
    const [column, direction = "asc", nulls] = part.trim().split(".");
    if (!column) continue;
    if (!resource.columns.includes(column)) throw new Error(`Unknown order column: ${column}`);

    const dir = direction.toLowerCase() === "desc" ? "DESC" : "ASC";
    const nullsSql =
      nulls?.toLowerCase() === "nullsfirst"
        ? " NULLS FIRST"
        : nulls?.toLowerCase() === "nullslast"
          ? " NULLS LAST"
          : "";
    clauses.push(`${quoteIdent(column)} ${dir}${nullsSql}`);
  }

  return { sql: clauses.length > 0 ? ` ORDER BY ${clauses.join(", ")}` : "" };
}

function getRange(req, url) {
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  if (limitParam) {
    return {
      limit: Number(limitParam),
      offset: offsetParam ? Number(offsetParam) : 0,
    };
  }

  const range = String(req.headers.range ?? "");
  const match = /^(\d+)-(\d+)$/.exec(range);
  if (!match) return { limit: null, offset: null };

  const start = Number(match[1]);
  const end = Number(match[2]);
  return { limit: end - start + 1, offset: start };
}

function parseConflictColumns(resource, value) {
  if (!value) return [];
  const columns = value
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
  for (const column of columns) {
    if (!resource.columns.includes(column)) throw new Error(`Unknown conflict column: ${column}`);
  }
  return columns;
}

function buildConflictSql(columns, conflictColumns, ignoreDuplicates) {
  if (conflictColumns.length === 0) return "";
  const target = conflictColumns.map(quoteIdent).join(", ");
  if (ignoreDuplicates) return `ON CONFLICT (${target}) DO NOTHING`;

  const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
  if (updateColumns.length === 0) return `ON CONFLICT (${target}) DO NOTHING`;
  const setters = updateColumns
    .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`)
    .join(", ");
  return `ON CONFLICT (${target}) DO UPDATE SET ${setters}`;
}

async function findLocalUser(email, password) {
  const result = await pool.query(
    "SELECT id, email, password, created_at FROM local_auth.users WHERE lower(email) = lower($1) LIMIT 1",
    [email],
  );
  const row = result.rows[0];
  if (!row || !verifyPassword(password, String(row.password ?? ""))) return null;
  return { id: row.id, email: row.email, created_at: row.created_at };
}

function normalizeUserEmail(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored.startsWith("pbkdf2_sha256$")) return stored === password;

  const parts = stored.split("$");
  if (parts.length !== 4) return false;

  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = Buffer.from(parts[3], "hex");
  if (!Number.isFinite(iterations) || !salt || expected.length === 0) return false;

  const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function redactConnectionString(value) {
  try {
    const parsed = new URL(value);
    if (parsed.username) parsed.username = "***";
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "<configured>";
  }
}

function isHostedRuntime() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_ENVIRONMENT_ID ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.NODE_ENV === "production",
  );
}

function makeSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + tokenTtlSeconds;
  const accessToken = signJwt({
    aud: "authenticated",
    exp: expiresAt,
    iat: now,
    iss: "supabase",
    role: "authenticated",
    sub: user.id,
    email: user.email,
  });

  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: tokenTtlSeconds,
    expires_at: expiresAt,
    refresh_token: crypto.randomBytes(32).toString("base64url"),
    user: userFromClaims({ sub: user.id, email: user.email, role: "authenticated" }),
  };
}

function signJwt(payload) {
  const header = base64urlJson({ alg: "HS256", typ: "JWT" });
  const body = base64urlJson(payload);
  const data = `${header}.${body}`;
  const signature = crypto.createHmac("sha256", jwtSecret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function verifyRequestClaims(req) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) return null;

  try {
    const [encodedHeader, encodedPayload, signature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !signature) return null;

    const expected = crypto
      .createHmac("sha256", jwtSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

    const claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

function userFromClaims(claims) {
  return {
    id: claims.sub,
    aud: "authenticated",
    role: claims.role ?? "authenticated",
    email: claims.email,
    email_confirmed_at: new Date(0).toISOString(),
    confirmed_at: new Date(0).toISOString(),
    created_at: new Date(0).toISOString(),
    updated_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
  };
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body.trim()) return {};
  return JSON.parse(body);
}

async function readRaw(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

async function readMolliePaymentId(req) {
  const rawBody = await readRaw(req);
  const contentType = req.headers["content-type"] ?? "";

  if (String(contentType).includes("application/json")) {
    const body = rawBody.trim() ? JSON.parse(rawBody) : {};
    return body.id ?? null;
  }

  const params = new URLSearchParams(rawBody);
  return params.get("id");
}

function splitTopLevel(value) {
  const parts = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (current) parts.push(current);
  return parts;
}

function parseList(value) {
  if (!value.trim()) return [];
  return splitTopLevel(value).map((item) => item.trim().replace(/^"|"$/g, ""));
}

function stripToColumns(row, columns) {
  const out = {};
  for (const column of columns) out[column] = row[column];
  return out;
}

function quoteIdent(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe identifier: ${value}`);
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^"|"$/g, "");
  }
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function addCors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,HEAD,POST,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    [
      "authorization",
      "apikey",
      "content-type",
      "x-client-info",
      "x-supabase-api-version",
      "prefer",
      "range",
      "accept-profile",
      "content-profile",
    ].join(", "),
  );
  res.setHeader("access-control-expose-headers", "content-range");
}

function sendHead(res, status, headers = {}) {
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, String(value));
  res.writeHead(status);
  res.end();
}

function sendJson(res, status, data, headers = {}) {
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, String(value));
  if (status === 204) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.writeHead(status);
  res.end(JSON.stringify(data));
}

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { message: "Method not allowed" });
    return;
  }

  const staticOnly = isStaticAssetPath(url.pathname);
  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    if (staticOnly) {
      sendJson(res, 404, { message: "Static asset not found" });
      return;
    }
    await serveBuiltApp(req, res, url);
    return;
  }

  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    if (staticOnly) {
      sendJson(res, 404, { message: "Static asset not found" });
      return;
    }
    await serveBuiltApp(req, res, url);
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Content-Length": stat.size,
    "Cache-Control": filePath.includes(`${path.sep}assets${path.sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

function resolveStaticPath(pathname) {
  const cleanPath = decodeURIComponent(pathname).replace(/\\/g, "/");
  const relativePath = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const requested = path.resolve(staticRoot, relativePath);
  const rootWithSep = `${staticRoot}${path.sep}`;
  if (requested !== staticRoot && !requested.startsWith(rootWithSep)) return null;
  if (fs.existsSync(requested) && fs.statSync(requested).isFile()) return requested;

  const indexPath = path.join(staticRoot, "index.html");
  return fs.existsSync(indexPath) ? indexPath : null;
}

function isStaticAssetPath(pathname) {
  const cleanPath = pathname.split("?")[0] ?? "";
  if (cleanPath.startsWith("/assets/")) return true;
  return Boolean(path.extname(cleanPath));
}

async function serveBuiltApp(req, res, url) {
  if (!fs.existsSync(builtServerEntry)) {
    sendJson(res, 404, { message: "Built app not found. Run npm run build first." });
    return;
  }

  const builtAppServer = await getBuiltAppServer();
  const request = new Request(url.toString(), {
    method: req.method,
    headers: nodeHeadersToWebHeaders(req.headers),
  });
  const response = await builtAppServer.fetch(request, {}, {});
  await sendWebResponse(res, response);
}

async function getBuiltAppServer() {
  if (!builtAppServerPromise) {
    builtAppServerPromise = import(pathToFileURL(builtServerEntry).href).then(
      (module) => module.default,
    );
  }
  return builtAppServerPromise;
}

function nodeHeadersToWebHeaders(headers) {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item);
    } else {
      result.set(key, String(value));
    }
  }
  return result;
}

async function sendWebResponse(res, response) {
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "content-encoding") res.setHeader(key, value);
  });
  res.writeHead(response.status, response.statusText);
  if (!response.body) {
    res.end();
    return;
  }
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[ext] ?? "application/octet-stream";
}
