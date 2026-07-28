export type FinancialMetricColumn = "actual" | "budget" | "variance";

export type FinancialStatementRow = {
  key: string;
  label: string;
  section: string;
  level: number;
  kind: "normal" | "heading" | "subtotal" | "result";
  valueFormat?: "currency" | "percentage";
  values: Record<string, number>;
  budgetValues?: Record<string, number>;
  ytd?: number;
  budgetYtd?: number;
};

export type FinancialInputRow = {
  group: string;
  category: string;
  label: string;
  note?: string;
  values: Record<string, number>;
  total?: number;
  numberFormat?: "currency" | "percentage" | "integer" | "decimal";
};

export type CashflowInputExportRow = {
  group: string;
  label: string;
  actual: Record<string, number>;
  budget: Record<string, number>;
  numberFormat?: "currency" | "integer";
};

export type AfsBlockExportRow = {
  block: string;
  component: string;
  amount: number;
  referenceMachineCount: number;
  amountPerMachine: number;
};

export type FinancialExportData = {
  title: string;
  selectionLabel: string;
  months: string[];
  columns: FinancialMetricColumn[];
  totalLabel: string;
  plRows: FinancialStatementRow[];
  budgetInputRows: FinancialInputRow[];
  cashflowInputRows: CashflowInputExportRow[];
  afsBlockRows: AfsBlockExportRow[];
  cashflowRows: FinancialStatementRow[];
};

const METRIC_LABELS: Record<FinancialMetricColumn, string> = {
  actual: "Actueel",
  budget: "Budget",
  variance: "Verschil",
};

const COLORS = {
  charcoal: "1F1F1F",
  cream: "F8F1E9",
  pink: "D99B99",
  pinkLight: "F5E8E4",
  red: "F53229",
  white: "FFFFFF",
  gray: "6B6B6B",
  line: "E8D8D0",
};

export async function exportFinancialWorkbook(data: FinancialExportData) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const plSheet = buildStatementSheet(XLSX, data, data.plRows, "W&V");
  XLSX.utils.book_append_sheet(workbook, plSheet, "W&V");

  const budgetSheet = buildBudgetInputsSheet(XLSX, data);
  XLSX.utils.book_append_sheet(workbook, budgetSheet, "Budget inputs");

  const cashflowInputsSheet = buildCashflowInputsSheet(XLSX, data);
  XLSX.utils.book_append_sheet(workbook, cashflowInputsSheet, "Cashflow inputs");

  const cashflowSheet = buildStatementSheet(XLSX, data, data.cashflowRows, "Cashflow");
  XLSX.utils.book_append_sheet(workbook, cashflowSheet, "Cashflow");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `Daily Flowers financieel overzicht ${stamp}.xlsx`, {
    cellStyles: true,
  });
}

export async function exportFinancialPresentation(data: FinancialExportData) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Daily Flowers";
  pptx.company = "Daily Flowers";
  pptx.subject = data.selectionLabel;
  pptx.title = `W&V en cashflow — ${data.selectionLabel}`;
  pptx.lang = "nl-NL";
  pptx.theme = {
    headFontFace: "Cambria",
    bodyFontFace: "Calibri",
    lang: "nl-NL",
  };

  const cover = pptx.addSlide();
  cover.background = { color: COLORS.charcoal };
  cover.addText("DAILY FLOWERS", {
    x: 0.7,
    y: 0.45,
    w: 4.1,
    h: 0.42,
    fontFace: "Calibri",
    fontSize: 23,
    bold: true,
    color: COLORS.white,
    charSpacing: 5,
    margin: 0,
  });
  cover.addText("FINANCIEEL OVERZICHT", {
    x: 0.7,
    y: 2.15,
    w: 8.5,
    h: 0.7,
    fontFace: "Cambria",
    fontSize: 31,
    bold: true,
    color: COLORS.white,
    margin: 0,
  });
  cover.addText("W&V en cashflow", {
    x: 0.7,
    y: 2.85,
    w: 7.5,
    h: 0.55,
    fontFace: "Cambria",
    fontSize: 25,
    color: COLORS.white,
    margin: 0,
  });
  cover.addShape(pptx.ShapeType.line, {
    x: 0.7,
    y: 4.08,
    w: 2.1,
    h: 0,
    line: { color: COLORS.pink, width: 2 },
  });
  cover.addText(data.selectionLabel, {
    x: 0.7,
    y: 4.45,
    w: 6.5,
    h: 0.4,
    fontFace: "Calibri",
    fontSize: 17,
    bold: true,
    color: COLORS.pink,
    margin: 0,
  });
  cover.addText(`Gegenereerd op ${formatDateNl(new Date())}`, {
    x: 0.7,
    y: 4.9,
    w: 5.5,
    h: 0.3,
    fontFace: "Calibri",
    fontSize: 10,
    color: "D8D8D8",
    margin: 0,
  });
  cover.addText("Vertrouwelijk — uitsluitend voor intern gebruik en financiers", {
    x: 0.7,
    y: 6.95,
    w: 7.5,
    h: 0.25,
    fontFace: "Calibri",
    fontSize: 8,
    color: "BFBFBF",
    margin: 0,
  });

  addStatementSlide({
    pptx,
    title: "W&V — resultaat en belangrijkste kostendrijvers",
    rows: selectPlPresentationRows(data.plRows),
    trendRow: data.plRows.find((row) => row.key === "result") ?? data.plRows.at(-1),
    data,
    chartTitle: "Resultaatontwikkeling",
    slideNumber: 2,
  });

  addStatementSlide({
    pptx,
    title: "Cashflow — operationeel, investeringen en financiering",
    rows: selectCashflowPresentationRows(data.cashflowRows),
    trendRow:
      data.cashflowRows.find((row) => row.key === "net-cashflow") ?? data.cashflowRows.at(-1),
    data,
    chartTitle: "Netto cashflowontwikkeling",
    slideNumber: 3,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  await pptx.writeFile({
    fileName: `Daily Flowers W&V en cashflow ${stamp}.pptx`,
    compression: true,
  });
}

function buildStatementSheet(
  XLSX: typeof import("xlsx"),
  data: FinancialExportData,
  rows: FinancialStatementRow[],
  sheetTitle: string,
) {
  const metricCount = data.columns.length;
  const totalColumns = 2 + (data.months.length + 1) * metricCount;
  const matrix: Array<Array<string | number | null>> = [
    [`Daily Flowers — ${sheetTitle}`],
    [`Filter: ${data.selectionLabel}`],
    [`Kolommen: ${data.columns.map((column) => METRIC_LABELS[column]).join(", ")}`],
    [],
  ];
  const groupHeader: Array<string | number | null> = ["Rubriek", "Regel"];
  const metricHeader: Array<string | number | null> = ["", ""];
  for (const period of data.months) {
    groupHeader.push(formatPeriod(period));
    metricHeader.push(...data.columns.map((column) => METRIC_LABELS[column]));
    for (let index = 1; index < metricCount; index += 1) groupHeader.push("");
  }
  groupHeader.push(data.totalLabel);
  metricHeader.push(...data.columns.map((column) => METRIC_LABELS[column]));
  for (let index = 1; index < metricCount; index += 1) groupHeader.push("");
  matrix.push(groupHeader, metricHeader);

  for (const row of rows) {
    const values: Array<string | number | null> = [
      row.level === 0 ? row.section : "",
      `${row.level > 0 ? "  ".repeat(row.level) : ""}${row.label}`,
    ];
    for (const period of data.months) {
      values.push(...data.columns.map((column) => statementMetricValue(row, period, column)));
    }
    values.push(...data.columns.map((column) => statementMetricTotal(row, data.months, column)));
    matrix.push(values);
  }

  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalColumns - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: totalColumns - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: totalColumns - 1 } },
  ];
  for (let group = 0; group <= data.months.length; group += 1) {
    const start = 2 + group * metricCount;
    if (metricCount > 1) {
      merges.push({ s: { r: 4, c: start }, e: { r: 4, c: start + metricCount - 1 } });
    }
  }
  sheet["!merges"] = merges;
  sheet["!cols"] = [
    { wch: 25 },
    { wch: 42 },
    ...Array.from({ length: totalColumns - 2 }, () => ({ wch: 14 })),
  ];
  sheet["!rows"] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 18 }, { hpt: 8 }, { hpt: 22 }, { hpt: 22 }];
  sheet["!autofilter"] = { ref: `A6:${columnName(totalColumns)}${matrix.length}` };
  setSheetFreeze(sheet, 6, 2);
  applySheetStyles(sheet, matrix.length, totalColumns, rows, 6);
  return sheet;
}

function buildBudgetInputsSheet(XLSX: typeof import("xlsx"), data: FinancialExportData) {
  const matrix: Array<Array<string | number | null>> = [
    ["Daily Flowers — Budget inputs"],
    [`Filter: ${data.selectionLabel}`],
    [],
    [
      "Onderdeel",
      "Categorie",
      "Budgetregel",
      "Toelichting",
      ...data.months.map(formatPeriod),
      "Totaal",
    ],
  ];
  for (const row of data.budgetInputRows) {
    matrix.push([
      row.group,
      row.category,
      row.label,
      row.note ?? "",
      ...data.months.map((period) => row.values[period] ?? 0),
      row.total ?? sumRecord(row.values, data.months),
    ]);
  }

  const totalColumns = 5 + data.months.length;
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalColumns - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: totalColumns - 1 } },
  ];
  sheet["!cols"] = [
    { wch: 22 },
    { wch: 24 },
    { wch: 38 },
    { wch: 48 },
    ...Array.from({ length: data.months.length + 1 }, () => ({ wch: 14 })),
  ];
  sheet["!autofilter"] = { ref: `A4:${columnName(totalColumns)}${matrix.length}` };
  setSheetFreeze(sheet, 4, 4);
  applyInputSheetStyles(sheet, matrix.length, totalColumns, 4);
  for (let rowIndex = 0; rowIndex < data.budgetInputRows.length; rowIndex += 1) {
    const format = excelNumberFormat(data.budgetInputRows[rowIndex].numberFormat);
    for (let column = 4; column < totalColumns; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex + 4, c: column })];
      if (cell) cell.z = format;
    }
  }
  return sheet;
}

function buildCashflowInputsSheet(XLSX: typeof import("xlsx"), data: FinancialExportData) {
  const matrix: Array<Array<string | number | null>> = [
    ["Daily Flowers — Cashflow inputs"],
    [`Filter: ${data.selectionLabel}`],
    [],
    ["AFS-investeringsblokken"],
    ["Blok", "Component", "Totaal bedrag", "Referentie machines", "Bedrag per machine"],
  ];
  for (const row of data.afsBlockRows) {
    matrix.push([
      row.block,
      row.component,
      row.amount,
      row.referenceMachineCount,
      row.amountPerMachine,
    ]);
  }
  matrix.push([], ["Cashflow inputs per maand"]);
  const inputHeaderRow = matrix.length;
  const header: Array<string | number | null> = ["Rubriek", "Cashflowregel"];
  for (const period of data.months)
    header.push(`${formatPeriod(period)} Actueel`, `${formatPeriod(period)} Budget`);
  header.push("Totaal Actueel", "Totaal Budget");
  matrix.push(header);

  for (const row of data.cashflowInputRows) {
    const values: Array<string | number | null> = [row.group, row.label];
    for (const period of data.months) {
      values.push(row.actual[period] ?? 0, row.budget[period] ?? 0);
    }
    values.push(sumRecord(row.actual, data.months), sumRecord(row.budget, data.months));
    matrix.push(values);
  }

  const totalColumns = 4 + data.months.length * 2;
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalColumns - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: totalColumns - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },
    { s: { r: inputHeaderRow - 1, c: 0 }, e: { r: inputHeaderRow - 1, c: totalColumns - 1 } },
  ];
  sheet["!cols"] = [
    { wch: 24 },
    { wch: 42 },
    ...Array.from({ length: totalColumns - 2 }, () => ({ wch: 15 })),
  ];
  sheet["!autofilter"] = {
    ref: `A${inputHeaderRow + 1}:${columnName(totalColumns)}${matrix.length}`,
  };
  setSheetFreeze(sheet, inputHeaderRow + 1, 2);
  applyInputSheetStyles(sheet, matrix.length, totalColumns, inputHeaderRow + 1);
  for (let row = 5; row < 5 + data.afsBlockRows.length; row += 1) {
    for (const column of [2, 4]) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = "€ #,##0;[Red](€ #,##0);-";
    }
    const countCell = sheet[XLSX.utils.encode_cell({ r: row, c: 3 })];
    if (countCell) countCell.z = "#,##0";
  }
  return sheet;
}

function addStatementSlide({
  pptx,
  title,
  rows,
  trendRow,
  data,
  chartTitle,
  slideNumber,
}: {
  pptx: InstanceType<(typeof import("pptxgenjs"))["default"]>;
  title: string;
  rows: FinancialStatementRow[];
  trendRow: FinancialStatementRow | undefined;
  data: FinancialExportData;
  chartTitle: string;
  slideNumber: number;
}) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };
  slide.addText(title, {
    x: 0.55,
    y: 0.35,
    w: 10.2,
    h: 0.52,
    fontFace: "Cambria",
    fontSize: 25,
    bold: true,
    color: COLORS.charcoal,
    margin: 0,
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 10.62,
    y: 0.32,
    w: 2.16,
    h: 0.38,
    rectRadius: 0.08,
    fill: { color: COLORS.red },
    line: { color: COLORS.red },
  });
  slide.addText(data.selectionLabel.toUpperCase(), {
    x: 10.73,
    y: 0.405,
    w: 1.94,
    h: 0.18,
    fontFace: "Calibri",
    fontSize: 8,
    bold: true,
    color: COLORS.white,
    align: "center",
    margin: 0,
    fit: "shrink",
  });

  const tableRows = [
    [
      {
        text: "€",
        options: { bold: true, color: COLORS.white, fill: COLORS.charcoal },
      },
      ...data.columns.map((column) => ({
        text: METRIC_LABELS[column],
        options: {
          bold: true,
          color: COLORS.white,
          fill: COLORS.charcoal,
          align: "right" as const,
        },
      })),
    ],
    ...rows.map((row) => {
      const rowFill =
        row.kind === "result"
          ? COLORS.charcoal
          : row.kind === "subtotal"
            ? COLORS.pinkLight
            : COLORS.white;
      const rowColor = row.kind === "result" ? COLORS.white : COLORS.charcoal;

      return [
        {
          text: row.label,
          options: {
            bold: row.kind !== "normal",
            color: rowColor,
            fill: rowFill,
            indent: row.level > 0 ? row.level * 10 : 0,
          },
        },
        ...data.columns.map((column) => ({
          text: formatStatementValue(
            statementMetricTotal(row, data.months, column),
            row.valueFormat,
          ),
          options: {
            bold: row.kind === "result",
            color:
              row.kind === "result"
                ? COLORS.white
                : column === "variance" && statementMetricTotal(row, data.months, column) < 0
                  ? COLORS.red
                  : COLORS.charcoal,
            fill: rowFill,
            align: "right" as const,
          },
        })),
      ];
    }),
  ];
  slide.addTable(tableRows, {
    x: 0.55,
    y: 1.18,
    w: 7.7,
    h: 4.85,
    border: { type: "solid", color: COLORS.line, pt: 0.7 },
    fill: COLORS.white,
    color: COLORS.charcoal,
    fontFace: "Calibri",
    fontSize: 10,
    margin: 0.09,
    rowH: 0.38,
    colW: [4.25, ...data.columns.map(() => 1.15)],
    autoFit: false,
    bold: false,
    valign: "middle",
    breakLine: false,
  });

  const periods = presentationPeriods(data.months);
  const labels = periods.map((period) => period.label);
  const chartSeries = data.columns
    .map((column) => ({
      name: METRIC_LABELS[column],
      labels,
      values: periods.map((period) => aggregateStatementMetric(trendRow, period.months, column)),
    }))
    .filter((series) => series.values.some((value) => Math.abs(value) >= 0.005));

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 8.6,
    y: 1.18,
    w: 4.18,
    h: 4.85,
    rectRadius: 0.08,
    fill: { color: COLORS.cream },
    line: { color: COLORS.cream },
  });
  slide.addText(chartTitle, {
    x: 8.9,
    y: 1.55,
    w: 3.6,
    h: 0.35,
    fontFace: "Calibri",
    fontSize: 15,
    bold: true,
    color: COLORS.charcoal,
    margin: 0,
  });
  if (chartSeries.length > 0 && periods.length > 0) {
    slide.addChart(pptx.ChartType.line, chartSeries, {
      x: 8.85,
      y: 2.05,
      w: 3.62,
      h: 2.75,
      showTitle: false,
      showLegend: chartSeries.length > 1,
      legendPos: "b",
      legendFontFace: "Calibri",
      legendFontSize: 8,
      showValue: false,
      catAxisLabelFontFace: "Calibri",
      catAxisLabelFontSize: 7,
      valAxisLabelFontFace: "Calibri",
      valAxisLabelFontSize: 7,
      valAxisNumFmt: '€ #,##0,," mln"',
      showCatName: false,
      chartColors: [COLORS.charcoal, COLORS.pink, COLORS.red],
      showMarker: true,
      lineSize: 2,
      showBorder: false,
    });
  } else {
    slide.addText("Geen waarden voor deze selectie.", {
      x: 8.9,
      y: 2.6,
      w: 3.55,
      h: 0.5,
      fontFace: "Calibri",
      fontSize: 12,
      italic: true,
      color: COLORS.gray,
      align: "center",
      margin: 0,
    });
  }
  slide.addText(
    periods.length < data.months.length
      ? "Trend per jaar; tabel toont het totaal van de volledige selectie."
      : "Trend per maand; tabel toont het totaal van de volledige selectie.",
    {
      x: 8.9,
      y: 5.2,
      w: 3.55,
      h: 0.42,
      fontFace: "Calibri",
      fontSize: 8,
      italic: true,
      color: COLORS.gray,
      margin: 0,
      align: "center",
    },
  );
  addSlideFooter(slide, slideNumber);
}

function addSlideFooter(
  slide: ReturnType<InstanceType<(typeof import("pptxgenjs"))["default"]>["addSlide"]>,
  slideNumber: number,
) {
  slide.addText("Daily Flowers — financieel overzicht · vertrouwelijk", {
    x: 0.55,
    y: 7.08,
    w: 5.5,
    h: 0.18,
    fontFace: "Calibri",
    fontSize: 7,
    color: COLORS.gray,
    margin: 0,
  });
  slide.addText(String(slideNumber), {
    x: 12.45,
    y: 7.08,
    w: 0.3,
    h: 0.18,
    fontFace: "Calibri",
    fontSize: 7,
    color: COLORS.gray,
    align: "right",
    margin: 0,
  });
}

function selectPlPresentationRows(rows: FinancialStatementRow[]) {
  const preferredKeys = [
    "revenue-total",
    "gross-margin",
    "gross-margin-percentage",
    "subtotal-personnel",
    "subtotal-afs_fulfillment_logistics",
    "subtotal-housing",
    "subtotal-sales_marketing",
    "subtotal-general_admin",
    "subtotal-depreciation",
    "result",
  ];
  return preferredKeys
    .map((key) => rows.find((row) => row.key === key))
    .filter((row): row is FinancialStatementRow => Boolean(row));
}

function selectCashflowPresentationRows(rows: FinancialStatementRow[]) {
  const preferredKeys = [
    "operating-result",
    "investment-afs-total",
    "investment_office_property",
    "investment_other_fixed_assets",
    "investment-total",
    "debt_loans_received",
    "debt_loans_repaid",
    "financing-total",
    "net-cashflow",
  ];
  return preferredKeys
    .map((key) => rows.find((row) => row.key === key))
    .filter((row): row is FinancialStatementRow => Boolean(row));
}

function statementMetricValue(
  row: FinancialStatementRow,
  period: string,
  column: FinancialMetricColumn,
) {
  const actual = finiteNumber(row.values[period]);
  const budget = finiteNumber(row.budgetValues?.[period]);
  if (column === "actual") return actual;
  if (column === "budget") return budget;
  return actual - budget;
}

function statementMetricTotal(
  row: FinancialStatementRow,
  months: string[],
  column: FinancialMetricColumn,
) {
  const actualYtd = optionalFiniteNumber(row.ytd);
  const budgetYtd = optionalFiniteNumber(row.budgetYtd);
  if (actualYtd !== undefined && column === "actual") return actualYtd;
  if (budgetYtd !== undefined && column === "budget") return budgetYtd;
  if (actualYtd !== undefined && budgetYtd !== undefined && column === "variance")
    return actualYtd - budgetYtd;
  return months.reduce((sum, period) => sum + statementMetricValue(row, period, column), 0);
}

function finiteNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function optionalFiniteNumber(value: unknown) {
  if (value === undefined || value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function aggregateStatementMetric(
  row: FinancialStatementRow | undefined,
  months: string[],
  column: FinancialMetricColumn,
) {
  if (!row) return 0;
  return statementMetricTotal(row, months, column);
}

function presentationPeriods(months: string[]) {
  if (months.length <= 18) {
    return months.map((period) => ({ label: formatPeriodShort(period), months: [period] }));
  }
  const grouped = new Map<string, string[]>();
  for (const period of months) {
    const year = period.split("-")[0];
    grouped.set(year, [...(grouped.get(year) ?? []), period]);
  }
  return [...grouped.entries()].map(([label, groupedMonths]) => ({
    label,
    months: groupedMonths,
  }));
}

function formatStatementValue(value: number, format: FinancialStatementRow["valueFormat"]) {
  if (format === "percentage") {
    return `${value.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }
  return formatCompactEuro(value);
}

function formatCompactEuro(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1_000_000) {
    return `${sign}€ ${(absolute / 1_000_000).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mln`;
  }
  if (absolute >= 1_000) {
    return `${sign}€ ${(absolute / 1_000).toLocaleString("nl-NL", { maximumFractionDigits: 0 })}k`;
  }
  return `${sign}€ ${absolute.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}`;
}

function applySheetStyles(
  sheet: import("xlsx").WorkSheet,
  rowCount: number,
  columnCount: number,
  rows: FinancialStatementRow[],
  dataStartRow: number,
) {
  setRowStyle(sheet, 0, columnCount, titleStyle());
  setRowStyle(sheet, 1, columnCount, metadataStyle());
  setRowStyle(sheet, 2, columnCount, metadataStyle());
  setRowStyle(sheet, 4, columnCount, headerStyle());
  setRowStyle(sheet, 5, columnCount, headerStyle());
  for (let row = dataStartRow; row < rowCount; row += 1) {
    const statementRow = rows[row - dataStartRow];
    if (statementRow?.kind === "result") setRowStyle(sheet, row, columnCount, resultStyle());
    else if (statementRow?.kind !== "normal") setRowStyle(sheet, row, columnCount, subtotalStyle());
    for (let column = 2; column < columnCount; column += 1) {
      const cell = sheet[cellAddress(row, column)];
      if (!cell) continue;
      cell.z =
        statementRow?.valueFormat === "percentage"
          ? '0.0"%";[Red](0.0"%");-'
          : "€ #,##0;[Red](€ #,##0);-";
    }
  }
}

function applyInputSheetStyles(
  sheet: import("xlsx").WorkSheet,
  rowCount: number,
  columnCount: number,
  headerRow: number,
) {
  setRowStyle(sheet, 0, columnCount, titleStyle());
  setRowStyle(sheet, 1, columnCount, metadataStyle());
  setRowStyle(sheet, headerRow - 1, columnCount, headerStyle());
  for (let row = headerRow; row < rowCount; row += 1) {
    if ((row - headerRow) % 2 === 1) {
      setRowStyle(sheet, row, columnCount, {
        fill: { fgColor: { rgb: "FCF8F4" } },
      });
    }
    for (let column = 4; column < columnCount; column += 1) {
      const cell = sheet[cellAddress(row, column)];
      if (cell) cell.z = "€ #,##0;[Red](€ #,##0);-";
    }
  }
}

function setRowStyle(
  sheet: import("xlsx").WorkSheet,
  row: number,
  columnCount: number,
  style: import("xlsx").CellStyle,
) {
  for (let column = 0; column < columnCount; column += 1) {
    const cell = sheet[cellAddress(row, column)];
    if (cell) cell.s = style;
  }
}

function titleStyle(): import("xlsx").CellStyle {
  return {
    fill: { fgColor: { rgb: COLORS.charcoal } },
    font: { name: "Cambria", sz: 18, bold: true, color: { rgb: COLORS.white } },
    alignment: { vertical: "center" },
  };
}

function metadataStyle(): import("xlsx").CellStyle {
  return {
    fill: { fgColor: { rgb: COLORS.cream } },
    font: { name: "Calibri", sz: 10, color: { rgb: COLORS.gray } },
  };
}

function headerStyle(): import("xlsx").CellStyle {
  return {
    fill: { fgColor: { rgb: COLORS.charcoal } },
    font: { name: "Calibri", sz: 10, bold: true, color: { rgb: COLORS.white } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      bottom: { style: "thin", color: { rgb: COLORS.line } },
    },
  };
}

function subtotalStyle(): import("xlsx").CellStyle {
  return {
    fill: { fgColor: { rgb: COLORS.pinkLight } },
    font: { name: "Calibri", bold: true, color: { rgb: COLORS.charcoal } },
    border: {
      top: { style: "thin", color: { rgb: COLORS.pink } },
    },
  };
}

function resultStyle(): import("xlsx").CellStyle {
  return {
    fill: { fgColor: { rgb: COLORS.charcoal } },
    font: { name: "Calibri", bold: true, color: { rgb: COLORS.white } },
    border: {
      top: { style: "medium", color: { rgb: COLORS.pink } },
    },
  };
}

function excelNumberFormat(format: FinancialInputRow["numberFormat"]) {
  if (format === "percentage") return "0.0%;[Red](0.0%);-";
  if (format === "integer") return "#,##0";
  if (format === "decimal") return "#,##0.00";
  return "€ #,##0;[Red](€ #,##0);-";
}

function setSheetFreeze(sheet: import("xlsx").WorkSheet, row: number, column: number) {
  const withFreeze = sheet as import("xlsx").WorkSheet & {
    "!freeze"?: { xSplit: number; ySplit: number; topLeftCell: string; activePane: string };
  };
  withFreeze["!freeze"] = {
    xSplit: column,
    ySplit: row,
    topLeftCell: cellAddress(row, column),
    activePane: "bottomRight",
  };
}

function cellAddress(row: number, column: number) {
  return `${columnName(column + 1)}${row + 1}`;
}

function columnName(columnNumber: number) {
  let result = "";
  let current = columnNumber;
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function sumRecord(values: Record<string, number>, months: string[]) {
  return months.reduce((sum, period) => sum + finiteNumber(values[period]), 0);
}

function formatPeriod(period: string) {
  const [year, rawMonth] = period.split("-");
  const date = new Date(Number(year), Number(rawMonth) - 1, 1);
  return date.toLocaleDateString("nl-NL", { month: "short", year: "numeric" });
}

function formatPeriodShort(period: string) {
  const [year, rawMonth] = period.split("-");
  const date = new Date(Number(year), Number(rawMonth) - 1, 1);
  return date.toLocaleDateString("nl-NL", { month: "short", year: "2-digit" });
}

function formatDateNl(date: Date) {
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
