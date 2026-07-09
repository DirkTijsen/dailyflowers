import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, RefreshCw, Upload } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/winst-verlies")({
  head: () => ({ meta: [{ title: "W&V - Daily Flowers" }] }),
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
  machines?: { display_name: string | null; afs_number: string | null } | null;
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
  net_total: number | string | null;
  gross_total: number | string | null;
};

type ViewMode = "month" | "range" | "year" | "multiYear";
type PlMetricColumn = "actual" | "budget" | "variance";

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
    section: "afs_fulfillment_logistics",
    lineKey: "budget-afs-autos",
    lineLabel: "AFS - Auto's",
    sourceSheet: "AFS",
    sourceLabel: "Auto's",
    sortOrder: 360,
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
    defaultAmount: 45,
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
    defaultAmount: 0,
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
    defaultAmount: 0,
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
    defaultAmount: 0,
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
    driver_key: "marketing_verkoopkosten",
    driver_label: "Marketing - Marketingkosten/verkoopkosten",
    calculation_type: "percentage_of_revenue",
    section: "sales_marketing",
    line_key: "budget-webshop-advertentiekosten",
    line_label: "Marketing - Marketingkosten/verkoopkosten",
    source_label: "Marketingkosten/verkoopkosten (% van totale budgetomzet)",
    source_sheet: "Marketing",
    source_workbook: PL_PARAMETER_SOURCE_WORKBOOK,
    input_label: "% van totale budgetomzet",
    revenue_channels: [...CHANNELS],
    fallback_line_key: "budget-webshop-advertentiekosten",
    sort_order: 510,
    defaultAmount: 0,
    defaultBasisAmount: null,
  },
];
const BUDGET_DRIVER_DEFINITIONS = [...COST_DRIVER_DEFINITIONS, ...PL_PARAMETER_DRIVER_DEFINITIONS];
const BUDGET_DRIVER_KEYS = BUDGET_DRIVER_DEFINITIONS.map((driver) => driver.driver_key);

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
};

type RevenueBudgetInputRow = {
  key: string;
  channel: string;
  machineId: string | null;
  label: string;
  level: 0 | 1;
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
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [savingBudgetCell, setSavingBudgetCell] = useState<string | null>(null);
  const months = useMemo(() => {
    if (viewMode === "month") return [composePeriod(year, month)];
    if (viewMode === "year") return yearPeriods(year);
    if (viewMode === "multiYear") return multiYearPeriods(selectedYears, selectedMonths);
    return periodsBetween(composePeriod(year, fromMonth), composePeriod(year, toMonth));
  }, [fromMonth, month, selectedMonths, selectedYears, toMonth, viewMode, year]);
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
    queryKey: ["wv-gl-monthly", months],
    queryFn: async () => {
      const { data, error } = await db
        .from<GlPeriodRow>("vw_gl_monthly_account")
        .select("*")
        .in("period", months);
      if (error) throw error;
      return (data ?? []) as GlPeriodRow[];
    },
    enabled: months.length > 0,
  });

  const salesQ = useQuery({
    queryKey: ["wv-sales-monthly", months],
    queryFn: async () => {
      const { data, error } = await db
        .from<SalesPeriodRow>("vw_monthly_revenue_actuals")
        .select("*")
        .in("period", months);
      if (error) throw error;
      return (data ?? []) as SalesPeriodRow[];
    },
    enabled: months.length > 0,
  });

  const budgetsQ = useQuery({
    queryKey: ["wv-pl-budget-lines", months],
    queryFn: async () => {
      const { data, error } = await db
        .from<PlBudgetLine>("pl_budget_lines")
        .select(
          "id,period,budget_year,section,line_key,line_label,kind,amount,source_workbook,source_sheet,source_label,sort_order",
        )
        .in("period", months)
        .order("sort_order")
        .order("line_label");
      if (error) throw error;
      return (data ?? []) as PlBudgetLine[];
    },
    enabled: months.length > 0,
  });

  const revenueBudgetsQ = useQuery({
    queryKey: ["wv-revenue-budgets", months],
    queryFn: async () => {
      const { data, error } = await db
        .from<RevenueBudgetRow>("budgets")
        .select("id,period,channel,machine_id,amount,machines(display_name,afs_number)")
        .in("period", months);
      if (error) throw error;
      return (data ?? []) as RevenueBudgetRow[];
    },
    enabled: months.length > 0,
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
    queryKey: ["wv-afs-rental-invoices", months],
    queryFn: async () => {
      const { data, error } = await db
        .from<AfsRentalInvoiceRow>("afs_rental_invoices")
        .select("id,period,machine_id,subtotal_net,status")
        .in("period", months)
        .neq("status", "canceled");
      if (error) throw error;
      return (data ?? []) as AfsRentalInvoiceRow[];
    },
    enabled: months.length > 0,
  });

  const afsMachineActualsQ = useQuery({
    queryKey: ["wv-afs-machine-actuals", months],
    queryFn: async () => {
      const { data, error } = await db
        .from<AfsMachineActualRow>("vw_monthly_machine")
        .select("period,machine_id,net_total,gross_total")
        .in("period", months)
        .eq("channel", "bold_afs");
      if (error) throw error;
      return (data ?? []) as AfsMachineActualRow[];
    },
    enabled: months.length > 0,
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

  const effectiveBudgetLines = useMemo(
    () =>
      buildEffectiveBudgetLines({
        budgetLines: budgetsQ.data ?? [],
        driverRules: costDriverRulesQ.data ?? [],
        revenueBudgets: revenueBudgetsQ.data ?? [],
        afsRentalAgreements: afsRentalAgreementsQ.data ?? [],
        afsMachineActuals: afsMachineActualsQ.data ?? [],
        months,
        activeAfsCount: activeAfsCountQ.data ?? 0,
      }),
    [
      activeAfsCountQ.data,
      afsMachineActualsQ.data,
      afsRentalAgreementsQ.data,
      costDriverRulesQ.data,
      budgetsQ.data,
      months,
      revenueBudgetsQ.data,
    ],
  );

  const { rows } = useMemo(
    () =>
      buildProfitLoss({
        months,
        glRows: glQ.data ?? [],
        salesRows: salesQ.data ?? [],
        afsRentalInvoices: afsRentalInvoicesQ.data ?? [],
        budgetLines: effectiveBudgetLines,
        revenueBudgets: revenueBudgetsQ.data ?? [],
        accounts: accountsQ.data ?? [],
      }),
    [
      accountsQ.data,
      afsRentalInvoicesQ.data,
      effectiveBudgetLines,
      glQ.data,
      months,
      revenueBudgetsQ.data,
      salesQ.data,
    ],
  );
  const revenueActualsByChannel = useMemo(
    () => buildRevenueActualsByChannel(salesQ.data ?? [], months),
    [months, salesQ.data],
  );

  useEffect(() => {
    setBudgetDrafts({});
  }, [costDriverRulesQ.data, budgetsQ.data, months, revenueBudgetsQ.data]);

  function toggleColumn(column: PlMetricColumn) {
    setVisibleColumns((current) => {
      if (current.includes(column)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== column);
      }
      return orderPlMetricColumns([...current, column]);
    });
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
        let del = db.from("budgets").delete().eq("channel", row.channel).eq("period", period);
        del = row.machineId ? del.eq("machine_id", row.machineId) : del.is("machine_id", null);
        const deleteResult = await del;
        if (deleteResult.error) throw deleteResult.error;

        const { error } = await db.from("budgets").insert({
          channel: row.channel,
          machine_id: row.machineId,
          period,
          amount,
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
          <h1 className="text-2xl font-semibold">W&V</h1>
          <p className="text-sm text-muted-foreground">
            Maandrapportage met omzet uit eigen verkoopdata, omzetbudget uit omzet monitoring en
            kosten uit het grootboek.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        <TabsList>
          <TabsTrigger value="wv">W&V</TabsTrigger>
          <TabsTrigger value="budget-inputs">Budget inputs</TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6 items-end">
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
                onderliggende grootboekregels of verkooptransacties te zien.
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
            revenueActualsByChannel={revenueActualsByChannel}
            budgetLines={budgetsQ.data ?? []}
            driverRules={costDriverRulesQ.data ?? []}
            activeAfsCount={activeAfsCountQ.data ?? 0}
            drafts={budgetDrafts}
            savingCell={savingBudgetCell}
            onDraftChange={updateBudgetDraft}
            onSaveRevenue={saveRevenueBudgetInput}
            onSavePl={savePlBudgetInput}
            onSaveCostDriver={saveCostDriverInput}
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
  revenueActualsByChannel,
  budgetLines,
  driverRules,
  activeAfsCount,
  drafts,
  savingCell,
  onDraftChange,
  onSaveRevenue,
  onSavePl,
  onSaveCostDriver,
}: {
  months: string[];
  revenueBudgets: RevenueBudgetRow[];
  revenueActualsByChannel: Map<string, Record<string, number>>;
  budgetLines: PlBudgetLine[];
  driverRules: PlBudgetDriverRule[];
  activeAfsCount: number;
  drafts: Record<string, string>;
  savingCell: string | null;
  onDraftChange: (cellKey: string, value: string) => void;
  onSaveRevenue: (row: RevenueBudgetInputRow, period: string, rawValue: string) => void;
  onSavePl: (row: PlBudgetInputRow, period: string, rawValue: string) => void;
  onSaveCostDriver: (
    driver: CostDriverDefinition,
    period: string,
    rawValue: string,
    field?: "amount" | "basisAmount",
  ) => void;
}) {
  const revenueRows = useMemo(
    () => buildRevenueBudgetInputRows(revenueBudgets, months),
    [months, revenueBudgets],
  );
  const plRows = useMemo(() => buildPlBudgetInputRows(budgetLines, months), [budgetLines, months]);
  const tableMinWidth = Math.max(960, 360 + months.length * 132 + 140);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Omzetbudgetten</CardTitle>
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
                {revenueRows.map((row) => (
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
                            onSave={(rawValue) => onSaveRevenue(row, period, rawValue)}
                          />
                          {actualAmount !== null && (
                            <div className="mt-1 whitespace-nowrap text-right text-[11px] text-muted-foreground tabular-nums">
                              Real. {formatEUR(actualAmount)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-l px-3 py-2 text-right font-semibold tabular-nums">
                      <div>{formatEUR(sumInputCells(row.values, months))}</div>
                      {row.level === 0 && (
                        <div className="mt-1 whitespace-nowrap text-[11px] font-normal text-muted-foreground">
                          Real.{" "}
                          {formatEUR(
                            sumValues(revenueActualsByChannel.get(row.channel) ?? {}, months),
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DriverInputsCard
        title="Kostprijs omzet"
        driverDefinitions={COST_DRIVER_DEFINITIONS}
        showAfsMachineCountRow
        months={months}
        revenueBudgets={revenueBudgets}
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
        revenueBudgets={revenueBudgets}
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

function BudgetInputHeader({ period }: { period: string }) {
  return (
    <th className="w-32 border-l px-3 py-2 text-right font-medium">
      <span className="block">{monthHeaderLabel(period, true)}</span>
      <span className="block text-[11px] font-normal text-muted-foreground">
        {quarterHeaderLabel(period, true)}
      </span>
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

function buildRevenueBudgetInputRows(revenueBudgets: RevenueBudgetRow[], months: string[]) {
  const result = new Map<string, RevenueBudgetInputRow>();

  const ensure = (channel: string, machineId: string | null, label: string, level: 0 | 1) => {
    const key = revenueBudgetRowKey(channel, machineId);
    if (!result.has(key)) {
      result.set(key, {
        key,
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
  revenueBudgets,
  afsRentalAgreements,
  afsMachineActuals,
  months,
  activeAfsCount,
}: {
  budgetLines: PlBudgetLine[];
  driverRules: PlBudgetDriverRule[];
  revenueBudgets: RevenueBudgetRow[];
  afsRentalAgreements: AfsRentalAgreementRow[];
  afsMachineActuals: AfsMachineActualRow[];
  months: string[];
  activeAfsCount: number;
}) {
  const manualLines = budgetLines
    .filter((line) => line.kind === "revenue" || !EXCLUDED_PL_BUDGET_LINE_KEYS.has(line.line_key))
    .map(normalizeManualBudgetLine);
  const driverRows = buildCostDriverInputRows({
    driverDefinitions: BUDGET_DRIVER_DEFINITIONS,
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
    revenueBudgets,
    machineActuals: afsMachineActuals,
    months,
  });

  return [...manualLines, ...generatedLines, ...afsRentBudgetLines];
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
  revenueBudgets,
  machineActuals,
  months,
}: {
  agreements: AfsRentalAgreementRow[];
  revenueBudgets: RevenueBudgetRow[];
  machineActuals: AfsMachineActualRow[];
  months: string[];
}): PlBudgetLine[] {
  if (agreements.length === 0 || months.length === 0) return [];

  const turnoverByMachinePeriod = afsTurnoverByMachinePeriod({
    revenueBudgets,
    machineActuals,
    months,
  });

  return months.map((period) => {
    const activeAgreements = activeAfsRentalAgreementsForPeriod(agreements, period);
    const amount = activeAgreements.reduce((sum, agreement) => {
      const turnover =
        turnoverByMachinePeriod.get(afsMachinePeriodKey(agreement.machine_id, period)) ?? 0;
      return sum + calculateAfsRentalCost(agreement, turnover);
    }, 0);

    return {
      id: `afs-rent:${period}`,
      period,
      budget_year: Number(period.split("-")[0]),
      section: "housing",
      line_key: AFS_RENT_BUDGET_LINE_KEY,
      line_label: AFS_RENT_LINE_LABEL,
      kind: "cost" as const,
      amount: roundMoney(amount),
      source_workbook: AFS_RENT_SOURCE_WORKBOOK,
      source_sheet: "AFS huurafspraken",
      source_label: "Vaste fee + energie + omzetafhankelijke huur",
      sort_order: 430,
    };
  });
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

function revenueBudgetRowKey(channel: string, machineId: string | null) {
  return `${channel}|${machineId ?? "channel"}`;
}

function revenueBudgetCellKey(rowKey: string, period: string) {
  return `revenue|${rowKey}|${period}`;
}

function plBudgetRowKey(lineKey: string) {
  return lineKey;
}

function plBudgetCellKey(rowKey: string, period: string) {
  return `pl|${rowKey}|${period}`;
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
  return rules.find(
    (rule) =>
      comparePeriods(rule.from_period, period) <= 0 &&
      (!rule.to_period || comparePeriods(rule.to_period, period) >= 0),
  );
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
    hasAfsRentalInvoiceValues ? new Set([AFS_RENT_BUDGET_LINE_KEY]) : undefined,
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
    nonRevenueAccounts.set("synthetic-afs-rental-invoices", {
      label: AFS_RENT_LINE_LABEL,
      section: "housing",
      sort: 430,
      values: afsRentalInvoiceValues,
      accountCode: "afs-rental-invoices",
      budgetLineKey: AFS_RENT_BUDGET_LINE_KEY,
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
    const detailByPeriod =
      account.accountCode === "afs-rental-invoices"
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
    if (account.accountCode !== "afs-rental-invoices")
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
  for (const period of months) {
    resultValues[period] = revenueTotal[period] - costTotal[period];
    resultBudgetValues[period] = revenueBudgetTotal[period] - costBudgetTotal[period];
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

  return { rows };
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
