import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  Printer,
  Presentation,
  RefreshCw,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MultiPeriodPicker } from "@/components/multi-period-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { currentMonth, formatDateNL, formatDateTimeNL, formatEUR } from "@/lib/format";
import {
  CHANNELS,
  channelLabel,
  downloadTransactionTemplate,
  monthShortLabel,
  monthToQuarterKey,
  parseGlTransactionWorkbook,
  sectionIndex,
  sectionLabel,
  type GlAccount,
} from "@/lib/pl";
import {
  AFS_INVESTMENT_COMPONENTS,
  AFS_BUDGET_PAYMENT_MONTH_OFFSET,
  AFS_MACHINE_INPUT_KEY,
  AFS_REVENUE_COMMISSION_INPUT_KEY,
  CASHFLOW_INPUT_DEFINITIONS,
  afsRevenueCommissionValues,
  afsInvestmentAmountPerMachine,
  afsInvestmentPackageTotal,
  afsBudgetPaymentPeriod,
  buildAfsInvestmentValues,
  buildCashflowReport,
  cashflowInputValues,
  type CashflowAfsBlock,
  type CashflowAfsBlockField,
  type CashflowInputDefinition,
  type CashflowInputMetric,
  type CashflowInputRecord,
  type CashflowReportRow,
  type CashflowValues,
} from "@/lib/cashflow";
import {
  exportBankWorkbook,
  exportFinancialPresentation,
  exportFinancialWorkbook,
  type BankAfsScenarioData,
  type BankExportData,
  type BankInvestmentAgendaData,
  type BankSourceSheet,
  type FinancialExportData,
  type FinancialInputRow,
} from "@/lib/financial-export";
import { exportBankReportPdf } from "@/lib/bank-pdf-export";
import dailyFlowersLogoUrl from "@/assets/daily-flowers-logo.png";

export const Route = createFileRoute("/_authenticated/winst-verlies")({
  head: () => ({ meta: [{ title: "W&V / Cashflow - Daily Flowers" }] }),
  component: ProfitLossPage,
});

type GlPeriodRow = {
  period: string;
  quarter_key: string;
  account_id: string | null;
  account_code: string;
  account_name: string;
  pl_section: string;
  revenue_channel: string | null;
  sort_order: number;
  entry_count: number;
  amount: number;
};

type SalesPeriodRow = {
  period: string;
  channel: string;
  tx_count: number;
  net_total: number;
  gross_total: number;
  vat_total: number;
};

type PlBudgetLine = {
  id: string;
  period: string;
  budget_year: number;
  section: string;
  line_key: string;
  line_label: string;
  kind: "revenue" | "cost";
  amount: number | string;
  source_workbook: string;
  source_sheet: string;
  source_label: string;
  sort_order: number;
};

type CostDriverCalculationType =
  | "percentage_of_revenue"
  | "amount_per_afs"
  | "percentage_of_driver"
  | "orders_from_revenue";

type PlBudgetDriverRule = {
  id: string;
  driver_key: string;
  driver_label: string;
  calculation_type: CostDriverCalculationType;
  amount: number | string;
  basis_amount: number | string | null;
  machine_count: number | string | null;
  section: string;
  line_key: string;
  line_label: string;
  source_label: string;
  sort_order: number;
  from_period: string;
  to_period: string | null;
};

type RevenueBudgetRow = {
  id: string;
  period: string;
  channel: string;
  machine_id: string | null;
  amount: number | string;
  scenario: RevenueBudgetScenario;
  machines?: { display_name: string | null; afs_number: string | null } | null;
};

type AfsBudgetTrancheRow = {
  id: string;
  budget_year: number;
  tranche_number: number;
  machine_count: number;
  display_name: string;
  start_period: string;
};

type AfsBudgetTrancheRevenueRow = {
  id: string;
  cashflow_input_id: string;
  period: string;
  amount: number | string;
  amount_per_machine: number | string;
};

type AfsRentalAgreementRow = {
  id: string;
  machine_id: string;
  start_period: string;
  end_period: string | null;
  fixed_fee_net: number | string;
  energy_cost_net: number | string;
  turnover_rate_percent: number | string;
  turnover_threshold_net: number | string;
  status: "active" | "inactive";
};

type AfsRentalInvoiceRow = {
  id: string;
  period: string;
  machine_id: string | null;
  subtotal_net: number | string;
  status: string;
};

type AfsMachineActualRow = {
  period: string;
  machine_id: string | null;
  afs_number: string | null;
  net_total: number | string | null;
  gross_total: number | string | null;
};

type ViewMode = "month" | "range" | "year" | "multiYear";
type PlMetricColumn = "actual" | "budget" | "variance";
type RevenueBudgetScenario = "mid" | "low";
type MarketingBudgetMode = "internal" | "bank";

const PL_METRIC_COLUMNS: Array<{ value: PlMetricColumn; label: string }> = [
  { value: "actual", label: "Actueel" },
  { value: "budget", label: "Budget" },
  { value: "variance", label: "Verschil" },
];
const WEFACT_NON_CUSTOMER_CATEGORIES = new Set(["omzethuur", "facilitair", "energie"]);
const STICKY_SEPARATOR_SHADOW = "shadow-[4px_0_8px_-8px_rgba(15,23,42,0.65)]";
const BUDGET_STICKY_HEADER_FIRST = "sticky left-0 z-30 w-44 min-w-[11rem] bg-muted px-3 py-2";
const BUDGET_STICKY_HEADER_SECOND =
  "sticky left-[11rem] z-30 w-52 min-w-[13rem] bg-muted px-3 py-2";
const BUDGET_STICKY_BODY_FIRST =
  "sticky left-0 z-20 w-44 min-w-[11rem] bg-background px-3 py-2 group-hover:bg-muted/30";
const BUDGET_STICKY_BODY_SECOND =
  "sticky left-[11rem] z-20 w-52 min-w-[13rem] bg-background px-3 py-2 group-hover:bg-muted/30";
const PL_STICKY_HEADER_FIRST = "sticky left-0 z-30 w-44 min-w-[11rem] bg-muted px-3 py-2";
const PL_STICKY_HEADER_SECOND = "sticky left-[11rem] z-30 w-72 min-w-[18rem] bg-muted px-3 py-2";
const PL_STICKY_BODY_FIRST = "sticky left-0 z-20 w-44 min-w-[11rem] px-3 py-2";
const PL_STICKY_BODY_SECOND = "sticky left-[11rem] z-20 w-72 min-w-[18rem] px-3 py-2";
const MANUAL_PL_BUDGET_SOURCE_WORKBOOK = "W&V budgetregels";
const COST_DRIVER_SOURCE_WORKBOOK = "Kostprijs omzet drivers";
const PL_PARAMETER_SOURCE_WORKBOOK = "W&V parameters";
const AFS_RENT_SOURCE_WORKBOOK = "AFS huurafspraken";
const AFS_RENT_BUDGET_LINE_KEY = "budget-afs-huurkosten";
const AFS_RENT_LINE_LABEL = "AFS - Huurkosten";
const AFS_RENT_COST_OF_GOODS_LINE_KEY = "budget-afs-huurkosten-kostprijs";
const AFS_RENT_MONTHLY_RETAINED_AMOUNT = 17_250;
const AFS_DELIVERY_PERSONNEL_MONTHLY_TRANSFER = 7_125;
const AFS_UNCONTRACTED_RENT_DRIVER: CostDriverDefinition = {
  driver_key: "afs_huurpercentage_zonder_afspraak",
  driver_label: "AFS - Huur zonder huurafspraak",
  calculation_type: "percentage_of_revenue",
  section: "housing",
  line_key: AFS_RENT_BUDGET_LINE_KEY,
  line_label: AFS_RENT_LINE_LABEL,
  source_label:
    "Vast huurpercentage van de budgetomzet van bestaande AFS'en zonder huurafspraak; LEGACY-machines uitgesloten",
  source_sheet: "AFS huurafspraken",
  source_workbook: AFS_RENT_SOURCE_WORKBOOK,
  input_label: "% van omzet bestaande AFS'en zonder actieve huurafspraak",
  sort_order: 294,
  defaultAmount: 15,
  defaultBasisAmount: null,
};
const AFS_BUDGET_MACHINE_RENT_LINE_KEY = "budget-afs-huurkosten-budgetmachines";
const AFS_BUDGET_MACHINE_RENT_LINE_LABEL = "AFS - Huurkosten nieuwe budgetmachines";
const AFS_BUDGET_MACHINE_RENT_DRIVER: CostDriverDefinition = {
  driver_key: "afs_budgetmachines_huurpercentage",
  driver_label: "AFS - Huurkosten nieuwe budgetmachines",
  calculation_type: "percentage_of_revenue",
  section: "cost_of_goods",
  line_key: AFS_BUDGET_MACHINE_RENT_LINE_KEY,
  line_label: AFS_BUDGET_MACHINE_RENT_LINE_LABEL,
  source_label: "Vast huurpercentage van de omzet van nieuwe AFS-budgetmachines",
  source_sheet: "AFS budgettranches",
  source_workbook: AFS_RENT_SOURCE_WORKBOOK,
  input_label: "% van omzet nieuwe AFS-budgetmachines",
  sort_order: 296,
  defaultAmount: 15,
  defaultBasisAmount: null,
};
const EXCLUDED_PL_BUDGET_LINE_KEYS = new Set([
  "budget-afs-inkoop",
  "budget-afs-vaste-machinekosten",
  AFS_RENT_BUDGET_LINE_KEY,
  "budget-winkels-inkoop",
  "budget-winkels-verspilling",
  "budget-webshop-inkoop",
  "budget-webshop-bezorgkosten",
  "budget-webshop-advertentiekosten",
  "budget-winkels-overhead",
  "budget-webshop-overhead",
  "budget-winkels-aflossing",
]);
const MANUAL_PL_BUDGET_DEFINITIONS: ManualPlBudgetDefinition[] = [
  {
    section: "housing",
    lineKey: "budget-winkels-huur",
    lineLabel: "Winkel - Pand",
    sourceSheet: "Winkel",
    sourceLabel: "Pand",
    sortOrder: 410,
  },
  {
    section: "personnel",
    lineKey: "budget-winkels-personeel",
    lineLabel: "Winkel - Personeel",
    sourceSheet: "Winkel",
    sourceLabel: "Personeel",
    sortOrder: 310,
  },
  {
    section: "personnel",
    lineKey: "budget-webshop-personeel",
    lineLabel: "Webshop - Personeel",
    sourceSheet: "Webshop",
    sourceLabel: "Personeel",
    sortOrder: 320,
  },
  {
    section: "general_admin",
    lineKey: "budget-webshop-autos",
    lineLabel: "Webshop - Auto's",
    sourceSheet: "Webshop",
    sourceLabel: "Auto's",
    sortOrder: 630,
  },
  {
    section: "personnel",
    lineKey: "budget-afs-personeel",
    lineLabel: "AFS - Personeel",
    sourceSheet: "AFS",
    sourceLabel: "Personeel",
    sortOrder: 330,
  },
  {
    section: "general_admin",
    lineKey: "budget-afs-autos",
    lineLabel: "AFS - Auto's",
    sourceSheet: "AFS",
    sourceLabel: "Auto's",
    sortOrder: 620,
  },
  {
    section: "personnel",
    lineKey: "budget-hoofdkantoor-personeel",
    lineLabel: "Hoofdkantoor - Personeel",
    sourceSheet: "Hoofdkantoor",
    sourceLabel: "Personeel",
    sortOrder: 340,
  },
  {
    section: "housing",
    lineKey: "budget-hoofdkantoor-huur",
    lineLabel: "Hoofdkantoor - Huur",
    sourceSheet: "Hoofdkantoor",
    sourceLabel: "Huur",
    sortOrder: 420,
  },
  {
    section: "general_admin",
    lineKey: "budget-hoofdkantoor-kantoorkosten",
    lineLabel: "Hoofdkantoor - Kantoorkosten",
    sourceSheet: "Hoofdkantoor",
    sourceLabel: "Kantoorkosten",
    sortOrder: 640,
  },
  {
    section: "general_admin",
    lineKey: "budget-hoofdkantoor-autokosten",
    lineLabel: "Hoofdkantoor - Autokosten",
    sourceSheet: "Hoofdkantoor",
    sourceLabel: "Autokosten",
    sortOrder: 650,
  },
  {
    section: "general_admin",
    lineKey: "budget-hoofdkantoor-overige-kosten",
    lineLabel: "Hoofdkantoor - Overige kosten",
    sourceSheet: "Hoofdkantoor",
    sourceLabel: "Licenties, administratie, juridisch",
    sortOrder: 660,
  },
  {
    section: "general_admin",
    lineKey: "budget-hoofdkantoor-management-fees",
    lineLabel: "Hoofdkantoor - Management fees",
    sourceSheet: "Hoofdkantoor",
    sourceLabel: "Management fees",
    sortOrder: 670,
  },
];
const MANUAL_PL_BUDGET_DEFINITION_BY_KEY = new Map(
  MANUAL_PL_BUDGET_DEFINITIONS.map((definition) => [definition.lineKey, definition]),
);
const AFS_COST_DRIVER_DEFINITIONS: CostDriverDefinition[] = [
  {
    driver_key: "afs_inkoop",
    driver_label: "AFS - Inkoop",
    calculation_type: "percentage_of_revenue",
    section: "cost_of_goods",
    line_key: "budget-afs-inkoop",
    line_label: "AFS - Inkoop",
    source_label: "Inkoop (% van AFS omzet)",
    source_sheet: "AFS kostprijs",
    input_label: "% van AFS omzet",
    revenue_channel: "bold_afs",
    sort_order: 210,
    defaultAmount: 33,
    defaultBasisAmount: null,
  },
  {
    driver_key: "afs_schoonmaak",
    driver_label: "AFS - Schoonmaak",
    calculation_type: "amount_per_afs",
    section: "cost_of_goods",
    line_key: "budget-afs-schoonmaak",
    line_label: "AFS - Schoonmaak",
    source_label: "Vast bedrag per AFS per maand",
    source_sheet: "AFS kostprijs",
    input_label: "Bedrag per AFS per maand",
    sort_order: 211,
    defaultAmount: 40,
    defaultBasisAmount: null,
  },
  {
    driver_key: "afs_onderhoud",
    driver_label: "AFS - Onderhoud",
    calculation_type: "amount_per_afs",
    section: "cost_of_goods",
    line_key: "budget-afs-onderhoud",
    line_label: "AFS - Onderhoud",
    source_label: "Vast bedrag per AFS per maand",
    source_sheet: "AFS kostprijs",
    input_label: "Bedrag per AFS per maand",
    sort_order: 212,
    defaultAmount: 16.67,
    defaultBasisAmount: null,
  },
  {
    driver_key: "afs_logistiek",
    driver_label: "AFS - Logistiek",
    calculation_type: "amount_per_afs",
    section: "cost_of_goods",
    line_key: "budget-afs-logistiek",
    line_label: "AFS - Logistiek",
    source_label: "Vast bedrag per AFS per maand",
    source_sheet: "AFS kostprijs",
    input_label: "Bedrag per AFS per maand",
    sort_order: 213,
    defaultAmount: 250,
    defaultBasisAmount: null,
  },
];
const AFS_MACHINE_COUNT_DRIVER_KEY = "afs_schoonmaak";
const SHOP_COST_DRIVER_DEFINITIONS: CostDriverDefinition[] = [
  {
    driver_key: "winkels_inkoop",
    driver_label: "Winkels - Inkoop",
    calculation_type: "percentage_of_revenue",
    section: "cost_of_goods",
    line_key: "budget-winkels-inkoop",
    line_label: "Winkels - Inkoop",
    source_label: "Inkoop (% van winkelomzet)",
    source_sheet: "Winkels/Webshop kostprijs",
    input_label: "% van winkels omzet",
    revenue_channel: "shopify_winkel",
    sort_order: 220,
    defaultAmount: 33.333333,
    defaultBasisAmount: null,
  },
  {
    driver_key: "winkels_verspilling",
    driver_label: "Winkels - Verspilling",
    calculation_type: "percentage_of_driver",
    section: "cost_of_goods",
    line_key: "budget-winkels-verspilling",
    line_label: "Winkels - Verspilling",
    source_label: "Verspilling (% van winkels inkoop)",
    source_sheet: "Winkels/Webshop kostprijs",
    input_label: "% van Winkels - Inkoop",
    depends_on_driver_key: "winkels_inkoop",
    sort_order: 221,
    defaultAmount: 10,
    defaultBasisAmount: null,
  },
  {
    driver_key: "webshop_inkoop",
    driver_label: "Webshop/Mollie - Inkoop",
    calculation_type: "percentage_of_revenue",
    section: "cost_of_goods",
    line_key: "budget-webshop-inkoop",
    line_label: "Webshop/Mollie - Inkoop",
    source_label: "Inkoop (% van webshop + Mollie omzet)",
    source_sheet: "Winkels/Webshop kostprijs",
    input_label: "% van webshop + Mollie omzet",
    revenue_channels: ["shopify_webshop", "mollie_facturen"],
    sort_order: 230,
    defaultAmount: 33.333333,
    defaultBasisAmount: null,
  },
  {
    driver_key: "webshop_bezorgkosten",
    driver_label: "Webshop - Bezorgkosten",
    calculation_type: "orders_from_revenue",
    section: "cost_of_goods",
    line_key: "budget-webshop-bezorgkosten",
    line_label: "Webshop - Bezorgkosten",
    source_label: "Omzet / orderwaarde * bezorgkosten",
    source_sheet: "Winkels/Webshop kostprijs",
    input_label: "Orderwaarde en bezorgkosten per bestelling",
    revenue_channel: "shopify_webshop",
    sort_order: 231,
    defaultAmount: 20,
    defaultBasisAmount: 110,
  },
];
const COST_DRIVER_DEFINITIONS = [...AFS_COST_DRIVER_DEFINITIONS, ...SHOP_COST_DRIVER_DEFINITIONS];
const PL_PARAMETER_DRIVER_DEFINITIONS: CostDriverDefinition[] = [
  {
    driver_key: "marketing_verkoopkosten_intern",
    driver_label: "Marketing - Intern",
    calculation_type: "percentage_of_revenue",
    section: "sales_marketing",
    line_key: "budget-webshop-advertentiekosten",
    line_label: "Marketing - Marketingkosten intern",
    source_label: "Marketingkosten intern (% van totale budgetomzet)",
    source_sheet: "Marketing",
    source_workbook: PL_PARAMETER_SOURCE_WORKBOOK,
    input_label: "% van totale budgetomzet",
    revenue_channels: [...CHANNELS],
    fallback_line_key: "budget-webshop-advertentiekosten",
    sort_order: 510,
    defaultAmount: 0,
    defaultBasisAmount: null,
  },
  {
    driver_key: "marketing_verkoopkosten_bank",
    driver_label: "Marketing - Bank",
    calculation_type: "percentage_of_revenue",
    section: "sales_marketing",
    line_key: "budget-webshop-advertentiekosten",
    line_label: "Marketing - Marketingkosten bank",
    source_label: "Marketingkosten bank (% van totale budgetomzet)",
    source_sheet: "Marketing",
    source_workbook: PL_PARAMETER_SOURCE_WORKBOOK,
    input_label: "% van totale budgetomzet",
    revenue_channels: [...CHANNELS],
    fallback_line_key: "budget-webshop-advertentiekosten",
    sort_order: 511,
    defaultAmount: 0,
    defaultBasisAmount: null,
  },
];
const BUDGET_DRIVER_DEFINITIONS = [...COST_DRIVER_DEFINITIONS, ...PL_PARAMETER_DRIVER_DEFINITIONS];
const BUDGET_DRIVER_KEYS = [
  ...BUDGET_DRIVER_DEFINITIONS.map((driver) => driver.driver_key),
  AFS_UNCONTRACTED_RENT_DRIVER.driver_key,
  AFS_BUDGET_MACHINE_RENT_DRIVER.driver_key,
];

type DetailBase = {
  source: "gl" | "sales";
  label: string;
  channel?: string;
  accountCodes?: string[];
  invertGlSign?: boolean;
};

type DetailSelection = DetailBase & {
  period: string;
  amount: number;
  title: string;
};

type PlRow = {
  key: string;
  label: string;
  section: string;
  level: 0 | 1;
  kind: "normal" | "subtotal" | "result";
  valueFormat?: "currency" | "percentage";
  values: Record<string, number>;
  ytd: number;
  budgetValues?: Record<string, number>;
  budgetYtd?: number;
  budgetOnly?: boolean;
  detailByPeriod?: Record<string, DetailBase>;
};

type BudgetInputCell = {
  id?: string;
  amount: number;
  amountPerMachine?: number;
};

type RevenueBudgetInputRow = {
  key: string;
  scenario: RevenueBudgetScenario;
  channel: string;
  machineId: string | null;
  label: string;
  level: 0 | 1;
  values: Record<string, BudgetInputCell>;
};

type AfsBudgetTrancheInputRow = AfsBudgetTrancheRow & {
  values: Record<string, BudgetInputCell>;
};

type PlBudgetInputRow = {
  key: string;
  section: string;
  lineKey: string;
  lineLabel: string;
  kind: "revenue" | "cost";
  sourceWorkbook: string;
  sourceSheet: string;
  sourceLabel: string;
  sortOrder: number;
  values: Record<string, BudgetInputCell>;
};

type ManualPlBudgetDefinition = {
  section: string;
  lineKey: string;
  lineLabel: string;
  sourceSheet: string;
  sourceLabel: string;
  sortOrder: number;
};

type CostDriverDefinition = {
  driver_key: string;
  driver_label: string;
  calculation_type: CostDriverCalculationType;
  section: string;
  line_key: string;
  line_label: string;
  source_label: string;
  source_sheet: string;
  source_workbook?: string;
  input_label: string;
  revenue_channel?: string;
  revenue_channels?: string[];
  depends_on_driver_key?: string;
  fallback_line_key?: string;
  sort_order: number;
  defaultAmount: number;
  defaultBasisAmount: number | null;
};

type CostDriverInputCell = {
  rule?: PlBudgetDriverRule;
  amount: number;
  basisAmount: number | null;
  machineCount: number | null;
  machineCountOverride: number | null;
  standardMachineCount: number | null;
  calculatedAmount: number;
};

type CostDriverInputFieldName = "amount" | "basisAmount" | "machineCount";

type CostDriverInputRow = CostDriverDefinition & {
  values: Record<string, CostDriverInputCell>;
  total: number;
};

type GlDetailRow = {
  id: string;
  transaction_date: string | null;
  account_code: string | null;
  description: string | null;
  relation_name: string | null;
  document_number: string | null;
  amount: number | string | null;
  debit_amount: number | string | null;
  credit_amount: number | string | null;
  raw_payload: Record<string, unknown> | null;
};

type SalesDetailRow = {
  id: string;
  external_id: string | null;
  source: string | null;
  channel: string | null;
  article_number: string | null;
  product_name: string | null;
  amount_gross: number | string | null;
  amount_net: number | string | null;
  vat_amount: number | string | null;
  vat_rate: number | string | null;
  invoice_number: string | null;
  status: string | null;
  paid_at: string | null;
  description_raw: string | null;
  parse_status: string | null;
  invoice_url?: string | null;
};

type ShopifyOrderDetailRow = {
  id: string;
  external_id: string;
  order_name: string | null;
  source_name: string | null;
  channel: string | null;
  financial_status: string | null;
  processed_at: string | null;
  current_total_price: number | string | null;
  current_total_tax: number | string | null;
  total_price: number | string | null;
  total_tax: number | string | null;
  line_tax_total?: number | string | null;
  total_shipping: number | string | null;
  total_refunded: number | string | null;
  raw_payload: Record<string, unknown> | null;
};

type MollieSalesInvoiceDetailRow = {
  id: string;
  sales_invoice_id: string;
  reference: string | null;
  status: string | null;
  issued_at: string | null;
  paid_at: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  amount_gross: number | string | null;
  amount_net: number | string | null;
  vat_amount: number | string | null;
  invoice_url: string | null;
  raw_payload: Record<string, unknown> | null;
};

type WefactInvoiceDetailRow = {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  status: string | null;
  customer_number: string | null;
  customer_name: string | null;
  reference: string | null;
  category: string | null;
  amount_gross: number | string | null;
  amount_net: number | string | null;
  vat_amount: number | string | null;
  source_filename: string | null;
};

type SupabaseError = { message: string };
type SupabaseResult<T> = { data: T[] | null; error: SupabaseError | null };
type SupabaseQuery<T> = PromiseLike<SupabaseResult<T>> & {
  select(columns: string): SupabaseQuery<T>;
  order(column: string, options?: Record<string, unknown>): SupabaseQuery<T>;
  in(column: string, values: unknown[]): SupabaseQuery<T>;
  gte(column: string, value: unknown): SupabaseQuery<T>;
  lt(column: string, value: unknown): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  neq(column: string, value: unknown): SupabaseQuery<T>;
  limit(count: number): SupabaseQuery<T>;
  is(column: string, value: unknown): SupabaseQuery<T>;
  delete(): SupabaseQuery<T>;
  update(values: unknown): SupabaseQuery<T>;
  insert(values: unknown): PromiseLike<SupabaseResult<T>>;
  upsert(values: unknown, options?: Record<string, unknown>): PromiseLike<SupabaseResult<T>>;
};

const db = supabase as unknown as {
  from<T = unknown>(table: string): SupabaseQuery<T>;
};

function ProfitLossPage() {
  const qc = useQueryClient();
  const thisMonth = currentMonth();
  const thisYear = thisMonth.split("-")[0];
  const thisMonthNumber = thisMonth.split("-")[1];
  const [viewMode, setViewMode] = useState<ViewMode>("year");
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(thisMonthNumber);
  const [fromMonth, setFromMonth] = useState("01");
  const [toMonth, setToMonth] = useState(thisMonthNumber);
  const [selectedYears, setSelectedYears] = useState<string[]>([thisYear]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<PlMetricColumn[]>([
    "actual",
    "budget",
    "variance",
  ]);
  const [detail, setDetail] = useState<DetailSelection | null>(null);
  const [exactSyncing, setExactSyncing] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "presentation" | null>(null);
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [savingBudgetCell, setSavingBudgetCell] = useState<string | null>(null);
  const [cashflowDrafts, setCashflowDrafts] = useState<Record<string, string>>({});
  const [savingCashflowCell, setSavingCashflowCell] = useState<string | null>(null);
  const [revenueBudgetScenario, setRevenueBudgetScenario] = useState<RevenueBudgetScenario>("mid");
  const [marketingBudgetMode, setMarketingBudgetMode] = useState<MarketingBudgetMode>("internal");
  const [bankReportYear, setBankReportYear] = useState(thisYear);
  const [bankActualThroughMonth, setBankActualThroughMonth] = useState(
    String(Math.max(1, Number(thisMonthNumber) - 1)).padStart(2, "0"),
  );
  const months = useMemo(() => {
    if (viewMode === "month") return [composePeriod(year, month)];
    if (viewMode === "year") return yearPeriods(year);
    if (viewMode === "multiYear") return multiYearPeriods(selectedYears, selectedMonths);
    return periodsBetween(composePeriod(year, fromMonth), composePeriod(year, toMonth));
  }, [fromMonth, month, selectedMonths, selectedYears, toMonth, viewMode, year]);
  const bankMonths = useMemo(
    () => [...yearPeriods(bankReportYear), ...yearPeriods(String(Number(bankReportYear) + 1))],
    [bankReportYear],
  );
  const queryMonths = useMemo(
    () =>
      uniqueSorted([
        ...months,
        ...bankMonths,
        ...yearPeriods("2026"),
        ...yearPeriods("2027"),
        ...yearPeriods("2028"),
      ]),
    [bankMonths, months],
  );
  const periodColumns = visibleColumns;
  const totalColumns = visibleColumns;
  const totalLabel = aggregateLabel(viewMode, months);
  const tableColSpan = 2 + months.length * periodColumns.length + totalColumns.length;

  const accountsQ = useQuery({
    queryKey: ["gl-accounts"],
    queryFn: async () => {
      const { data, error } = await db
        .from<GlAccount>("gl_accounts")
        .select("*")
        .order("sort_order")
        .order("account_code");
      if (error) throw error;
      return (data ?? []) as GlAccount[];
    },
  });

  const glQ = useQuery({
    queryKey: ["wv-gl-monthly", queryMonths],
    queryFn: async () => {
      const { data, error } = await db
        .from<GlPeriodRow>("vw_gl_monthly_account")
        .select("*")
        .in("period", queryMonths);
      if (error) throw error;
      return (data ?? []) as GlPeriodRow[];
    },
    enabled: queryMonths.length > 0,
  });

  const salesQ = useQuery({
    queryKey: ["wv-sales-monthly", queryMonths],
    queryFn: async () => {
      const { data, error } = await db
        .from<SalesPeriodRow>("vw_monthly_revenue_actuals")
        .select("*")
        .in("period", queryMonths);
      if (error) throw error;
      return (data ?? []) as SalesPeriodRow[];
    },
    enabled: queryMonths.length > 0,
  });

  const budgetsQ = useQuery({
    queryKey: ["wv-pl-budget-lines", queryMonths],
    queryFn: async () => {
      const { data, error } = await db
        .from<PlBudgetLine>("pl_budget_lines")
        .select(
          "id,period,budget_year,section,line_key,line_label,kind,amount,source_workbook,source_sheet,source_label,sort_order",
        )
        .in("period", queryMonths)
        .order("sort_order")
        .order("line_label");
      if (error) throw error;
      return (data ?? []) as PlBudgetLine[];
    },
    enabled: queryMonths.length > 0,
  });

  const revenueBudgetsQ = useQuery({
    queryKey: ["wv-revenue-budgets", queryMonths],
    queryFn: async () => {
      const { data, error } = await db
        .from<RevenueBudgetRow>("budgets")
        .select("id,period,channel,machine_id,amount,scenario,machines(display_name,afs_number)")
        .in("period", queryMonths);
      if (error) throw error;
      return (data ?? []) as RevenueBudgetRow[];
    },
    enabled: queryMonths.length > 0,
  });

  const afsBudgetTranchesQ = useQuery({
    queryKey: ["wv-afs-budget-tranches", queryMonths],
    queryFn: async () => {
      const years = [...new Set(queryMonths.map((period) => Number(period.split("-")[0])))];
      const tranchePeriods = years.flatMap((trancheYear) => yearPeriods(String(trancheYear)));
      const { data, error } = await db
        .from<CashflowInputRecord>("cashflow_inputs")
        .select("id,period,budget_machine_count")
        .eq("line_key", AFS_MACHINE_INPUT_KEY)
        .in("period", tranchePeriods)
        .gt("budget_machine_count", 0)
        .order("period");
      if (error) throw error;
      const trancheNumberByYear = new Map<number, number>();
      return ((data ?? []) as CashflowInputRecord[]).map((input) => {
        const budgetYear = Number(input.period.split("-")[0]);
        const trancheNumber = (trancheNumberByYear.get(budgetYear) ?? 0) + 1;
        trancheNumberByYear.set(budgetYear, trancheNumber);
        return {
          id: input.id,
          budget_year: budgetYear,
          tranche_number: trancheNumber,
          machine_count: Number(input.budget_machine_count ?? 0),
          display_name: `Tranche ${trancheNumber}`,
          start_period: input.period,
        } satisfies AfsBudgetTrancheRow;
      });
    },
    enabled: queryMonths.length > 0,
  });

  const afsBudgetTrancheRevenuesQ = useQuery({
    queryKey: ["wv-afs-budget-tranche-revenues", queryMonths],
    queryFn: async () => {
      const { data, error } = await db
        .from<AfsBudgetTrancheRevenueRow>("afs_budget_tranche_revenues")
        .select("id,cashflow_input_id,period,amount,amount_per_machine")
        .in("period", queryMonths);
      if (error) throw error;
      return (data ?? []) as AfsBudgetTrancheRevenueRow[];
    },
    enabled: queryMonths.length > 0,
  });

  const afsRentalAgreementsQ = useQuery({
    queryKey: ["wv-afs-rental-agreements"],
    queryFn: async () => {
      const { data, error } = await db
        .from<AfsRentalAgreementRow>("afs_rental_agreements")
        .select(
          "id,machine_id,start_period,end_period,fixed_fee_net,energy_cost_net,turnover_rate_percent,turnover_threshold_net,status",
        )
        .order("start_period", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AfsRentalAgreementRow[];
    },
  });

  const afsRentalInvoicesQ = useQuery({
    queryKey: ["wv-afs-rental-invoices", queryMonths],
    queryFn: async () => {
      const { data, error } = await db
        .from<AfsRentalInvoiceRow>("afs_rental_invoices")
        .select("id,period,machine_id,subtotal_net,status")
        .in("period", queryMonths)
        .neq("status", "canceled");
      if (error) throw error;
      return (data ?? []) as AfsRentalInvoiceRow[];
    },
    enabled: queryMonths.length > 0,
  });

  const afsMachineActualsQ = useQuery({
    queryKey: ["wv-afs-machine-actuals", queryMonths],
    queryFn: async () => {
      const { data, error } = await db
        .from<AfsMachineActualRow>("vw_monthly_machine")
        .select("period,machine_id,afs_number,net_total,gross_total")
        .in("period", queryMonths)
        .eq("channel", "bold_afs");
      if (error) throw error;
      return (data ?? []) as AfsMachineActualRow[];
    },
    enabled: queryMonths.length > 0,
  });

  const costDriverRulesQ = useQuery({
    queryKey: ["wv-cost-driver-rules"],
    queryFn: async () => {
      const { data, error } = await db
        .from<PlBudgetDriverRule>("pl_budget_driver_rules")
        .select(
          "id,driver_key,driver_label,calculation_type,amount,basis_amount,machine_count,section,line_key,line_label,source_label,sort_order,from_period,to_period",
        )
        .in("driver_key", BUDGET_DRIVER_KEYS)
        .order("driver_key")
        .order("from_period");
      if (error) throw error;
      return (data ?? []) as PlBudgetDriverRule[];
    },
  });

  const cashflowInputsQ = useQuery({
    queryKey: ["cashflow-inputs", queryMonths],
    queryFn: async () => {
      const { data, error } = await db
        .from<CashflowInputRecord>("cashflow_inputs")
        .select(
          "id,period,line_key,actual_amount,budget_amount,actual_machine_count,budget_machine_count,actual_afs_block_id,budget_afs_block_id",
        )
        .in("period", queryMonths)
        .order("period")
        .order("line_key");
      if (error) throw error;
      return (data ?? []) as CashflowInputRecord[];
    },
    enabled: queryMonths.length > 0,
  });

  const cashflowAfsBlocksQ = useQuery({
    queryKey: ["cashflow-afs-blocks"],
    queryFn: async () => {
      const { data, error } = await db
        .from<CashflowAfsBlock>("cashflow_afs_blocks")
        .select(
          "id,block_number,reference_machine_count,afs_amount,roofs_140_amount,shipping_amount,quality_check_amount,installation_amount,kpn_mollie_amount,location_renovation_amount",
        )
        .order("block_number");
      if (error) throw error;
      return (data ?? []) as CashflowAfsBlock[];
    },
  });

  const activeAfsCountQ = useQuery({
    queryKey: ["machines-active-afs-count"],
    queryFn: async () => {
      const { data, error } = await db
        .from<{ id: string }>("machines")
        .select("id")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []).length;
    },
  });
  const exportDataLoading = [
    accountsQ,
    glQ,
    salesQ,
    budgetsQ,
    revenueBudgetsQ,
    afsBudgetTranchesQ,
    afsBudgetTrancheRevenuesQ,
    afsRentalAgreementsQ,
    afsRentalInvoicesQ,
    afsMachineActualsQ,
    costDriverRulesQ,
    cashflowInputsQ,
    cashflowAfsBlocksQ,
    activeAfsCountQ,
  ].some((query) => query.isPending);

  const selectedRevenueBudgets = useMemo(
    () =>
      (revenueBudgetsQ.data ?? []).filter(
        (budget) => (budget.scenario ?? "mid") === revenueBudgetScenario,
      ),
    [revenueBudgetScenario, revenueBudgetsQ.data],
  );
  const activeBudgetDriverDefinitions = useMemo(
    () => [
      ...COST_DRIVER_DEFINITIONS,
      PL_PARAMETER_DRIVER_DEFINITIONS.find((definition) =>
        marketingBudgetMode === "bank"
          ? definition.driver_key === "marketing_verkoopkosten_bank"
          : definition.driver_key === "marketing_verkoopkosten_intern",
      )!,
    ],
    [marketingBudgetMode],
  );
  const effectiveRevenueBudgets = useMemo(
    () =>
      addAfsBudgetTrancheRevenue({
        revenueBudgets: selectedRevenueBudgets,
        budgetTranches: afsBudgetTranchesQ.data ?? [],
        budgetTrancheRevenues: afsBudgetTrancheRevenuesQ.data ?? [],
        months: queryMonths,
        scenario: revenueBudgetScenario,
      }),
    [
      afsBudgetTrancheRevenuesQ.data,
      afsBudgetTranchesQ.data,
      queryMonths,
      revenueBudgetScenario,
      selectedRevenueBudgets,
    ],
  );

  const effectiveBudgetLines = useMemo(
    () =>
      buildEffectiveBudgetLines({
        budgetLines: budgetsQ.data ?? [],
        driverRules: costDriverRulesQ.data ?? [],
        driverDefinitions: activeBudgetDriverDefinitions,
        revenueBudgets: effectiveRevenueBudgets,
        afsRentalAgreements: afsRentalAgreementsQ.data ?? [],
        afsMachineActuals: afsMachineActualsQ.data ?? [],
        afsBudgetTranches: afsBudgetTranchesQ.data ?? [],
        afsBudgetTrancheRevenues: afsBudgetTrancheRevenuesQ.data ?? [],
        months: queryMonths,
        activeAfsCount: activeAfsCountQ.data ?? 0,
      }),
    [
      activeAfsCountQ.data,
      afsMachineActualsQ.data,
      afsRentalAgreementsQ.data,
      afsBudgetTrancheRevenuesQ.data,
      afsBudgetTranchesQ.data,
      activeBudgetDriverDefinitions,
      costDriverRulesQ.data,
      budgetsQ.data,
      effectiveRevenueBudgets,
      queryMonths,
    ],
  );

  const { rows, operatingResult } = useMemo(
    () =>
      buildProfitLoss({
        months,
        glRows: glQ.data ?? [],
        salesRows: salesQ.data ?? [],
        afsRentalInvoices: afsRentalInvoicesQ.data ?? [],
        budgetLines: effectiveBudgetLines,
        revenueBudgets: effectiveRevenueBudgets,
        accounts: accountsQ.data ?? [],
      }),
    [
      accountsQ.data,
      afsRentalInvoicesQ.data,
      effectiveBudgetLines,
      effectiveRevenueBudgets,
      glQ.data,
      months,
      salesQ.data,
    ],
  );
  const cashflowRows = useMemo(
    () =>
      buildCashflowReport({
        months,
        inputs: cashflowInputsQ.data ?? [],
        operatingResult,
        afsRevenue: plRowCashflowValues(rows, "revenue-bold_afs", months),
        afsBlocks: cashflowAfsBlocksQ.data ?? [],
      }),
    [cashflowAfsBlocksQ.data, cashflowInputsQ.data, months, operatingResult, rows],
  );
  const { rows: bankProfitLossRows, operatingResult: bankOperatingResult } = useMemo(
    () =>
      buildProfitLoss({
        months: bankMonths,
        glRows: glQ.data ?? [],
        salesRows: salesQ.data ?? [],
        afsRentalInvoices: afsRentalInvoicesQ.data ?? [],
        budgetLines: effectiveBudgetLines,
        revenueBudgets: effectiveRevenueBudgets,
        accounts: accountsQ.data ?? [],
      }),
    [
      accountsQ.data,
      afsRentalInvoicesQ.data,
      bankMonths,
      effectiveBudgetLines,
      effectiveRevenueBudgets,
      glQ.data,
      salesQ.data,
    ],
  );
  const scenarioCashflowMonths = useMemo(
    () => [...yearPeriods("2026"), ...yearPeriods("2027")],
    [],
  );
  const { rows: scenario2027ProfitLossRows } = useMemo(
    () =>
      buildProfitLoss({
        months: scenarioCashflowMonths,
        glRows: glQ.data ?? [],
        salesRows: salesQ.data ?? [],
        afsRentalInvoices: afsRentalInvoicesQ.data ?? [],
        budgetLines: effectiveBudgetLines,
        revenueBudgets: effectiveRevenueBudgets,
        accounts: accountsQ.data ?? [],
      }),
    [
      accountsQ.data,
      afsRentalInvoicesQ.data,
      effectiveBudgetLines,
      effectiveRevenueBudgets,
      glQ.data,
      salesQ.data,
      scenarioCashflowMonths,
    ],
  );
  const bankCashflowRows = useMemo(
    () =>
      buildCashflowReport({
        months: bankMonths,
        inputs: cashflowInputsQ.data ?? [],
        operatingResult: bankOperatingResult,
        afsRevenue: plRowCashflowValues(bankProfitLossRows, "revenue-bold_afs", bankMonths),
        afsBlocks: cashflowAfsBlocksQ.data ?? [],
      }),
    [
      bankMonths,
      bankOperatingResult,
      bankProfitLossRows,
      cashflowAfsBlocksQ.data,
      cashflowInputsQ.data,
    ],
  );
  const bankSourceSheets = useMemo(
    () =>
      buildBankSourceSheets({
        months: bankMonths,
        glRows: glQ.data ?? [],
        salesRows: salesQ.data ?? [],
        budgetLines: budgetsQ.data ?? [],
        revenueBudgets: revenueBudgetsQ.data ?? [],
        driverRules: costDriverRulesQ.data ?? [],
        budgetTranches: afsBudgetTranchesQ.data ?? [],
        budgetTrancheRevenues: afsBudgetTrancheRevenuesQ.data ?? [],
        cashflowInputs: cashflowInputsQ.data ?? [],
        afsBlocks: cashflowAfsBlocksQ.data ?? [],
        rentalAgreements: afsRentalAgreementsQ.data ?? [],
        rentalInvoices: afsRentalInvoicesQ.data ?? [],
        machineActuals: afsMachineActualsQ.data ?? [],
        revenueBudgetScenario,
        marketingBudgetMode,
      }),
    [
      afsBudgetTrancheRevenuesQ.data,
      afsBudgetTranchesQ.data,
      afsMachineActualsQ.data,
      afsRentalAgreementsQ.data,
      afsRentalInvoicesQ.data,
      bankMonths,
      budgetsQ.data,
      cashflowAfsBlocksQ.data,
      cashflowInputsQ.data,
      costDriverRulesQ.data,
      glQ.data,
      revenueBudgetsQ.data,
      revenueBudgetScenario,
      salesQ.data,
      marketingBudgetMode,
    ],
  );
  const revenueActualsByChannel = useMemo(
    () => buildRevenueActualsByChannel(salesQ.data ?? [], months),
    [months, salesQ.data],
  );

  useEffect(() => {
    setBudgetDrafts({});
  }, [
    afsBudgetTrancheRevenuesQ.data,
    costDriverRulesQ.data,
    budgetsQ.data,
    months,
    revenueBudgetsQ.data,
  ]);

  useEffect(() => {
    setCashflowDrafts({});
  }, [cashflowAfsBlocksQ.data, cashflowInputsQ.data, months]);

  function toggleColumn(column: PlMetricColumn) {
    setVisibleColumns((current) => {
      if (current.includes(column)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== column);
      }
      return orderPlMetricColumns([...current, column]);
    });
  }

  function buildCurrentFinancialExportData(): FinancialExportData {
    const revenueInputRows = (["mid", "low"] as const).flatMap((scenario) =>
      buildRevenueBudgetInputRows(revenueBudgetsQ.data ?? [], months, scenario),
    );
    const afsBudgetTrancheInputRows = buildAfsBudgetTrancheInputRows(
      afsBudgetTranchesQ.data ?? [],
      afsBudgetTrancheRevenuesQ.data ?? [],
      months,
    );
    const driverRows = buildCostDriverInputRows({
      driverDefinitions: BUDGET_DRIVER_DEFINITIONS,
      driverRules: costDriverRulesQ.data ?? [],
      revenueBudgets: effectiveRevenueBudgets,
      budgetLines: budgetsQ.data ?? [],
      months,
      activeAfsCount: activeAfsCountQ.data ?? 0,
    });
    const manualRows = buildPlBudgetInputRows(budgetsQ.data ?? [], months);
    const budgetInputRows: FinancialInputRow[] = [];

    for (const row of revenueInputRows) {
      budgetInputRows.push({
        group: `Omzetbudgetten - ${row.scenario === "low" ? "low case" : "mid case"}`,
        category: channelLabel(row.channel),
        label: row.label,
        note: row.level === 0 ? "Kanaalbudget" : "Budget bestaande AFS",
        values: Object.fromEntries(
          months.map((period) => [period, Number(row.values[period]?.amount ?? 0)]),
        ),
        numberFormat: "currency",
      });
      if (row.level === 0) {
        budgetInputRows.push({
          group: `Omzetbudgetten - ${row.scenario === "low" ? "low case" : "mid case"}`,
          category: channelLabel(row.channel),
          label: "Realisatie ter referentie",
          note: "Zoals getoond onder het kanaalbudget",
          values: revenueActualsByChannel.get(row.channel) ?? blankValues(months),
          numberFormat: "currency",
        });
      }
    }

    for (const row of afsBudgetTrancheInputRows) {
      budgetInputRows.push({
        group: "Omzet nieuwe AFS-tranches",
        category: monthHeaderLabel(row.start_period, true),
        label: `${row.display_name} — omzet per machine`,
        note: `${row.machine_count} machines, actief vanaf ${row.start_period}`,
        values: Object.fromEntries(
          months.map((period) => [
            period,
            period < row.start_period || row.machine_count <= 0
              ? 0
              : Number(
                  row.values[period]?.amountPerMachine ??
                    Number(row.values[period]?.amount ?? 0) / row.machine_count,
                ),
          ]),
        ),
        numberFormat: "currency",
      });
      budgetInputRows.push({
        group: "Omzet nieuwe AFS-tranches",
        category: monthHeaderLabel(row.start_period, true),
        label: `${row.display_name} — totale trancheomzet`,
        note: `${row.machine_count} machines × omzet per machine`,
        values: Object.fromEntries(
          months.map((period) => [
            period,
            period < row.start_period ? 0 : Number(row.values[period]?.amount ?? 0),
          ]),
        ),
        numberFormat: "currency",
      });
    }

    const afsUncontractedTurnover = afsTurnoverByMachinePeriod({
      revenueBudgets: selectedRevenueBudgets,
      machineActuals: afsMachineActualsQ.data ?? [],
      months,
    });
    const afsUncontractedValues = afsUncontractedRentValues({
      agreements: afsRentalAgreementsQ.data ?? [],
      driverRules: costDriverRulesQ.data ?? [],
      turnoverByMachinePeriod: afsUncontractedTurnover,
      excludedMachineIds: legacyAfsMachineIds({
        revenueBudgets: selectedRevenueBudgets,
        machineActuals: afsMachineActualsQ.data ?? [],
      }),
      months,
    });
    budgetInputRows.push({
      group: "Kostprijs omzet",
      category: "Huurkosten",
      label: "Huurpercentage bestaande AFS'en zonder huurafspraak",
      note: AFS_UNCONTRACTED_RENT_DRIVER.source_label,
      values: Object.fromEntries(
        months.map((period) => [period, afsUncontractedValues[period].percentage / 100]),
      ),
      numberFormat: "percentage",
    });
    budgetInputRows.push({
      group: "Kostprijs omzet",
      category: "Huurkosten",
      label: "Berekende huur bestaande AFS'en zonder huurafspraak",
      note: "Omzetbudget zonder actieve huurafspraak × vast huurpercentage",
      values: Object.fromEntries(
        months.map((period) => [period, afsUncontractedValues[period].amount]),
      ),
      numberFormat: "currency",
    });

    const afsBudgetRentValues = afsBudgetMachineRentValues({
      driverRules: costDriverRulesQ.data ?? [],
      budgetTranches: afsBudgetTranchesQ.data ?? [],
      budgetTrancheRevenues: afsBudgetTrancheRevenuesQ.data ?? [],
      months,
    });
    budgetInputRows.push({
      group: "Omzet nieuwe AFS-tranches",
      category: "Huurkosten",
      label: "Vast huurpercentage nieuwe AFS'en",
      note: AFS_BUDGET_MACHINE_RENT_DRIVER.source_label,
      values: Object.fromEntries(
        months.map((period) => [period, afsBudgetRentValues[period].percentage / 100]),
      ),
      numberFormat: "percentage",
    });
    budgetInputRows.push({
      group: "Kostprijs omzet",
      category: sectionLabel(AFS_BUDGET_MACHINE_RENT_DRIVER.section),
      label: AFS_BUDGET_MACHINE_RENT_LINE_LABEL,
      note: "Totale omzet nieuwe AFS'en × vast huurpercentage",
      values: Object.fromEntries(
        months.map((period) => [period, afsBudgetRentValues[period].amount]),
      ),
      numberFormat: "currency",
    });

    for (const driver of driverRows) {
      const percentageInput =
        driver.calculation_type === "percentage_of_revenue" ||
        driver.calculation_type === "percentage_of_driver";
      budgetInputRows.push({
        group: PL_PARAMETER_DRIVER_DEFINITIONS.some(
          (definition) => definition.driver_key === driver.driver_key,
        )
          ? "W&V parameters"
          : "Kostprijs omzet",
        category: sectionLabel(driver.section),
        label: `${driver.driver_label} — invoer`,
        note: driver.input_label,
        values: Object.fromEntries(
          months.map((period) => [
            period,
            percentageInput
              ? Number(driver.values[period]?.amount ?? 0) / 100
              : Number(driver.values[period]?.amount ?? 0),
          ]),
        ),
        numberFormat: percentageInput ? "percentage" : "currency",
      });
      if (driver.calculation_type === "orders_from_revenue") {
        budgetInputRows.push({
          group: "Kostprijs omzet",
          category: sectionLabel(driver.section),
          label: `${driver.driver_label} — orderwaarde`,
          note: "Basisbedrag per bestelling",
          values: Object.fromEntries(
            months.map((period) => [period, Number(driver.values[period]?.basisAmount ?? 0)]),
          ),
          numberFormat: "currency",
        });
      }
      budgetInputRows.push({
        group: PL_PARAMETER_DRIVER_DEFINITIONS.some(
          (definition) => definition.driver_key === driver.driver_key,
        )
          ? "W&V parameters"
          : "Kostprijs omzet",
        category: sectionLabel(driver.section),
        label: `${driver.driver_label} — berekend budget`,
        note: driver.source_label,
        values: Object.fromEntries(
          months.map((period) => [period, Number(driver.values[period]?.calculatedAmount ?? 0)]),
        ),
        numberFormat: "currency",
      });
    }

    const afsCountDriver = driverRows.find(
      (driver) => driver.driver_key === AFS_MACHINE_COUNT_DRIVER_KEY,
    );
    if (afsCountDriver) {
      budgetInputRows.push({
        group: "Kostprijs omzet",
        category: "AFS-volume",
        label: "Aantal AFS'en",
        note: "Gedeeld volume voor schoonmaak, onderhoud en logistiek",
        values: Object.fromEntries(
          months.map((period) => [
            period,
            Number(afsCountDriver.values[period]?.machineCount ?? 0),
          ]),
        ),
        numberFormat: "integer",
      });
    }

    for (const row of manualRows) {
      budgetInputRows.push({
        group: "W&V-budgetregels",
        category: sectionLabel(row.section),
        label: row.lineLabel,
        note: row.sourceLabel,
        values: Object.fromEntries(
          months.map((period) => [period, Number(row.values[period]?.amount ?? 0)]),
        ),
        numberFormat: "currency",
      });
    }

    const afsCashOut = buildAfsInvestmentValues(
      cashflowInputsQ.data ?? [],
      cashflowAfsBlocksQ.data ?? [],
      months,
    );
    const machineCounts = {
      actual: blankValues(months),
      budget: blankValues(months),
    };
    for (const input of cashflowInputsQ.data ?? []) {
      if (input.line_key !== AFS_MACHINE_INPUT_KEY || !months.includes(input.period)) continue;
      machineCounts.actual[input.period] = Number(input.actual_machine_count ?? 0);
      machineCounts.budget[input.period] = Number(input.budget_machine_count ?? 0);
    }
    const cashflowInputRows = [
      {
        group: "Investeringen",
        label: "AFS'en: aantal machines",
        actual: machineCounts.actual,
        budget: machineCounts.budget,
        numberFormat: "integer" as const,
      },
      {
        group: "Investeringen",
        label: "Cash-out investering AFS'en",
        actual: afsCashOut.actual,
        budget: afsCashOut.budget,
        numberFormat: "currency" as const,
      },
      ...CASHFLOW_INPUT_DEFINITIONS.map((definition) => {
        const values = cashflowInputValues(cashflowInputsQ.data ?? [], definition.key, months);
        return {
          group:
            definition.group === "liquidity"
              ? "Liquiditeitspositie"
              : definition.group === "investments"
                ? "Investeringen"
                : definition.group === "debt"
                  ? "Vreemd vermogen"
                  : "Eigen vermogen",
          label: definition.label,
          actual: values.actual,
          budget: values.budget,
          numberFormat: "currency" as const,
        };
      }),
    ];

    const afsBlockRows = (cashflowAfsBlocksQ.data ?? []).flatMap((block) => [
      ...AFS_INVESTMENT_COMPONENTS.map((component) => ({
        block: `Blok ${block.block_number}`,
        component: component.label,
        amount: Number(block[component.field] ?? 0),
        referenceMachineCount: Number(block.reference_machine_count ?? 0),
        amountPerMachine: afsInvestmentAmountPerMachine(block),
      })),
      {
        block: `Blok ${block.block_number}`,
        component: "Totaal pakket",
        amount: afsInvestmentPackageTotal(block),
        referenceMachineCount: Number(block.reference_machine_count ?? 0),
        amountPerMachine: afsInvestmentAmountPerMachine(block),
      },
    ]);

    return {
      title: "Daily Flowers — W&V / Cashflow",
      selectionLabel: `${selectionTitle(viewMode, months, year)} - ${revenueBudgetScenario === "low" ? "low case" : "mid case"} - marketing ${marketingBudgetMode === "bank" ? "bank" : "intern"}`,
      months,
      columns: visibleColumns,
      totalLabel,
      plRows: rows,
      budgetInputRows,
      cashflowInputRows,
      afsBlockRows,
      cashflowRows: cashflowRows.map((row) => ({
        key: row.key,
        label: row.label,
        section: row.section,
        level: row.level,
        kind: row.kind,
        values: row.values.actual,
        budgetValues: row.values.budget,
        aggregation: row.aggregation,
      })),
    };
  }

  async function runFinancialExport(kind: "excel" | "presentation") {
    setExporting(kind);
    try {
      const exportData = buildCurrentFinancialExportData();
      if (kind === "excel") await exportFinancialWorkbook(exportData);
      else await exportFinancialPresentation(exportData);
      toast.success(
        kind === "excel" ? "Excel-werkmap geëxporteerd" : "Financiële presentatie geëxporteerd",
      );
    } catch (error) {
      toast.error("Exporteren mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setExporting(null);
    }
  }

  function openDetail(row: PlRow, period: string) {
    const base = row.detailByPeriod?.[period];
    const amount = row.values[period] ?? 0;
    if (!base || Math.abs(amount) < 0.005) return;
    setDetail({
      ...base,
      period,
      amount,
      title: `${row.label} - ${monthLabel(period)}`,
    });
  }

  function updateBudgetDraft(cellKey: string, value: string) {
    setBudgetDrafts((current) => ({ ...current, [cellKey]: value }));
  }

  function updateCashflowDraft(cellKey: string, value: string) {
    setCashflowDrafts((current) => ({ ...current, [cellKey]: value }));
  }

  async function saveCashflowInput(
    definition: CashflowInputDefinition,
    period: string,
    metric: CashflowInputMetric,
    rawValue: string,
  ) {
    const amount = parseBudgetInput(rawValue);
    const cellKey = cashflowInputCellKey(definition.key, period, metric);
    const existing = (cashflowInputsQ.data ?? []).find(
      (input) => input.line_key === definition.key && input.period === period,
    );
    const existingAmount = Number(
      metric === "actual" ? (existing?.actual_amount ?? 0) : (existing?.budget_amount ?? 0),
    );
    const allowNegative = definition.group === "liquidity";
    const isPercentage = definition.inputKind === "percentage_of_afs_revenue";
    if (
      !Number.isFinite(amount) ||
      (!allowNegative && amount < 0) ||
      (isPercentage && amount > 100)
    ) {
      toast.error(
        isPercentage
          ? "Vul een percentage tussen 0 en 100 in"
          : allowNegative
            ? "Vul een geldig bedrag in"
            : "Vul een positief bedrag in",
      );
      setCashflowDrafts((current) => ({
        ...current,
        [cellKey]: formatAmountInput(existingAmount),
      }));
      return;
    }
    if (Math.abs(amount - existingAmount) < 0.005) return;

    const payload = {
      period,
      line_key: definition.key,
      actual_amount: metric === "actual" ? amount : Number(existing?.actual_amount ?? 0),
      budget_amount: metric === "budget" ? amount : Number(existing?.budget_amount ?? 0),
    };

    setSavingCashflowCell(cellKey);
    try {
      const { error } = await db
        .from("cashflow_inputs")
        .upsert(payload, { onConflict: "period,line_key" });
      if (error) throw error;
      setCashflowDrafts((current) => ({
        ...current,
        [cellKey]: formatAmountInput(amount),
      }));
      qc.invalidateQueries({ queryKey: ["cashflow-inputs"] });
      toast.success("Cashflow-input opgeslagen");
    } catch (error) {
      toast.error("Cashflow-input opslaan mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSavingCashflowCell(null);
    }
  }

  async function saveAfsMachineCount(
    period: string,
    metric: CashflowInputMetric,
    rawValue: string,
  ) {
    const count = parseBudgetInput(rawValue);
    const cellKey = cashflowMachineCountCellKey(period, metric);
    const existing = (cashflowInputsQ.data ?? []).find(
      (input) => input.line_key === AFS_MACHINE_INPUT_KEY && input.period === period,
    );
    const existingCount = Number(
      metric === "actual"
        ? (existing?.actual_machine_count ?? 0)
        : (existing?.budget_machine_count ?? 0),
    );
    if (!Number.isInteger(count) || count < 0) {
      toast.error("Aantal machines moet een positief heel getal zijn");
      setCashflowDrafts((current) => ({
        ...current,
        [cellKey]: formatMachineCountInput(existingCount),
      }));
      return;
    }
    if (count === existingCount) return;

    setSavingCashflowCell(cellKey);
    try {
      const { error } = await db.from("cashflow_inputs").upsert(
        {
          period,
          line_key: AFS_MACHINE_INPUT_KEY,
          actual_amount: Number(existing?.actual_amount ?? 0),
          budget_amount: Number(existing?.budget_amount ?? 0),
          actual_machine_count:
            metric === "actual" ? count : Number(existing?.actual_machine_count ?? 0),
          budget_machine_count:
            metric === "budget" ? count : Number(existing?.budget_machine_count ?? 0),
          actual_afs_block_id: existing?.actual_afs_block_id ?? null,
          budget_afs_block_id: existing?.budget_afs_block_id ?? null,
        },
        { onConflict: "period,line_key" },
      );
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["cashflow-inputs"] });
      qc.invalidateQueries({ queryKey: ["wv-afs-budget-tranches"] });
      toast.success("Aantal AFS'en opgeslagen");
    } catch (error) {
      toast.error("Aantal AFS'en opslaan mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSavingCashflowCell(null);
    }
  }

  async function saveAfsBlockSelection(
    period: string,
    metric: CashflowInputMetric,
    blockId: string,
  ) {
    const existing = (cashflowInputsQ.data ?? []).find(
      (input) => input.line_key === AFS_MACHINE_INPUT_KEY && input.period === period,
    );
    try {
      const { error } = await db.from("cashflow_inputs").upsert(
        {
          period,
          line_key: AFS_MACHINE_INPUT_KEY,
          actual_amount: Number(existing?.actual_amount ?? 0),
          budget_amount: Number(existing?.budget_amount ?? 0),
          actual_machine_count: Number(existing?.actual_machine_count ?? 0),
          budget_machine_count: Number(existing?.budget_machine_count ?? 0),
          actual_afs_block_id:
            metric === "actual" ? blockId : (existing?.actual_afs_block_id ?? null),
          budget_afs_block_id:
            metric === "budget" ? blockId : (existing?.budget_afs_block_id ?? null),
        },
        { onConflict: "period,line_key" },
      );
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["cashflow-inputs"] });
      toast.success("AFS-blok geselecteerd");
    } catch (error) {
      toast.error("AFS-blok selecteren mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function saveAfsBlockSetting(
    block: CashflowAfsBlock,
    field: CashflowAfsBlockField,
    rawValue: string,
  ) {
    const value = parseBudgetInput(rawValue);
    const cellKey = cashflowAfsBlockCellKey(block.id, field);
    const currentValue = Number(block[field] ?? 0);
    const isMachineCount = field === "reference_machine_count";
    const invalid =
      !Number.isFinite(value) ||
      value < 0 ||
      (isMachineCount && (!Number.isInteger(value) || value <= 0));
    if (invalid) {
      toast.error(
        isMachineCount
          ? "Referentie-aantal moet een heel getal groter dan 0 zijn"
          : "Vul een positief bedrag in",
      );
      setCashflowDrafts((drafts) => ({
        ...drafts,
        [cellKey]: isMachineCount
          ? formatMachineCountInput(currentValue)
          : formatAmountInput(currentValue),
      }));
      return;
    }
    if (Math.abs(value - currentValue) < 0.005) return;

    setSavingCashflowCell(cellKey);
    try {
      const { error } = await db
        .from("cashflow_afs_blocks")
        .update({ [field]: value })
        .eq("id", block.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["cashflow-afs-blocks"] });
      toast.success("AFS-investeringsparameter opgeslagen");
    } catch (error) {
      toast.error("AFS-investeringsparameter opslaan mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSavingCashflowCell(null);
    }
  }

  async function addAfsBlock() {
    const nextNumber =
      Math.max(0, ...(cashflowAfsBlocksQ.data ?? []).map((block) => Number(block.block_number))) +
      1;
    try {
      const { error } = await db.from("cashflow_afs_blocks").insert({
        block_number: nextNumber,
        reference_machine_count: 1,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["cashflow-afs-blocks"] });
      toast.success(`AFS-blok ${nextNumber} toegevoegd`);
    } catch (error) {
      toast.error("AFS-blok toevoegen mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function saveRevenueBudgetInput(
    row: RevenueBudgetInputRow,
    period: string,
    rawValue: string,
  ) {
    const cell = row.values[period];
    const amount = parseBudgetInput(rawValue);
    const cellKey = revenueBudgetCellKey(row.key, period);
    if (!Number.isFinite(amount)) {
      toast.error("Ongeldig bedrag");
      setBudgetDrafts((current) => ({
        ...current,
        [cellKey]: formatAmountInput(cell?.amount ?? 0),
      }));
      return;
    }
    if (cell?.id && Math.abs(amount - cell.amount) < 0.005) return;
    if (!cell?.id && Math.abs(amount) < 0.005) return;

    setSavingBudgetCell(cellKey);
    try {
      if (cell?.id) {
        const { error } = await db.from("budgets").update({ amount }).eq("id", cell.id);
        if (error) throw error;
      } else {
        let del = db
          .from("budgets")
          .delete()
          .eq("scenario", row.scenario)
          .eq("channel", row.channel)
          .eq("period", period);
        del = row.machineId ? del.eq("machine_id", row.machineId) : del.is("machine_id", null);
        const deleteResult = await del;
        if (deleteResult.error) throw deleteResult.error;

        const { error } = await db.from("budgets").insert({
          channel: row.channel,
          machine_id: row.machineId,
          period,
          amount,
          scenario: row.scenario,
        });
        if (error) throw error;
      }

      setBudgetDrafts((current) => ({ ...current, [cellKey]: formatAmountInput(amount) }));
      qc.invalidateQueries({ queryKey: ["wv-revenue-budgets"] });
      qc.invalidateQueries({ queryKey: ["budgets-analysis"] });
      toast.success("Budget opgeslagen");
    } catch (error) {
      toast.error("Budget opslaan mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSavingBudgetCell(null);
    }
  }

  async function saveAfsBudgetTrancheRevenue(
    row: AfsBudgetTrancheInputRow,
    period: string,
    rawValue: string,
  ) {
    const cell = row.values[period];
    const amountPerMachine = parseBudgetInput(rawValue);
    const machineCount = Number(row.machine_count ?? 0);
    const totalAmount = amountPerMachine * machineCount;
    const cellKey = afsBudgetTrancheRevenueCellKey(row.id, period);
    if (!Number.isFinite(amountPerMachine) || amountPerMachine < 0) {
      toast.error("Vul een positief omzetbedrag per machine in");
      setBudgetDrafts((current) => ({
        ...current,
        [cellKey]: formatAmountInput(
          Number(cell?.amountPerMachine ?? 0) ||
            (machineCount > 0 ? Number(cell?.amount ?? 0) / machineCount : 0),
        ),
      }));
      return;
    }
    if (!Number.isFinite(machineCount) || machineCount <= 0) {
      toast.error("Deze tranche heeft geen geldig aantal machines");
      return;
    }
    if (period < row.start_period) {
      toast.error("Deze tranche is in deze maand nog niet actief");
      return;
    }
    if (cell?.id && Math.abs(totalAmount - cell.amount) < 0.005) return;
    if (!cell?.id && Math.abs(totalAmount) < 0.005) return;

    setSavingBudgetCell(cellKey);
    try {
      const { error } = await db.from("afs_budget_tranche_revenues").upsert(
        {
          cashflow_input_id: row.id,
          period,
          amount: totalAmount,
          amount_per_machine: amountPerMachine,
        },
        { onConflict: "cashflow_input_id,period" },
      );
      if (error) throw error;
      setBudgetDrafts((current) => ({
        ...current,
        [cellKey]: formatAmountInput(amountPerMachine),
      }));
      qc.invalidateQueries({ queryKey: ["wv-afs-budget-tranche-revenues"] });
      toast.success(
        `${machineCount} machines × ${formatEUR(amountPerMachine)} = ${formatEUR(totalAmount)}`,
      );
    } catch (error) {
      toast.error("Trancheomzet opslaan mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSavingBudgetCell(null);
    }
  }

  async function savePlBudgetInput(row: PlBudgetInputRow, period: string, rawValue: string) {
    const cell = row.values[period];
    const amount = parseBudgetInput(rawValue);
    const cellKey = plBudgetCellKey(row.key, period);
    if (!Number.isFinite(amount)) {
      toast.error("Ongeldig bedrag");
      setBudgetDrafts((current) => ({
        ...current,
        [cellKey]: formatAmountInput(cell?.amount ?? 0),
      }));
      return;
    }
    if (cell?.id && Math.abs(amount - cell.amount) < 0.005) return;
    if (!cell?.id && Math.abs(amount) < 0.005) return;

    setSavingBudgetCell(cellKey);
    try {
      if (cell?.id) {
        const { error } = await db.from("pl_budget_lines").update({ amount }).eq("id", cell.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("pl_budget_lines").upsert(
          {
            period,
            budget_year: Number(period.split("-")[0]),
            section: row.section,
            line_key: row.lineKey,
            line_label: row.lineLabel,
            kind: row.kind,
            amount,
            source_workbook: row.sourceWorkbook,
            source_sheet: row.sourceSheet,
            source_label: row.sourceLabel,
            sort_order: row.sortOrder,
          },
          { onConflict: "source_workbook,period,line_key" },
        );
        if (error) throw error;
      }

      setBudgetDrafts((current) => ({ ...current, [cellKey]: formatAmountInput(amount) }));
      qc.invalidateQueries({ queryKey: ["wv-pl-budget-lines"] });
      toast.success("Budget opgeslagen");
    } catch (error) {
      toast.error("Budget opslaan mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSavingBudgetCell(null);
    }
  }

  async function saveCostDriverInput(
    driver: CostDriverDefinition,
    period: string,
    rawValue: string,
    field: CostDriverInputFieldName = "amount",
  ) {
    const isMachineCountField = field === "machineCount";
    const trimmedValue = String(rawValue ?? "").trim();
    const parsedValue =
      isMachineCountField && !trimmedValue ? null : parseBudgetInput(trimmedValue);
    const cellKey = costDriverCellKey(driver.driver_key, period, field);
    const rules = (costDriverRulesQ.data ?? [])
      .filter((rule) => rule.driver_key === driver.driver_key)
      .sort((a, b) => comparePeriods(a.from_period, b.from_period));
    const currentRule = activeRuleForPeriod(rules, period);
    const currentAmount = Number(currentRule?.amount ?? driver.defaultAmount);
    const currentBasisAmount = Number(currentRule?.basis_amount ?? driver.defaultBasisAmount ?? 0);
    const currentMachineCountOverride =
      currentRule?.machine_count == null ? null : Number(currentRule.machine_count);
    const numericValue = parsedValue ?? 0;
    const nextAmount = field === "amount" ? numericValue : currentAmount;
    const nextBasisAmount = field === "basisAmount" ? numericValue : currentBasisAmount;
    const nextMachineCountOverride =
      field === "machineCount" ? parsedValue : currentMachineCountOverride;

    if (parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
      toast.error("Ongeldige driverwaarde");
      setBudgetDrafts((current) => ({
        ...current,
        [cellKey]:
          field === "machineCount"
            ? formatMachineCountInput(currentMachineCountOverride)
            : formatDriverInput(driver, field === "amount" ? currentAmount : currentBasisAmount),
      }));
      return;
    }
    if (field === "machineCount" && parsedValue !== null && !Number.isInteger(parsedValue)) {
      toast.error("Aantal AFS moet een heel getal zijn");
      setBudgetDrafts((current) => ({
        ...current,
        [cellKey]: formatMachineCountInput(currentMachineCountOverride),
      }));
      return;
    }
    if (driver.calculation_type === "orders_from_revenue" && nextBasisAmount <= 0) {
      toast.error("Orderwaarde moet groter dan 0 zijn");
      setBudgetDrafts((current) => ({
        ...current,
        [cellKey]: formatDriverInput(driver, currentBasisAmount),
      }));
      return;
    }
    if (
      currentRule &&
      Math.abs(nextAmount - currentAmount) < 0.0005 &&
      Math.abs(nextBasisAmount - currentBasisAmount) < 0.0005 &&
      nextMachineCountOverride === currentMachineCountOverride
    ) {
      return;
    }

    const rulePayload = {
      driver_key: driver.driver_key,
      driver_label: driver.driver_label,
      calculation_type: driver.calculation_type,
      amount: nextAmount,
      basis_amount: driver.calculation_type === "orders_from_revenue" ? nextBasisAmount : null,
      machine_count: driver.calculation_type === "amount_per_afs" ? nextMachineCountOverride : null,
      section: driver.section,
      line_key: driver.line_key,
      line_label: driver.line_label,
      source_label: driver.source_label,
      sort_order: driver.sort_order,
    };

    setSavingBudgetCell(cellKey);
    try {
      if (currentRule?.from_period === period) {
        const { error } = await db
          .from("pl_budget_driver_rules")
          .update(rulePayload)
          .eq("id", currentRule.id);
        if (error) throw error;
      } else {
        if (currentRule && comparePeriods(currentRule.from_period, period) < 0) {
          const { error } = await db
            .from("pl_budget_driver_rules")
            .update({ to_period: previousPeriod(period) })
            .eq("id", currentRule.id);
          if (error) throw error;
        }

        const nextRule = rules.find((rule) => comparePeriods(rule.from_period, period) > 0);
        const { error } = await db.from("pl_budget_driver_rules").insert({
          ...rulePayload,
          from_period: period,
          to_period:
            currentRule?.to_period ?? (nextRule ? previousPeriod(nextRule.from_period) : null),
        });
        if (error) throw error;
      }

      setBudgetDrafts((current) => ({
        ...current,
        [cellKey]:
          field === "machineCount"
            ? formatMachineCountInput(nextMachineCountOverride)
            : formatDriverInput(driver, field === "amount" ? nextAmount : nextBasisAmount),
      }));
      qc.invalidateQueries({ queryKey: ["wv-cost-driver-rules"] });
      toast.success("Budgetparameter opgeslagen");
    } catch (error) {
      toast.error("Budgetparameter opslaan mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSavingBudgetCell(null);
    }
  }

  async function uploadTransactions(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const accounts = accountsQ.data ?? [];
      if (accounts.length === 0) throw new Error("Importeer eerst het grootboekschema");
      const importBatchId = `${new Date().toISOString()}-${file.name}`;
      const rows = await parseGlTransactionWorkbook(file, accounts, importBatchId);
      if (rows.length === 0) {
        toast.error("Geen grootboektransacties gevonden");
        return;
      }

      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error } = await db
          .from("gl_transactions")
          .upsert(rows.slice(i, i + chunk), { onConflict: "source,external_id" });
        if (error) throw error;
      }

      toast.success(`${rows.length} grootboektransacties geimporteerd`);
      qc.invalidateQueries({ queryKey: ["wv-gl-monthly"] });
      qc.invalidateQueries({ queryKey: ["wv-gl-quarterly"] });
    } catch (error) {
      toast.error("W&V-transacties importeren mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      event.target.value = "";
    }
  }

  async function syncExact() {
    setExactSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("exact-sync");
      if (error) throw error;
      if ((data as { status?: string } | null)?.status === "already_running") {
        toast.message("Exact sync draait al", {
          description: (data as { message?: string } | null)?.message,
        });
      } else {
        toast.success("Exact sync gestart", {
          description: "De grootboekregels worden op de achtergrond opgehaald.",
        });
      }
      qc.invalidateQueries({ queryKey: ["sync_state"] });
      qc.invalidateQueries({ queryKey: ["gl-accounts"] });
      qc.invalidateQueries({ queryKey: ["wv-gl-monthly"] });
      qc.invalidateQueries({ queryKey: ["wv-gl-revenue-source-monthly"] });
    } catch (error) {
      toast.error("Exact sync starten mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setExactSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">W&V / Cashflow</h1>
          <p className="text-sm text-muted-foreground">
            Maandrapportage met omzet uit eigen verkoopdata, omzetbudget uit omzet monitoring en
            kosten uit het grootboek, aangevuld met indirecte cashflow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => runFinancialExport("excel")}
            disabled={exporting !== null || exportDataLoading}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {exportDataLoading
              ? "Gegevens laden..."
              : exporting === "excel"
                ? "Excel maken..."
                : "Excel (4 tabbladen)"}
          </Button>
          <Button
            variant="outline"
            onClick={() => runFinancialExport("presentation")}
            disabled={exporting !== null || exportDataLoading}
          >
            <Presentation className="mr-2 h-4 w-4" />
            {exportDataLoading
              ? "Gegevens laden..."
              : exporting === "presentation"
                ? "Presentatie maken..."
                : "Presentatie"}
          </Button>
          <Button variant="outline" onClick={syncExact} disabled={exactSyncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${exactSyncing ? "animate-spin" : ""}`} />
            Exact sync
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadTransactionTemplate(accountsQ.data ?? [])}
          >
            <Download className="mr-2 h-4 w-4" />
            Transactie-template
          </Button>
          <Button variant="outline" asChild>
            <label>
              <Upload className="mr-2 h-4 w-4" />
              W&V-transacties uploaden
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={uploadTransactions}
              />
            </label>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="wv" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="wv">W&V</TabsTrigger>
          <TabsTrigger value="budget-inputs">Budget inputs</TabsTrigger>
          <TabsTrigger value="cashflow-inputs">Cashflow inputs</TabsTrigger>
          <TabsTrigger value="cashflow">Cashflow</TabsTrigger>
          <TabsTrigger value="bank">Bankrapportage</TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="pt-6">
            <div className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-8">
              <Field label="View">
                <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Maand</SelectItem>
                    <SelectItem value="range">YTD / periode</SelectItem>
                    <SelectItem value="year">Jaar</SelectItem>
                    <SelectItem value="multiYear">Meerdere jaren</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {viewMode !== "multiYear" && (
                <Field label="Jaar">
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions().map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              {viewMode === "month" && (
                <Field label="Periode">
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions().map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              {viewMode === "range" && (
                <>
                  <Field label="Vanaf">
                    <Select value={fromMonth} onValueChange={setFromMonth}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {monthOptions().map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="T/m">
                    <Select value={toMonth} onValueChange={setToMonth}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {monthOptions().map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}

              <Field label="Omzetcase">
                <Select
                  value={revenueBudgetScenario}
                  onValueChange={(value) =>
                    setRevenueBudgetScenario(value as RevenueBudgetScenario)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mid">Mid case</SelectItem>
                    <SelectItem value="low">Low case</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Marketingbudget">
                <Select
                  value={marketingBudgetMode}
                  onValueChange={(value) => setMarketingBudgetMode(value as MarketingBudgetMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Intern</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <PlColumnToggles columns={visibleColumns} onToggle={toggleColumn} />

              {viewMode === "multiYear" && (
                <MultiPeriodPicker
                  years={yearOptions()}
                  months={monthOptions()}
                  selectedYears={selectedYears}
                  selectedMonths={selectedMonths}
                  onYearsChange={setSelectedYears}
                  onMonthsChange={setSelectedMonths}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <TabsContent value="wv" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{selectionTitle(viewMode, months, year)}</CardTitle>
              <CardDescription>
                Actuals naast omzetbudgetten en W&V-kostenbudgetten. Klik op een actual om de
                onderliggende grootboekregels of verkooptransacties te zien. Actief:{" "}
                {revenueBudgetScenario === "low" ? "low case" : "mid case"} en marketing{" "}
                {marketingBudgetMode === "bank" ? "bank" : "intern"}.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1680px] text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className={cn(PL_STICKY_HEADER_FIRST, "font-medium")} rowSpan={2}>
                        Rubriek
                      </th>
                      <th
                        className={cn(
                          PL_STICKY_HEADER_SECOND,
                          STICKY_SEPARATOR_SHADOW,
                          "font-medium",
                        )}
                        rowSpan={2}
                      >
                        Regel
                      </th>
                      {months.map((period) => (
                        <th
                          key={period}
                          className="border-l px-3 py-2 text-center font-medium"
                          colSpan={periodColumns.length}
                        >
                          <span className="block">
                            {monthHeaderLabel(period, viewMode === "multiYear")}
                          </span>
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            {quarterHeaderLabel(period, viewMode === "multiYear")}
                          </span>
                        </th>
                      ))}
                      <th
                        className="border-l px-3 py-2 text-center font-medium"
                        colSpan={totalColumns.length}
                      >
                        {totalLabel}
                      </th>
                    </tr>
                    <tr>
                      {months.map((period) => (
                        <BudgetHeaderCells key={`${period}-headers`} columns={periodColumns} />
                      ))}
                      <BudgetHeaderCells columns={totalColumns} totalLabel={totalLabel} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.key}
                        className={
                          row.kind === "subtotal" || row.kind === "result"
                            ? "group border-t bg-muted/20 hover:bg-muted/30"
                            : "group border-t hover:bg-muted/30"
                        }
                      >
                        <td className={profitLossStickyCellClass(row, "section")}>
                          {row.level === 0 ? (
                            <Badge variant="outline">{sectionLabel(row.section)}</Badge>
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            profitLossStickyCellClass(row, "label"),
                            STICKY_SEPARATOR_SHADOW,
                            row.level === 0 ? "font-semibold" : "pl-8",
                          )}
                        >
                          {row.label}
                        </td>
                        {months.map((period) => {
                          const value = row.values[period] ?? 0;
                          const budget = row.budgetValues?.[period];
                          const canOpen =
                            Boolean(row.detailByPeriod?.[period]) && Math.abs(value) >= 0.005;
                          return (
                            <BudgetAmountCells
                              key={`${row.key}-${period}`}
                              columns={periodColumns}
                              value={value}
                              budget={budget}
                              budgetOnly={row.budgetOnly}
                              valueFormat={row.valueFormat}
                              strong={row.kind !== "normal"}
                              onClick={canOpen ? () => openDetail(row, period) : undefined}
                            />
                          );
                        })}
                        <BudgetAmountCells
                          columns={totalColumns}
                          value={row.ytd}
                          budget={row.budgetYtd}
                          budgetOnly={row.budgetOnly}
                          valueFormat={row.valueFormat}
                          strong
                        />
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={tableColSpan}
                          className="px-3 py-8 text-center text-muted-foreground"
                        >
                          Geen W&V-data voor deze selectie.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budget-inputs" className="space-y-4">
          <BudgetInputsPanel
            months={months}
            revenueBudgets={revenueBudgetsQ.data ?? []}
            calculationRevenueBudgets={selectedRevenueBudgets}
            afsBudgetTranches={afsBudgetTranchesQ.data ?? []}
            afsBudgetTrancheRevenues={afsBudgetTrancheRevenuesQ.data ?? []}
            revenueActualsByChannel={revenueActualsByChannel}
            budgetLines={budgetsQ.data ?? []}
            driverRules={costDriverRulesQ.data ?? []}
            activeAfsCount={activeAfsCountQ.data ?? 0}
            drafts={budgetDrafts}
            savingCell={savingBudgetCell}
            onDraftChange={updateBudgetDraft}
            onSaveRevenue={saveRevenueBudgetInput}
            onSaveAfsBudgetTrancheRevenue={saveAfsBudgetTrancheRevenue}
            onSavePl={savePlBudgetInput}
            onSaveCostDriver={saveCostDriverInput}
          />
        </TabsContent>

        <TabsContent value="cashflow-inputs" className="space-y-4">
          <CashflowInputsPanel
            months={months}
            inputs={cashflowInputsQ.data ?? []}
            afsRevenue={plRowCashflowValues(rows, "revenue-bold_afs", months)}
            afsBlocks={cashflowAfsBlocksQ.data ?? []}
            drafts={cashflowDrafts}
            savingCell={savingCashflowCell}
            onDraftChange={updateCashflowDraft}
            onSave={saveCashflowInput}
            onSaveAfsMachineCount={saveAfsMachineCount}
            onSaveAfsBlockSelection={saveAfsBlockSelection}
            onSaveAfsBlockSetting={saveAfsBlockSetting}
            onAddAfsBlock={addAfsBlock}
          />
        </TabsContent>

        <TabsContent value="cashflow" className="space-y-4">
          <CashflowReportPanel
            months={months}
            rows={cashflowRows}
            columns={visibleColumns}
            totalLabel={totalLabel}
            viewMode={viewMode}
            year={year}
          />
        </TabsContent>

        <TabsContent value="bank" className="space-y-4">
          <BankReportingPanel
            reportYear={bankReportYear}
            actualThroughMonth={bankActualThroughMonth}
            profitLossRows={bankProfitLossRows}
            cashflowRows={bankCashflowRows}
            scenario2027ProfitLossRows={scenario2027ProfitLossRows}
            afsBudgetTranches={afsBudgetTranchesQ.data ?? []}
            afsBudgetTrancheRevenues={afsBudgetTrancheRevenuesQ.data ?? []}
            cashflowInputs={cashflowInputsQ.data ?? []}
            afsBlocks={cashflowAfsBlocksQ.data ?? []}
            driverRules={costDriverRulesQ.data ?? []}
            sourceSheets={bankSourceSheets}
            revenueBudgetScenario={revenueBudgetScenario}
            marketingBudgetMode={marketingBudgetMode}
            loading={exportDataLoading}
            onReportYearChange={setBankReportYear}
            onActualThroughMonthChange={setBankActualThroughMonth}
          />
        </TabsContent>
      </Tabs>

      <TransactionDetailDialog detail={detail} onOpenChange={(open) => !open && setDetail(null)} />
    </div>
  );
}

function BudgetInputsPanel({
  months,
  revenueBudgets,
  calculationRevenueBudgets,
  afsBudgetTranches,
  afsBudgetTrancheRevenues,
  revenueActualsByChannel,
  budgetLines,
  driverRules,
  activeAfsCount,
  drafts,
  savingCell,
  onDraftChange,
  onSaveRevenue,
  onSaveAfsBudgetTrancheRevenue,
  onSavePl,
  onSaveCostDriver,
}: {
  months: string[];
  revenueBudgets: RevenueBudgetRow[];
  calculationRevenueBudgets: RevenueBudgetRow[];
  afsBudgetTranches: AfsBudgetTrancheRow[];
  afsBudgetTrancheRevenues: AfsBudgetTrancheRevenueRow[];
  revenueActualsByChannel: Map<string, Record<string, number>>;
  budgetLines: PlBudgetLine[];
  driverRules: PlBudgetDriverRule[];
  activeAfsCount: number;
  drafts: Record<string, string>;
  savingCell: string | null;
  onDraftChange: (cellKey: string, value: string) => void;
  onSaveRevenue: (row: RevenueBudgetInputRow, period: string, rawValue: string) => void;
  onSaveAfsBudgetTrancheRevenue: (
    row: AfsBudgetTrancheInputRow,
    period: string,
    rawValue: string,
  ) => void;
  onSavePl: (row: PlBudgetInputRow, period: string, rawValue: string) => void;
  onSaveCostDriver: (
    driver: CostDriverDefinition,
    period: string,
    rawValue: string,
    field?: "amount" | "basisAmount",
  ) => void;
}) {
  const revenueRowsByScenario = useMemo(
    () => ({
      mid: buildRevenueBudgetInputRows(revenueBudgets, months, "mid"),
      low: buildRevenueBudgetInputRows(revenueBudgets, months, "low"),
    }),
    [months, revenueBudgets],
  );
  const afsBudgetTrancheRows = useMemo(
    () => buildAfsBudgetTrancheInputRows(afsBudgetTranches, afsBudgetTrancheRevenues, months),
    [afsBudgetTrancheRevenues, afsBudgetTranches, months],
  );
  const afsBudgetRentPeriod = months[0] ?? "";
  const afsBudgetRentRule = activeRuleForPeriod(
    driverRules
      .filter((rule) => rule.driver_key === AFS_BUDGET_MACHINE_RENT_DRIVER.driver_key)
      .sort((a, b) => comparePeriods(a.from_period, b.from_period)),
    afsBudgetRentPeriod,
  );
  const afsBudgetRentPercentage = Number(
    afsBudgetRentRule?.amount ?? AFS_BUDGET_MACHINE_RENT_DRIVER.defaultAmount,
  );
  const afsBudgetRentCellKey = costDriverCellKey(
    AFS_BUDGET_MACHINE_RENT_DRIVER.driver_key,
    afsBudgetRentPeriod,
  );
  const afsUncontractedRentRule = activeRuleForPeriod(
    driverRules
      .filter((rule) => rule.driver_key === AFS_UNCONTRACTED_RENT_DRIVER.driver_key)
      .sort((a, b) => comparePeriods(a.from_period, b.from_period)),
    afsBudgetRentPeriod,
  );
  const afsUncontractedRentPercentage = Number(
    afsUncontractedRentRule?.amount ?? AFS_UNCONTRACTED_RENT_DRIVER.defaultAmount,
  );
  const afsUncontractedRentCellKey = costDriverCellKey(
    AFS_UNCONTRACTED_RENT_DRIVER.driver_key,
    afsBudgetRentPeriod,
  );
  const plRows = useMemo(() => buildPlBudgetInputRows(budgetLines, months), [budgetLines, months]);
  const tableMinWidth = Math.max(960, 360 + months.length * 132 + 140);

  return (
    <>
      {(["mid", "low"] as const).map((scenario) => (
        <RevenueBudgetInputsCard
          key={scenario}
          scenario={scenario}
          rows={revenueRowsByScenario[scenario]}
          months={months}
          revenueActualsByChannel={revenueActualsByChannel}
          drafts={drafts}
          savingCell={savingCell}
          tableMinWidth={tableMinWidth}
          onDraftChange={onDraftChange}
          onSave={onSaveRevenue}
        />
      ))}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-base">
                Huur bestaande AFS&apos;en zonder huurafspraak
              </CardTitle>
              <CardDescription>
                Voor bestaande machines zonder actieve huurafspraak wordt dit vaste percentage over
                hun omzetbudget berekend. Machines met een code die begint met LEGACY tellen niet
                mee.
              </CardDescription>
              <Badge variant="outline">LEGACY-machines uitgesloten</Badge>
            </div>
            <label className="w-full space-y-1.5 sm:w-64 sm:shrink-0">
              <span className="block text-sm font-medium">Huurpercentage</span>
              <div className="relative">
                <Input
                  value={
                    drafts[afsUncontractedRentCellKey] ??
                    formatDriverInput(AFS_UNCONTRACTED_RENT_DRIVER, afsUncontractedRentPercentage)
                  }
                  inputMode="decimal"
                  disabled={savingCell === afsUncontractedRentCellKey}
                  className="h-9 pr-8 text-right tabular-nums"
                  onChange={(event) =>
                    onDraftChange(afsUncontractedRentCellKey, event.target.value)
                  }
                  onBlur={(event) =>
                    onSaveCostDriver(
                      AFS_UNCONTRACTED_RENT_DRIVER,
                      afsBudgetRentPeriod,
                      event.currentTarget.value,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                  %
                </span>
              </div>
              <span className="block text-xs text-muted-foreground">
                Geldig vanaf{" "}
                {afsBudgetRentPeriod ? monthHeaderLabel(afsBudgetRentPeriod, true) : "selectie"}.
              </span>
            </label>
          </div>
        </CardHeader>
      </Card>

      {afsBudgetTrancheRows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="text-base">Omzet nieuwe AFS-tranches</CardTitle>
                <CardDescription>
                  Iedere investeringsmaand uit de cashflow vormt één tranche. Vul per maand de omzet
                  per machine in. De totale trancheomzet wordt automatisch berekend als aantal
                  machines × omzet per machine.
                </CardDescription>
              </div>
              <div className="w-full rounded-lg border bg-muted/30 p-3 lg:w-72 lg:shrink-0">
                <label className="space-y-1.5">
                  <span className="block text-sm font-medium">
                    Gemiddelde huur nieuwe AFS&apos;en
                  </span>
                  <div className="relative">
                    <Input
                      value={
                        drafts[afsBudgetRentCellKey] ??
                        formatDriverInput(AFS_BUDGET_MACHINE_RENT_DRIVER, afsBudgetRentPercentage)
                      }
                      inputMode="decimal"
                      disabled={savingCell === afsBudgetRentCellKey}
                      className="h-9 pr-8 text-right tabular-nums"
                      onChange={(event) => onDraftChange(afsBudgetRentCellKey, event.target.value)}
                      onBlur={(event) =>
                        onSaveCostDriver(
                          AFS_BUDGET_MACHINE_RENT_DRIVER,
                          afsBudgetRentPeriod,
                          event.currentTarget.value,
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </label>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Vast percentage van de totale omzet van alle nieuwe budgetmachines
                  {afsBudgetRentPeriod
                    ? `, vanaf ${monthHeaderLabel(afsBudgetRentPeriod, true)}`
                    : ""}
                  .
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: tableMinWidth }}>
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className={cn(BUDGET_STICKY_HEADER_FIRST, "font-medium")}>
                      Investeringsmoment
                    </th>
                    <th
                      className={cn(
                        BUDGET_STICKY_HEADER_SECOND,
                        STICKY_SEPARATOR_SHADOW,
                        "font-medium",
                      )}
                    >
                      Tranche
                    </th>
                    {months.map((period) => (
                      <BudgetInputHeader key={period} period={period} label="Per machine" />
                    ))}
                    <th className="w-32 border-l px-3 py-2 text-right font-medium">Totale omzet</th>
                  </tr>
                </thead>
                <tbody>
                  {afsBudgetTrancheRows.map((row) => (
                    <tr key={row.id} className="group border-t hover:bg-muted/30">
                      <td className={BUDGET_STICKY_BODY_FIRST}>
                        {monthHeaderLabel(row.start_period, true)}
                      </td>
                      <td
                        className={cn(
                          BUDGET_STICKY_BODY_SECOND,
                          STICKY_SEPARATOR_SHADOW,
                          "font-medium",
                        )}
                      >
                        <div>{row.display_name}</div>
                        <div className="text-xs font-normal text-muted-foreground">
                          {row.machine_count} machines
                        </div>
                      </td>
                      {months.map((period) => {
                        const cellKey = afsBudgetTrancheRevenueCellKey(row.id, period);
                        if (period < row.start_period) {
                          return (
                            <td
                              key={period}
                              className="border-l px-3 py-2 text-center text-muted-foreground"
                            >
                              —
                            </td>
                          );
                        }
                        const machineCount = Number(row.machine_count ?? 0);
                        const storedTotal = Number(row.values[period]?.amount ?? 0);
                        const perMachineCell = {
                          ...row.values[period],
                          amount: Number(
                            row.values[period]?.amountPerMachine ??
                              (machineCount > 0 ? storedTotal / machineCount : 0),
                          ),
                        };
                        const rawPerMachine =
                          drafts[cellKey] ?? formatAmountInput(perMachineCell.amount);
                        const amountPerMachine = parseBudgetInput(rawPerMachine);
                        const calculatedTotal =
                          Number.isFinite(amountPerMachine) && machineCount > 0
                            ? amountPerMachine * machineCount
                            : 0;
                        return (
                          <td key={period} className="border-l px-2 py-1 align-top">
                            <BudgetInputField
                              cellKey={cellKey}
                              cell={perMachineCell}
                              draft={drafts[cellKey]}
                              saving={savingCell === cellKey}
                              onDraftChange={onDraftChange}
                              onSave={(rawValue) =>
                                onSaveAfsBudgetTrancheRevenue(row, period, rawValue)
                              }
                            />
                            <div className="mt-1 whitespace-nowrap text-right text-[10px] text-muted-foreground">
                              {machineCount} × {formatEUR(amountPerMachine)} ={" "}
                              <span className="font-medium text-foreground">
                                {formatEUR(calculatedTotal)}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                      <td className="border-l px-3 py-2 text-right font-semibold tabular-nums">
                        {formatEUR(sumInputCells(row.values, months))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <DriverInputsCard
        title="Kostprijs omzet"
        driverDefinitions={COST_DRIVER_DEFINITIONS}
        showAfsMachineCountRow
        months={months}
        revenueBudgets={calculationRevenueBudgets}
        budgetLines={budgetLines}
        driverRules={driverRules}
        activeAfsCount={activeAfsCount}
        drafts={drafts}
        savingCell={savingCell}
        onDraftChange={onDraftChange}
        onSave={onSaveCostDriver}
      />

      <DriverInputsCard
        title="W&V parameters"
        driverDefinitions={PL_PARAMETER_DRIVER_DEFINITIONS}
        months={months}
        revenueBudgets={calculationRevenueBudgets}
        budgetLines={budgetLines}
        driverRules={driverRules}
        activeAfsCount={activeAfsCount}
        drafts={drafts}
        savingCell={savingCell}
        onDraftChange={onDraftChange}
        onSave={onSaveCostDriver}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">W&V-budgetregels</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: tableMinWidth }}>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className={cn(BUDGET_STICKY_HEADER_FIRST, "font-medium")}>Rubriek</th>
                  <th
                    className={cn(
                      BUDGET_STICKY_HEADER_SECOND,
                      STICKY_SEPARATOR_SHADOW,
                      "font-medium",
                    )}
                  >
                    Budgetregel
                  </th>
                  {months.map((period) => (
                    <BudgetInputHeader key={period} period={period} />
                  ))}
                  <th className="w-32 border-l px-3 py-2 text-right font-medium">Totaal</th>
                </tr>
              </thead>
              <tbody>
                {plRows.map((row) => (
                  <tr key={row.key} className="group border-t hover:bg-muted/30">
                    <td className={BUDGET_STICKY_BODY_FIRST}>
                      <Badge variant="outline">{sectionLabel(row.section)}</Badge>
                    </td>
                    <td className={cn(BUDGET_STICKY_BODY_SECOND, STICKY_SEPARATOR_SHADOW)}>
                      <div className="font-medium">{row.lineLabel}</div>
                      <div className="text-xs text-muted-foreground">{row.sourceLabel}</div>
                    </td>
                    {months.map((period) => {
                      const cellKey = plBudgetCellKey(row.key, period);
                      return (
                        <td key={period} className="border-l px-2 py-1">
                          <BudgetInputField
                            cellKey={cellKey}
                            cell={row.values[period]}
                            draft={drafts[cellKey]}
                            saving={savingCell === cellKey}
                            onDraftChange={onDraftChange}
                            onSave={(rawValue) => onSavePl(row, period, rawValue)}
                          />
                        </td>
                      );
                    })}
                    <td className="border-l px-3 py-2 text-right font-semibold tabular-nums">
                      {formatEUR(sumInputCells(row.values, months))}
                    </td>
                  </tr>
                ))}
                {plRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={months.length + 3}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      Geen W&V-budgetregels voor deze selectie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function AfsInvestmentBlocksCard({
  blocks,
  drafts,
  savingCell,
  onDraftChange,
  onSave,
  onAdd,
}: {
  blocks: CashflowAfsBlock[];
  drafts: Record<string, string>;
  savingCell: string | null;
  onDraftChange: (cellKey: string, value: string) => void;
  onSave: (block: CashflowAfsBlock, field: CashflowAfsBlockField, rawValue: string) => void;
  onAdd: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">AFS-investeringsblokken</CardTitle>
          <CardDescription>
            Leg per blok het totale pakket en het bijbehorende aantal machines vast. Het bedrag per
            machine wordt automatisch berekend.
          </CardDescription>
        </div>
        <Button type="button" variant="outline" onClick={onAdd}>
          + Blok toevoegen
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-2">
        {blocks.map((block) => {
          const total = afsInvestmentPackageTotal(block);
          const amountPerMachine = afsInvestmentAmountPerMachine(block);
          const machineCountKey = cashflowAfsBlockCellKey(block.id, "reference_machine_count");
          return (
            <div key={block.id} className="overflow-hidden rounded-md border">
              <div className="flex items-center justify-between gap-3 bg-muted/30 px-3 py-2">
                <div className="font-semibold">Blok {block.block_number}</div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>Totaal {formatEUR(total)}</div>
                  <div>Per machine {formatEUR(amountPerMachine)}</div>
                </div>
              </div>
              <div className="divide-y">
                {AFS_INVESTMENT_COMPONENTS.map((component) => {
                  const cellKey = cashflowAfsBlockCellKey(block.id, component.field);
                  return (
                    <div
                      key={component.key}
                      className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3 px-3 py-2"
                    >
                      <div className="text-sm">{component.label}</div>
                      <BudgetInputField
                        cellKey={cellKey}
                        cell={{ amount: Number(block[component.field] ?? 0) }}
                        draft={drafts[cellKey]}
                        saving={savingCell === cellKey}
                        onDraftChange={onDraftChange}
                        onSave={(rawValue) => onSave(block, component.field, rawValue)}
                      />
                    </div>
                  );
                })}
                <div className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3 bg-muted/20 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">Aantal machines in dit pakket</div>
                    <div className="text-xs text-muted-foreground">
                      Basis voor de prijs per machine
                    </div>
                  </div>
                  <Input
                    value={
                      drafts[machineCountKey] ??
                      formatMachineCountInput(Number(block.reference_machine_count))
                    }
                    inputMode="numeric"
                    disabled={savingCell === machineCountKey}
                    className="h-8 text-right tabular-nums"
                    onChange={(event) => onDraftChange(machineCountKey, event.target.value)}
                    onBlur={(event) =>
                      onSave(block, "reference_machine_count", event.currentTarget.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function RevenueBudgetInputsCard({
  scenario,
  rows,
  months,
  revenueActualsByChannel,
  drafts,
  savingCell,
  tableMinWidth,
  onDraftChange,
  onSave,
}: {
  scenario: RevenueBudgetScenario;
  rows: RevenueBudgetInputRow[];
  months: string[];
  revenueActualsByChannel: Map<string, Record<string, number>>;
  drafts: Record<string, string>;
  savingCell: string | null;
  tableMinWidth: number;
  onDraftChange: (cellKey: string, value: string) => void;
  onSave: (row: RevenueBudgetInputRow, period: string, rawValue: string) => void;
}) {
  const title = scenario === "low" ? "Omzetbudgetten - low case" : "Omzetbudgetten - mid case";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {scenario === "low"
            ? "Voorzichtige omzetvariant. Deze is initieel gekopieerd van de mid case en kan onafhankelijk worden aangepast."
            : "Basisscenario voor de omzetprognose."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: tableMinWidth }}>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className={cn(BUDGET_STICKY_HEADER_FIRST, "font-medium")}>Kanaal</th>
                <th
                  className={cn(
                    BUDGET_STICKY_HEADER_SECOND,
                    STICKY_SEPARATOR_SHADOW,
                    "font-medium",
                  )}
                >
                  Budgetregel
                </th>
                {months.map((period) => (
                  <BudgetInputHeader key={period} period={period} />
                ))}
                <th className="w-32 border-l px-3 py-2 text-right font-medium">Totaal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="group border-t hover:bg-muted/30">
                  <td className={BUDGET_STICKY_BODY_FIRST}>
                    {row.level === 0 ? (
                      <Badge variant="outline">{channelLabel(row.channel)}</Badge>
                    ) : null}
                  </td>
                  <td
                    className={cn(
                      BUDGET_STICKY_BODY_SECOND,
                      STICKY_SEPARATOR_SHADOW,
                      row.level === 0 ? "font-medium" : "pl-8",
                    )}
                  >
                    {row.label}
                  </td>
                  {months.map((period) => {
                    const cellKey = revenueBudgetCellKey(row.key, period);
                    const actualAmount =
                      row.level === 0
                        ? (revenueActualsByChannel.get(row.channel)?.[period] ?? 0)
                        : null;
                    return (
                      <td key={period} className="border-l px-2 py-1">
                        <BudgetInputField
                          cellKey={cellKey}
                          cell={row.values[period]}
                          draft={drafts[cellKey]}
                          saving={savingCell === cellKey}
                          onDraftChange={onDraftChange}
                          onSave={(rawValue) => onSave(row, period, rawValue)}
                        />
                        {actualAmount !== null ? (
                          <div className="mt-1 whitespace-nowrap text-right text-[11px] text-muted-foreground tabular-nums">
                            Real. {formatEUR(actualAmount)}
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                  <td className="border-l px-3 py-2 text-right font-semibold tabular-nums">
                    <div>{formatEUR(sumInputCells(row.values, months))}</div>
                    {row.level === 0 ? (
                      <div className="mt-1 whitespace-nowrap text-[11px] font-normal text-muted-foreground">
                        Real.{" "}
                        {formatEUR(
                          sumValues(revenueActualsByChannel.get(row.channel) ?? {}, months),
                        )}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CashflowInputsPanel({
  months,
  inputs,
  afsRevenue,
  afsBlocks,
  drafts,
  savingCell,
  onDraftChange,
  onSave,
  onSaveAfsMachineCount,
  onSaveAfsBlockSelection,
  onSaveAfsBlockSetting,
  onAddAfsBlock,
}: {
  months: string[];
  inputs: CashflowInputRecord[];
  afsRevenue: CashflowValues;
  afsBlocks: CashflowAfsBlock[];
  drafts: Record<string, string>;
  savingCell: string | null;
  onDraftChange: (cellKey: string, value: string) => void;
  onSave: (
    definition: CashflowInputDefinition,
    period: string,
    metric: CashflowInputMetric,
    rawValue: string,
  ) => void;
  onSaveAfsMachineCount: (period: string, metric: CashflowInputMetric, rawValue: string) => void;
  onSaveAfsBlockSelection: (period: string, metric: CashflowInputMetric, blockId: string) => void;
  onSaveAfsBlockSetting: (
    block: CashflowAfsBlock,
    field: CashflowAfsBlockField,
    rawValue: string,
  ) => void;
  onAddAfsBlock: () => void;
}) {
  const afsCashOut = useMemo(
    () => buildAfsInvestmentValues(inputs, afsBlocks, months),
    [afsBlocks, inputs, months],
  );
  const tableMinWidth = Math.max(1100, 360 + months.length * 264 + 264);
  const groups: Array<{
    key: string;
    label: string;
    definitions: CashflowInputDefinition[];
  }> = [
    {
      key: "liquidity",
      label: "Liquiditeitspositie",
      definitions: CASHFLOW_INPUT_DEFINITIONS.filter((item) => item.group === "liquidity"),
    },
    {
      key: "investments",
      label: "Investeringen",
      definitions: CASHFLOW_INPUT_DEFINITIONS.filter((item) => item.group === "investments"),
    },
    {
      key: "debt",
      label: "Vreemd vermogen",
      definitions: CASHFLOW_INPUT_DEFINITIONS.filter((item) => item.group === "debt"),
    },
    {
      key: "equity",
      label: "Eigen vermogen",
      definitions: CASHFLOW_INPUT_DEFINITIONS.filter((item) => item.group === "equity"),
    },
  ];

  return (
    <>
      <AfsInvestmentBlocksCard
        blocks={afsBlocks}
        drafts={drafts}
        savingCell={savingCell}
        onDraftChange={onDraftChange}
        onSave={onSaveAfsBlockSetting}
        onAdd={onAddAfsBlock}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cashflow inputs per maand</CardTitle>
          <CardDescription>
            Vul voor AFS alleen het aantal machines in. De cash-out wordt berekend met het
            investeringsbedrag per machine uit het blok hierboven. Vul de openingsbalans alleen in
            bij de maand waarin een nieuwe beginstand moet gelden; daarna rolt de cashpositie
            automatisch door.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: tableMinWidth }}>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className={cn(BUDGET_STICKY_HEADER_FIRST, "font-medium")} rowSpan={2}>
                    Rubriek
                  </th>
                  <th
                    className={cn(
                      BUDGET_STICKY_HEADER_SECOND,
                      STICKY_SEPARATOR_SHADOW,
                      "font-medium",
                    )}
                    rowSpan={2}
                  >
                    Cashflowregel
                  </th>
                  {months.map((period) => (
                    <th
                      key={period}
                      className="border-l px-3 py-2 text-center font-medium"
                      colSpan={2}
                    >
                      <span className="block">{monthHeaderLabel(period, true)}</span>
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {quarterHeaderLabel(period, true)}
                      </span>
                    </th>
                  ))}
                  <th className="border-l px-3 py-2 text-center font-medium" colSpan={2}>
                    Totaal
                  </th>
                </tr>
                <tr>
                  {months.map((period) => (
                    <Fragment key={`${period}-cashflow-input-headers`}>
                      <th className="border-l px-3 py-2 text-right font-medium">Actueel</th>
                      <th className="px-3 py-2 text-right font-medium">Budget</th>
                    </Fragment>
                  ))}
                  <th className="border-l px-3 py-2 text-right font-medium">Actueel</th>
                  <th className="px-3 py-2 text-right font-medium">Budget</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="border-t bg-muted/30">
                      <td className={cn(BUDGET_STICKY_BODY_FIRST, "bg-muted/30 font-semibold")}>
                        <Badge variant="outline">
                          {group.key === "investments" ? "Investeringen" : "Financiering"}
                        </Badge>
                      </td>
                      <td
                        className={cn(
                          BUDGET_STICKY_BODY_SECOND,
                          STICKY_SEPARATOR_SHADOW,
                          "bg-muted/30 font-semibold",
                        )}
                      >
                        {group.label}
                      </td>
                      <td colSpan={months.length * 2 + 2} />
                    </tr>
                    {group.key === "investments" && (
                      <>
                        <CashflowAfsMachineCountRow
                          months={months}
                          inputs={inputs}
                          afsBlocks={afsBlocks}
                          drafts={drafts}
                          savingCell={savingCell}
                          onDraftChange={onDraftChange}
                          onSave={onSaveAfsMachineCount}
                          onSelectBlock={onSaveAfsBlockSelection}
                        />
                        <CashflowInputTotalRow
                          label="Cash-out investering AFS'en"
                          description="Automatisch: bedrag per machine × aantal machines"
                          months={months}
                          values={afsCashOut}
                        />
                      </>
                    )}
                    {group.definitions.map((definition) => (
                      <CashflowInputRow
                        key={definition.key}
                        definition={definition}
                        months={months}
                        inputs={inputs}
                        afsRevenue={afsRevenue}
                        drafts={drafts}
                        savingCell={savingCell}
                        onDraftChange={onDraftChange}
                        onSave={onSave}
                      />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function CashflowAfsMachineCountRow({
  months,
  inputs,
  afsBlocks,
  drafts,
  savingCell,
  onDraftChange,
  onSave,
  onSelectBlock,
}: {
  months: string[];
  inputs: CashflowInputRecord[];
  afsBlocks: CashflowAfsBlock[];
  drafts: Record<string, string>;
  savingCell: string | null;
  onDraftChange: (cellKey: string, value: string) => void;
  onSave: (period: string, metric: CashflowInputMetric, rawValue: string) => void;
  onSelectBlock: (period: string, metric: CashflowInputMetric, blockId: string) => void;
}) {
  const machineCounts = {
    actual: Object.fromEntries(months.map((period) => [period, 0])),
    budget: Object.fromEntries(months.map((period) => [period, 0])),
  };
  for (const input of inputs) {
    if (input.line_key !== AFS_MACHINE_INPUT_KEY || !months.includes(input.period)) continue;
    machineCounts.actual[input.period] = Number(input.actual_machine_count ?? 0);
    machineCounts.budget[input.period] = Number(input.budget_machine_count ?? 0);
  }

  return (
    <tr className="group border-t hover:bg-muted/30">
      <td className={BUDGET_STICKY_BODY_FIRST} />
      <td className={cn(BUDGET_STICKY_BODY_SECOND, STICKY_SEPARATOR_SHADOW, "font-medium")}>
        AFS&apos;en: blok en aantal
        <div className="text-xs font-normal text-muted-foreground">
          Kies per kolom het pakket en vul het aantal machines in
        </div>
      </td>
      {months.map((period) => {
        const input = inputs.find(
          (item) => item.line_key === AFS_MACHINE_INPUT_KEY && item.period === period,
        );
        return (
          <Fragment key={period}>
            {(["actual", "budget"] as CashflowInputMetric[]).map((metric, index) => {
              const selectedBlockId =
                metric === "actual" ? input?.actual_afs_block_id : input?.budget_afs_block_id;
              const selectedBlock = afsBlocks.find((block) => block.id === selectedBlockId);
              const count = Number(
                metric === "actual"
                  ? (input?.actual_machine_count ?? 0)
                  : (input?.budget_machine_count ?? 0),
              );
              const cellKey = cashflowMachineCountCellKey(period, metric);
              return (
                <td key={metric} className={cn(index === 0 && "border-l", "px-2 py-1 align-top")}>
                  <Select
                    value={selectedBlockId ?? undefined}
                    onValueChange={(blockId) => onSelectBlock(period, metric, blockId)}
                  >
                    <SelectTrigger className="mb-1 h-8 min-w-28">
                      <SelectValue placeholder="Kies blok" />
                    </SelectTrigger>
                    <SelectContent>
                      {afsBlocks.map((block) => (
                        <SelectItem key={block.id} value={block.id}>
                          Blok {block.block_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={drafts[cellKey] ?? formatMachineCountInput(count)}
                    inputMode="numeric"
                    disabled={savingCell === cellKey}
                    className="h-8 min-w-28 text-right tabular-nums"
                    onChange={(event) => onDraftChange(cellKey, event.target.value)}
                    onBlur={(event) => onSave(period, metric, event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                  <div className="mt-1 whitespace-nowrap text-right text-[11px] text-muted-foreground">
                    Cash-out {formatEUR(-count * afsInvestmentAmountPerMachine(selectedBlock))}
                  </div>
                </td>
              );
            })}
          </Fragment>
        );
      })}
      <td className="border-l px-3 py-2 text-right font-semibold tabular-nums">
        {sumValues(machineCounts.actual, months)}
      </td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums">
        {sumValues(machineCounts.budget, months)}
      </td>
    </tr>
  );
}

function CashflowInputTotalRow({
  label,
  description,
  months,
  values,
}: {
  label: string;
  description: string;
  months: string[];
  values: CashflowValues;
}) {
  return (
    <tr className="group border-t bg-muted/20">
      <td className={cn(BUDGET_STICKY_BODY_FIRST, "bg-muted/20")} />
      <td
        className={cn(
          BUDGET_STICKY_BODY_SECOND,
          STICKY_SEPARATOR_SHADOW,
          "bg-muted/20 font-semibold",
        )}
      >
        {label}
        <div className="text-xs font-normal text-muted-foreground">{description}</div>
      </td>
      {months.map((period) => (
        <Fragment key={period}>
          <td className="border-l px-3 py-2 text-right font-semibold tabular-nums">
            {formatEUR(values.actual[period])}
          </td>
          <td className="px-3 py-2 text-right font-semibold tabular-nums">
            {formatEUR(values.budget[period])}
          </td>
        </Fragment>
      ))}
      <td className="border-l px-3 py-2 text-right font-semibold tabular-nums">
        {formatEUR(sumValues(values.actual, months))}
      </td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums">
        {formatEUR(sumValues(values.budget, months))}
      </td>
    </tr>
  );
}

function CashflowInputRow({
  definition,
  months,
  inputs,
  afsRevenue,
  drafts,
  savingCell,
  onDraftChange,
  onSave,
}: {
  definition: CashflowInputDefinition;
  months: string[];
  inputs: CashflowInputRecord[];
  afsRevenue: CashflowValues;
  drafts: Record<string, string>;
  savingCell: string | null;
  onDraftChange: (cellKey: string, value: string) => void;
  onSave: (
    definition: CashflowInputDefinition,
    period: string,
    metric: CashflowInputMetric,
    rawValue: string,
  ) => void;
}) {
  const values = cashflowInputValues(inputs, definition.key, months);
  const calculatedCommission =
    definition.key === AFS_REVENUE_COMMISSION_INPUT_KEY
      ? afsRevenueCommissionValues(inputs, afsRevenue, months)
      : null;
  return (
    <tr className="group border-t hover:bg-muted/30">
      <td className={BUDGET_STICKY_BODY_FIRST} />
      <td
        className={cn(
          BUDGET_STICKY_BODY_SECOND,
          STICKY_SEPARATOR_SHADOW,
          definition.level === 2 && "pl-8",
        )}
      >
        {definition.label}
        {calculatedCommission ? (
          <div className="text-xs font-normal text-muted-foreground">
            Percentage van de Bold/AFS-omzet; berekend bedrag staat onder de invoer
          </div>
        ) : null}
      </td>
      {months.map((period) => {
        const input = inputs.find(
          (item) => item.line_key === definition.key && item.period === period,
        );
        return (
          <Fragment key={period}>
            {(["actual", "budget"] as CashflowInputMetric[]).map((metric, index) => {
              const cellKey = cashflowInputCellKey(definition.key, period, metric);
              const amount = Number(
                metric === "actual" ? (input?.actual_amount ?? 0) : (input?.budget_amount ?? 0),
              );
              return (
                <td key={metric} className={cn(index === 0 && "border-l", "px-2 py-1")}>
                  <BudgetInputField
                    cellKey={cellKey}
                    cell={{ amount }}
                    draft={drafts[cellKey]}
                    saving={savingCell === cellKey}
                    onDraftChange={onDraftChange}
                    onSave={(rawValue) => onSave(definition, period, metric, rawValue)}
                  />
                  {calculatedCommission ? (
                    <div className="mt-1 whitespace-nowrap text-right text-[11px] text-muted-foreground">
                      {formatEUR(calculatedCommission[metric][period])}
                    </div>
                  ) : null}
                </td>
              );
            })}
          </Fragment>
        );
      })}
      <td className="border-l px-3 py-2 text-right font-semibold tabular-nums">
        {formatEUR(sumValues(calculatedCommission?.actual ?? values.actual, months))}
      </td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums">
        {formatEUR(sumValues(calculatedCommission?.budget ?? values.budget, months))}
      </td>
    </tr>
  );
}

function CashflowReportPanel({
  months,
  rows,
  columns,
  totalLabel,
  viewMode,
  year,
}: {
  months: string[];
  rows: CashflowReportRow[];
  columns: PlMetricColumn[];
  totalLabel: string;
  viewMode: ViewMode;
  year: string;
}) {
  const tableColSpan = 2 + months.length * columns.length + columns.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{selectionTitle(viewMode, months, year)}</CardTitle>
        <CardDescription>
          Bedrijfsresultaat uit de W&amp;V, aangevuld met handmatige investerings- en
          financieringskasstromen.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1680px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className={cn(PL_STICKY_HEADER_FIRST, "font-medium")} rowSpan={2}>
                  Rubriek
                </th>
                <th
                  className={cn(PL_STICKY_HEADER_SECOND, STICKY_SEPARATOR_SHADOW, "font-medium")}
                  rowSpan={2}
                >
                  Regel
                </th>
                {months.map((period) => (
                  <th
                    key={period}
                    className="border-l px-3 py-2 text-center font-medium"
                    colSpan={columns.length}
                  >
                    <span className="block">
                      {monthHeaderLabel(period, viewMode === "multiYear")}
                    </span>
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {quarterHeaderLabel(period, viewMode === "multiYear")}
                    </span>
                  </th>
                ))}
                <th className="border-l px-3 py-2 text-center font-medium" colSpan={columns.length}>
                  {totalLabel}
                </th>
              </tr>
              <tr>
                {months.map((period) => (
                  <BudgetHeaderCells key={`${period}-cashflow-headers`} columns={columns} />
                ))}
                <BudgetHeaderCells columns={columns} totalLabel={totalLabel} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const strong = row.kind !== "normal";
                const rowBackground =
                  row.kind === "result"
                    ? "bg-primary/5"
                    : row.kind === "subtotal" || row.kind === "heading"
                      ? "bg-muted/20"
                      : "bg-background";
                return (
                  <tr
                    key={row.key}
                    className={cn("group border-t hover:bg-muted/30", rowBackground)}
                  >
                    <td
                      className={cn(PL_STICKY_BODY_FIRST, rowBackground, "group-hover:bg-muted/30")}
                    >
                      {row.level === 0 ? <Badge variant="outline">{row.section}</Badge> : null}
                    </td>
                    <td
                      className={cn(
                        PL_STICKY_BODY_SECOND,
                        STICKY_SEPARATOR_SHADOW,
                        rowBackground,
                        "group-hover:bg-muted/30",
                        strong && "font-semibold",
                        row.level === 1 && "pl-8",
                        row.level === 2 && "pl-12 text-muted-foreground",
                      )}
                    >
                      {row.label}
                    </td>
                    {months.map((period) =>
                      row.kind === "heading" ? (
                        <td key={period} colSpan={columns.length} className="border-l" />
                      ) : (
                        <BudgetAmountCells
                          key={`${row.key}-${period}`}
                          columns={columns}
                          value={row.values.actual[period] ?? 0}
                          budget={row.values.budget[period] ?? 0}
                          strong={strong}
                        />
                      ),
                    )}
                    {row.kind === "heading" ? (
                      <td colSpan={columns.length} className="border-l" />
                    ) : (
                      <BudgetAmountCells
                        columns={columns}
                        value={cashflowReportTotal(row, row.values.actual, months)}
                        budget={cashflowReportTotal(row, row.values.budget, months)}
                        strong={strong}
                      />
                    )}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={tableColSpan}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    Geen cashflowdata voor deze selectie.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function cashflowReportTotal(
  row: CashflowReportRow,
  values: Record<string, number>,
  periods: string[],
) {
  if (periods.length === 0) return 0;
  if (row.aggregation === "opening") return Number(values[periods[0]] ?? 0);
  if (row.aggregation === "ending") return Number(values[periods.at(-1)!] ?? 0);
  if (row.aggregation === "max") {
    return Math.max(0, ...periods.map((period) => Number(values[period] ?? 0)));
  }
  return sumValues(values, periods);
}

type BankStatementRow = {
  key: string;
  label: string;
  section: string;
  level: 0 | 1 | 2;
  kind: "normal" | "heading" | "subtotal" | "result";
  actual: Record<string, number>;
  budget: Record<string, number>;
  projection?: Record<string, number>;
  aggregation?: "sum" | "opening" | "ending" | "max";
};

type BankCashNeedSummary = {
  peakFundingNeed: number;
  peakFundingPeriod: string | null;
  plannedFunding: number;
  peakAdditionalNeed: number;
  peakAdditionalPeriod: string | null;
};

function buildBankSourceSheets({
  months,
  glRows,
  salesRows,
  budgetLines,
  revenueBudgets,
  driverRules,
  budgetTranches,
  budgetTrancheRevenues,
  cashflowInputs,
  afsBlocks,
  rentalAgreements,
  rentalInvoices,
  machineActuals,
  revenueBudgetScenario,
  marketingBudgetMode,
}: {
  months: string[];
  glRows: GlPeriodRow[];
  salesRows: SalesPeriodRow[];
  budgetLines: PlBudgetLine[];
  revenueBudgets: RevenueBudgetRow[];
  driverRules: PlBudgetDriverRule[];
  budgetTranches: AfsBudgetTrancheRow[];
  budgetTrancheRevenues: AfsBudgetTrancheRevenueRow[];
  cashflowInputs: CashflowInputRecord[];
  afsBlocks: CashflowAfsBlock[];
  rentalAgreements: AfsRentalAgreementRow[];
  rentalInvoices: AfsRentalInvoiceRow[];
  machineActuals: AfsMachineActualRow[];
  revenueBudgetScenario: RevenueBudgetScenario;
  marketingBudgetMode: MarketingBudgetMode;
}): BankSourceSheet[] {
  const inScope = (period: string) => months.includes(period);
  return [
    {
      name: "Modelkeuze",
      title: "Actieve budgetscenario's",
      description: "Keuzes waarmee de W&V- en cashflowprognose in dit bankbestand is berekend.",
      headers: ["Onderdeel", "Actieve keuze"],
      rows: [
        ["Omzetbudget", revenueBudgetScenario === "low" ? "Low case" : "Mid case"],
        ["Marketingbudget", marketingBudgetMode === "bank" ? "Bank" : "Intern"],
      ],
    },
    {
      name: "Bron GL actuals",
      title: "Grootboekactuals",
      description: "Maandtotalen per grootboekrekening die de actuele W&V voeden.",
      headers: [
        "Periode",
        "Kwartaal",
        "Rekening-ID",
        "Rekeningcode",
        "Rekeningnaam",
        "W&V-rubriek",
        "Omzetkanaal",
        "Sorteervolgorde",
        "Aantal boekingen",
        "Bedrag",
      ],
      rows: glRows
        .filter((row) => inScope(row.period))
        .map((row) => [
          row.period,
          row.quarter_key,
          row.account_id,
          row.account_code,
          row.account_name,
          row.pl_section,
          row.revenue_channel,
          row.sort_order,
          row.entry_count,
          Number(row.amount ?? 0),
        ]),
      numericColumns: [7, 8, 9],
    },
    {
      name: "Bron omzet actuals",
      title: "Omzetactuals per kanaal",
      description: "Maandomzet per verkoopkanaal, inclusief aantallen en btw-aansluiting.",
      headers: ["Periode", "Kanaal", "Transacties", "Netto omzet", "Bruto omzet", "Btw"],
      rows: salesRows
        .filter((row) => inScope(row.period))
        .map((row) => [
          row.period,
          row.channel,
          row.tx_count,
          Number(row.net_total ?? 0),
          Number(row.gross_total ?? 0),
          Number(row.vat_total ?? 0),
        ]),
      numericColumns: [2, 3, 4, 5],
    },
    {
      name: "Budgetregels W&V",
      title: "Handmatige W&V-budgetregels",
      description: "Alle opgeslagen W&V-budgetregels binnen de modelhorizon.",
      headers: [
        "ID",
        "Periode",
        "Budgetjaar",
        "Rubriek",
        "Sleutel",
        "Regel",
        "Soort",
        "Bedrag",
        "Bronbestand",
        "Brontab",
        "Bronlabel",
        "Sorteervolgorde",
      ],
      rows: budgetLines
        .filter((row) => inScope(row.period))
        .map((row) => [
          row.id,
          row.period,
          row.budget_year,
          row.section,
          row.line_key,
          row.line_label,
          row.kind,
          Number(row.amount ?? 0),
          row.source_workbook,
          row.source_sheet,
          row.source_label,
          row.sort_order,
        ]),
      numericColumns: [2, 7, 11],
    },
    {
      name: "Omzetbudget inputs",
      title: "Omzetbudgetten",
      description:
        "Omzetbudget per scenario, kanaal en, waar van toepassing, per bestaande AFS-machine.",
      headers: [
        "ID",
        "Scenario",
        "Periode",
        "Kanaal",
        "Machine-ID",
        "Bedrag",
        "Machinenaam",
        "AFS-nummer",
      ],
      rows: revenueBudgets
        .filter((row) => inScope(row.period))
        .map((row) => [
          row.id,
          row.scenario ?? "mid",
          row.period,
          row.channel,
          row.machine_id,
          Number(row.amount ?? 0),
          row.machines?.display_name ?? "",
          row.machines?.afs_number ?? "",
        ]),
      numericColumns: [5],
    },
    {
      name: "Driverregels",
      title: "W&V- en kostprijsdrivers",
      description:
        "Ingevoerde percentages, bedragen per AFS, basisbedragen en geldigheidsperioden.",
      headers: [
        "ID",
        "Driver",
        "Label",
        "Berekening",
        "Invoer",
        "Basisbedrag",
        "Machineaantal",
        "Rubriek",
        "Regelsleutel",
        "Regellabel",
        "Bron",
        "Vanaf",
        "Tot en met",
      ],
      rows: driverRules.map((row) => [
        row.id,
        row.driver_key,
        row.driver_label,
        row.calculation_type,
        Number(row.amount ?? 0),
        row.basis_amount == null ? null : Number(row.basis_amount),
        row.machine_count == null ? null : Number(row.machine_count),
        row.section,
        row.line_key,
        row.line_label,
        row.source_label,
        row.from_period,
        row.to_period,
      ]),
      numericColumns: [4, 5, 6],
    },
    {
      name: "AFS tranches",
      title: "Nieuwe AFS-budgettranches",
      description: "Leverings-/startmaand en aantallen van de nieuwe machines.",
      headers: ["ID", "Budgetjaar", "Tranche", "Aantal machines", "Naam", "Startperiode"],
      rows: budgetTranches.map((row) => [
        row.id,
        row.budget_year,
        row.tranche_number,
        row.machine_count,
        row.display_name,
        row.start_period,
      ]),
      numericColumns: [1, 2, 3],
    },
    {
      name: "AFS trancheomzet",
      title: "Omzet per nieuwe AFS-tranche",
      description: "Per-machine invoer en totale trancheomzet per maand.",
      headers: ["ID", "Tranche-ID", "Periode", "Totale omzet", "Omzet per machine"],
      rows: budgetTrancheRevenues
        .filter((row) => inScope(row.period))
        .map((row) => [
          row.id,
          row.cashflow_input_id,
          row.period,
          Number(row.amount ?? 0),
          Number(row.amount_per_machine ?? 0),
        ]),
      numericColumns: [3, 4],
    },
    {
      name: "Cashflow inputs",
      title: "Cashflow-invoer",
      description: "Openingsbalans, investeringen, financiering en aantallen/blokkeuzes per maand.",
      headers: [
        "ID",
        "Periode",
        "Budget betaalperiode (-3 mnd)",
        "Regelsleutel",
        "Actual bedrag",
        "Budget bedrag",
        "Actual machines",
        "Budget machines",
        "Actual AFS-blok",
        "Budget AFS-blok",
      ],
      rows: cashflowInputs
        .filter((row) => inScope(row.period))
        .map((row) => [
          row.id,
          row.period,
          row.line_key === AFS_MACHINE_INPUT_KEY ? afsBudgetPaymentPeriod(row.period) : "",
          row.line_key,
          Number(row.actual_amount ?? 0),
          Number(row.budget_amount ?? 0),
          Number(row.actual_machine_count ?? 0),
          Number(row.budget_machine_count ?? 0),
          row.actual_afs_block_id,
          row.budget_afs_block_id,
        ]),
      numericColumns: [4, 5, 6, 7],
    },
    {
      name: "AFS investeringsblokken",
      title: "AFS-investeringsblokken",
      description: "Pakketkosten en referentieaantallen voor de investeringscashflow.",
      headers: [
        "ID",
        "Blok",
        "Referentie machines",
        "AFS",
        "140 daken",
        "Shipping",
        "Quality check",
        "Plaatsing",
        "KPN/Mollie",
        "Achtergrond/verbouwing",
      ],
      rows: afsBlocks.map((row) => [
        row.id,
        Number(row.block_number ?? 0),
        Number(row.reference_machine_count ?? 0),
        Number(row.afs_amount ?? 0),
        Number(row.roofs_140_amount ?? 0),
        Number(row.shipping_amount ?? 0),
        Number(row.quality_check_amount ?? 0),
        Number(row.installation_amount ?? 0),
        Number(row.kpn_mollie_amount ?? 0),
        Number(row.location_renovation_amount ?? 0),
      ]),
      numericColumns: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    },
    {
      name: "AFS huurafspraken",
      title: "AFS-huurafspraken",
      description: "Contractuele huurparameters die de werkelijke en budgethuur ondersteunen.",
      headers: [
        "ID",
        "Machine-ID",
        "Vanaf",
        "Tot en met",
        "Vaste huur",
        "Energie",
        "Omzetpercentage",
        "Omzetdrempel",
        "Status",
      ],
      rows: rentalAgreements.map((row) => [
        row.id,
        row.machine_id,
        row.start_period,
        row.end_period,
        Number(row.fixed_fee_net ?? 0),
        Number(row.energy_cost_net ?? 0),
        Number(row.turnover_rate_percent ?? 0),
        Number(row.turnover_threshold_net ?? 0),
        row.status,
      ]),
      numericColumns: [4, 5, 6, 7],
    },
    {
      name: "AFS huurfacturen",
      title: "AFS-huurfacturen",
      description: "Niet-geannuleerde huuractuals per machine en maand.",
      headers: ["ID", "Periode", "Machine-ID", "Netto subtotaal", "Status"],
      rows: rentalInvoices
        .filter((row) => inScope(row.period))
        .map((row) => [
          row.id,
          row.period,
          row.machine_id,
          Number(row.subtotal_net ?? 0),
          row.status,
        ]),
      numericColumns: [3],
    },
    {
      name: "AFS machine actuals",
      title: "AFS-omzetactuals per machine",
      description: "Machineomzet uit de maandelijkse aansluiting; bruikbaar voor huurberekeningen.",
      headers: ["Periode", "Machine-ID", "AFS-nummer", "Netto omzet", "Bruto omzet"],
      rows: machineActuals
        .filter((row) => inScope(row.period))
        .map((row) => [
          row.period,
          row.machine_id,
          row.afs_number,
          Number(row.net_total ?? 0),
          Number(row.gross_total ?? 0),
        ]),
      numericColumns: [3, 4],
    },
  ];
}

function BankReportingPanel({
  reportYear,
  actualThroughMonth,
  profitLossRows,
  cashflowRows,
  scenario2027ProfitLossRows,
  afsBudgetTranches,
  afsBudgetTrancheRevenues,
  cashflowInputs,
  afsBlocks,
  driverRules,
  sourceSheets,
  revenueBudgetScenario,
  marketingBudgetMode,
  loading,
  onReportYearChange,
  onActualThroughMonthChange,
}: {
  reportYear: string;
  actualThroughMonth: string;
  profitLossRows: PlRow[];
  cashflowRows: CashflowReportRow[];
  scenario2027ProfitLossRows: PlRow[];
  afsBudgetTranches: AfsBudgetTrancheRow[];
  afsBudgetTrancheRevenues: AfsBudgetTrancheRevenueRow[];
  cashflowInputs: CashflowInputRecord[];
  afsBlocks: CashflowAfsBlock[];
  driverRules: PlBudgetDriverRule[];
  sourceSheets: BankSourceSheet[];
  revenueBudgetScenario: RevenueBudgetScenario;
  marketingBudgetMode: MarketingBudgetMode;
  loading: boolean;
  onReportYearChange: (year: string) => void;
  onActualThroughMonthChange: (month: string) => void;
}) {
  const [exportingBankExcel, setExportingBankExcel] = useState(false);
  const [exportingBankPdf, setExportingBankPdf] = useState(false);
  const actualThroughPeriod = `${reportYear}-${actualThroughMonth}`;
  const nextYear = String(Number(reportYear) + 1);
  const reportMonths = [...yearPeriods(reportYear), ...yearPeriods(nextYear)];
  const actualThroughLabel = monthLabel(actualThroughPeriod);
  const generatedLabel = new Date().toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const bankProfitLossRows: BankStatementRow[] = profitLossRows
    .filter((row) => row.valueFormat !== "percentage")
    .map((row) => ({
      key: row.key,
      label: row.label,
      section: sectionLabel(row.section),
      level: row.level,
      kind: row.kind,
      actual: row.values,
      budget:
        row.budgetValues ?? blankValues([...yearPeriods(reportYear), ...yearPeriods(nextYear)]),
    }));
  const bankCashflowStatementRows: BankStatementRow[] = cashflowRows.map((row) => ({
    key: row.key,
    label: row.label,
    section: row.section,
    level: row.level,
    kind: row.kind,
    actual: row.values.actual,
    budget: row.values.budget,
    aggregation: row.aggregation,
  }));
  const { rows: bankCashNeedRows } = buildBankCashNeedRows(
    bankCashflowStatementRows,
    reportMonths,
    actualThroughPeriod,
  );
  const bankCashflowRowsWithNeed = [...bankCashflowStatementRows, ...bankCashNeedRows];
  const compactProfitLossRows = compactBankProfitLossRows(bankProfitLossRows);
  const afsScenario2027 = buildAfsScenario2027({
    profitLossRows: scenario2027ProfitLossRows,
    budgetTranches: afsBudgetTranches,
    budgetTrancheRevenues: afsBudgetTrancheRevenues,
    driverRules,
    marketingBudgetMode,
  });
  const bankInvestmentAgenda = buildBankInvestmentAgenda({
    inputs: cashflowInputs,
    afsBlocks,
    periods: reportMonths,
    cutoff: actualThroughPeriod,
  });

  async function exportBankExcel() {
    setExportingBankExcel(true);
    try {
      const exportData: BankExportData = {
        reportYear,
        nextYear,
        actualThroughMonth,
        months: reportMonths,
        profitLossRows: compactProfitLossRows,
        detailedProfitLossRows: bankProfitLossRows,
        cashflowRows: bankCashflowRowsWithNeed,
        sourceSheets,
        afsScenario2027,
        investmentAgenda: bankInvestmentAgenda,
      };
      await exportBankWorkbook(exportData);
      toast.success("Bankrapportage als Excel geëxporteerd");
    } catch (error) {
      toast.error("Excel-export mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setExportingBankExcel(false);
    }
  }

  async function exportBankPdf() {
    setExportingBankPdf(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await exportBankReportPdf({
        views: [
          "scenario",
          "profit-loss",
          "cashflow-current",
          "cashflow-next",
          "investment-agenda",
        ],
        fileName: `Daily Flowers bankrapportage ${reportYear}-${nextYear} ${stamp}.pdf`,
      });
      toast.success("Bankrapportage als PDF geëxporteerd");
    } catch (error) {
      toast.error("PDF-export mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setExportingBankPdf(false);
    }
  }

  return (
    <div className="bank-report-print-root space-y-4">
      <Card className="bank-report-no-print">
        <CardHeader>
          <CardTitle className="text-base">Bankrapportage instellen</CardTitle>
          <CardDescription>
            De jaarprognose gebruikt actuals t/m de gekozen maand en schakelt daarna automatisch
            over op budget. Het opvolgende jaar wordt volledig als budget getoond. Actief:{" "}
            {revenueBudgetScenario === "low" ? "low case" : "mid case"} en marketing{" "}
            {marketingBudgetMode === "bank" ? "bank" : "intern"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="Rapportagejaar">
              <Select value={reportYear} onValueChange={onReportYearChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions().map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Actuals rapporteren t/m (${reportYear})`}>
              <Select value={actualThroughMonth} onValueChange={onActualThroughMonthChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm lg:col-span-2">
              <span className="font-medium">Rapportagelogica: </span>
              actuals t/m {actualThroughLabel},{" "}
              {actualThroughMonth === "12"
                ? `daarna ${nextYear} volledig budget.`
                : `budget van ${monthLabel(`${reportYear}-${String(Number(actualThroughMonth) + 1).padStart(2, "0")}`)} t/m december en ${nextYear} volledig budget.`}
            </div>
            <Button
              variant="outline"
              onClick={exportBankExcel}
              disabled={loading || exportingBankExcel}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {exportingBankExcel ? "Excel maken..." : "Excel voor bank"}
            </Button>
            <Button
              variant="outline"
              onClick={exportBankPdf}
              disabled={loading || exportingBankPdf}
            >
              <Download className="mr-2 h-4 w-4" />
              {exportingBankPdf ? "PDF maken..." : "PDF voor bank"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <BankAfsScenarioSheet
        data={afsScenario2027}
        loading={loading}
        generatedLabel={generatedLabel}
      />
      <BankStatementSheet
        view="profit-loss"
        title="Resultaten & prognose"
        description={`Actuals t/m ${actualThroughLabel}; daarna ${revenueBudgetScenario === "low" ? "low case" : "mid case"} met marketing ${marketingBudgetMode === "bank" ? "bank" : "intern"}. De prognose is inclusief de volledige trancheplanning van ${afsScenario2027.machineCount} nieuwe AFS'en en budget ${nextYear}.`}
        reportYear={reportYear}
        nextYear={nextYear}
        actualThroughMonth={actualThroughMonth}
        generatedLabel={generatedLabel}
        rows={bankProfitLossRows}
        loading={loading}
      />
      <BankStatementSheet
        view="cashflow-current"
        title={`Cashflow & financieringsbehoefte ${reportYear}`}
        description={`Maandoverzicht ${reportYear}: actuals t/m ${actualThroughLabel} en daarna ${revenueBudgetScenario === "low" ? "low case" : "mid case"} met marketing ${marketingBudgetMode === "bank" ? "bank" : "intern"}. Inclusief de trancheplanning van ${afsScenario2027.machineCount} nieuwe AFS'en en de bijbehorende vooruitbetalingen.`}
        reportYear={reportYear}
        nextYear={nextYear}
        cashflowYear={reportYear}
        actualThroughMonth={actualThroughMonth}
        generatedLabel={generatedLabel}
        rows={bankCashflowRowsWithNeed}
        loading={loading}
      />
      <BankStatementSheet
        view="cashflow-next"
        title={`Cashflow & financieringsbehoefte ${nextYear}`}
        description={`Maandoverzicht ${nextYear}: volledig ${revenueBudgetScenario === "low" ? "low case" : "mid case"} met marketing ${marketingBudgetMode === "bank" ? "bank" : "intern"}. Inclusief ${afsScenario2027.machineCount} nieuwe AFS'en, investeringen en financieringsbehoefte.`}
        reportYear={reportYear}
        nextYear={nextYear}
        cashflowYear={nextYear}
        actualThroughMonth={actualThroughMonth}
        generatedLabel={generatedLabel}
        rows={bankCashflowRowsWithNeed}
        loading={loading}
      />
      <BankInvestmentAgendaSheet
        data={bankInvestmentAgenda}
        generatedLabel={generatedLabel}
        loading={loading}
      />
    </div>
  );
}

function buildAfsScenario2027({
  profitLossRows,
  budgetTranches,
  budgetTrancheRevenues,
  driverRules,
  marketingBudgetMode,
}: {
  profitLossRows: PlRow[];
  budgetTranches: AfsBudgetTrancheRow[];
  budgetTrancheRevenues: AfsBudgetTrancheRevenueRow[];
  driverRules: PlBudgetDriverRule[];
  marketingBudgetMode: MarketingBudgetMode;
}): BankAfsScenarioData {
  const year = "2027";
  const periods = yearPeriods(year);
  const tranches = budgetTranches.filter(
    (tranche) => tranche.budget_year === Number(year) && tranche.start_period.startsWith(year),
  );
  const trancheById = new Map(tranches.map((tranche) => [tranche.id, tranche]));
  const revenueByPeriod = blankValues(periods);
  for (const revenue of budgetTrancheRevenues) {
    const tranche = trancheById.get(revenue.cashflow_input_id);
    if (!tranche || !periods.includes(revenue.period) || tranche.start_period > revenue.period)
      continue;
    const perMachine = Number(revenue.amount_per_machine ?? 0);
    revenueByPeriod[revenue.period] +=
      perMachine > 0
        ? perMachine * Number(tranche.machine_count ?? 0)
        : Number(revenue.amount ?? 0);
  }

  const machineCount = tranches.reduce(
    (sum, tranche) => sum + Number(tranche.machine_count ?? 0),
    0,
  );
  const driverAmount = (driverKey: string, period: string, carryForward = false) => {
    const definition =
      BUDGET_DRIVER_DEFINITIONS.find((driver) => driver.driver_key === driverKey) ??
      (driverKey === AFS_BUDGET_MACHINE_RENT_DRIVER.driver_key
        ? AFS_BUDGET_MACHINE_RENT_DRIVER
        : undefined);
    const rules = driverRules
      .filter((rule) => rule.driver_key === driverKey)
      .sort((a, b) => comparePeriods(a.from_period, b.from_period));
    const activeRule = activeRuleForPeriod(rules, period);
    const latestRule = carryForward
      ? rules.filter((rule) => comparePeriods(rule.from_period, period) <= 0).at(-1)
      : undefined;
    return Number(activeRule?.amount ?? latestRule?.amount ?? definition?.defaultAmount ?? 0);
  };

  let revenueTotal = 0;
  let purchaseTotal = 0;
  let cleaningTotal = 0;
  let repairTotal = 0;
  let logisticsTotal = 0;
  let rentTotal = 0;
  let marketingTotal = 0;
  const marketingDriverKey =
    marketingBudgetMode === "bank"
      ? "marketing_verkoopkosten_bank"
      : "marketing_verkoopkosten_intern";
  for (const period of periods) {
    const revenue = Number(revenueByPeriod[period] ?? 0);
    const activeMachineCount = tranches
      .filter((tranche) => tranche.start_period <= period)
      .reduce((sum, tranche) => sum + Number(tranche.machine_count ?? 0), 0);
    revenueTotal += revenue;
    purchaseTotal += revenue * (driverAmount("afs_inkoop", period) / 100);
    cleaningTotal += activeMachineCount * driverAmount("afs_schoonmaak", period);
    repairTotal += activeMachineCount * driverAmount("afs_onderhoud", period);
    logisticsTotal += activeMachineCount * driverAmount("afs_logistiek", period);
    rentTotal += revenue * (driverAmount(AFS_BUDGET_MACHINE_RENT_DRIVER.driver_key, period) / 100);
    marketingTotal += revenue * (driverAmount(marketingDriverKey, period) / 100);
  }

  revenueTotal = roundMoney(revenueTotal);
  purchaseTotal = roundMoney(purchaseTotal);
  cleaningTotal = roundMoney(cleaningTotal);
  repairTotal = roundMoney(repairTotal);
  logisticsTotal = roundMoney(logisticsTotal);
  rentTotal = roundMoney(rentTotal);
  marketingTotal = roundMoney(marketingTotal);
  const incrementalCosts = roundMoney(
    purchaseTotal + cleaningTotal + repairTotal + logisticsTotal + rentTotal,
  );
  const contribution = roundMoney(revenueTotal - incrementalCosts);
  const resultImpact = roundMoney(contribution - marketingTotal);
  const budgetTotal = (key: string) => {
    const row = profitLossRows.find((candidate) => candidate.key === key);
    return roundMoney(sumValues(row?.budgetValues ?? {}, periods));
  };
  const withRevenue = budgetTotal("revenue-total");
  const withCostOfGoods = budgetTotal("subtotal-cost_of_goods");
  const withGrossMargin = budgetTotal("gross-margin");

  const scenarioRows = [
    {
      key: "revenue",
      label: "Omzet",
      withoutMachines: roundMoney(withRevenue - revenueTotal),
      withMachines: withRevenue,
      difference: revenueTotal,
    },
    {
      key: "cost-of-goods",
      label: "Kostprijs omzet",
      withoutMachines: roundMoney(withCostOfGoods - incrementalCosts),
      withMachines: withCostOfGoods,
      difference: incrementalCosts,
    },
    {
      key: "gross-margin",
      label: "Brutomarge",
      withoutMachines: roundMoney(withGrossMargin - contribution),
      withMachines: withGrossMargin,
      difference: contribution,
    },
  ];
  const perMachine = (value: number) => (machineCount > 0 ? roundMoney(value / machineCount) : 0);
  const unitEconomicsRows = [
    {
      key: "revenue",
      label: "Jaaromzet nieuwe machines",
      total: revenueTotal,
      perMachine: perMachine(revenueTotal),
    },
    {
      key: "purchase",
      label: "Inkoop bloemen (33% van omzet)",
      total: purchaseTotal,
      perMachine: perMachine(purchaseTotal),
    },
    {
      key: "cleaning",
      label: "Schoonmaak (€ 40 per maand)",
      total: cleaningTotal,
      perMachine: perMachine(cleaningTotal),
    },
    {
      key: "repairs",
      label: "Onderhoud (€ 16,67 per maand)",
      total: repairTotal,
      perMachine: perMachine(repairTotal),
    },
    {
      key: "logistics",
      label: "Logistiek / vulling (€ 250 per maand)",
      total: logisticsTotal,
      perMachine: perMachine(logisticsTotal),
    },
    {
      key: "rent",
      label: "Huurkosten (20% van omzet)",
      total: rentTotal,
      perMachine: perMachine(rentTotal),
    },
    {
      key: "contribution",
      label: "Margebijdrage vóór marketing",
      total: contribution,
      perMachine: perMachine(contribution),
    },
    {
      key: "marketing",
      label: `Marketing (${marketingBudgetMode === "bank" ? "bank" : "intern"} scenario)`,
      total: marketingTotal,
      perMachine: perMachine(marketingTotal),
    },
    {
      key: "result-impact",
      label: "Resultaatbijdrage na marketing",
      total: resultImpact,
      perMachine: perMachine(resultImpact),
    },
  ];

  const outlook2028MachineCount = 200;
  const outlook2028MonthlyRevenuePerMachine = 2_000;
  let outlook2028Revenue = 0;
  let outlook2028Purchase = 0;
  let outlook2028Cleaning = 0;
  let outlook2028Repair = 0;
  let outlook2028Logistics = 0;
  let outlook2028Rent = 0;
  for (const period of yearPeriods("2028")) {
    const revenue = outlook2028MachineCount * outlook2028MonthlyRevenuePerMachine;
    outlook2028Revenue += revenue;
    outlook2028Purchase += revenue * (driverAmount("afs_inkoop", period, true) / 100);
    outlook2028Cleaning += outlook2028MachineCount * driverAmount("afs_schoonmaak", period, true);
    outlook2028Repair += outlook2028MachineCount * driverAmount("afs_onderhoud", period, true);
    outlook2028Logistics += outlook2028MachineCount * driverAmount("afs_logistiek", period, true);
    outlook2028Rent +=
      revenue * (driverAmount(AFS_BUDGET_MACHINE_RENT_DRIVER.driver_key, period, true) / 100);
  }
  outlook2028Revenue = roundMoney(outlook2028Revenue);
  outlook2028Purchase = roundMoney(outlook2028Purchase);
  outlook2028Cleaning = roundMoney(outlook2028Cleaning);
  outlook2028Repair = roundMoney(outlook2028Repair);
  outlook2028Logistics = roundMoney(outlook2028Logistics);
  outlook2028Rent = roundMoney(outlook2028Rent);
  const outlook2028Contribution = roundMoney(
    outlook2028Revenue -
      outlook2028Purchase -
      outlook2028Cleaning -
      outlook2028Repair -
      outlook2028Logistics -
      outlook2028Rent,
  );
  const outlook2028PerMachine = (value: number) => roundMoney(value / outlook2028MachineCount);
  const outlook2028Rows = [
    {
      key: "revenue",
      label: "Jaaromzet bij € 2.000 per maand",
      total: outlook2028Revenue,
      perMachine: outlook2028PerMachine(outlook2028Revenue),
    },
    {
      key: "purchase",
      label: "Inkoop bloemen (33% van omzet)",
      total: outlook2028Purchase,
      perMachine: outlook2028PerMachine(outlook2028Purchase),
    },
    {
      key: "cleaning",
      label: "Schoonmaak (€ 40 per maand)",
      total: outlook2028Cleaning,
      perMachine: outlook2028PerMachine(outlook2028Cleaning),
    },
    {
      key: "repairs",
      label: "Onderhoud (€ 16,67 per maand)",
      total: outlook2028Repair,
      perMachine: outlook2028PerMachine(outlook2028Repair),
    },
    {
      key: "logistics",
      label: "Logistiek / vulling (€ 250 per maand)",
      total: outlook2028Logistics,
      perMachine: outlook2028PerMachine(outlook2028Logistics),
    },
    {
      key: "rent",
      label: "Huurkosten (20% van omzet)",
      total: outlook2028Rent,
      perMachine: outlook2028PerMachine(outlook2028Rent),
    },
    {
      key: "contribution",
      label: "Margebijdrage",
      total: outlook2028Contribution,
      perMachine: outlook2028PerMachine(outlook2028Contribution),
    },
  ];

  return {
    year,
    machineCount,
    marginPercentage: revenueTotal > 0 ? (contribution / revenueTotal) * 100 : 0,
    scenarioRows,
    unitEconomicsRows,
    outlook2028: {
      machineCount: outlook2028MachineCount,
      monthlyRevenuePerMachine: outlook2028MonthlyRevenuePerMachine,
      marginPercentage:
        outlook2028Revenue > 0 ? (outlook2028Contribution / outlook2028Revenue) * 100 : 0,
      unitEconomicsRows: outlook2028Rows,
    },
  };
}

function buildBankInvestmentAgenda({
  inputs,
  afsBlocks,
  periods,
  cutoff,
}: {
  inputs: CashflowInputRecord[];
  afsBlocks: CashflowAfsBlock[];
  periods: string[];
  cutoff: string;
}): BankInvestmentAgendaData {
  const cashflowValues = buildAfsInvestmentValues(inputs, afsBlocks, periods, {
    budgetMonthOffset: AFS_BUDGET_PAYMENT_MONTH_OFFSET,
  });
  const rows = inputs
    .flatMap((input) => {
      if (input.line_key !== AFS_MACHINE_INPUT_KEY) return [];
      const deliveryPeriod = input.period;
      const isActual = deliveryPeriod <= cutoff;
      const paymentPeriod = isActual ? deliveryPeriod : afsBudgetPaymentPeriod(deliveryPeriod);
      if (!periods.includes(deliveryPeriod) && !periods.includes(paymentPeriod)) return [];
      const machineCount = Number(
        isActual ? (input.actual_machine_count ?? 0) : (input.budget_machine_count ?? 0),
      );
      const blockId = isActual ? input.actual_afs_block_id : input.budget_afs_block_id;
      const block = afsBlocks.find((candidate) => candidate.id === blockId);
      const amountPerMachine = roundMoney(afsInvestmentAmountPerMachine(block));
      const totalInvestment = roundMoney(machineCount * amountPerMachine);
      if (machineCount <= 0 && Math.abs(totalInvestment) < 0.005) return [];
      return [
        {
          deliveryPeriod,
          paymentPeriod,
          basis: isActual ? ("Actual" as const) : ("Budget" as const),
          blockLabel: block ? `Blok ${block.block_number}` : "Geen blok gekoppeld",
          machineCount,
          amountPerMachine,
          totalInvestment,
        },
      ];
    })
    .sort(
      (a, b) =>
        comparePeriods(a.paymentPeriod, b.paymentPeriod) ||
        comparePeriods(a.deliveryPeriod, b.deliveryPeriod),
    );
  const totalMachines = rows.reduce((sum, row) => sum + row.machineCount, 0);
  const totalInvestment = roundMoney(rows.reduce((sum, row) => sum + row.totalInvestment, 0));
  const agendaByPaymentPeriod = Object.fromEntries(periods.map((period) => [period, 0])) as Record<
    string,
    number
  >;
  for (const row of rows) {
    if (periods.includes(row.paymentPeriod)) {
      agendaByPaymentPeriod[row.paymentPeriod] += row.totalInvestment;
    }
  }
  const cashflowForecastByPeriod = Object.fromEntries(
    periods.map((period) => [
      period,
      Math.abs(
        period <= cutoff
          ? Number(cashflowValues.actual[period] ?? 0)
          : Number(cashflowValues.budget[period] ?? 0),
      ),
    ]),
  ) as Record<string, number>;
  const cashflowForecastInvestment = roundMoney(
    periods.reduce((sum, period) => sum + cashflowForecastByPeriod[period], 0),
  );
  const timingDifference = roundMoney(
    periods.reduce(
      (sum, period) =>
        sum + Math.abs(agendaByPaymentPeriod[period] - cashflowForecastByPeriod[period]),
      0,
    ),
  );

  return {
    rows,
    totalMachines,
    totalInvestment,
    cashflowForecastInvestment,
    difference: roundMoney(totalInvestment - cashflowForecastInvestment),
    timingDifference,
  };
}

function BankReportLogo() {
  return (
    <img
      src={dailyFlowersLogoUrl}
      alt="Daily Flowers"
      className="bank-report-logo mb-3 h-9 w-auto object-contain"
    />
  );
}

function BankAfsScenarioSheet({
  data,
  loading,
  generatedLabel,
}: {
  data: BankAfsScenarioData;
  loading: boolean;
  generatedLabel: string;
}) {
  const scenarioRevenue = data.scenarioRows.find((row) => row.key === "revenue")?.difference ?? 0;
  const scenarioGrossMargin =
    data.scenarioRows.find((row) => row.key === "gross-margin")?.difference ?? 0;
  const temporaryMarketing =
    data.unitEconomicsRows.find((row) => row.key === "marketing")?.total ?? 0;
  const operationalCashContribution =
    data.unitEconomicsRows.find((row) => row.key === "result-impact")?.total ?? 0;
  const temporaryMarketingPercentage =
    scenarioRevenue > 0 ? (temporaryMarketing / scenarioRevenue) * 100 : 0;
  const visibleUnitEconomicsRows = data.unitEconomicsRows.filter(
    (row) => row.key !== "marketing" && row.key !== "result-impact",
  );

  return (
    <Card
      className="bank-report-scenario-sheet bank-report-sheet overflow-hidden"
      data-bank-report-view="scenario"
    >
      <div className="bank-report-accent h-1" />
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <BankReportLogo />
            <CardTitle className="bank-report-title text-2xl">
              AFS-cases 2027 & verwachting 2028
            </CardTitle>
            <CardDescription className="mt-1">
              W&V-vergelijking van het volledige budget inclusief {data.machineCount} nieuwe
              AFS&apos;en met een case zonder deze nieuwe machines.
            </CardDescription>
          </div>
          <Button
            className="bank-report-no-print"
            size="sm"
            variant="outline"
            onClick={() => printBankReport("scenario")}
            disabled={loading}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print deze view
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 p-5 xl:grid-cols-2">
        <div className="overflow-x-auto xl:col-span-2">
          <h3 className="mb-2 text-sm font-semibold">W&V-vergelijking 2027</h3>
          <table className="bank-report-table w-full min-w-[680px] text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-3 py-2 text-left">Regel</th>
                <th className="px-3 py-2 text-right">
                  Zonder {data.machineCount} nieuwe AFS&apos;en
                </th>
                <th className="bg-emerald-800 px-3 py-2 text-right">
                  Met {data.machineCount} nieuwe AFS&apos;en
                </th>
                <th className="px-3 py-2 text-right">Verschil</th>
              </tr>
            </thead>
            <tbody>
              {data.scenarioRows.map((row) => (
                <tr
                  key={row.key}
                  className={cn(
                    "border-t",
                    row.key === "gross-margin" && "bg-emerald-50 font-semibold",
                  )}
                >
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEUR(row.withoutMachines)}
                  </td>
                  <td className="bg-emerald-50/50 px-3 py-2 text-right tabular-nums">
                    {formatEUR(row.withMachines)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEUR(row.difference)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/70 p-3 text-xs">
            <h4 className="font-semibold text-emerald-950">Toelichting kasconversie</h4>
            <p className="mt-1 text-emerald-950/80">
              De {formatEUR(scenarioGrossMargin)} extra brutomarge leidt niet tot hogere vaste
              overhead. In 2027 is tijdelijk {formatPercentage(temporaryMarketingPercentage)} van de
              extra omzet als marketingbudget opgenomen ({formatEUR(temporaryMarketing)}). Daardoor
              resteert {formatEUR(operationalCashContribution)} operationele kasbijdrage vóór
              machine-investeringen en financiering. Zodra dit tijdelijke marketingniveau wordt
              afgebouwd, converteert de extra brutomarge zonder aanvullende vaste overhead
              rechtstreeks naar operationele kasstroom.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="mb-3">
            <h3 className="text-base font-semibold">Verwachting nieuwe AFS&apos;en 2027</h3>
            <p className="text-xs text-muted-foreground">
              Gefaseerde uitrol van {data.machineCount} machines volgens de ingevoerde
              trancheplanning en omzet per machine per maand.
            </p>
          </div>
          <table className="bank-report-table w-full min-w-[560px] text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-3 py-2 text-left">Onderdeel 2027</th>
                <th className="px-3 py-2 text-right">Totaal {data.machineCount} machines</th>
                <th className="bg-emerald-800 px-3 py-2 text-right">Per 1 machine</th>
                <th className="px-3 py-2 text-right">Marge %</th>
              </tr>
            </thead>
            <tbody>
              {visibleUnitEconomicsRows.map((row) => (
                <tr
                  key={row.key}
                  className={cn(
                    "border-t",
                    row.key === "contribution" && "bg-emerald-50 font-semibold",
                  )}
                >
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEUR(row.total)}</td>
                  <td className="bg-emerald-50/50 px-3 py-2 text-right tabular-nums">
                    {formatEUR(row.perMachine)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.key === "contribution" ? formatPercentage(data.marginPercentage) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto">
          <div className="mb-3">
            <h3 className="text-base font-semibold">Verwachting nieuwe AFS&apos;en 2028</h3>
            <p className="text-xs text-muted-foreground">
              Volledig jaar met {data.outlook2028.machineCount} machines op{" "}
              {formatEUR(data.outlook2028.monthlyRevenuePerMachine)} omzet per machine per maand.
            </p>
          </div>
          <table className="bank-report-table w-full min-w-[560px] text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-3 py-2 text-left">Onderdeel 2028</th>
                <th className="px-3 py-2 text-right">
                  Totaal {data.outlook2028.machineCount} machines
                </th>
                <th className="bg-emerald-800 px-3 py-2 text-right">Per 1 machine</th>
                <th className="px-3 py-2 text-right">Marge %</th>
              </tr>
            </thead>
            <tbody>
              {data.outlook2028.unitEconomicsRows.map((row) => (
                <tr
                  key={row.key}
                  className={cn(
                    "border-t",
                    row.key === "contribution" && "bg-emerald-50 font-semibold",
                  )}
                >
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEUR(row.total)}</td>
                  <td className="bg-emerald-50/50 px-3 py-2 text-right tabular-nums">
                    {formatEUR(row.perMachine)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.key === "contribution"
                      ? formatPercentage(data.outlook2028.marginPercentage)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      <div className="bank-report-footer flex justify-between border-t px-6 py-3 text-[10px] text-muted-foreground">
        <span>Daily Flowers · Vertrouwelijk</span>
        <span>Gegenereerd op {generatedLabel}</span>
      </div>
    </Card>
  );
}

function BankStatementSheet({
  view,
  title,
  description,
  reportYear,
  nextYear,
  cashflowYear,
  actualThroughMonth,
  generatedLabel,
  rows,
  loading,
}: {
  view: "profit-loss" | "cashflow-current" | "cashflow-next";
  title: string;
  description: string;
  reportYear: string;
  nextYear: string;
  cashflowYear?: string;
  actualThroughMonth: string;
  generatedLabel: string;
  rows: BankStatementRow[];
  loading: boolean;
}) {
  const isCashflow = view !== "profit-loss";
  const [displayMode, setDisplayMode] = useState<"summary" | "monthly">("summary");
  const [showDetails, setShowDetails] = useState(false);
  const throughMonthLabel = shortMonthName(actualThroughMonth);
  const remainingStartMonth = String(Math.min(12, Number(actualThroughMonth) + 1)).padStart(2, "0");
  const remainingLabel =
    actualThroughMonth === "12" ? "Geen restant" : `${shortMonthName(remainingStartMonth)}–dec`;
  const cutoff = `${reportYear}-${actualThroughMonth}`;
  const reportPeriods = cashflowYear
    ? yearPeriods(cashflowYear)
    : [...yearPeriods(reportYear), ...yearPeriods(nextYear)];
  const visibleRows =
    view === "profit-loss" && !showDetails ? compactBankProfitLossRows(rows) : rows;

  return (
    <Card className="bank-report-sheet overflow-hidden" data-bank-report-view={view}>
      <div className="bank-report-accent h-1" />
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <BankReportLogo />
            <CardTitle className="bank-report-title text-2xl">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <div className="bank-report-no-print flex flex-wrap justify-end gap-2">
            {!isCashflow ? (
              <div className="flex rounded-md border p-0.5">
                <Button
                  size="sm"
                  variant={displayMode === "summary" ? "default" : "ghost"}
                  onClick={() => setDisplayMode("summary")}
                >
                  Samenvatting
                </Button>
                <Button
                  size="sm"
                  variant={displayMode === "monthly" ? "default" : "ghost"}
                  onClick={() => setDisplayMode("monthly")}
                >
                  Per maand
                </Button>
              </div>
            ) : null}
            {view === "profit-loss" ? (
              <Button size="sm" variant="outline" onClick={() => setShowDetails((value) => !value)}>
                {showDetails ? "Compacte W&V" : "Alle regels"}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => printBankReport(view)}
              disabled={loading}
            >
              <Printer className="mr-2 h-4 w-4" />
              {loading ? "Gegevens laden..." : "Print deze view"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table
            className={cn(
              "bank-report-table w-full text-xs",
              isCashflow
                ? "bank-report-cashflow-table min-w-[1740px]"
                : displayMode === "monthly"
                  ? "min-w-[3000px]"
                  : "min-w-[1120px]",
            )}
          >
            {!isCashflow && displayMode === "summary" ? (
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="w-48 px-3 py-2 text-left">Rubriek</th>
                  <th className="min-w-64 px-3 py-2 text-left">Regel</th>
                  <th className="px-3 py-2 text-right">Actual t/m {throughMonthLabel}</th>
                  <th className="px-3 py-2 text-right">Budget t/m {throughMonthLabel}</th>
                  <th className="px-3 py-2 text-right">Budget {remainingLabel}</th>
                  <th className="bg-emerald-800 px-3 py-2 text-right">Prognose {reportYear}</th>
                  <th className="px-3 py-2 text-right">Budget {reportYear}</th>
                  <th className="bg-emerald-800 px-3 py-2 text-right">Budget {nextYear}</th>
                </tr>
              </thead>
            ) : cashflowYear ? (
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th rowSpan={2} className="w-[145px] min-w-[145px] px-3 py-2 text-left">
                    Rubriek
                  </th>
                  <th rowSpan={2} className="w-[225px] min-w-[225px] px-3 py-2 text-left">
                    Regel
                  </th>
                  <th colSpan={12} className="border-l border-slate-600 px-3 py-2 text-center">
                    {cashflowYear}
                  </th>
                  <th
                    rowSpan={2}
                    className="w-[150px] min-w-[150px] whitespace-nowrap border-l-2 border-white/50 bg-emerald-800 px-3 py-2 text-right"
                  >
                    Totaal {cashflowYear}
                  </th>
                </tr>
                <tr className="bg-slate-800 text-white">
                  {reportPeriods.map((period) => (
                    <th
                      key={period}
                      className={cn(
                        "min-w-[98px] whitespace-nowrap border-l border-slate-600 px-2 py-2 text-right",
                        period > cutoff && "bg-emerald-900",
                      )}
                    >
                      {shortMonthName(period.split("-")[1])}
                      <span className="ml-1 text-[9px] opacity-75">
                        {period <= cutoff ? "A" : "B"}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
            ) : (
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th rowSpan={2} className="w-48 px-3 py-2 text-left">
                    Rubriek
                  </th>
                  <th rowSpan={2} className="min-w-64 px-3 py-2 text-left">
                    Regel
                  </th>
                  <th colSpan={12} className="border-l border-slate-600 px-3 py-2 text-center">
                    {reportYear}
                  </th>
                  <th rowSpan={2} className="bg-emerald-800 px-3 py-2 text-right">
                    Totaal {reportYear}
                  </th>
                  <th colSpan={12} className="border-l border-slate-600 px-3 py-2 text-center">
                    {nextYear}
                  </th>
                  <th rowSpan={2} className="bg-emerald-800 px-3 py-2 text-right">
                    Totaal {nextYear}
                  </th>
                </tr>
                <tr className="bg-slate-800 text-white">
                  {reportPeriods.map((period) => (
                    <th
                      key={period}
                      className={cn(
                        "whitespace-nowrap border-l border-slate-600 px-2 py-2 text-right",
                        period > cutoff && "bg-emerald-900",
                      )}
                    >
                      {shortMonthName(period.split("-")[1])}
                      <span className="ml-1 text-[9px] opacity-75">
                        {period <= cutoff ? "A" : "B"}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {visibleRows.map((row) => {
                const values = bankReportValues(row, reportYear, nextYear, actualThroughMonth);
                const projection = bankProjectionValues(row, reportPeriods, cutoff);
                const strong = row.kind !== "normal";
                return (
                  <tr
                    key={row.key}
                    className={cn(
                      "border-t",
                      row.kind === "result"
                        ? "bg-emerald-50"
                        : row.kind === "subtotal" || row.kind === "heading"
                          ? "bg-slate-100"
                          : "bg-white",
                    )}
                  >
                    <td className="px-3 py-1.5">{row.level === 0 ? row.section : ""}</td>
                    <td
                      className={cn(
                        "px-3 py-1.5",
                        strong && "font-semibold",
                        row.level === 1 && "pl-6",
                        row.level === 2 && "pl-10 text-muted-foreground",
                      )}
                    >
                      {row.label}
                    </td>
                    {row.kind === "heading" ? (
                      <td
                        colSpan={
                          isCashflow ? reportPeriods.length + 1 : displayMode === "monthly" ? 26 : 6
                        }
                      />
                    ) : cashflowYear ? (
                      <>
                        {reportPeriods.map((period) => (
                          <BankValue
                            key={period}
                            value={projection[period] ?? 0}
                            strong={strong}
                            className={period > cutoff ? "bg-emerald-50/50" : undefined}
                          />
                        ))}
                        <BankValue
                          value={aggregateBankRow(row, projection, reportPeriods)}
                          strong
                          className="bank-report-year-total min-w-[150px] border-l-2 bg-emerald-50/70"
                        />
                      </>
                    ) : displayMode === "monthly" ? (
                      <>
                        {reportPeriods.slice(0, 12).map((period) => (
                          <BankValue
                            key={period}
                            value={projection[period] ?? 0}
                            strong={strong}
                            className={period > cutoff ? "bg-emerald-50/50" : undefined}
                          />
                        ))}
                        <BankValue
                          value={aggregateBankRow(row, projection, yearPeriods(reportYear))}
                          strong
                          className="bg-emerald-50/70"
                        />
                        {reportPeriods.slice(12).map((period) => (
                          <BankValue
                            key={period}
                            value={projection[period] ?? 0}
                            strong={strong}
                            className="bg-emerald-50/50"
                          />
                        ))}
                        <BankValue
                          value={aggregateBankRow(row, projection, yearPeriods(nextYear))}
                          strong
                          className="bg-emerald-50/70"
                        />
                      </>
                    ) : (
                      <>
                        <BankValue value={values.actualYtd} strong={strong} />
                        <BankValue value={values.budgetYtd} strong={strong} />
                        <BankValue value={values.budgetRemainder} strong={strong} />
                        <BankValue value={values.forecast} strong className="bg-emerald-50/70" />
                        <BankValue value={values.yearBudget} strong={strong} />
                        <BankValue
                          value={values.nextYearBudget}
                          strong
                          className="bg-emerald-50/70"
                        />
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
      <div className="bank-report-footer flex justify-between border-t px-6 py-3 text-[10px] text-muted-foreground">
        <span>Daily Flowers · Vertrouwelijk</span>
        <span>Gegenereerd op {generatedLabel}</span>
      </div>
    </Card>
  );
}

function BankInvestmentAgendaSheet({
  data,
  generatedLabel,
  loading,
}: {
  data: BankInvestmentAgendaData;
  generatedLabel: string;
  loading: boolean;
}) {
  return (
    <Card className="bank-report-sheet overflow-hidden" data-bank-report-view="investment-agenda">
      <div className="bank-report-accent h-1" />
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <BankReportLogo />
            <CardTitle className="bank-report-title text-2xl">
              Investeringsagenda — {data.totalMachines} AFS
            </CardTitle>
            <CardDescription className="mt-1">
              Leveringsfasering met budgetbetaling drie maanden vóór levering, conform de
              cashflowprognose.
            </CardDescription>
          </div>
          <Button
            className="bank-report-no-print"
            size="sm"
            variant="outline"
            onClick={() => printBankReport("investment-agenda")}
            disabled={loading}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print deze view
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <div className="overflow-x-auto">
          <table className="bank-report-table w-full min-w-[1040px] text-xs">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left">Leveringsmaand</th>
                <th className="bg-emerald-800 px-3 py-2 text-left">Betaalmaand cashflow</th>
                <th className="px-3 py-2 text-left">Basis</th>
                <th className="px-3 py-2 text-left">Investeringsblok</th>
                <th className="px-3 py-2 text-right">Aantal AFS</th>
                <th className="px-3 py-2 text-right">Investering per AFS</th>
                <th className="bg-emerald-800 px-3 py-2 text-right">Cash-out investering</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={`${row.deliveryPeriod}:${row.paymentPeriod}:${row.basis}`}
                  className="border-t"
                >
                  <td className="px-3 py-2 font-semibold">
                    {monthHeaderLabel(row.deliveryPeriod, true)}
                  </td>
                  <td className="bg-emerald-50/50 px-3 py-2 font-semibold">
                    {monthHeaderLabel(row.paymentPeriod, true)}
                  </td>
                  <td className="px-3 py-2">{row.basis}</td>
                  <td className="px-3 py-2">{row.blockLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.machineCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEUR(row.amountPerMachine)}
                  </td>
                  <td className="bg-emerald-50/50 px-3 py-2 text-right tabular-nums">
                    {formatEUR(row.totalInvestment)}
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 ? (
                <tr className="border-t">
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Geen AFS-investeringen ingepland binnen deze rapportageperiode.
                  </td>
                </tr>
              ) : null}
              <tr className="border-t bg-emerald-50 font-semibold">
                <td colSpan={4} className="px-3 py-2">
                  Totaal investeringsagenda
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{data.totalMachines}</td>
                <td className="px-3 py-2 text-right">—</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatEUR(data.totalInvestment)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
      <div className="bank-report-footer flex justify-between border-t px-6 py-3 text-[10px] text-muted-foreground">
        <span>Daily Flowers · Vertrouwelijk</span>
        <span>Gegenereerd op {generatedLabel}</span>
      </div>
    </Card>
  );
}

function BankValue({
  value,
  strong = false,
  variance = false,
  className,
}: {
  value: number;
  strong?: boolean;
  variance?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-3 py-1.5 text-right tabular-nums",
        strong && "font-semibold",
        variance && value < -0.005 && "text-red-700",
        variance && value > 0.005 && "text-emerald-700",
        className,
      )}
    >
      {formatEUR(value)}
    </td>
  );
}

function compactBankProfitLossRows(rows: BankStatementRow[]) {
  return rows.filter(
    (row) =>
      row.key === "revenue-total" ||
      row.key === "gross-margin" ||
      row.key === "result" ||
      row.key.startsWith("subtotal-"),
  );
}

function buildBankCashNeedRows(
  rows: BankStatementRow[],
  periods: string[],
  cutoff: string,
): { rows: BankStatementRow[]; summary: BankCashNeedSummary } {
  const rowByKey = new Map(rows.map((row) => [row.key, row]));
  const preFundingKeys = [
    "operating-result",
    "investment-total",
    "debt_loans_repaid",
    "debt_interest_paid",
    "debt_interest_received",
    "equity_dividend_paid",
  ];
  const fundingKeys = ["debt_loans_received", "equity_shareholder_contributions"];

  const scenario = (metric: "actual" | "budget" | "projection") => {
    const monthlyBeforeFunding = blankValues(periods);
    const plannedFunding = blankValues(periods);
    const cumulativeBeforeFunding = blankValues(periods);
    const fundingNeed = blankValues(periods);
    const cumulativeAfterFunding = blankValues(periods);
    const additionalNeed = blankValues(periods);
    const openingBalanceRow = rowByKey.get("opening-cash-balance");
    const openingBalance =
      periods.length === 0 || !openingBalanceRow
        ? 0
        : metric === "projection"
          ? Number(
              (periods[0] <= cutoff
                ? openingBalanceRow.actual[periods[0]]
                : openingBalanceRow.budget[periods[0]]) ?? 0,
            )
          : Number(openingBalanceRow[metric][periods[0]] ?? 0);
    let runningBeforeFunding = openingBalance;
    let runningAfterFunding = openingBalance;

    for (const period of periods) {
      const valueFor = (key: string) => {
        const row = rowByKey.get(key);
        if (!row) return 0;
        if (metric === "projection") {
          return period <= cutoff
            ? Number(row.actual[period] ?? 0)
            : Number(row.budget[period] ?? 0);
        }
        return Number(row[metric][period] ?? 0);
      };
      const beforeFunding = preFundingKeys.reduce((sum, key) => sum + valueFor(key), 0);
      const funding = fundingKeys.reduce((sum, key) => sum + valueFor(key), 0);
      const netCashflow = valueFor("net-cashflow");
      runningBeforeFunding += beforeFunding;
      runningAfterFunding += netCashflow;
      monthlyBeforeFunding[period] = beforeFunding;
      plannedFunding[period] = funding;
      cumulativeBeforeFunding[period] = runningBeforeFunding;
      fundingNeed[period] = Math.max(0, -runningBeforeFunding);
      cumulativeAfterFunding[period] = runningAfterFunding;
      additionalNeed[period] = Math.max(0, -runningAfterFunding);
    }
    return {
      monthlyBeforeFunding,
      plannedFunding,
      cumulativeBeforeFunding,
      fundingNeed,
      cumulativeAfterFunding,
      additionalNeed,
    };
  };

  const actual = scenario("actual");
  const budget = scenario("budget");
  const projection = scenario("projection");
  const derivedRows: BankStatementRow[] = [
    {
      key: "cash-need-heading",
      label: "Liquiditeits- en financieringsbehoefte",
      section: "Liquiditeitsbehoefte",
      level: 0,
      kind: "heading",
      actual: blankValues(periods),
      budget: blankValues(periods),
    },
    {
      key: "cash-before-funding",
      label: "Cashflow vóór nieuwe financiering",
      section: "Liquiditeitsbehoefte",
      level: 1,
      kind: "subtotal",
      actual: actual.monthlyBeforeFunding,
      budget: budget.monthlyBeforeFunding,
      projection: projection.monthlyBeforeFunding,
    },
    {
      key: "cumulative-before-funding",
      label: "Cumulatieve cashpositie vóór financiering",
      section: "Liquiditeitsbehoefte",
      level: 1,
      kind: "result",
      actual: actual.cumulativeBeforeFunding,
      budget: budget.cumulativeBeforeFunding,
      projection: projection.cumulativeBeforeFunding,
      aggregation: "ending",
    },
    {
      key: "funding-need",
      label: "Financieringsbehoefte",
      section: "Liquiditeitsbehoefte",
      level: 1,
      kind: "result",
      actual: actual.fundingNeed,
      budget: budget.fundingNeed,
      projection: projection.fundingNeed,
      aggregation: "max",
    },
    {
      key: "planned-funding",
      label: "Geplande financieringsinstroom",
      section: "Liquiditeitsbehoefte",
      level: 1,
      kind: "subtotal",
      actual: actual.plannedFunding,
      budget: budget.plannedFunding,
      projection: projection.plannedFunding,
    },
    {
      key: "cumulative-after-funding",
      label: "Cumulatieve cashpositie na geplande financiering",
      section: "Liquiditeitsbehoefte",
      level: 1,
      kind: "result",
      actual: actual.cumulativeAfterFunding,
      budget: budget.cumulativeAfterFunding,
      projection: projection.cumulativeAfterFunding,
      aggregation: "ending",
    },
    {
      key: "additional-cash-need",
      label: "Aanvullende cashbehoefte",
      section: "Liquiditeitsbehoefte",
      level: 1,
      kind: "result",
      actual: actual.additionalNeed,
      budget: budget.additionalNeed,
      projection: projection.additionalNeed,
      aggregation: "max",
    },
  ];

  const peakFunding = peakValue(projection.fundingNeed, periods);
  const peakAdditional = peakValue(projection.additionalNeed, periods);
  return {
    rows: derivedRows,
    summary: {
      peakFundingNeed: peakFunding.value,
      peakFundingPeriod: peakFunding.period,
      plannedFunding: sumValues(projection.plannedFunding, periods),
      peakAdditionalNeed: peakAdditional.value,
      peakAdditionalPeriod: peakAdditional.period,
    },
  };
}

function bankProjectionValues(row: BankStatementRow, periods: string[], cutoff: string) {
  if (row.projection) return row.projection;
  return Object.fromEntries(
    periods.map((period) => [
      period,
      period <= cutoff ? Number(row.actual[period] ?? 0) : Number(row.budget[period] ?? 0),
    ]),
  );
}

function aggregateBankRow(
  row: BankStatementRow,
  values: Record<string, number>,
  periods: string[],
) {
  if (periods.length === 0) return 0;
  if (row.aggregation === "opening") return Number(values[periods[0]] ?? 0);
  if (row.aggregation === "ending") return Number(values[periods.at(-1)!] ?? 0);
  if (row.aggregation === "max") {
    return Math.max(0, ...periods.map((period) => Number(values[period] ?? 0)));
  }
  return sumValues(values, periods);
}

function peakValue(values: Record<string, number>, periods: string[]) {
  let value = 0;
  let period: string | null = null;
  for (const candidate of periods) {
    const candidateValue = Number(values[candidate] ?? 0);
    if (candidateValue > value + 0.005) {
      value = candidateValue;
      period = candidate;
    }
  }
  return { value, period };
}

function bankReportValues(
  row: BankStatementRow,
  reportYear: string,
  nextYear: string,
  actualThroughMonth: string,
) {
  const reportPeriods = yearPeriods(reportYear);
  const cutoff = `${reportYear}-${actualThroughMonth}`;
  const actualPeriods = reportPeriods.filter((period) => period <= cutoff);
  const remainingPeriods = reportPeriods.filter((period) => period > cutoff);
  const projection = bankProjectionValues(
    row,
    [...reportPeriods, ...yearPeriods(nextYear)],
    cutoff,
  );
  const actualYtd = aggregateBankRow(row, row.actual, actualPeriods);
  const budgetYtd = aggregateBankRow(row, row.budget, actualPeriods);
  const budgetRemainder = aggregateBankRow(row, row.budget, remainingPeriods);
  const forecast = aggregateBankRow(row, projection, reportPeriods);
  const yearBudget = aggregateBankRow(row, row.budget, reportPeriods);
  return {
    actualYtd,
    budgetYtd,
    budgetRemainder,
    forecast,
    yearBudget,
    variance: forecast - yearBudget,
    nextYearBudget: aggregateBankRow(row, row.budget, yearPeriods(nextYear)),
  };
}

function printBankReport(
  view: "profit-loss" | "cashflow-current" | "cashflow-next" | "scenario" | "investment-agenda",
) {
  document.body.dataset.bankPrintView = view;
  const cleanup = () => {
    delete document.body.dataset.bankPrintView;
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  window.requestAnimationFrame(() => window.print());
}

function profitLossStickyCellClass(row: PlRow, column: "section" | "label") {
  const rowBackground =
    row.kind === "subtotal" || row.kind === "result"
      ? "bg-muted/20 group-hover:bg-muted/30"
      : "bg-background group-hover:bg-muted/30";

  return cn(column === "section" ? PL_STICKY_BODY_FIRST : PL_STICKY_BODY_SECOND, rowBackground);
}

function DriverInputsCard({
  title,
  driverDefinitions,
  showAfsMachineCountRow = false,
  months,
  revenueBudgets,
  budgetLines,
  driverRules,
  activeAfsCount,
  drafts,
  savingCell,
  onDraftChange,
  onSave,
}: {
  title: string;
  driverDefinitions: CostDriverDefinition[];
  showAfsMachineCountRow?: boolean;
  months: string[];
  revenueBudgets: RevenueBudgetRow[];
  budgetLines: PlBudgetLine[];
  driverRules: PlBudgetDriverRule[];
  activeAfsCount: number;
  drafts: Record<string, string>;
  savingCell: string | null;
  onDraftChange: (cellKey: string, value: string) => void;
  onSave: (
    driver: CostDriverDefinition,
    period: string,
    rawValue: string,
    field?: CostDriverInputFieldName,
  ) => void;
}) {
  const rows = useMemo(
    () =>
      buildCostDriverInputRows({
        driverDefinitions,
        driverRules,
        revenueBudgets,
        budgetLines,
        months,
        activeAfsCount,
      }),
    [activeAfsCount, budgetLines, driverDefinitions, driverRules, months, revenueBudgets],
  );
  const afsMachineCountDriver = showAfsMachineCountRow
    ? rows.find((row) => row.driver_key === AFS_MACHINE_COUNT_DRIVER_KEY)
    : undefined;
  const tableMinWidth = Math.max(1020, 380 + months.length * 156 + 140);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: tableMinWidth }}>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className={cn(BUDGET_STICKY_HEADER_FIRST, "font-medium")}>Driver</th>
                <th
                  className={cn(
                    BUDGET_STICKY_HEADER_SECOND,
                    STICKY_SEPARATOR_SHADOW,
                    "font-medium",
                  )}
                >
                  Input
                </th>
                {months.map((period) => (
                  <BudgetInputHeader key={period} period={period} />
                ))}
                <th className="w-32 border-l px-3 py-2 text-right font-medium">Budget totaal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.driver_key}>
                  {row.driver_key === AFS_MACHINE_COUNT_DRIVER_KEY && afsMachineCountDriver ? (
                    <AfsMachineCountInputRow
                      driver={afsMachineCountDriver}
                      months={months}
                      drafts={drafts}
                      savingCell={savingCell}
                      onDraftChange={onDraftChange}
                      onSave={(period, rawValue) =>
                        onSave(afsMachineCountDriver, period, rawValue, "machineCount")
                      }
                    />
                  ) : null}
                  <tr className="group border-t hover:bg-muted/30">
                    <td className={BUDGET_STICKY_BODY_FIRST}>
                      <Badge variant="outline">{sectionLabel(row.section)}</Badge>
                    </td>
                    <td className={cn(BUDGET_STICKY_BODY_SECOND, STICKY_SEPARATOR_SHADOW)}>
                      <div className="font-medium">{row.driver_label}</div>
                      <div className="text-xs text-muted-foreground">{row.input_label}</div>
                    </td>
                    {months.map((period) => {
                      const cell = row.values[period];
                      return (
                        <td key={period} className="border-l px-2 py-1">
                          <CostDriverInputField
                            driver={row}
                            period={period}
                            cell={cell}
                            drafts={drafts}
                            savingCell={savingCell}
                            onDraftChange={onDraftChange}
                            onSave={(rawValue, field) => onSave(row, period, rawValue, field)}
                          />
                          <div className="mt-1 text-right text-[11px] text-muted-foreground">
                            {formatEUR(cell?.calculatedAmount ?? 0)}
                          </div>
                        </td>
                      );
                    })}
                    <td className="border-l px-3 py-2 text-right font-semibold tabular-nums">
                      {formatEUR(row.total)}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AfsMachineCountInputRow({
  driver,
  months,
  drafts,
  savingCell,
  onDraftChange,
  onSave,
}: {
  driver: CostDriverInputRow;
  months: string[];
  drafts: Record<string, string>;
  savingCell: string | null;
  onDraftChange: (cellKey: string, value: string) => void;
  onSave: (period: string, rawValue: string) => void;
}) {
  return (
    <tr className="group border-t bg-muted/20 hover:bg-muted/30">
      <td className={cn(BUDGET_STICKY_BODY_FIRST, "bg-muted/20")}>
        <Badge variant="outline">Kostprijs omzet</Badge>
      </td>
      <td className={cn(BUDGET_STICKY_BODY_SECOND, STICKY_SEPARATOR_SHADOW, "bg-muted/20")}>
        <div className="font-medium">Aantal AFS</div>
        <div className="text-xs text-muted-foreground">Leeg = standaardtelling</div>
      </td>
      {months.map((period) => {
        const cell = driver.values[period];
        const cellKey = costDriverCellKey(driver.driver_key, period, "machineCount");
        const value =
          drafts[cellKey] ?? formatMachineCountInput(cell?.machineCountOverride ?? null);
        const standard = formatMachineCountInput(cell?.standardMachineCount ?? null);
        return (
          <td key={period} className="border-l px-2 py-1">
            <Input
              value={value}
              placeholder={standard}
              inputMode="numeric"
              disabled={savingCell === cellKey}
              className="h-8 min-w-28 text-right tabular-nums"
              onChange={(event) => onDraftChange(cellKey, event.target.value)}
              onBlur={(event) => onSave(period, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <div className="mt-1 text-right text-[11px] text-muted-foreground">
              Standaard: {standard}
            </div>
          </td>
        );
      })}
      <td className="border-l px-3 py-2 text-right text-muted-foreground">-</td>
    </tr>
  );
}

function BudgetInputHeader({ period, label }: { period: string; label?: string }) {
  return (
    <th className="w-32 border-l px-3 py-2 text-right font-medium">
      <span className="block">{monthHeaderLabel(period, true)}</span>
      <span className="block text-[11px] font-normal text-muted-foreground">
        {quarterHeaderLabel(period, true)}
      </span>
      {label ? (
        <span className="mt-0.5 block text-[10px] font-normal text-emerald-700">{label}</span>
      ) : null}
    </th>
  );
}

function BudgetInputField({
  cellKey,
  cell,
  draft,
  saving,
  onDraftChange,
  onSave,
}: {
  cellKey: string;
  cell?: BudgetInputCell;
  draft?: string;
  saving: boolean;
  onDraftChange: (cellKey: string, value: string) => void;
  onSave: (rawValue: string) => void;
}) {
  const value = draft ?? formatAmountInput(cell?.amount ?? 0);
  return (
    <Input
      value={value}
      inputMode="decimal"
      disabled={saving}
      className="h-8 min-w-28 text-right tabular-nums"
      onChange={(event) => onDraftChange(cellKey, event.target.value)}
      onBlur={(event) => onSave(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function CostDriverInputField({
  driver,
  period,
  cell,
  drafts,
  savingCell,
  onDraftChange,
  onSave,
}: {
  driver: CostDriverDefinition;
  period: string;
  cell?: CostDriverInputCell;
  drafts: Record<string, string>;
  savingCell: string | null;
  onDraftChange: (cellKey: string, value: string) => void;
  onSave: (rawValue: string, field?: CostDriverInputFieldName) => void;
}) {
  const amountCellKey = costDriverCellKey(driver.driver_key, period, "amount");
  const amountValue =
    drafts[amountCellKey] ?? formatDriverInput(driver, cell?.amount ?? driver.defaultAmount);

  if (driver.calculation_type === "orders_from_revenue") {
    const basisCellKey = costDriverCellKey(driver.driver_key, period, "basisAmount");
    const basisValue =
      drafts[basisCellKey] ??
      formatDriverInput(driver, cell?.basisAmount ?? driver.defaultBasisAmount ?? 0);
    return (
      <div className="space-y-2">
        <label className="block space-y-1">
          <span className="block text-[11px] text-muted-foreground">Orderwaarde</span>
          <Input
            value={basisValue}
            inputMode="decimal"
            disabled={savingCell === basisCellKey}
            className="h-8 w-full min-w-0 text-right tabular-nums"
            onChange={(event) => onDraftChange(basisCellKey, event.target.value)}
            onBlur={(event) => onSave(event.currentTarget.value, "basisAmount")}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-[11px] text-muted-foreground">Per order</span>
          <Input
            value={amountValue}
            inputMode="decimal"
            disabled={savingCell === amountCellKey}
            className="h-8 w-full min-w-0 text-right tabular-nums"
            onChange={(event) => onDraftChange(amountCellKey, event.target.value)}
            onBlur={(event) => onSave(event.currentTarget.value, "amount")}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
      </div>
    );
  }

  return (
    <Input
      value={amountValue}
      inputMode="decimal"
      disabled={savingCell === amountCellKey}
      className="h-8 min-w-28 text-right tabular-nums"
      onChange={(event) => onDraftChange(amountCellKey, event.target.value)}
      onBlur={(event) => onSave(event.currentTarget.value, "amount")}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function buildRevenueBudgetInputRows(
  revenueBudgets: RevenueBudgetRow[],
  months: string[],
  scenario: RevenueBudgetScenario,
) {
  const result = new Map<string, RevenueBudgetInputRow>();

  const ensure = (channel: string, machineId: string | null, label: string, level: 0 | 1) => {
    const key = revenueBudgetRowKey(scenario, channel, machineId);
    if (!result.has(key)) {
      result.set(key, {
        key,
        scenario,
        channel,
        machineId,
        label,
        level,
        values: blankInputCells(months),
      });
    }
    return result.get(key)!;
  };

  for (const channel of CHANNELS) {
    ensure(channel, null, "Totaal kanaal", 0);
  }

  for (const budget of revenueBudgets) {
    if ((budget.scenario ?? "mid") !== scenario) continue;
    if (!CHANNELS.includes(budget.channel as (typeof CHANNELS)[number])) continue;
    if (!months.includes(budget.period)) continue;
    const machineLabel = budget.machine_id ? machineBudgetLabel(budget.machines) : "Totaal kanaal";
    const row = ensure(budget.channel, budget.machine_id, machineLabel, budget.machine_id ? 1 : 0);
    row.values[budget.period] = {
      id: budget.id,
      amount: Number(budget.amount ?? 0),
    };
  }

  return [...result.values()].sort((a, b) => {
    const channelSort = channelOrderIndex(a.channel) - channelOrderIndex(b.channel);
    if (channelSort !== 0) return channelSort;
    if (a.level !== b.level) return a.level - b.level;
    return a.label.localeCompare(b.label);
  });
}

function buildAfsBudgetTrancheInputRows(
  tranches: AfsBudgetTrancheRow[],
  revenues: AfsBudgetTrancheRevenueRow[],
  months: string[],
) {
  const rows = new Map<string, AfsBudgetTrancheInputRow>();
  for (const tranche of tranches) {
    rows.set(tranche.id, {
      ...tranche,
      values: blankInputCells(months),
    });
  }
  for (const revenue of revenues) {
    const row = rows.get(revenue.cashflow_input_id);
    if (!row || !months.includes(revenue.period)) continue;
    row.values[revenue.period] = {
      id: revenue.id,
      amount: Number(revenue.amount ?? 0),
      amountPerMachine: Number(revenue.amount_per_machine ?? 0),
    };
  }
  return [...rows.values()].sort(
    (a, b) => a.budget_year - b.budget_year || a.tranche_number - b.tranche_number,
  );
}

function addAfsBudgetTrancheRevenue({
  revenueBudgets,
  budgetTranches,
  budgetTrancheRevenues,
  months,
  scenario,
}: {
  revenueBudgets: RevenueBudgetRow[];
  budgetTranches: AfsBudgetTrancheRow[];
  budgetTrancheRevenues: AfsBudgetTrancheRevenueRow[];
  months: string[];
  scenario: RevenueBudgetScenario;
}) {
  const result = revenueBudgets.map((budget) => ({ ...budget }));
  const forecastByPeriod = new Map<string, number>();
  const activeTranches = new Map(budgetTranches.map((tranche) => [tranche.id, tranche]));
  for (const revenue of budgetTrancheRevenues) {
    const tranche = activeTranches.get(revenue.cashflow_input_id);
    if (!months.includes(revenue.period) || !tranche) continue;
    const amountPerMachine = Number(revenue.amount_per_machine ?? 0);
    const totalAmount =
      amountPerMachine > 0
        ? amountPerMachine * Number(tranche.machine_count ?? 0)
        : Number(revenue.amount ?? 0);
    forecastByPeriod.set(revenue.period, (forecastByPeriod.get(revenue.period) ?? 0) + totalAmount);
  }

  for (const period of months) {
    const forecastAmount = forecastByPeriod.get(period) ?? 0;
    if (Math.abs(forecastAmount) < 0.005) continue;
    const channelBudget = result.find(
      (budget) => budget.channel === "bold_afs" && budget.period === period && !budget.machine_id,
    );
    if (channelBudget) {
      channelBudget.amount = Number(channelBudget.amount ?? 0) + forecastAmount;
    } else {
      result.push({
        id: `afs-budget-tranches:${period}`,
        period,
        channel: "bold_afs",
        machine_id: null,
        amount: forecastAmount,
        scenario,
      });
    }
  }
  return result;
}

function buildPlBudgetInputRows(budgetLines: PlBudgetLine[], months: string[]) {
  const result = new Map<string, PlBudgetInputRow>();

  for (const definition of MANUAL_PL_BUDGET_DEFINITIONS) {
    const key = plBudgetRowKey(definition.lineKey);
    result.set(key, {
      key,
      section: definition.section,
      lineKey: definition.lineKey,
      lineLabel: definition.lineLabel,
      kind: "cost",
      sourceWorkbook: MANUAL_PL_BUDGET_SOURCE_WORKBOOK,
      sourceSheet: definition.sourceSheet,
      sourceLabel: definition.sourceLabel,
      sortOrder: definition.sortOrder,
      values: blankInputCells(months),
    });
  }

  for (const line of budgetLines) {
    if (line.kind === "revenue") continue;
    if (EXCLUDED_PL_BUDGET_LINE_KEYS.has(line.line_key)) continue;
    if (!months.includes(line.period)) continue;
    const key = plBudgetRowKey(line.line_key);
    if (!result.has(key)) {
      result.set(key, {
        key,
        section: line.section,
        lineKey: line.line_key,
        lineLabel: line.line_label,
        kind: line.kind,
        sourceWorkbook: line.source_workbook,
        sourceSheet: line.source_sheet,
        sourceLabel: line.source_label,
        sortOrder: Number(line.sort_order ?? 0),
        values: blankInputCells(months),
      });
    }
    result.get(key)!.values[line.period] = {
      id: line.id,
      amount: Number(line.amount ?? 0),
    };
  }

  return [...result.values()].sort((a, b) => {
    const sectionSort = sectionIndex(a.section) - sectionIndex(b.section);
    if (sectionSort !== 0) return sectionSort;
    return a.sortOrder - b.sortOrder || a.lineLabel.localeCompare(b.lineLabel);
  });
}

function buildCostDriverInputRows({
  driverDefinitions,
  driverRules,
  revenueBudgets,
  budgetLines,
  months,
  activeAfsCount,
}: {
  driverDefinitions: CostDriverDefinition[];
  driverRules: PlBudgetDriverRule[];
  revenueBudgets: RevenueBudgetRow[];
  budgetLines: PlBudgetLine[];
  months: string[];
  activeAfsCount: number;
}) {
  const revenueBudgetByChannel = revenueBudgetValuesByChannel(revenueBudgets, budgetLines, months);
  const calculatedByDriver = new Map<string, Record<string, number>>();
  const sharedAfsMachineCountByPeriod = sharedAfsMachineCountOverrides(driverRules, months);

  const legacyBudgetValuesByKey = budgetLinesByKey(
    budgetLines.filter((line) => line.kind === "cost"),
    months,
  );

  return driverDefinitions.map((driver) => {
    const rules = driverRules
      .filter((rule) => rule.driver_key === driver.driver_key)
      .sort((a, b) => comparePeriods(a.from_period, b.from_period));
    const values = blankCostDriverCells(months);
    const revenueValues = revenueValuesForDriver(driver, revenueBudgetByChannel, months);
    const dependencyValues = driver.depends_on_driver_key
      ? (calculatedByDriver.get(driver.depends_on_driver_key) ?? blankValues(months))
      : blankValues(months);

    for (const period of months) {
      const rule = activeRuleForPeriod(rules, period);
      const fallbackAmount = fallbackDriverPercentageAmount({
        driver,
        period,
        revenue: revenueValues[period] ?? 0,
        legacyBudgetValuesByKey,
      });
      const amount = Number(rule?.amount ?? fallbackAmount ?? driver.defaultAmount);
      const basisAmount = Number(rule?.basis_amount ?? driver.defaultBasisAmount ?? 0) || null;
      const standardMachineCount =
        driver.calculation_type === "amount_per_afs" ? activeAfsCount : null;
      const machineCountOverride =
        driver.calculation_type === "amount_per_afs"
          ? (sharedAfsMachineCountByPeriod[period] ?? null)
          : null;
      const machineCount =
        driver.calculation_type === "amount_per_afs"
          ? (machineCountOverride ?? standardMachineCount ?? 0)
          : null;
      values[period] = {
        rule,
        amount,
        basisAmount,
        machineCount,
        machineCountOverride,
        standardMachineCount,
        calculatedAmount: calculateCostDriverAmount({
          driver,
          amount,
          basisAmount,
          machineCount,
          revenue: revenueValues[period] ?? 0,
          dependencyAmount: dependencyValues[period] ?? 0,
        }),
      };
    }

    const calculatedValues = Object.fromEntries(
      months.map((period) => [period, values[period]?.calculatedAmount ?? 0]),
    ) as Record<string, number>;
    calculatedByDriver.set(driver.driver_key, calculatedValues);

    return {
      ...driver,
      values,
      total: months.reduce((sum, period) => sum + (values[period]?.calculatedAmount ?? 0), 0),
    };
  });
}

function revenueValuesForDriver(
  driver: CostDriverDefinition,
  revenueBudgetByChannel: Map<string, Record<string, number>>,
  months: string[],
) {
  const channels =
    driver.revenue_channels ?? (driver.revenue_channel ? [driver.revenue_channel] : []);
  const values = blankValues(months);

  for (const channel of channels) {
    const channelValues = revenueBudgetByChannel.get(channel);
    if (!channelValues) continue;
    for (const period of months) values[period] += channelValues[period] ?? 0;
  }

  return values;
}

function fallbackDriverPercentageAmount({
  driver,
  period,
  revenue,
  legacyBudgetValuesByKey,
}: {
  driver: CostDriverDefinition;
  period: string;
  revenue: number;
  legacyBudgetValuesByKey: Map<string, Record<string, number>>;
}) {
  if (driver.calculation_type !== "percentage_of_revenue" || !driver.fallback_line_key) return null;
  if (Math.abs(revenue) < 0.005) return null;

  const legacyValues = legacyBudgetValuesByKey.get(driver.fallback_line_key);
  if (!legacyValues) return null;

  const legacyAmount = Number(legacyValues[period] ?? 0);
  if (!Number.isFinite(legacyAmount)) return null;

  return (legacyAmount / revenue) * 100;
}

function buildEffectiveBudgetLines({
  budgetLines,
  driverRules,
  driverDefinitions,
  revenueBudgets,
  afsRentalAgreements,
  afsMachineActuals,
  afsBudgetTranches,
  afsBudgetTrancheRevenues,
  months,
  activeAfsCount,
}: {
  budgetLines: PlBudgetLine[];
  driverRules: PlBudgetDriverRule[];
  driverDefinitions: CostDriverDefinition[];
  revenueBudgets: RevenueBudgetRow[];
  afsRentalAgreements: AfsRentalAgreementRow[];
  afsMachineActuals: AfsMachineActualRow[];
  afsBudgetTranches: AfsBudgetTrancheRow[];
  afsBudgetTrancheRevenues: AfsBudgetTrancheRevenueRow[];
  months: string[];
  activeAfsCount: number;
}) {
  const manualLines = budgetLines
    .filter((line) => line.kind === "revenue" || !EXCLUDED_PL_BUDGET_LINE_KEYS.has(line.line_key))
    .map(normalizeManualBudgetLine);
  const driverRows = buildCostDriverInputRows({
    driverDefinitions,
    driverRules,
    revenueBudgets,
    budgetLines,
    months,
    activeAfsCount,
  });
  const generatedLines = driverRows.flatMap((driver) =>
    months.map((period) => ({
      id: `driver:${driver.driver_key}:${period}`,
      period,
      budget_year: Number(period.split("-")[0]),
      section: driver.section,
      line_key: driver.line_key,
      line_label: driver.line_label,
      kind: "cost" as const,
      amount: driver.values[period]?.calculatedAmount ?? 0,
      source_workbook: driver.source_workbook ?? COST_DRIVER_SOURCE_WORKBOOK,
      source_sheet: driver.source_sheet,
      source_label: driver.source_label,
      sort_order: driver.sort_order,
    })),
  );
  const afsRentBudgetLines = buildAfsRentalBudgetLines({
    agreements: afsRentalAgreements,
    driverRules,
    revenueBudgets,
    machineActuals: afsMachineActuals,
    months,
  });
  const afsBudgetTrancheRentLines = buildAfsBudgetTrancheRentalBudgetLines({
    driverRules,
    budgetTranches: afsBudgetTranches,
    budgetTrancheRevenues: afsBudgetTrancheRevenues,
    months,
  });

  return [...manualLines, ...generatedLines, ...afsRentBudgetLines, ...afsBudgetTrancheRentLines];
}

function normalizeManualBudgetLine(line: PlBudgetLine): PlBudgetLine {
  const definition = MANUAL_PL_BUDGET_DEFINITION_BY_KEY.get(line.line_key);
  if (!definition) return line;
  return {
    ...line,
    section: definition.section,
    line_label: definition.lineLabel,
    source_sheet: definition.sourceSheet,
    source_label: definition.sourceLabel,
    sort_order: definition.sortOrder,
  };
}

function buildAfsRentalBudgetLines({
  agreements,
  driverRules,
  revenueBudgets,
  machineActuals,
  months,
}: {
  agreements: AfsRentalAgreementRow[];
  driverRules: PlBudgetDriverRule[];
  revenueBudgets: RevenueBudgetRow[];
  machineActuals: AfsMachineActualRow[];
  months: string[];
}): PlBudgetLine[] {
  if (months.length === 0) return [];

  const turnoverByMachinePeriod = afsTurnoverByMachinePeriod({
    revenueBudgets,
    machineActuals,
    months,
  });
  const uncontractedRentValues = afsUncontractedRentValues({
    agreements,
    driverRules,
    turnoverByMachinePeriod,
    excludedMachineIds: legacyAfsMachineIds({ revenueBudgets, machineActuals }),
    months,
  });

  return months.flatMap((period) => {
    const activeAgreements = activeAfsRentalAgreementsForPeriod(agreements, period);
    const amount =
      activeAgreements.reduce((sum, agreement) => {
        const turnover =
          turnoverByMachinePeriod.get(afsMachinePeriodKey(agreement.machine_id, period)) ?? 0;
        return sum + calculateAfsRentalCost(agreement, turnover);
      }, 0) + uncontractedRentValues[period].amount;

    const retainedAmount = Math.min(AFS_RENT_MONTHLY_RETAINED_AMOUNT, amount);
    const costOfGoodsAmount = Math.max(0, amount - retainedAmount);
    return [
      {
        id: `afs-rent:${period}`,
        period,
        budget_year: Number(period.split("-")[0]),
        section: "housing",
        line_key: AFS_RENT_BUDGET_LINE_KEY,
        line_label: `${AFS_RENT_LINE_LABEL} (basis)`,
        kind: "cost" as const,
        amount: roundMoney(retainedAmount),
        source_workbook: AFS_RENT_SOURCE_WORKBOOK,
        source_sheet: "AFS huurafspraken",
        source_label: `Contracthuur plus ${formatPercentage(uncontractedRentValues[period].percentage)} over ${formatEUR(uncontractedRentValues[period].revenue)} omzet zonder huurafspraak (LEGACY uitgesloten); basis maximaal ${formatEUR(AFS_RENT_MONTHLY_RETAINED_AMOUNT)}`,
        sort_order: 430,
      },
      {
        id: `afs-rent-cogs:${period}`,
        period,
        budget_year: Number(period.split("-")[0]),
        section: "cost_of_goods",
        line_key: AFS_RENT_COST_OF_GOODS_LINE_KEY,
        line_label: `${AFS_RENT_LINE_LABEL} naar kostprijs`,
        kind: "cost" as const,
        amount: roundMoney(costOfGoodsAmount),
        source_workbook: AFS_RENT_SOURCE_WORKBOOK,
        source_sheet: "AFS huurafspraken",
        source_label: `Huur boven ${formatEUR(AFS_RENT_MONTHLY_RETAINED_AMOUNT)} per maand`,
        sort_order: 295,
      },
    ];
  });
}

function buildAfsBudgetTrancheRentalBudgetLines({
  driverRules,
  budgetTranches,
  budgetTrancheRevenues,
  months,
}: {
  driverRules: PlBudgetDriverRule[];
  budgetTranches: AfsBudgetTrancheRow[];
  budgetTrancheRevenues: AfsBudgetTrancheRevenueRow[];
  months: string[];
}): PlBudgetLine[] {
  if (budgetTranches.length === 0 || months.length === 0) return [];

  const values = afsBudgetMachineRentValues({
    driverRules,
    budgetTranches,
    budgetTrancheRevenues,
    months,
  });

  return months.map((period) => {
    const value = values[period];

    return {
      id: `afs-budget-machine-rent:${period}`,
      period,
      budget_year: Number(period.split("-")[0]),
      section: "cost_of_goods",
      line_key: AFS_BUDGET_MACHINE_RENT_LINE_KEY,
      line_label: AFS_BUDGET_MACHINE_RENT_LINE_LABEL,
      kind: "cost" as const,
      amount: value.amount,
      source_workbook: AFS_RENT_SOURCE_WORKBOOK,
      source_sheet: "AFS budgettranches",
      source_label: `${formatPercentage(value.percentage)} van ${formatEUR(value.revenue)} omzet nieuwe AFS'en`,
      sort_order: 296,
    };
  });
}

function afsBudgetMachineRentValues({
  driverRules,
  budgetTranches,
  budgetTrancheRevenues,
  months,
}: {
  driverRules: PlBudgetDriverRule[];
  budgetTranches: AfsBudgetTrancheRow[];
  budgetTrancheRevenues: AfsBudgetTrancheRevenueRow[];
  months: string[];
}) {
  const trancheById = new Map(budgetTranches.map((tranche) => [tranche.id, tranche]));
  const revenueByPeriod = blankValues(months);
  const includedPeriods = new Set(months);
  for (const revenue of budgetTrancheRevenues) {
    const tranche = trancheById.get(revenue.cashflow_input_id);
    if (!tranche || !includedPeriods.has(revenue.period) || tranche.start_period > revenue.period)
      continue;
    const amountPerMachine = Number(revenue.amount_per_machine ?? 0);
    revenueByPeriod[revenue.period] +=
      amountPerMachine > 0
        ? amountPerMachine * Number(tranche.machine_count ?? 0)
        : Number(revenue.amount ?? 0);
  }

  const rules = driverRules
    .filter((rule) => rule.driver_key === AFS_BUDGET_MACHINE_RENT_DRIVER.driver_key)
    .sort((a, b) => comparePeriods(a.from_period, b.from_period));
  return Object.fromEntries(
    months.map((period) => {
      const rule = activeRuleForPeriod(rules, period);
      const percentage = Number(rule?.amount ?? AFS_BUDGET_MACHINE_RENT_DRIVER.defaultAmount);
      const revenue = roundMoney(revenueByPeriod[period] ?? 0);
      return [
        period,
        {
          percentage,
          revenue,
          amount: roundMoney(revenue * (percentage / 100)),
        },
      ];
    }),
  ) as Record<string, { percentage: number; revenue: number; amount: number }>;
}

function activeAfsRentalAgreementsForPeriod(agreements: AfsRentalAgreementRow[], period: string) {
  const byMachine = new Map<string, AfsRentalAgreementRow>();

  for (const agreement of agreements) {
    if (agreement.status !== "active") continue;
    if (agreement.start_period > period) continue;
    if (agreement.end_period && agreement.end_period < period) continue;

    const existing = byMachine.get(agreement.machine_id);
    if (!existing || agreement.start_period > existing.start_period) {
      byMachine.set(agreement.machine_id, agreement);
    }
  }

  return [...byMachine.values()];
}

function afsUncontractedRentValues({
  agreements,
  driverRules,
  turnoverByMachinePeriod,
  excludedMachineIds,
  months,
}: {
  agreements: AfsRentalAgreementRow[];
  driverRules: PlBudgetDriverRule[];
  turnoverByMachinePeriod: Map<string, number>;
  excludedMachineIds: Set<string>;
  months: string[];
}) {
  const rules = driverRules
    .filter((rule) => rule.driver_key === AFS_UNCONTRACTED_RENT_DRIVER.driver_key)
    .sort((a, b) => comparePeriods(a.from_period, b.from_period));

  return Object.fromEntries(
    months.map((period) => {
      const contractedMachineIds = new Set(
        activeAfsRentalAgreementsForPeriod(agreements, period).map(
          (agreement) => agreement.machine_id,
        ),
      );
      let revenue = 0;
      for (const [key, turnover] of turnoverByMachinePeriod) {
        const separatorIndex = key.lastIndexOf("|");
        if (separatorIndex < 0 || key.slice(separatorIndex + 1) !== period) continue;
        const machineId = key.slice(0, separatorIndex);
        if (!contractedMachineIds.has(machineId) && !excludedMachineIds.has(machineId)) {
          revenue += turnover;
        }
      }

      const rule = activeRuleForPeriod(rules, period);
      const percentage = Number(rule?.amount ?? AFS_UNCONTRACTED_RENT_DRIVER.defaultAmount);
      return [
        period,
        {
          percentage,
          revenue: roundMoney(revenue),
          amount: roundMoney(revenue * (percentage / 100)),
        },
      ];
    }),
  ) as Record<string, { percentage: number; revenue: number; amount: number }>;
}

function legacyAfsMachineIds({
  revenueBudgets,
  machineActuals,
}: {
  revenueBudgets: RevenueBudgetRow[];
  machineActuals: AfsMachineActualRow[];
}) {
  const ids = new Set<string>();

  for (const budget of revenueBudgets) {
    if (
      budget.machine_id &&
      budget.machines?.afs_number?.trim().toUpperCase().startsWith("LEGACY")
    ) {
      ids.add(budget.machine_id);
    }
  }
  for (const actual of machineActuals) {
    if (actual.machine_id && actual.afs_number?.trim().toUpperCase().startsWith("LEGACY")) {
      ids.add(actual.machine_id);
    }
  }

  return ids;
}

function afsTurnoverByMachinePeriod({
  revenueBudgets,
  machineActuals,
  months,
}: {
  revenueBudgets: RevenueBudgetRow[];
  machineActuals: AfsMachineActualRow[];
  months: string[];
}) {
  const monthSet = new Set(months);
  const values = new Map<string, number>();
  const explicitBudgetKeys = new Set<string>();

  for (const budget of revenueBudgets) {
    if (budget.channel !== "bold_afs") continue;
    if (!budget.machine_id) continue;
    if (!monthSet.has(budget.period)) continue;

    const amount = Number(budget.amount ?? 0);
    if (!Number.isFinite(amount)) continue;

    const key = afsMachinePeriodKey(budget.machine_id, budget.period);
    explicitBudgetKeys.add(key);
    values.set(key, (values.get(key) ?? 0) + amount);
  }

  for (const actual of machineActuals) {
    if (!actual.machine_id) continue;
    if (!monthSet.has(actual.period)) continue;

    const key = afsMachinePeriodKey(actual.machine_id, actual.period);
    if (explicitBudgetKeys.has(key)) continue;

    values.set(key, Number(actual.net_total ?? actual.gross_total ?? 0));
  }

  return values;
}

function afsMachinePeriodKey(machineId: string, period: string) {
  return `${machineId}|${period}`;
}

function calculateAfsRentalCost(agreement: AfsRentalAgreementRow, turnoverNet: number) {
  const fixedFeeNet = roundMoney(agreement.fixed_fee_net);
  const energyCostNet = roundMoney(agreement.energy_cost_net);
  const thresholdNet = roundMoney(agreement.turnover_threshold_net);
  const ratePercent = Number(agreement.turnover_rate_percent ?? 0);
  const variableBaseNet = Math.max(0, roundMoney(turnoverNet) - thresholdNet);
  const variableFeeNet = roundMoney((variableBaseNet * ratePercent) / 100);

  return roundMoney(fixedFeeNet + energyCostNet + variableFeeNet);
}

function blankInputCells(months: string[]) {
  return Object.fromEntries(months.map((period) => [period, { amount: 0 }])) as Record<
    string,
    BudgetInputCell
  >;
}

function blankCostDriverCells(months: string[]) {
  return Object.fromEntries(
    months.map((period) => [
      period,
      {
        amount: 0,
        basisAmount: null,
        machineCount: null,
        machineCountOverride: null,
        standardMachineCount: null,
        calculatedAmount: 0,
      },
    ]),
  ) as Record<string, CostDriverInputCell>;
}

function revenueBudgetRowKey(
  scenario: RevenueBudgetScenario,
  channel: string,
  machineId: string | null,
) {
  return `${scenario}|${channel}|${machineId ?? "channel"}`;
}

function revenueBudgetCellKey(rowKey: string, period: string) {
  return `revenue|${rowKey}|${period}`;
}

function afsBudgetTrancheRevenueCellKey(cashflowInputId: string, period: string) {
  return `afs-budget-tranche-revenue|${cashflowInputId}|${period}`;
}

function plBudgetRowKey(lineKey: string) {
  return lineKey;
}

function plBudgetCellKey(rowKey: string, period: string) {
  return `pl|${rowKey}|${period}`;
}

function cashflowInputCellKey(lineKey: string, period: string, metric: CashflowInputMetric) {
  return `cashflow-input|${lineKey}|${period}|${metric}`;
}

function cashflowMachineCountCellKey(period: string, metric: CashflowInputMetric) {
  return `cashflow-afs-machines|${period}|${metric}`;
}

function cashflowAfsBlockCellKey(blockId: string, field: CashflowAfsBlockField) {
  return `cashflow-afs-block|${blockId}|${field}`;
}

function costDriverCellKey(
  driverKey: string,
  period: string,
  field: CostDriverInputFieldName = "amount",
) {
  return `cost-driver|${driverKey}|${period}|${field}`;
}

function machineBudgetLabel(machine: RevenueBudgetRow["machines"]) {
  const name = machine?.display_name?.trim();
  const afsNumber = machine?.afs_number?.trim();
  if (name && afsNumber) return `${name} (${afsNumber})`;
  return name || afsNumber || "Onbekende AFS";
}

function sumInputCells(values: Record<string, BudgetInputCell>, months: string[]) {
  return months.reduce((sum, period) => sum + Number(values[period]?.amount ?? 0), 0);
}

function formatAmountInput(value: number) {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMachineCountInput(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toLocaleString("nl-NL", {
    maximumFractionDigits: 0,
  });
}

function parseBudgetInput(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return 0;
  let normalized = trimmed.replace(/[\u20ac%\s]/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(",", ".");
  }
  return Number(normalized);
}

function formatDriverInput(driver: CostDriverDefinition, value: number) {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: driver.calculation_type === "percentage_of_revenue" ? 2 : 2,
  });
}

function activeRuleForPeriod(rules: PlBudgetDriverRule[], period: string) {
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index];
    if (
      comparePeriods(rule.from_period, period) <= 0 &&
      (!rule.to_period || comparePeriods(rule.to_period, period) >= 0)
    ) {
      return rule;
    }
  }
  return undefined;
}

function sharedAfsMachineCountOverrides(driverRules: PlBudgetDriverRule[], months: string[]) {
  const rules = driverRules
    .filter((rule) => rule.driver_key === AFS_MACHINE_COUNT_DRIVER_KEY)
    .sort((a, b) => comparePeriods(a.from_period, b.from_period));

  return Object.fromEntries(
    months.map((period) => {
      const rule = activeRuleForPeriod(rules, period);
      if (rule?.machine_count == null) return [period, null];
      const override = Number(rule.machine_count);
      return [period, Number.isFinite(override) ? override : null];
    }),
  ) as Record<string, number | null>;
}

function calculateCostDriverAmount({
  driver,
  amount,
  basisAmount,
  machineCount,
  revenue,
  dependencyAmount,
}: {
  driver: CostDriverDefinition;
  amount: number;
  basisAmount: number | null;
  machineCount: number | null;
  revenue: number;
  dependencyAmount: number;
}) {
  if (driver.calculation_type === "percentage_of_revenue")
    return roundMoney(revenue * (amount / 100));
  if (driver.calculation_type === "percentage_of_driver")
    return roundMoney(dependencyAmount * (amount / 100));
  if (driver.calculation_type === "orders_from_revenue") {
    if (!basisAmount || basisAmount <= 0) return 0;
    return roundMoney((revenue / basisAmount) * amount);
  }
  return roundMoney(amount * Number(machineCount ?? 0));
}

function comparePeriods(a: string, b: string) {
  return a.localeCompare(b);
}

function previousPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function channelOrderIndex(channel: string) {
  const index = CHANNELS.indexOf(channel as (typeof CHANNELS)[number]);
  return index === -1 ? 999 : index;
}

function buildProfitLoss({
  months,
  glRows,
  salesRows,
  afsRentalInvoices,
  budgetLines,
  revenueBudgets,
  accounts,
}: {
  months: string[];
  glRows: GlPeriodRow[];
  salesRows: SalesPeriodRow[];
  afsRentalInvoices: AfsRentalInvoiceRow[];
  budgetLines: PlBudgetLine[];
  revenueBudgets: RevenueBudgetRow[];
  accounts: GlAccount[];
}) {
  const accountsByCode = new Map(accounts.map((account) => [account.account_code, account]));
  const ownRevenue = new Map<string, number>();
  const rows: PlRow[] = [];
  const revenueBudgetByChannel = revenueBudgetValuesByChannel(revenueBudgets, budgetLines, months);
  const budgetBySection = budgetLinesBySection(budgetLines, months);
  const budgetByLineKey = budgetLinesByKey(budgetLines, months);
  const afsRentalInvoiceValues = afsRentalInvoiceValuesByPeriod(afsRentalInvoices, months);
  const hasAfsRentalInvoiceValues = hasAnyValue(afsRentalInvoiceValues);
  const budgetRowsBySection = budgetOnlyRowsBySection(
    budgetLines,
    months,
    hasAfsRentalInvoiceValues
      ? new Set([AFS_RENT_BUDGET_LINE_KEY, AFS_RENT_COST_OF_GOODS_LINE_KEY])
      : undefined,
  );

  for (const row of salesRows) {
    add(ownRevenue, `${row.period}|${row.channel}`, Number(row.net_total ?? 0));
  }

  const revenueTotal = blankValues(months);
  const revenueBudgetTotal = blankValues(months);
  const revenueTotalDetails: Record<string, DetailBase> = {};
  for (const channel of CHANNELS) {
    const values = blankValues(months);
    const budgetValues = revenueBudgetByChannel.get(channel) ?? blankValues(months);
    const detailByPeriod: Record<string, DetailBase> = {};
    for (const period of months) {
      const own = ownRevenue.get(`${period}|${channel}`) ?? 0;
      values[period] = own;
      revenueTotal[period] += values[period];
      revenueBudgetTotal[period] += budgetValues[period] ?? 0;
      detailByPeriod[period] = {
        source: "sales",
        label: `${channelLabel(channel)} verkooptransacties`,
        channel,
      };
    }
    rows.push(
      makeRow(
        `revenue-${channel}`,
        channelLabel(channel),
        "revenue",
        1,
        "normal",
        values,
        months,
        detailByPeriod,
        undefined,
        undefined,
        budgetValues,
      ),
    );
  }

  for (const period of months) {
    revenueTotalDetails[period] = {
      source: "sales",
      label: "Omzet totaal verkooptransacties",
    };
  }

  rows.push(
    makeRow(
      "revenue-total",
      "Omzet totaal",
      "revenue",
      0,
      "subtotal",
      revenueTotal,
      months,
      revenueTotalDetails,
      undefined,
      undefined,
      revenueBudgetTotal,
    ),
  );

  const costTotal = blankValues(months);
  const costBudgetTotal = blankValues(months);
  const operatingCostTotal = blankValues(months);
  const operatingCostBudgetTotal = blankValues(months);
  const revenueYtd = sumValues(revenueTotal, months);
  const revenueBudgetYtd = sumValues(revenueBudgetTotal, months);
  const nonRevenueAccounts = new Map<
    string,
    {
      label: string;
      section: string;
      sort: number;
      values: Record<string, number>;
      accountCode: string;
      budgetLineKey?: string;
    }
  >();
  for (const row of glRows) {
    if (row.pl_section === "revenue") continue;
    const account = accountsByCode.get(row.account_code);
    if (account && account.active === false) continue;
    const statement = String(account?.statement_type ?? "").toLowerCase();
    if (statement && !statement.includes("winst")) continue;
    const key = row.account_code;
    if (!nonRevenueAccounts.has(key)) {
      nonRevenueAccounts.set(key, {
        label: `${row.account_code} - ${row.account_name}`,
        section: row.pl_section || "other",
        sort: Number(row.sort_order ?? 999999),
        values: blankValues(months),
        accountCode: row.account_code,
      });
    }
    nonRevenueAccounts.get(key)!.values[row.period] += Number(row.amount ?? 0);
  }

  if (hasAfsRentalInvoiceValues) {
    const retainedRentalValues = blankValues(months);
    const costOfGoodsRentalValues = blankValues(months);
    for (const period of months) {
      const amount = Math.max(0, afsRentalInvoiceValues[period] ?? 0);
      retainedRentalValues[period] = Math.min(AFS_RENT_MONTHLY_RETAINED_AMOUNT, amount);
      costOfGoodsRentalValues[period] = Math.max(0, amount - retainedRentalValues[period]);
    }
    nonRevenueAccounts.set("synthetic-afs-rental-invoices", {
      label: `${AFS_RENT_LINE_LABEL} (basis)`,
      section: "housing",
      sort: 430,
      values: retainedRentalValues,
      accountCode: "afs-rental-invoices",
      budgetLineKey: AFS_RENT_BUDGET_LINE_KEY,
    });
    nonRevenueAccounts.set("synthetic-afs-rental-invoices-cogs", {
      label: `${AFS_RENT_LINE_LABEL} naar kostprijs`,
      section: "cost_of_goods",
      sort: 295,
      values: costOfGoodsRentalValues,
      accountCode: "afs-rental-invoices-cogs",
      budgetLineKey: AFS_RENT_COST_OF_GOODS_LINE_KEY,
    });
  }

  const personnelActualPeriods = new Set(
    glRows
      .filter((row) => row.pl_section === "personnel" && Math.abs(Number(row.amount ?? 0)) >= 0.005)
      .map((row) => row.period),
  );
  if (personnelActualPeriods.size > 0) {
    const deliveryCostValues = blankValues(months);
    const personnelCorrectionValues = blankValues(months);
    for (const period of months) {
      if (!personnelActualPeriods.has(period)) continue;
      deliveryCostValues[period] = AFS_DELIVERY_PERSONNEL_MONTHLY_TRANSFER;
      personnelCorrectionValues[period] = -AFS_DELIVERY_PERSONNEL_MONTHLY_TRANSFER;
    }
    nonRevenueAccounts.set("synthetic-afs-delivery-personnel-cogs", {
      label: "AFS bezorgers vanuit personeelskosten",
      section: "cost_of_goods",
      sort: 294,
      values: deliveryCostValues,
      accountCode: "afs-delivery-personnel-cogs",
    });
    nonRevenueAccounts.set("synthetic-afs-delivery-personnel-correction", {
      label: "Herclassificatie AFS bezorgers naar kostprijs",
      section: "personnel",
      sort: 399,
      values: personnelCorrectionValues,
      accountCode: "afs-delivery-personnel-correction",
    });
  }

  const accountsBySection = [...nonRevenueAccounts.values()].sort((a, b) => {
    const sectionSort = sectionIndex(a.section) - sectionIndex(b.section);
    if (sectionSort !== 0) return sectionSort;
    return a.sort - b.sort || a.label.localeCompare(b.label);
  });

  let currentSection = "";
  let sectionValues = blankValues(months);
  let sectionAccountCodes: string[] = [];
  const flushedSections = new Set<string>();
  const flushSection = () => {
    if (!currentSection) return;
    flushedSections.add(currentSection);
    const sectionBudgetValues = budgetBySection.get(currentSection) ?? blankValues(months);
    for (const period of months) costTotal[period] += sectionValues[period] ?? 0;
    for (const period of months) costBudgetTotal[period] += sectionBudgetValues[period] ?? 0;
    if (currentSection !== "financial" && currentSection !== "tax") {
      for (const period of months) operatingCostTotal[period] += sectionValues[period] ?? 0;
      for (const period of months)
        operatingCostBudgetTotal[period] += sectionBudgetValues[period] ?? 0;
    }
    const sectionDetails = Object.fromEntries(
      months.map((period) => [
        period,
        {
          source: "gl" as const,
          label: `${sectionLabel(currentSection)} totaal`,
          accountCodes: sectionAccountCodes,
        },
      ]),
    );
    for (const budgetRow of budgetRowsBySection.get(currentSection) ?? []) rows.push(budgetRow);
    rows.push(
      makeRow(
        `subtotal-${currentSection}`,
        `${sectionLabel(currentSection)} totaal`,
        currentSection,
        0,
        "subtotal",
        sectionValues,
        months,
        sectionDetails,
        undefined,
        undefined,
        sectionBudgetValues,
      ),
    );
    if (currentSection === "cost_of_goods") {
      const grossMarginValues = blankValues(months);
      const grossMarginPercentageValues = blankValues(months);
      const grossMarginBudgetValues = blankValues(months);
      const grossMarginPercentageBudgetValues = blankValues(months);
      for (const period of months) {
        grossMarginValues[period] = revenueTotal[period] - (sectionValues[period] ?? 0);
        grossMarginPercentageValues[period] = percentage(
          grossMarginValues[period],
          revenueTotal[period],
        );
        grossMarginBudgetValues[period] =
          revenueBudgetTotal[period] - (sectionBudgetValues[period] ?? 0);
        grossMarginPercentageBudgetValues[period] = percentage(
          grossMarginBudgetValues[period],
          revenueBudgetTotal[period],
        );
      }

      const grossMarginYtd = revenueYtd - sumValues(sectionValues, months);
      const grossMarginPercentageYtd = percentage(grossMarginYtd, revenueYtd);
      const grossMarginBudgetYtd = revenueBudgetYtd - sumValues(sectionBudgetValues, months);
      const grossMarginPercentageBudgetYtd = percentage(grossMarginBudgetYtd, revenueBudgetYtd);
      rows.push(
        makeRow(
          "gross-margin",
          "Brutomarge",
          "cost_of_goods",
          0,
          "result",
          grossMarginValues,
          months,
          undefined,
          undefined,
          undefined,
          grossMarginBudgetValues,
          grossMarginBudgetYtd,
        ),
      );
      rows.push(
        makeRow(
          "gross-margin-percentage",
          "Brutomarge %",
          "cost_of_goods",
          0,
          "result",
          grossMarginPercentageValues,
          months,
          undefined,
          "percentage",
          grossMarginPercentageYtd,
          grossMarginPercentageBudgetValues,
          grossMarginPercentageBudgetYtd,
        ),
      );
    }
    sectionValues = blankValues(months);
    sectionAccountCodes = [];
  };

  for (const account of accountsBySection) {
    if (account.section !== currentSection) {
      flushSection();
      currentSection = account.section;
    }
    const detailByPeriod = account.accountCode.startsWith("afs-rental-invoices")
      ? undefined
      : Object.fromEntries(
          months.map((period) => [
            period,
            {
              source: "gl" as const,
              label: account.label,
              accountCodes: [account.accountCode],
            },
          ]),
        );
    rows.push(
      makeRow(
        `account-${account.accountCode}`,
        account.label,
        account.section,
        1,
        "normal",
        account.values,
        months,
        detailByPeriod,
        undefined,
        undefined,
        account.budgetLineKey ? budgetByLineKey.get(account.budgetLineKey) : undefined,
      ),
    );
    if (
      !account.accountCode.startsWith("afs-rental-invoices") &&
      !account.accountCode.startsWith("afs-delivery-personnel-")
    )
      sectionAccountCodes.push(account.accountCode);
    for (const period of months) sectionValues[period] += account.values[period] ?? 0;
  }
  flushSection();

  for (const section of [...budgetBySection.keys()].sort(
    (a, b) => sectionIndex(a) - sectionIndex(b),
  )) {
    if (section === "revenue" || flushedSections.has(section)) continue;
    currentSection = section;
    sectionValues = blankValues(months);
    sectionAccountCodes = [];
    flushSection();
  }

  const resultValues = blankValues(months);
  const resultBudgetValues = blankValues(months);
  const operatingResultValues = blankValues(months);
  const operatingResultBudgetValues = blankValues(months);
  for (const period of months) {
    resultValues[period] = revenueTotal[period] - costTotal[period];
    resultBudgetValues[period] = revenueBudgetTotal[period] - costBudgetTotal[period];
    operatingResultValues[period] = revenueTotal[period] - operatingCostTotal[period];
    operatingResultBudgetValues[period] =
      revenueBudgetTotal[period] - operatingCostBudgetTotal[period];
  }
  rows.push(
    makeRow(
      "result",
      "Resultaat",
      "other",
      0,
      "result",
      resultValues,
      months,
      undefined,
      undefined,
      undefined,
      resultBudgetValues,
    ),
  );

  return {
    rows,
    operatingResult: {
      actual: operatingResultValues,
      budget: operatingResultBudgetValues,
    },
  };
}

function TransactionDetailDialog({
  detail,
  onOpenChange,
}: {
  detail: DetailSelection | null;
  onOpenChange: (open: boolean) => void;
}) {
  const range = useMemo(() => (detail ? monthRange(detail.period) : null), [detail]);
  const detailQ = useQuery({
    queryKey: ["wv-detail", detail],
    queryFn: async () => {
      if (!detail || !range) return [];
      if (detail.source === "gl") {
        let q = db
          .from<GlDetailRow>("gl_transactions")
          .select(
            "id,transaction_date,account_code,description,relation_name,document_number,amount,debit_amount,credit_amount,raw_payload",
          )
          .gte("transaction_date", range.startDate)
          .lt("transaction_date", range.endDate)
          .order("transaction_date", { ascending: false })
          .limit(10000);
        if (detail.accountCodes && detail.accountCodes.length > 0)
          q = q.in("account_code", detail.accountCodes);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as GlDetailRow[];
      }

      const wantsShopify =
        !detail.channel ||
        detail.channel === "shopify_webshop" ||
        detail.channel === "shopify_winkel";
      const wantsTransactions = !detail.channel || detail.channel === "bold_afs";
      const wantsMollieInvoices = !detail.channel || detail.channel === "mollie_facturen";
      const wantsWefactInvoices = !detail.channel || detail.channel === "wefact_facturen";
      const rows: SalesDetailRow[] = [];

      if (wantsShopify) {
        let q = db
          .from<ShopifyOrderDetailRow>("shopify_order_summaries")
          .select(
            "id,external_id,order_name,source_name,channel,financial_status,processed_at,current_total_price,current_total_tax,total_price,total_tax,line_tax_total,total_shipping,total_refunded,raw_payload",
          )
          .gte("processed_at", range.startIso)
          .lt("processed_at", range.endIso)
          .order("processed_at", { ascending: false, nullsFirst: false })
          .limit(5000);
        if (detail.channel) q = q.eq("channel", detail.channel);
        const { data, error } = await q;
        if (error) throw error;
        rows.push(...(data ?? []).filter(hasShopifyInvoiceData).map(mapShopifyOrderDetail));
      }

      if (wantsTransactions) {
        let q = db
          .from<SalesDetailRow>("transactions")
          .select(
            "id,external_id,source,channel,article_number,product_name,amount_gross,amount_net,vat_amount,vat_rate,invoice_number,status,paid_at,description_raw,parse_status",
          )
          .eq("status", "paid")
          .eq("parse_status", "ok")
          .gte("paid_at", range.startIso)
          .lt("paid_at", range.endIso)
          .order("paid_at", { ascending: false, nullsFirst: false })
          .limit(2000);
        if (detail.channel) q = q.eq("channel", detail.channel);
        const { data, error } = await q;
        if (error) throw error;
        rows.push(...((data ?? []) as SalesDetailRow[]));
      }

      if (wantsMollieInvoices) {
        const { data, error } = await db
          .from<MollieSalesInvoiceDetailRow>("mollie_sales_invoices")
          .select(
            "id,sales_invoice_id,reference,status,issued_at,paid_at,recipient_name,recipient_email,amount_gross,amount_net,vat_amount,invoice_url,raw_payload",
          )
          .gte("issued_at", range.startIso)
          .lt("issued_at", range.endIso)
          .order("issued_at", { ascending: false, nullsFirst: false })
          .limit(5000);
        if (error) throw error;
        rows.push(
          ...((data ?? []) as MollieSalesInvoiceDetailRow[])
            .filter(isRevenueMollieInvoice)
            .map(mapMollieInvoiceDetail),
        );
      }

      if (wantsWefactInvoices) {
        const { data, error } = await db
          .from<WefactInvoiceDetailRow>("wefact_invoices")
          .select(
            "id,invoice_number,invoice_date,due_date,status,customer_number,customer_name,reference,category,amount_gross,amount_net,vat_amount,source_filename",
          )
          .neq("status", "canceled")
          .gte("invoice_date", range.startDate)
          .lt("invoice_date", range.endDate)
          .order("invoice_date", { ascending: false })
          .limit(5000);
        if (error) throw error;
        rows.push(
          ...((data ?? []) as WefactInvoiceDetailRow[])
            .filter((row) => !WEFACT_NON_CUSTOMER_CATEGORIES.has(row.category ?? ""))
            .map(mapWefactInvoiceDetail),
        );
      }

      return rows.sort(
        (a, b) => new Date(b.paid_at ?? 0).getTime() - new Date(a.paid_at ?? 0).getTime(),
      );
    },
    enabled: Boolean(detail && range),
  });

  const rows = detailQ.data ?? [];
  const sourceTotal = rows.reduce((sum, row) => {
    if (detail?.source === "gl") return sum + Number((row as GlDetailRow).amount ?? 0);
    return sum + Number((row as SalesDetailRow).amount_net ?? 0);
  }, 0);
  const normalizedSourceTotal =
    detail?.source === "gl" && detail.invertGlSign ? -sourceTotal : sourceTotal;

  return (
    <Dialog open={Boolean(detail)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-[1100px] overflow-hidden p-0">
        <div className="p-6 pb-3">
          <DialogHeader>
            <DialogTitle>{detail?.title ?? "Transacties"}</DialogTitle>
            <DialogDescription>
              {detail?.source === "gl"
                ? "Onderliggende grootboektransacties"
                : "Onderliggende verkooptransacties"}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="grid gap-3 px-6 md:grid-cols-3">
          <MiniMetric label="W&V bedrag" value={formatEUR(detail?.amount ?? 0)} />
          <MiniMetric label="Controle totaal" value={formatEUR(normalizedSourceTotal)} />
          <MiniMetric label="Regels" value={detailQ.isLoading ? "..." : String(rows.length)} />
        </div>
        <div className="max-h-[58vh] overflow-auto px-6 pb-6 pt-3">
          {detailQ.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Transacties laden...
            </div>
          ) : detailQ.isError ? (
            <div className="py-8 text-center text-sm text-destructive">
              Detail ophalen mislukt:{" "}
              {detailQ.error instanceof Error ? detailQ.error.message : String(detailQ.error)}
            </div>
          ) : detail?.source === "gl" ? (
            <GlDetailTable rows={rows as GlDetailRow[]} />
          ) : (
            <SalesDetailTable rows={rows as SalesDetailRow[]} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GlDetailTable({ rows }: { rows: GlDetailRow[] }) {
  if (rows.length === 0) return <EmptyDetails />;
  return (
    <table className="w-full min-w-[940px] text-sm">
      <thead className="sticky top-0 bg-background text-left shadow-sm">
        <tr>
          <th className="px-3 py-2 font-medium">Datum</th>
          <th className="px-3 py-2 font-medium">Rekening</th>
          <th className="px-3 py-2 font-medium">Boekstuk</th>
          <th className="px-3 py-2 font-medium">Exact</th>
          <th className="px-3 py-2 font-medium">Relatie</th>
          <th className="px-3 py-2 font-medium">Omschrijving</th>
          <th className="px-3 py-2 text-right font-medium">Bedrag</th>
          <th className="px-3 py-2 text-right font-medium">Debet</th>
          <th className="px-3 py-2 text-right font-medium">Credit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const documentUrl = exactDocumentUrl(row);
          return (
            <tr key={row.id} className="border-t align-top">
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatGlDate(row)}</td>
              <td className="whitespace-nowrap px-3 py-2">{row.account_code ?? "-"}</td>
              <td className="whitespace-nowrap px-3 py-2">{row.document_number || "-"}</td>
              <td className="whitespace-nowrap px-3 py-1">
                {documentUrl ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Open Exact-document"
                  >
                    <a href={documentUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2">{row.relation_name || "-"}</td>
              <td className="px-3 py-2">{row.description || "-"}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                {formatEUR(row.amount)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                {formatEUR(row.debit_amount)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                {formatEUR(row.credit_amount)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SalesDetailTable({ rows }: { rows: SalesDetailRow[] }) {
  if (rows.length === 0) return <EmptyDetails />;
  return (
    <table className="w-full min-w-[940px] text-sm">
      <thead className="sticky top-0 bg-background text-left shadow-sm">
        <tr>
          <th className="px-3 py-2 font-medium">Datum</th>
          <th className="px-3 py-2 font-medium">Kanaal</th>
          <th className="px-3 py-2 font-medium">Factuur</th>
          <th className="px-3 py-2 font-medium">Artikel</th>
          <th className="px-3 py-2 font-medium">Omschrijving</th>
          <th className="px-3 py-2 text-right font-medium">Netto</th>
          <th className="px-3 py-2 text-right font-medium">Btw</th>
          <th className="px-3 py-2 text-right font-medium">Bruto</th>
          <th className="px-3 py-2 font-medium">Bron</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-t align-top">
            <td className="whitespace-nowrap px-3 py-2 tabular-nums">
              {formatDateTimeNL(row.paid_at)}
            </td>
            <td className="whitespace-nowrap px-3 py-2">{channelLabel(row.channel)}</td>
            <td className="whitespace-nowrap px-3 py-2">
              {row.invoice_url ? (
                <a
                  href={row.invoice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline"
                >
                  {row.invoice_number || row.external_id || "Open"}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                row.invoice_number || row.external_id || "-"
              )}
            </td>
            <td className="whitespace-nowrap px-3 py-2">{row.article_number || "-"}</td>
            <td className="px-3 py-2">{row.product_name || row.description_raw || "-"}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
              {formatEUR(row.amount_net)}
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
              {formatEUR(row.vat_amount)}
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
              {formatEUR(row.amount_gross)}
            </td>
            <td className="whitespace-nowrap px-3 py-2">{row.source || "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function mapShopifyOrderDetail(row: ShopifyOrderDetailRow): SalesDetailRow {
  const { gross, vat } = shopifyInvoiceAmounts(row);
  return {
    id: row.id,
    external_id: row.external_id,
    source: "shopify_orderdata",
    channel: row.channel,
    article_number: row.source_name ?? null,
    product_name: `Shopify order ${row.order_name ?? row.external_id}`,
    amount_gross: gross,
    amount_net: roundMoney(gross - vat),
    vat_amount: vat,
    vat_rate: null,
    invoice_number: row.order_name ?? row.external_id,
    status: row.financial_status,
    paid_at: row.processed_at,
    description_raw: [
      row.source_name ? `Bron: ${row.source_name}` : null,
      isCancelledShopifyOrder(row) ? "Geannuleerd: telt niet mee" : null,
      Number(row.total_shipping ?? 0) ? `Verzendkosten: ${formatEUR(row.total_shipping)}` : null,
      Number(row.total_refunded ?? 0) ? `Refunds: ${formatEUR(row.total_refunded)}` : null,
    ]
      .filter(Boolean)
      .join(" | "),
    parse_status: "ok",
  };
}

function mapMollieInvoiceDetail(row: MollieSalesInvoiceDetailRow): SalesDetailRow {
  return {
    id: row.id,
    external_id: row.sales_invoice_id,
    source: "mollie_sales_invoice",
    channel: "mollie_facturen",
    article_number: null,
    product_name: row.recipient_name || row.recipient_email || "Mollie factuur",
    amount_gross: row.amount_gross,
    amount_net: row.amount_net,
    vat_amount: row.vat_amount,
    vat_rate: null,
    invoice_number: row.reference ?? row.sales_invoice_id,
    status: row.status,
    paid_at: row.issued_at ?? row.paid_at,
    description_raw: [row.status ? `Status: ${row.status}` : null, row.recipient_email]
      .filter(Boolean)
      .join(" | "),
    parse_status: "ok",
    invoice_url: row.invoice_url,
  };
}

function isRevenueMollieInvoice(row: MollieSalesInvoiceDetailRow) {
  const status = String(row.status ?? "").toLowerCase();
  if (status === "canceled" || status === "cancelled") return false;
  return String(row.raw_payload?.type ?? "invoice").toLowerCase() === "invoice";
}

function mapWefactInvoiceDetail(row: WefactInvoiceDetailRow): SalesDetailRow {
  return {
    id: row.id,
    external_id: row.invoice_number,
    source: "wefact_invoice_pdf",
    channel: "wefact_facturen",
    article_number: row.category,
    product_name: row.customer_name || row.reference || "WeFact factuur",
    amount_gross: row.amount_gross,
    amount_net: row.amount_net,
    vat_amount: row.vat_amount,
    vat_rate: null,
    invoice_number: row.invoice_number,
    status: row.status,
    paid_at: row.invoice_date,
    description_raw: [
      row.reference ? `Referentie: ${row.reference}` : null,
      row.customer_number ? `Klant: ${row.customer_number}` : null,
      row.source_filename,
    ]
      .filter(Boolean)
      .join(" | "),
    parse_status: "ok",
  };
}

function hasShopifyInvoiceData(row: ShopifyOrderDetailRow) {
  return Boolean(
    row.raw_payload?.tax_rates !== undefined ||
    row.total_tax !== null ||
    row.current_total_tax !== null,
  );
}

function exactDocumentUrl(row: GlDetailRow) {
  const rawUrl = payloadValue(row.raw_payload, [
    "exact_document_url",
    "ExactDocumentUrl",
    "document_url",
    "DocumentUrl",
  ]);
  const url = String(rawUrl ?? "").trim();
  if (/^https?:\/\//i.test(url)) return url;

  const rawDocumentId = payloadValue(row.raw_payload, [
    "exact_document_id",
    "Document",
    "document",
  ]);
  const documentId = String(rawDocumentId ?? "").trim();
  if (!documentId) return null;
  return `https://start.exactonline.nl/docs/DocView.aspx?DocumentID=${encodeURIComponent(documentId)}`;
}

function shopifyInvoiceAmounts(row: ShopifyOrderDetailRow) {
  if (isCancelledShopifyOrder(row)) return { gross: 0, vat: 0 };
  if (isFullyRefundedShopifyOrder(row)) return { gross: 0, vat: 0 };

  const gross = coalesceMoney(row.current_total_price, row.total_price);
  const vat = coalesceMoney(row.current_total_tax, row.total_tax, row.line_tax_total);
  return { gross, vat };
}

function isCancelledShopifyOrder(row: ShopifyOrderDetailRow) {
  const status = String(row.financial_status ?? "").toLowerCase();
  const cancelledAt = payloadValue(row.raw_payload, [
    "cancelled_at",
    "cancelled_at_csv",
    "cancelledAt",
    "canceled_at",
  ]);
  return (
    status === "canceled" ||
    status === "cancelled" ||
    status === "voided" ||
    String(cancelledAt ?? "").trim() !== ""
  );
}

function isFullyRefundedShopifyOrder(row: ShopifyOrderDetailRow) {
  const currentTotal = moneyOrNull(row.current_total_price);
  const totalPrice = moneyOrNull(row.total_price);
  const totalRefunded = moneyOrNull(row.total_refunded);
  return (
    row.financial_status === "refunded" &&
    currentTotal !== null &&
    totalPrice !== null &&
    totalRefunded !== null &&
    Math.abs(currentTotal) < 0.005 &&
    totalRefunded >= totalPrice - 0.005
  );
}

function moneyOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? roundMoney(numeric) : null;
}

function coalesceMoney(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return roundMoney(numeric);
  }
  return 0;
}

function roundMoney(value: unknown) {
  return Number.isFinite(Number(value)) ? +Number(value).toFixed(2) : 0;
}

function makeRow(
  key: string,
  label: string,
  section: string,
  level: 0 | 1,
  kind: PlRow["kind"],
  values: Record<string, number>,
  months: string[],
  detailByPeriod?: Record<string, DetailBase>,
  valueFormat?: PlRow["valueFormat"],
  ytd?: number,
  budgetValues?: Record<string, number>,
  budgetYtd?: number,
  budgetOnly = false,
): PlRow {
  return {
    key,
    label,
    section,
    level,
    kind,
    valueFormat,
    values,
    ytd: ytd ?? sumValues(values, months),
    budgetValues,
    budgetYtd: budgetValues ? (budgetYtd ?? sumValues(budgetValues, months)) : undefined,
    budgetOnly,
    detailByPeriod,
  };
}

function blankValues(months: string[]) {
  return Object.fromEntries(months.map((period) => [period, 0]));
}

function plRowCashflowValues(rows: PlRow[], rowKey: string, months: string[]): CashflowValues {
  const row = rows.find((candidate) => candidate.key === rowKey);
  return {
    actual: Object.fromEntries(months.map((period) => [period, row?.values[period] ?? 0])),
    budget: Object.fromEntries(months.map((period) => [period, row?.budgetValues?.[period] ?? 0])),
  };
}

function budgetLinesByKey(budgetLines: PlBudgetLine[], months: string[]) {
  const result = new Map<string, Record<string, number>>();
  for (const line of budgetLines) {
    if (!result.has(line.line_key)) result.set(line.line_key, blankValues(months));
    result.get(line.line_key)![line.period] += Number(line.amount ?? 0);
  }
  return result;
}

function revenueBudgetValuesByChannel(
  revenueBudgets: RevenueBudgetRow[],
  budgetLines: PlBudgetLine[],
  months: string[],
) {
  const result = new Map<string, Record<string, number>>();
  const machineBudgetByChannelPeriod = new Map<string, number>();
  const explicitChannelBudgetPeriods = new Set<string>();

  for (const channel of CHANNELS) {
    result.set(channel, blankValues(months));
  }

  for (const budget of revenueBudgets) {
    if (!CHANNELS.includes(budget.channel as (typeof CHANNELS)[number])) continue;
    const period = budget.period;
    if (!months.includes(period)) continue;
    const amount = Number(budget.amount ?? 0);
    if (!Number.isFinite(amount)) continue;

    const key = `${budget.channel}|${period}`;
    if (!budget.machine_id) {
      explicitChannelBudgetPeriods.add(key);
      result.get(budget.channel)![period] += amount;
      continue;
    }

    machineBudgetByChannelPeriod.set(key, (machineBudgetByChannelPeriod.get(key) ?? 0) + amount);
  }

  for (const [key, amount] of machineBudgetByChannelPeriod.entries()) {
    if (explicitChannelBudgetPeriods.has(key)) continue;
    const [channel, period] = key.split("|");
    result.get(channel)![period] += amount;
  }

  const forecastRevenue = budgetLinesByKey(
    budgetLines.filter((line) => line.kind === "revenue"),
    months,
  );
  for (const channel of CHANNELS) {
    const values = result.get(channel)!;
    const fallback = forecastRevenue.get(`revenue-${channel}`);
    if (!fallback) continue;
    for (const period of months) {
      if (Math.abs(values[period] ?? 0) < 0.005) values[period] = fallback[period] ?? 0;
    }
  }

  return result;
}

function buildRevenueActualsByChannel(salesRows: SalesPeriodRow[], months: string[]) {
  const result = new Map<string, Record<string, number>>();
  for (const channel of CHANNELS) result.set(channel, blankValues(months));

  for (const row of salesRows) {
    if (!CHANNELS.includes(row.channel as (typeof CHANNELS)[number])) continue;
    if (!months.includes(row.period)) continue;
    result.get(row.channel)![row.period] += Number(row.net_total ?? 0);
  }

  return result;
}

function budgetLinesBySection(budgetLines: PlBudgetLine[], months: string[]) {
  const result = new Map<string, Record<string, number>>();
  for (const line of budgetLines) {
    if (line.kind === "revenue") continue;
    if (!result.has(line.section)) result.set(line.section, blankValues(months));
    result.get(line.section)![line.period] += Number(line.amount ?? 0);
  }
  return result;
}

function afsRentalInvoiceValuesByPeriod(invoices: AfsRentalInvoiceRow[], months: string[]) {
  const monthSet = new Set(months);
  const values = blankValues(months);

  for (const invoice of invoices) {
    if (!monthSet.has(invoice.period)) continue;
    if (String(invoice.status ?? "").toLowerCase() === "canceled") continue;
    values[invoice.period] += Number(invoice.subtotal_net ?? 0);
  }

  return values;
}

function hasAnyValue(values: Record<string, number>) {
  return Object.values(values).some((value) => Math.abs(Number(value ?? 0)) >= 0.005);
}

function budgetOnlyRowsBySection(
  budgetLines: PlBudgetLine[],
  months: string[],
  hiddenLineKeys = new Set<string>(),
) {
  const grouped = new Map<string, Map<string, PlBudgetLine[]>>();
  for (const line of budgetLines) {
    if (line.kind === "revenue") continue;
    if (hiddenLineKeys.has(line.line_key)) continue;
    if (!grouped.has(line.section)) grouped.set(line.section, new Map());
    const section = grouped.get(line.section)!;
    if (!section.has(line.line_key)) section.set(line.line_key, []);
    section.get(line.line_key)!.push(line);
  }

  const result = new Map<string, PlRow[]>();
  for (const [section, linesByKey] of grouped.entries()) {
    const rows = [...linesByKey.entries()]
      .map(([lineKey, lines]) => {
        const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order);
        const first = sorted[0];
        const budgetValues = blankValues(months);
        for (const line of sorted) budgetValues[line.period] += Number(line.amount ?? 0);
        return makeRow(
          `budget-${lineKey}`,
          first.line_label,
          section,
          1,
          "normal",
          blankValues(months),
          months,
          undefined,
          undefined,
          0,
          budgetValues,
          undefined,
          true,
        );
      })
      .sort((a, b) => {
        const aLine = linesByKey.get(a.key.replace(/^budget-/, ""))?.[0];
        const bLine = linesByKey.get(b.key.replace(/^budget-/, ""))?.[0];
        return Number(aLine?.sort_order ?? 999999) - Number(bLine?.sort_order ?? 999999);
      });
    result.set(section, rows);
  }
  return result;
}

function sumValues(values: Record<string, number>, months: string[]) {
  return months.reduce((sum, period) => sum + Number(values[period] ?? 0), 0);
}

function percentage(value: number, total: number) {
  return Math.abs(total) < 0.005 ? Number.NaN : (value / total) * 100;
}

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function PlColumnToggles({
  columns,
  onToggle,
}: {
  columns: PlMetricColumn[];
  onToggle: (column: PlMetricColumn) => void;
}) {
  return (
    <div className="md:col-span-2 xl:col-span-2">
      <div className="mb-2 text-xs text-muted-foreground">Kolommen</div>
      <div className="flex flex-wrap gap-2 rounded-md border bg-background p-2">
        {PL_METRIC_COLUMNS.map((option) => {
          const checked = columns.includes(option.value);
          return (
            <label
              key={option.value}
              className="flex min-h-8 items-center gap-2 rounded border bg-muted/20 px-2 text-sm"
            >
              <Checkbox
                checked={checked}
                disabled={checked && columns.length === 1}
                onCheckedChange={() => onToggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function BudgetHeaderCells({
  columns,
  totalLabel,
}: {
  columns: PlMetricColumn[];
  totalLabel?: string;
}) {
  return (
    <>
      {columns.map((column, index) => (
        <th
          key={column}
          className={`${index === 0 ? "border-l" : ""} px-3 py-2 text-right font-medium`}
        >
          {totalLabel ? totalPlMetricLabel(column, totalLabel) : plMetricLabel(column)}
        </th>
      ))}
    </>
  );
}

function BudgetAmountCells({
  columns,
  value,
  budget,
  budgetOnly = false,
  valueFormat = "currency",
  strong = false,
  onClick,
}: {
  columns: PlMetricColumn[];
  value: number;
  budget?: number;
  budgetOnly?: boolean;
  valueFormat?: "currency" | "percentage";
  strong?: boolean;
  onClick?: () => void;
}) {
  const hasBudget = budget !== undefined && Number.isFinite(budget);
  const variance = hasBudget && !budgetOnly ? value - Number(budget) : undefined;
  return (
    <>
      {columns.map((column, index) => {
        const isActual = column === "actual";
        const metricValue =
          column === "actual"
            ? budgetOnly
              ? undefined
              : value
            : column === "budget"
              ? hasBudget
                ? Number(budget)
                : undefined
              : variance;
        return (
          <BudgetValueCell
            key={column}
            value={metricValue}
            valueFormat={valueFormat}
            strong={strong}
            muted={(column === "budget" || column === "variance") && !hasBudget}
            onClick={isActual && !budgetOnly ? onClick : undefined}
            className={index === 0 ? "border-l" : ""}
          />
        );
      })}
    </>
  );
}

function BudgetValueCell({
  value,
  valueFormat = "currency",
  strong = false,
  muted = false,
  className = "",
  onClick,
}: {
  value?: number;
  valueFormat?: "currency" | "percentage";
  strong?: boolean;
  muted?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const numericValue = Number(value);
  const hasValue = value !== undefined && Number.isFinite(numericValue);
  const classes = [
    "px-3 py-2 text-right tabular-nums",
    strong ? "font-semibold" : "",
    muted || !hasValue ? "text-muted-foreground" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const formatted = hasValue
    ? valueFormat === "percentage"
      ? formatPercentage(numericValue)
      : formatEUR(numericValue)
    : "-";
  if (!onClick || !hasValue) return <td className={classes}>{formatted}</td>;
  return (
    <td className={classes}>
      <button
        type="button"
        className="rounded px-1 text-right underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
        onClick={onClick}
      >
        {formatted}
      </button>
    </td>
  );
}

function formatPercentage(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%`;
}

function composePeriod(year: string, month: string) {
  return `${year}-${month}`;
}

function periodsBetween(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const start = new Date(fy, fm - 1, 1);
  const end = new Date(ty, tm - 1, 1);
  if (start > end) return periodsBetween(to, from);
  const periods: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return periods;
}

function yearPeriods(year: string) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function multiYearPeriods(years: string[], months: string[]) {
  const selectedYears = uniqueSorted(years);
  const selectedMonths =
    months.length > 0 ? uniqueSorted(months) : monthOptions().map((m) => m.value);
  return selectedYears.flatMap((year) => selectedMonths.map((month) => composePeriod(year, month)));
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => {
    const value = String(index + 1).padStart(2, "0");
    return {
      value,
      label: new Date(2026, index, 1).toLocaleDateString("nl-NL", { month: "long" }),
    };
  });
}

function selectionTitle(viewMode: ViewMode, periods: string[], year: string) {
  if (viewMode === "year") return `Winst en verlies - jaar ${year}`;
  if (viewMode === "multiYear") return `Winst en verlies - ${multiPeriodLabel(periods)}`;
  if (periods.length === 1) return `Winst en verlies - ${monthLabel(periods[0])}`;
  return `Winst en verlies - ${monthLabel(periods[0])} t/m ${monthLabel(periods[periods.length - 1])}`;
}

function aggregateLabel(viewMode: ViewMode, periods: string[]) {
  if (viewMode === "year") return "Jaar totaal";
  if (viewMode === "multiYear") return "Selectie totaal";
  if (periods.length <= 1) return "Totaal";
  return periods[0]?.endsWith("-01") ? "YTD totaal" : "Periode totaal";
}

function multiPeriodLabel(periods: string[]) {
  const years = uniqueSorted(periods.map((period) => period.split("-")[0]));
  const months = uniqueSorted(periods.map((period) => period.split("-")[1]));
  const monthText =
    months.length === 12 ? "alle maanden" : months.map((month) => shortMonthName(month)).join(", ");
  return `${years.join(", ")} - ${monthText}`;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort();
}

function shortMonthName(month: string) {
  return new Date(2026, Number(month) - 1, 1).toLocaleDateString("nl-NL", {
    month: "short",
  });
}

function monthHeaderLabel(period: string, includeYear: boolean) {
  if (!includeYear) return monthShortLabel(period);
  const [year, rawMonth] = period.split("-");
  return new Date(Number(year), Number(rawMonth) - 1, 1).toLocaleDateString("nl-NL", {
    month: "short",
    year: "2-digit",
  });
}

function quarterHeaderLabel(period: string, includeYear: boolean) {
  const [year, quarter] = monthToQuarterKey(period).split("-Q");
  return includeYear ? `Q${quarter} ${year}` : `Q${quarter}`;
}

function plMetricLabel(column: PlMetricColumn) {
  switch (column) {
    case "actual":
      return "Actueel";
    case "budget":
      return "Budget";
    case "variance":
      return "Verschil";
  }
}

function totalPlMetricLabel(column: PlMetricColumn, totalLabel: string) {
  const suffix = totalLabel === "YTD totaal" ? " YTD" : totalLabel === "Jaar totaal" ? " jaar" : "";
  switch (column) {
    case "actual":
      return `Actueel${suffix}`;
    case "budget":
      return `Budget${suffix}`;
    case "variance":
      return `Verschil${suffix}`;
  }
}

function orderPlMetricColumns(columns: PlMetricColumn[]) {
  const order = new Map(PL_METRIC_COLUMNS.map((column, index) => [column.value, index]));
  return [...columns].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
}

function EmptyDetails() {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      Geen onderliggende transacties gevonden.
    </div>
  );
}

function yearOptions() {
  const current = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, index) => String(current + 2 - index));
}

function monthRange(period: string) {
  const [year, rawMonth] = period.split("-");
  const start = new Date(Number(year), Number(rawMonth) - 1, 1);
  const end = new Date(Number(year), Number(rawMonth), 1);
  return {
    startDate: `${year}-${rawMonth}-01`,
    endDate: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-01`,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function monthLabel(period: string) {
  const [year, rawMonth] = period.split("-");
  const date = new Date(Number(year), Number(rawMonth) - 1, 1);
  return date.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

function formatGlDate(row: GlDetailRow) {
  const rawDate = payloadValue(row.raw_payload, [
    "EntryDate",
    "entrydate",
    "entry_date",
    "Datum",
    "Boekdatum",
  ]);
  return (
    formatLooseDate(rawDate) ??
    formatLooseDate(row.transaction_date) ??
    formatDateNL(row.transaction_date)
  );
}

function payloadValue(payload: Record<string, unknown> | null, keys: string[]) {
  if (!payload) return null;
  for (const key of keys) {
    if (payload[key] !== undefined) return payload[key];
  }
  const normalizedKeys = new Set(keys.map(normalizeKey));
  const found = Object.entries(payload).find(([key]) => normalizedKeys.has(normalizeKey(key)));
  return found?.[1] ?? null;
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatLooseDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const nl = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})/.exec(raw);
  if (nl) {
    const year = nl[3].length === 2 ? `20${nl[3]}` : nl[3];
    return `${nl[1].padStart(2, "0")}-${nl[2].padStart(2, "0")}-${year}`;
  }
  return null;
}
