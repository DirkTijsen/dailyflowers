export type CashflowInputMetric = "actual" | "budget";

export type CashflowInputRecord = {
  id: string;
  period: string;
  line_key: string;
  actual_amount: number | string;
  budget_amount: number | string;
  actual_machine_count: number | string;
  budget_machine_count: number | string;
  actual_afs_block_id: string | null;
  budget_afs_block_id: string | null;
};

export type CashflowAfsBlock = {
  id: string;
  block_number: number | string;
  reference_machine_count: number | string;
  afs_amount: number | string;
  roofs_140_amount: number | string;
  shipping_amount: number | string;
  quality_check_amount: number | string;
  installation_amount: number | string;
  kpn_mollie_amount: number | string;
  location_renovation_amount: number | string;
};

export type CashflowAfsBlockField = Exclude<keyof CashflowAfsBlock, "id" | "block_number">;

export type AfsInvestmentComponent = {
  key: string;
  label: string;
  field: Exclude<CashflowAfsBlockField, "reference_machine_count">;
};

export type CashflowInputDefinition = {
  key: string;
  label: string;
  group: "investments" | "debt" | "equity";
  direction: 1 | -1;
  level: 1 | 2;
};

export type CashflowValues = {
  actual: Record<string, number>;
  budget: Record<string, number>;
};

export type CashflowReportRow = {
  key: string;
  label: string;
  section: string;
  level: 0 | 1 | 2;
  kind: "normal" | "heading" | "subtotal" | "result";
  values: CashflowValues;
};

export const AFS_MACHINE_INPUT_KEY = "investment_afs_machines";

export const AFS_INVESTMENT_COMPONENTS: AfsInvestmentComponent[] = [
  { key: "afs", label: "AFS", field: "afs_amount" },
  { key: "roofs-140", label: "140 daken", field: "roofs_140_amount" },
  { key: "shipping", label: "Shipping", field: "shipping_amount" },
  { key: "quality-check", label: "Quality check", field: "quality_check_amount" },
  { key: "installation", label: "Plaatsing", field: "installation_amount" },
  { key: "kpn-mollie", label: "KPN/Mollie", field: "kpn_mollie_amount" },
  {
    key: "location-renovation",
    label: "Achtergrond/verbouwing locatie",
    field: "location_renovation_amount",
  },
];

export const CASHFLOW_INPUT_DEFINITIONS: CashflowInputDefinition[] = [
  {
    key: "investment_office_property",
    label: "Kantoor- en pandinrichting",
    group: "investments",
    direction: -1,
    level: 1,
  },
  {
    key: "investment_other_fixed_assets",
    label: "Investering overige vaste activa",
    group: "investments",
    direction: -1,
    level: 1,
  },
  {
    key: "debt_loans_received",
    label: "Aangetrokken leningen",
    group: "debt",
    direction: 1,
    level: 1,
  },
  {
    key: "debt_loans_repaid",
    label: "Terugbetaalde leningen",
    group: "debt",
    direction: -1,
    level: 1,
  },
  {
    key: "debt_interest_paid",
    label: "Betaalde rente",
    group: "debt",
    direction: -1,
    level: 1,
  },
  {
    key: "debt_interest_received",
    label: "Ontvangen rente",
    group: "debt",
    direction: 1,
    level: 1,
  },
  {
    key: "equity_dividend_paid",
    label: "Uitbetaald dividend",
    group: "equity",
    direction: -1,
    level: 1,
  },
  {
    key: "equity_shareholder_contributions",
    label: "Stortingen aandeelhouders",
    group: "equity",
    direction: 1,
    level: 1,
  },
];

export function buildCashflowReport({
  months,
  inputs,
  operatingResult,
  afsBlocks,
}: {
  months: string[];
  inputs: CashflowInputRecord[];
  operatingResult: CashflowValues;
  afsBlocks: CashflowAfsBlock[];
}): CashflowReportRow[] {
  const byKey = new Map<string, CashflowValues>();
  for (const definition of CASHFLOW_INPUT_DEFINITIONS) {
    byKey.set(definition.key, blankCashflowValues(months));
  }
  for (const input of inputs) {
    const definition = CASHFLOW_INPUT_DEFINITIONS.find((item) => item.key === input.line_key);
    const values = byKey.get(input.line_key);
    if (!definition || !values || !months.includes(input.period)) continue;
    values.actual[input.period] = definition.direction * Number(input.actual_amount ?? 0);
    values.budget[input.period] = definition.direction * Number(input.budget_amount ?? 0);
  }

  const inputRow = (definition: CashflowInputDefinition): CashflowReportRow => ({
    key: definition.key,
    label: definition.label,
    section:
      definition.group === "investments"
        ? "Investeringen"
        : definition.group === "debt"
          ? "Vreemd vermogen"
          : "Eigen vermogen",
    level: definition.level,
    kind: "normal",
    values: byKey.get(definition.key) ?? blankCashflowValues(months),
  });

  const afsTotal = buildAfsInvestmentValues(inputs, afsBlocks, months);
  const office = byKey.get("investment_office_property")!;
  const otherAssets = byKey.get("investment_other_fixed_assets")!;
  const investmentTotal = sumCashflowValues([afsTotal, office, otherAssets], months);
  const debtDefinitions = CASHFLOW_INPUT_DEFINITIONS.filter((item) => item.group === "debt");
  const equityDefinitions = CASHFLOW_INPUT_DEFINITIONS.filter((item) => item.group === "equity");
  const debtTotal = sumCashflowValues(
    debtDefinitions.map((definition) => byKey.get(definition.key)!),
    months,
  );
  const equityTotal = sumCashflowValues(
    equityDefinitions.map((definition) => byKey.get(definition.key)!),
    months,
  );
  const financingTotal = sumCashflowValues([debtTotal, equityTotal], months);
  const netCashflow = sumCashflowValues([operatingResult, investmentTotal, financingTotal], months);

  return [
    {
      key: "operating-result",
      label: "Bedrijfsresultaat",
      section: "Operationele activiteiten",
      level: 0,
      kind: "result",
      values: operatingResult,
    },
    {
      key: "investment-afs-total",
      label: "Investering AFS'en",
      section: "Investeringen",
      level: 1,
      kind: "subtotal",
      values: afsTotal,
    },
    inputRow(CASHFLOW_INPUT_DEFINITIONS.find((item) => item.key === "investment_office_property")!),
    inputRow(
      CASHFLOW_INPUT_DEFINITIONS.find((item) => item.key === "investment_other_fixed_assets")!,
    ),
    {
      key: "investment-total",
      label: "Investeringscashflow",
      section: "Investeringen",
      level: 0,
      kind: "subtotal",
      values: investmentTotal,
    },
    {
      key: "debt-heading",
      label: "Vreemd vermogen",
      section: "Financieringsactiviteiten",
      level: 1,
      kind: "heading",
      values: debtTotal,
    },
    ...debtDefinitions.map(inputRow),
    {
      key: "equity-heading",
      label: "Eigen vermogen",
      section: "Financieringsactiviteiten",
      level: 1,
      kind: "heading",
      values: equityTotal,
    },
    ...equityDefinitions.map(inputRow),
    {
      key: "financing-total",
      label: "Financieringscashflow",
      section: "Financieringsactiviteiten",
      level: 0,
      kind: "subtotal",
      values: financingTotal,
    },
    {
      key: "net-cashflow",
      label: "Netto cashflow",
      section: "Netto cashflow",
      level: 0,
      kind: "result",
      values: netCashflow,
    },
  ];
}

export function buildAfsInvestmentValues(
  inputs: CashflowInputRecord[],
  blocks: CashflowAfsBlock[],
  months: string[],
): CashflowValues {
  const values = blankCashflowValues(months);
  for (const input of inputs) {
    if (input.line_key !== AFS_MACHINE_INPUT_KEY || !months.includes(input.period)) continue;
    const actualBlock = blocks.find((block) => block.id === input.actual_afs_block_id);
    const budgetBlock = blocks.find((block) => block.id === input.budget_afs_block_id);
    values.actual[input.period] =
      -Number(input.actual_machine_count ?? 0) * afsInvestmentAmountPerMachine(actualBlock);
    values.budget[input.period] =
      -Number(input.budget_machine_count ?? 0) * afsInvestmentAmountPerMachine(budgetBlock);
  }
  return values;
}

export function afsInvestmentPackageTotal(block: CashflowAfsBlock) {
  return AFS_INVESTMENT_COMPONENTS.reduce(
    (sum, component) => sum + Number(block[component.field] ?? 0),
    0,
  );
}

export function afsInvestmentAmountPerMachine(block: CashflowAfsBlock | undefined) {
  if (!block) return 0;
  const referenceCount = Number(block.reference_machine_count ?? 0);
  return referenceCount > 0 ? afsInvestmentPackageTotal(block) / referenceCount : 0;
}

export function cashflowInputValues(
  inputs: CashflowInputRecord[],
  lineKey: string,
  months: string[],
): CashflowValues {
  const values = blankCashflowValues(months);
  for (const input of inputs) {
    if (input.line_key !== lineKey || !months.includes(input.period)) continue;
    values.actual[input.period] = Number(input.actual_amount ?? 0);
    values.budget[input.period] = Number(input.budget_amount ?? 0);
  }
  return values;
}

export function sumCashflowValues(items: CashflowValues[], months: string[]): CashflowValues {
  const result = blankCashflowValues(months);
  for (const item of items) {
    for (const period of months) {
      result.actual[period] += item.actual[period] ?? 0;
      result.budget[period] += item.budget[period] ?? 0;
    }
  }
  return result;
}

export function blankCashflowValues(months: string[]): CashflowValues {
  return {
    actual: Object.fromEntries(months.map((period) => [period, 0])),
    budget: Object.fromEntries(months.map((period) => [period, 0])),
  };
}
