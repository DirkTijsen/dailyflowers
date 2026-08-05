import dailyFlowersLogoUrl from "@/assets/daily-flowers-logo.png";

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
  aggregation?: "sum" | "opening" | "ending" | "max";
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

export type BankExportRow = {
  key: string;
  label: string;
  section: string;
  level: number;
  kind: "normal" | "heading" | "subtotal" | "result";
  actual: Record<string, number>;
  budget: Record<string, number>;
  projection?: Record<string, number>;
  aggregation?: "sum" | "opening" | "ending" | "max";
};

export type BankExportData = {
  reportYear: string;
  nextYear: string;
  actualThroughMonth: string;
  months: string[];
  profitLossRows: BankExportRow[];
  detailedProfitLossRows: BankExportRow[];
  cashflowRows: BankExportRow[];
  sourceSheets: BankSourceSheet[];
  afsScenario2027?: BankAfsScenarioData;
  investmentAgenda?: BankInvestmentAgendaData;
};

export type BankSourceSheet = {
  name: string;
  title: string;
  description: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
  numericColumns?: number[];
};

export type BankAfsScenarioData = {
  year: string;
  machineCount: number;
  marginPercentage: number;
  scenarioRows: Array<{
    key: string;
    label: string;
    withoutMachines: number;
    withMachines: number;
    difference: number;
  }>;
  unitEconomicsRows: Array<{
    key: string;
    label: string;
    total: number;
    perMachine: number;
  }>;
  outlook2028: {
    machineCount: number;
    monthlyRevenuePerMachine: number;
    marginPercentage: number;
    unitEconomicsRows: Array<{
      key: string;
      label: string;
      total: number;
      perMachine: number;
    }>;
  };
};

export type BankInvestmentAgendaData = {
  rows: Array<{
    deliveryPeriod: string;
    paymentPeriod: string;
    basis: "Actual" | "Budget";
    blockLabel: string;
    machineCount: number;
    amountPerMachine: number;
    totalInvestment: number;
  }>;
  totalMachines: number;
  totalInvestment: number;
  cashflowForecastInvestment: number;
  difference: number;
  timingDifference: number;
};

const METRIC_LABELS: Record<FinancialMetricColumn, string> = {
  actual: "Actueel",
  budget: "Budget",
  variance: "Verschil",
};

const COLORS = {
  charcoal: "1F1F1F",
  cream: "F9F1E8",
  pink: "DEA5A4",
  pinkLight: "EADCD6",
  red: "DEA5A4",
  white: "FFFFFF",
  gray: "6B6B6B",
  line: "EADCD6",
};

const BANK_WORKBOOK_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="€ #,##0;[Red](€ #,##0);-"/>
  </numFmts>
  <fonts count="7">
    <font><sz val="11"/><color rgb="FF1F1F1F"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Cambria"/><family val="1"/></font>
    <font><sz val="10"/><color rgb="FF6B6B6B"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF1F1F1F"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><sz val="11"/><color rgb="FF0000FF"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F1F1F"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF9F1E8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEADCD6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDEA5A4"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top style="thin"><color rgb="FFDEA5A4"/></top><bottom/><diagonal/></border>
    <border><left/><right/><top style="medium"><color rgb="FFDEA5A4"/></top><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="12">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="5" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="4" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="164" fontId="5" fillId="2" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="164" fontId="6" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/>
</styleSheet>`;

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

export async function exportBankWorkbook(data: BankExportData) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    buildBankSummarySheet(
      XLSX,
      data,
      data.profitLossRows,
      "W&V compact",
      "Model W&V",
      data.detailedProfitLossRows,
    ),
    "W&V compact",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    buildBankMonthlySheet(
      XLSX,
      data,
      data.profitLossRows,
      "W&V per maand",
      "Model W&V",
      data.detailedProfitLossRows,
    ),
    "W&V per maand",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    buildBankMonthlySheet(
      XLSX,
      data,
      data.cashflowRows,
      "Cashflow per maand",
      "Model Cashflow",
      data.cashflowRows,
    ),
    "Cashflow per maand",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    buildBankSummarySheet(
      XLSX,
      data,
      data.cashflowRows,
      "Cashflow samenvatting",
      "Model Cashflow",
      data.cashflowRows,
    ),
    "Cashflow samenvatting",
  );
  if (data.afsScenario2027) {
    XLSX.utils.book_append_sheet(
      workbook,
      buildBankAfsScenarioSheet(XLSX, data.afsScenario2027),
      `AFS cases ${data.afsScenario2027.year}`,
    );
  }
  if (data.investmentAgenda) {
    XLSX.utils.book_append_sheet(
      workbook,
      buildBankInvestmentAgendaSheet(XLSX, data.investmentAgenda),
      "Investeringsagenda",
    );
  }
  XLSX.utils.book_append_sheet(workbook, buildBankSettingsSheet(XLSX, data), "Model instellingen");
  XLSX.utils.book_append_sheet(
    workbook,
    buildBankModelSheet(XLSX, data, data.detailedProfitLossRows, "Model W&V"),
    "Model W&V",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    buildBankModelSheet(XLSX, data, data.cashflowRows, "Model Cashflow"),
    "Model Cashflow",
  );
  for (const sourceSheet of data.sourceSheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      buildBankSourceSheet(XLSX, sourceSheet),
      safeSheetName(sourceSheet.name),
    );
  }
  XLSX.utils.book_append_sheet(workbook, buildBankChecksSheet(XLSX, data), "Checks");

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `Daily Flowers bankrapportage ${data.reportYear}-${data.nextYear} ${stamp}.xlsx`;
  const rawWorkbook = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    cellStyles: true,
  });
  const styledWorkbook = await styleBankWorkbook(rawWorkbook, data);
  downloadExcelFile(styledWorkbook, fileName);
}

async function styleBankWorkbook(rawWorkbook: ArrayBuffer, data: BankExportData) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(rawWorkbook);
  zip.file("xl/styles.xml", BANK_WORKBOOK_STYLES);
  const sheetRows = [
    data.profitLossRows,
    data.profitLossRows,
    data.cashflowRows,
    data.cashflowRows,
  ];

  for (let sheetNumber = 1; sheetNumber <= sheetRows.length; sheetNumber += 1) {
    const path = `xl/worksheets/sheet${sheetNumber}.xml`;
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async("string");
    zip.file(
      path,
      applyBankWorkbookXmlStyles(
        xml,
        sheetRows[sheetNumber - 1],
        sheetNumber === 2 || sheetNumber === 3,
        data,
      ),
    );
  }
  if (data.afsScenario2027) {
    const path = "xl/worksheets/sheet5.xml";
    const file = zip.file(path);
    if (file) {
      const xml = await file.async("string");
      zip.file(path, applyBankScenarioXmlStyles(xml, data.afsScenario2027));
    }
  }
  const investmentAgendaSheetNumber = 5 + (data.afsScenario2027 ? 1 : 0);
  const settingsSheetNumber = investmentAgendaSheetNumber + (data.investmentAgenda ? 1 : 0);
  const supportSheets: Array<{
    sheetNumber: number;
    kind: "settings" | "model" | "source" | "checks";
    numericColumns?: number[];
  }> = [
    ...(data.investmentAgenda
      ? [
          {
            sheetNumber: investmentAgendaSheetNumber,
            kind: "source" as const,
            numericColumns: [4, 5, 6],
          },
        ]
      : []),
    { sheetNumber: settingsSheetNumber, kind: "settings" },
    { sheetNumber: settingsSheetNumber + 1, kind: "model" },
    { sheetNumber: settingsSheetNumber + 2, kind: "model" },
    ...data.sourceSheets.map((source, index) => ({
      sheetNumber: settingsSheetNumber + 3 + index,
      kind: "source" as const,
      numericColumns: source.numericColumns,
    })),
    {
      sheetNumber: settingsSheetNumber + 3 + data.sourceSheets.length,
      kind: "checks",
    },
  ];
  for (const support of supportSheets) {
    const path = `xl/worksheets/sheet${support.sheetNumber}.xml`;
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async("string");
    zip.file(
      path,
      applyBankSupportSheetXmlStyles(xml, support.kind, data, support.numericColumns ?? []),
    );
  }
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

function applyBankSupportSheetXmlStyles(
  xml: string,
  kind: "settings" | "model" | "source" | "checks",
  data: BankExportData,
  numericColumns: number[],
) {
  return xml
    .replace(
      /<c r="([A-Z]+)(\d+)"(?: s="\d+")?/g,
      (match, columnLetters: string, rawRow: string) => {
        const row = Number(rawRow);
        const column = excelColumnNumber(columnLetters);
        let style = 0;
        if (row === 1) style = 2;
        else if (row === 2 || row === 3) style = 3;
        else if (
          (kind === "settings" && row === 4) ||
          ((kind === "model" || kind === "source") && row === 5) ||
          (kind === "checks" && row === 6)
        ) {
          style = 4;
        } else if (kind === "settings" && row >= 5 && column === 2) {
          style = 11;
        } else if (kind === "model" && row >= 6) {
          const firstNumericColumn = 5;
          const lastInputColumn = 4 + data.months.length * 2;
          style =
            column >= firstNumericColumn && column <= lastInputColumn
              ? 10
              : column > lastInputColumn
                ? 1
                : 0;
        } else if (kind === "source" && row >= 6 && numericColumns.includes(column - 1)) {
          style = 11;
        } else if (kind === "checks" && row >= 7 && column >= 2 && column <= 5) {
          style = 0;
        }
        return `${match.replace(/ s="\d+"/, "")} s="${style}"`;
      },
    )
    .replace(/<sheetView([^>]*)>/, (_match, attributes: string) => {
      const selfClosing = /\/\s*$/.test(attributes);
      const cleanAttributes = attributes.replace(/\s+showGridLines="\d"/, "").replace(/\/\s*$/, "");
      return `<sheetView${cleanAttributes} showGridLines="0"${selfClosing ? "/" : ""}>`;
    });
}

function applyBankScenarioXmlStyles(xml: string, data: BankAfsScenarioData) {
  const visibleUnitEconomicsRows = data.unitEconomicsRows.filter(
    (row) => row.key !== "marketing" && row.key !== "result-impact",
  );
  const unitHeaderRow = 10 + data.scenarioRows.length;
  const contributionRow = unitHeaderRow + visibleUnitEconomicsRows.length;
  const outlookHeaderRow = contributionRow + 2;
  const outlookContributionRow = outlookHeaderRow + data.outlook2028.unitEconomicsRows.length;
  const highlightedScenarioRows = new Set(
    data.scenarioRows.flatMap((row, index) =>
      row.key === "result" || row.key === "closing-cash" ? [6 + index] : [],
    ),
  );
  const styled = xml.replace(
    /<c r="([A-Z]+)(\d+)"(?: s="\d+")?/g,
    (match, columnLetters: string, rawRow: string) => {
      const rowNumber = Number(rawRow);
      const column = excelColumnNumber(columnLetters);
      let style = 0;
      if (rowNumber === 1) style = 2;
      else if (rowNumber === 2 || rowNumber === 3) style = 3;
      else if (rowNumber === 5 || rowNumber === unitHeaderRow || rowNumber === outlookHeaderRow) {
        style = column === 3 ? 7 : 4;
      } else if (rowNumber >= 6) {
        const isResult =
          highlightedScenarioRows.has(rowNumber) ||
          rowNumber === contributionRow ||
          rowNumber === outlookContributionRow;
        style = isResult ? (column >= 2 ? 9 : 6) : column >= 2 ? 1 : 0;
      }
      return `${match.replace(/ s="\d+"/, "")} s="${style}"`;
    },
  );
  return styled
    .replace(/<sheetView([^>]*)>/, (_match, attributes: string) => {
      const selfClosing = /\/\s*$/.test(attributes);
      const cleanAttributes = attributes.replace(/\s+showGridLines="\d"/, "").replace(/\/\s*$/, "");
      return `<sheetView${cleanAttributes} showGridLines="0"${selfClosing ? "/" : ""}>`;
    })
    .replace(/<pageMargins\b[^>]*\/>/g, "")
    .replace(/<pageSetup\b[^>]*\/>/g, "")
    .replace(
      "</worksheet>",
      '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1"/></worksheet>',
    );
}

function applyBankWorkbookXmlStyles(
  xml: string,
  rows: BankExportRow[],
  monthly: boolean,
  data: BankExportData,
) {
  const cutoffColumn = 2 + Number(data.actualThroughMonth);
  const styled = xml.replace(
    /<c r="([A-Z]+)(\d+)"(?: s="\d+")?/g,
    (match, columnLetters: string, rawRow: string) => {
      const rowNumber = Number(rawRow);
      const column = excelColumnNumber(columnLetters);
      let style = 0;
      if (rowNumber === 1) style = 2;
      else if (rowNumber === 2 || rowNumber === 3) style = 3;
      else if (rowNumber === 5) {
        const forecastHeader = monthly
          ? column > cutoffColumn && column <= 26
          : column === 6 || column === 9;
        style = forecastHeader ? 7 : 4;
      } else if (rowNumber >= 6) {
        const row = rows[rowNumber - 6];
        const numeric = column >= 3;
        if (row?.kind === "result") style = numeric ? 9 : 6;
        else if (row?.kind !== "normal") style = numeric ? 8 : 5;
        else style = numeric ? 1 : 0;
      }
      return `${match.replace(/ s="\d+"/, "")} s="${style}"`;
    },
  );
  return styled
    .replace(/<sheetView([^>]*)>/, (_match, attributes: string) => {
      const selfClosing = /\/\s*$/.test(attributes);
      const cleanAttributes = attributes.replace(/\s+showGridLines="\d"/, "").replace(/\/\s*$/, "");
      return `<sheetView${cleanAttributes} showGridLines="0"${selfClosing ? "/" : ""}>`;
    })
    .replace(/<pageMargins\b[^>]*\/>/g, "")
    .replace(/<pageSetup\b[^>]*\/>/g, "")
    .replace(
      "</worksheet>",
      '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>',
    );
}

function downloadExcelFile(content: ArrayBuffer, fileName: string) {
  const blob = new Blob([content], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function excelColumnNumber(columnLetters: string) {
  return [...columnLetters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
}

async function imageUrlToDataUri(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Daily Flowers-logo kon niet worden geladen");
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Logo kon niet worden ingelezen"));
    reader.readAsDataURL(blob);
  });
}

export async function exportFinancialPresentation(data: FinancialExportData) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const logoData = await imageUrlToDataUri(dailyFlowersLogoUrl);
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
  cover.background = { color: COLORS.white };
  cover.addImage({
    data: logoData,
    x: 0.62,
    y: 0.32,
    w: 2.75,
    h: 0.92,
  });
  cover.addText("FINANCIEEL OVERZICHT", {
    x: 0.7,
    y: 2.15,
    w: 8.5,
    h: 0.7,
    fontFace: "Cambria",
    fontSize: 31,
    bold: true,
    color: COLORS.charcoal,
    margin: 0,
  });
  cover.addText("W&V en cashflow", {
    x: 0.7,
    y: 2.85,
    w: 7.5,
    h: 0.55,
    fontFace: "Cambria",
    fontSize: 25,
    color: COLORS.charcoal,
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
    logoData,
    title: "W&V — resultaat en belangrijkste kostendrijvers",
    rows: selectPlPresentationRows(data.plRows),
    trendRow: data.plRows.find((row) => row.key === "result") ?? data.plRows.at(-1),
    data,
    chartTitle: "Resultaatontwikkeling",
    slideNumber: 2,
  });

  addStatementSlide({
    pptx,
    logoData,
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

function buildBankSummarySheet(
  XLSX: typeof import("xlsx"),
  data: BankExportData,
  rows: BankExportRow[],
  sheetTitle: string,
  modelSheetName: string,
  modelRows: BankExportRow[],
) {
  const actualThroughPeriod = `${data.reportYear}-${data.actualThroughMonth}`;
  const actualThroughLabel = formatPeriod(actualThroughPeriod);
  const matrix: Array<Array<string | number | null>> = [
    [`Daily Flowers — ${sheetTitle}`],
    [`Actuals t/m ${actualThroughLabel}; daarna budget. ${data.nextYear} volledig budget.`],
    ["Bedragen in euro · vertrouwelijk · gegenereerd voor bankrapportage"],
    [],
    [
      "Rubriek",
      "Regel",
      `Actual t/m ${actualThroughLabel}`,
      `Budget t/m ${actualThroughLabel}`,
      `Budget restant ${data.reportYear}`,
      `Prognose ${data.reportYear}`,
      `Budget ${data.reportYear}`,
      "Verschil",
      `Budget ${data.nextYear}`,
    ],
  ];

  for (const row of rows) {
    const values = bankSummaryValues(row, data);
    matrix.push([
      row.level === 0 ? row.section : "",
      `${row.level > 0 ? "  ".repeat(row.level) : ""}${row.label}`,
      values.actualYtd,
      values.budgetYtd,
      values.budgetRemainder,
      values.forecast,
      values.yearBudget,
      values.variance,
      values.nextYearBudget,
    ]);
  }

  const columnCount = 9;
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columnCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columnCount - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: columnCount - 1 } },
  ];
  sheet["!cols"] = [
    { wch: 25 },
    { wch: 42 },
    ...Array.from({ length: columnCount - 2 }, () => ({ wch: 17 })),
  ];
  sheet["!rows"] = [{ hpt: 30 }, { hpt: 20 }, { hpt: 18 }, { hpt: 8 }, { hpt: 30 }];
  sheet["!autofilter"] = { ref: `A5:I${matrix.length}` };
  setSheetFreeze(sheet, 5, 2);
  setBankPrintLayout(sheet);
  applyBankSheetStyles(sheet, rows, 5, columnCount);
  const modelRowByKey = new Map(modelRows.map((row, index) => [row.key, 6 + index]));
  rows.forEach((row, index) => {
    const outputRow = 6 + index;
    const modelRow = modelRowByKey.get(row.key);
    if (!modelRow) return;
    const values = bankSummaryValues(row, data);
    const reportPeriods = yearPeriodsForExport(data.reportYear);
    const cutoff = `${data.reportYear}-${data.actualThroughMonth}`;
    const actualPeriods = reportPeriods.filter((period) => period <= cutoff);
    const remainingPeriods = reportPeriods.filter((period) => period > cutoff);
    const formulas = [
      modelAggregateFormula(
        modelSheetName,
        modelRow,
        data,
        "actual",
        actualPeriods,
        row.aggregation,
      ),
      modelAggregateFormula(
        modelSheetName,
        modelRow,
        data,
        "budget",
        actualPeriods,
        row.aggregation,
      ),
      modelAggregateFormula(
        modelSheetName,
        modelRow,
        data,
        "budget",
        remainingPeriods,
        row.aggregation,
      ),
      modelAggregateFormula(
        modelSheetName,
        modelRow,
        data,
        "projection",
        reportPeriods,
        row.aggregation,
      ),
      modelAggregateFormula(
        modelSheetName,
        modelRow,
        data,
        "budget",
        reportPeriods,
        row.aggregation,
      ),
      `=F${outputRow}-G${outputRow}`,
      modelAggregateFormula(
        modelSheetName,
        modelRow,
        data,
        "budget",
        yearPeriodsForExport(data.nextYear),
        row.aggregation,
      ),
    ];
    const cached = [
      values.actualYtd,
      values.budgetYtd,
      values.budgetRemainder,
      values.forecast,
      values.yearBudget,
      values.variance,
      values.nextYearBudget,
    ];
    formulas.forEach((formula, formulaIndex) => {
      setFormulaCell(
        sheet,
        XLSX.utils.encode_cell({ r: outputRow - 1, c: 2 + formulaIndex }),
        formula,
        cached[formulaIndex],
      );
    });
  });
  return sheet;
}

function buildBankMonthlySheet(
  XLSX: typeof import("xlsx"),
  data: BankExportData,
  rows: BankExportRow[],
  sheetTitle: string,
  modelSheetName: string,
  modelRows: BankExportRow[],
) {
  const cutoff = `${data.reportYear}-${data.actualThroughMonth}`;
  const matrix: Array<Array<string | number | null>> = [
    [`Daily Flowers — ${sheetTitle}`],
    [
      `Actuals t/m ${formatPeriod(cutoff)}; daarna budget. Maandelijkse doorkijk ${data.reportYear}-${data.nextYear}.`,
    ],
    ["A = actual · B = budget/prognose · bedragen in euro"],
    [],
    [
      "Rubriek",
      "Regel",
      ...data.months.map(
        (period) => `${formatPeriodShort(period)} ${period <= cutoff ? "A" : "B"}`,
      ),
      `Totaal ${data.reportYear}`,
      `Totaal ${data.nextYear}`,
    ],
  ];

  for (const row of rows) {
    const projection = bankProjection(row, data);
    matrix.push([
      row.level === 0 ? row.section : "",
      `${row.level > 0 ? "  ".repeat(row.level) : ""}${row.label}`,
      ...data.months.map((period) => projection[period] ?? 0),
      aggregateBankValues(projection, yearPeriodsForExport(data.reportYear), row.aggregation),
      aggregateBankValues(projection, yearPeriodsForExport(data.nextYear), row.aggregation),
    ]);
  }

  const columnCount = 4 + data.months.length;
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columnCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columnCount - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: columnCount - 1 } },
  ];
  sheet["!cols"] = [
    { wch: 25 },
    { wch: 42 },
    ...Array.from({ length: data.months.length }, () => ({ wch: 13 })),
    { wch: 17 },
    { wch: 17 },
  ];
  sheet["!rows"] = [{ hpt: 30 }, { hpt: 20 }, { hpt: 18 }, { hpt: 8 }, { hpt: 30 }];
  sheet["!autofilter"] = {
    ref: `A5:${columnName(columnCount)}${matrix.length}`,
  };
  setSheetFreeze(sheet, 5, 2);
  setBankPrintLayout(sheet);
  applyBankSheetStyles(sheet, rows, 5, columnCount);

  for (let index = 0; index < data.months.length; index += 1) {
    const period = data.months[index];
    const cell = sheet[cellAddress(4, index + 2)];
    if (!cell) continue;
    cell.s = period <= cutoff ? headerStyle() : bankForecastHeaderStyle();
  }
  const modelRowByKey = new Map(modelRows.map((row, index) => [row.key, 6 + index]));
  rows.forEach((row, index) => {
    const outputRow = 6 + index;
    const modelRow = modelRowByKey.get(row.key);
    if (!modelRow) return;
    const projection = bankProjection(row, data);
    data.months.forEach((period, periodIndex) => {
      const formula = `='${modelSheetName}'!${modelColumnName(data, "projection", period)}${modelRow}`;
      setFormulaCell(
        sheet,
        XLSX.utils.encode_cell({ r: outputRow - 1, c: 2 + periodIndex }),
        formula,
        projection[period] ?? 0,
      );
    });
    const reportYearCell = XLSX.utils.encode_cell({
      r: outputRow - 1,
      c: 2 + data.months.length,
    });
    const nextYearCell = XLSX.utils.encode_cell({
      r: outputRow - 1,
      c: 3 + data.months.length,
    });
    setFormulaCell(
      sheet,
      reportYearCell,
      modelAggregateFormula(
        modelSheetName,
        modelRow,
        data,
        "projection",
        yearPeriodsForExport(data.reportYear),
        row.aggregation,
      ),
      aggregateBankValues(projection, yearPeriodsForExport(data.reportYear), row.aggregation),
    );
    setFormulaCell(
      sheet,
      nextYearCell,
      modelAggregateFormula(
        modelSheetName,
        modelRow,
        data,
        "projection",
        yearPeriodsForExport(data.nextYear),
        row.aggregation,
      ),
      aggregateBankValues(projection, yearPeriodsForExport(data.nextYear), row.aggregation),
    );
  });
  return sheet;
}

function buildBankAfsScenarioSheet(XLSX: typeof import("xlsx"), data: BankAfsScenarioData) {
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
  const matrix: Array<Array<string | number | null>> = [
    [`Daily Flowers — AFS-scenariovergelijking ${data.year}`],
    [
      `W&V met en zonder ${data.machineCount} nieuwe AFS'en, plus gemiddelde unit economics per geplande machine.`,
    ],
    ["Bedragen exclusief btw · rekening houdend met de ingevoerde tranchefasering"],
    [],
    [
      "Scenario-regel",
      `Zonder ${data.machineCount} nieuwe AFS'en`,
      `Met ${data.machineCount} nieuwe AFS'en`,
      "Verschil",
    ],
    ...data.scenarioRows.map((row) => [
      row.label,
      row.withoutMachines,
      row.withMachines,
      row.difference,
    ]),
    [],
    ["Toelichting kasconversie"],
    [
      `${formatCompactEuro(scenarioGrossMargin)} extra brutomarge zonder hogere vaste overhead. In 2027 is tijdelijk ${formatExportPercentage(temporaryMarketingPercentage)} van de extra omzet als marketingbudget opgenomen (${formatCompactEuro(temporaryMarketing)}), waardoor ${formatCompactEuro(operationalCashContribution)} operationele kasbijdrage resteert vóór machine-investeringen en financiering.`,
    ],
    [],
    [
      `Verwachting nieuwe AFS'en ${data.year} — gefaseerde uitrol`,
      `Totaal ${data.machineCount} machines`,
      "Per 1 machine",
      "Marge %",
    ],
    ...visibleUnitEconomicsRows.map((row) => [
      row.label,
      row.total,
      row.perMachine,
      row.key === "contribution" ? formatExportPercentage(data.marginPercentage) : "",
    ]),
    [],
    [
      "Verwachting 2028 — volledig jaar",
      `Totaal ${data.outlook2028.machineCount} machines`,
      "Per 1 machine",
      "Marge %",
    ],
    ...data.outlook2028.unitEconomicsRows.map((row) => [
      row.label,
      row.total,
      row.perMachine,
      row.key === "contribution" ? formatExportPercentage(data.outlook2028.marginPercentage) : "",
    ]),
  ];
  const columnCount = 4;
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columnCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columnCount - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: columnCount - 1 } },
  ];
  sheet["!cols"] = [{ wch: 42 }, { wch: 24 }, { wch: 24 }, { wch: 20 }];
  sheet["!rows"] = [{ hpt: 30 }, { hpt: 20 }, { hpt: 18 }, { hpt: 8 }, { hpt: 30 }];
  setSheetFreeze(sheet, 5, 1);
  setBankPrintLayout(sheet);
  return sheet;
}

function buildBankInvestmentAgendaSheet(
  XLSX: typeof import("xlsx"),
  data: BankInvestmentAgendaData,
) {
  const matrix: Array<Array<string | number | null>> = [
    [`Daily Flowers — Investeringsagenda ${data.totalMachines} AFS`],
    [
      "Leveringsfasering en bijbehorende cash-out. Budgetbetalingen vallen drie maanden vóór de leveringsmaand.",
    ],
    [],
    [
      "Leveringsmaand",
      "Betaalmaand cashflow",
      "Basis",
      "Investeringsblok",
      "Aantal AFS",
      "Investering per AFS",
      "Cash-out investering",
    ],
    ...data.rows.map((row) => [
      row.deliveryPeriod,
      row.paymentPeriod,
      row.basis,
      row.blockLabel,
      row.machineCount,
      row.amountPerMachine,
      row.totalInvestment,
    ]),
    [],
    ["Totaal investeringsagenda", null, null, null, data.totalMachines, null, data.totalInvestment],
    ["Aansluiting cashflowprognose", null, null, null, null, null, data.cashflowForecastInvestment],
    ["Verschil totaal", null, null, null, null, null, data.difference],
    ["Verschil timing", null, null, null, null, null, data.timingDifference],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
  ];
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 21 },
    { wch: 13 },
    { wch: 22 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
  ];
  sheet["!autofilter"] = {
    ref: `A4:G${Math.max(4, 4 + data.rows.length)}`,
  };
  setSheetFreeze(sheet, 4, 2);
  setBankPrintLayout(sheet);
  return sheet;
}

function buildBankSettingsSheet(XLSX: typeof import("xlsx"), data: BankExportData) {
  const cutoff = `${data.reportYear}-${data.actualThroughMonth}`;
  const matrix: Array<Array<string | number | null>> = [
    ["Daily Flowers - modelinstellingen"],
    ["Centrale instellingen waar de formulegedreven bankrapportage naar verwijst."],
    [],
    ["Instelling", "Waarde", "Toelichting"],
    ["Rapportagejaar", data.reportYear, "Jaar met actuals plus resterend budget"],
    ["Opvolgend jaar", data.nextYear, "Volledig budgetjaar"],
    ["Actuals t/m", cutoff, "Vanaf de volgende maand schakelt de prognose over op budget"],
    ["Aantal maanden", data.months.length, "Maandelijkse modelhorizon"],
    ["Valuta", "EUR", "Bedragen exclusief btw tenzij anders vermeld"],
    ["Versie", new Date().toISOString().slice(0, 10), "Exportdatum"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
  ];
  sheet["!cols"] = [{ wch: 25 }, { wch: 22 }, { wch: 64 }];
  setRowStyle(sheet, 0, 3, titleStyle());
  setRowStyle(sheet, 1, 3, metadataStyle());
  setRowStyle(sheet, 3, 3, headerStyle());
  setSheetFreeze(sheet, 4, 1);
  return sheet;
}

function buildBankModelSheet(
  XLSX: typeof import("xlsx"),
  data: BankExportData,
  rows: BankExportRow[],
  title: string,
) {
  const matrix: Array<Array<string | number | null>> = [
    [`Daily Flowers - ${title}`],
    [
      `Formulemodel: actuals t/m ${data.reportYear}-${data.actualThroughMonth}; daarna budget. Pas blauwe actual- en budgetcellen aan om alle rapportbladen door te rekenen.`,
    ],
    [
      "Zwarte projectiecellen zijn formules; groene verwijzingen in de rapportbladen linken hiernaartoe.",
    ],
    [],
    [
      "Rubriek",
      "Sleutel",
      "Regel",
      "Aggregatie",
      ...data.months.map((period) => `${period} Actual`),
      ...data.months.map((period) => `${period} Budget`),
      ...data.months.map((period) => `${period} Prognose`),
    ],
  ];
  for (const row of rows) {
    const projection = bankProjection(row, data);
    matrix.push([
      row.section,
      row.key,
      row.label,
      row.aggregation ?? "sum",
      ...data.months.map((period) => Number(row.actual[period] ?? 0)),
      ...data.months.map((period) => Number(row.budget[period] ?? 0)),
      ...data.months.map((period) => Number(projection[period] ?? 0)),
    ]);
  }

  const columnCount = 4 + data.months.length * 3;
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columnCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columnCount - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: columnCount - 1 } },
  ];
  sheet["!cols"] = [
    { wch: 25 },
    { wch: 30 },
    { wch: 42 },
    { wch: 12 },
    ...Array.from({ length: data.months.length * 3 }, () => ({ wch: 14 })),
  ];
  sheet["!autofilter"] = { ref: `A5:${columnName(columnCount)}${matrix.length}` };
  setSheetFreeze(sheet, 5, 4);
  setBankPrintLayout(sheet);
  setRowStyle(sheet, 0, columnCount, titleStyle());
  setRowStyle(sheet, 1, columnCount, metadataStyle());
  setRowStyle(sheet, 2, columnCount, metadataStyle());
  setRowStyle(sheet, 4, columnCount, headerStyle());

  const modelRowByKey = new Map(rows.map((row, index) => [row.key, 6 + index]));
  rows.forEach((row, rowIndex) => {
    const excelRow = 6 + rowIndex;
    for (let periodIndex = 0; periodIndex < data.months.length; periodIndex += 1) {
      const actualColumn = 4 + periodIndex;
      const budgetColumn = 4 + data.months.length + periodIndex;
      const projectionColumn = 4 + data.months.length * 2 + periodIndex;
      const actualCell = sheet[XLSX.utils.encode_cell({ r: excelRow - 1, c: actualColumn })];
      const budgetCell = sheet[XLSX.utils.encode_cell({ r: excelRow - 1, c: budgetColumn })];
      if (actualCell) {
        actualCell.z = "€ #,##0;[Red](€ #,##0);-";
        actualCell.s = {
          font: { color: { rgb: "0000FF" } },
          numFmt: "€ #,##0;[Red](€ #,##0);-",
        };
      }
      if (budgetCell) {
        budgetCell.z = "€ #,##0;[Red](€ #,##0);-";
        budgetCell.s = {
          font: { color: { rgb: "0000FF" } },
          numFmt: "€ #,##0;[Red](€ #,##0);-",
        };
      }
      const period = data.months[periodIndex];
      const projectionValue = bankProjection(row, data)[period] ?? 0;
      const formula =
        derivedCashflowProjectionFormula(row.key, periodIndex, data, modelRowByKey) ??
        `=IF(${columnName(projectionColumn + 1)}$5<='Model instellingen'!$B$7,${columnName(actualColumn + 1)}${excelRow},${columnName(budgetColumn + 1)}${excelRow})`;
      setFormulaCell(
        sheet,
        XLSX.utils.encode_cell({ r: excelRow - 1, c: projectionColumn }),
        formula,
        projectionValue,
      );
    }
  });
  return sheet;
}

function buildBankSourceSheet(XLSX: typeof import("xlsx"), source: BankSourceSheet) {
  const matrix: Array<Array<string | number | null>> = [
    [`Daily Flowers - ${source.title}`],
    [source.description],
    [
      "Bron-/auditblad. Blauwe waarden zijn invoer; rapportuitkomsten worden berekend op de modelbladen.",
    ],
    [],
    source.headers,
    ...source.rows,
  ];
  const columnCount = Math.max(1, source.headers.length);
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columnCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columnCount - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: columnCount - 1 } },
  ];
  sheet["!cols"] = source.headers.map((header, index) => ({
    wch: source.numericColumns?.includes(index)
      ? 16
      : Math.min(48, Math.max(14, header.length + 4)),
  }));
  sheet["!autofilter"] = { ref: `A5:${columnName(columnCount)}${matrix.length}` };
  setSheetFreeze(sheet, 5, 0);
  setRowStyle(sheet, 0, columnCount, titleStyle());
  setRowStyle(sheet, 1, columnCount, metadataStyle());
  setRowStyle(sheet, 2, columnCount, metadataStyle());
  setRowStyle(sheet, 4, columnCount, headerStyle());
  source.rows.forEach((_row, rowIndex) => {
    for (const column of source.numericColumns ?? []) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 5 + rowIndex, c: column })];
      if (!cell) continue;
      cell.z = "€ #,##0.00;[Red](€ #,##0.00);-";
      cell.s = {
        font: { color: { rgb: "0000FF" } },
        numFmt: "€ #,##0.00;[Red](€ #,##0.00);-",
      };
    }
  });
  return sheet;
}

function buildBankChecksSheet(XLSX: typeof import("xlsx"), data: BankExportData) {
  const missingProfitLossKeys = data.profitLossRows.filter(
    (row) => !data.detailedProfitLossRows.some((detail) => detail.key === row.key),
  ).length;
  const matrix: Array<Array<string | number | null>> = [
    ["Daily Flowers - modelchecks"],
    ["Controleblad voor volledigheid en de aansluiting tussen bronmodel en bankrapport."],
    [],
    ["MODEL STATUS", null, null, null, null, null],
    [],
    ["Controle", "Actueel", "Verwacht", "Verschil", "Tolerantie", "Status"],
    ["Aantal modelmaanden", data.months.length, 24, null, 0, null],
    ["Ontbrekende W&V-sleutels", missingProfitLossKeys, 0, null, 0, null],
    [
      "Rapportagejaren sluiten aan",
      Number(data.nextYear) - Number(data.reportYear),
      1,
      null,
      0,
      null,
    ],
    [
      "Bronbladen aanwezig",
      data.sourceSheets.length,
      Math.max(1, data.sourceSheets.length),
      null,
      0,
      null,
    ],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ];
  sheet["!cols"] = [{ wch: 34 }, ...Array.from({ length: 5 }, () => ({ wch: 16 }))];
  setRowStyle(sheet, 0, 6, titleStyle());
  setRowStyle(sheet, 1, 6, metadataStyle());
  setRowStyle(sheet, 5, 6, headerStyle());
  for (let row = 7; row <= 10; row += 1) {
    setFormulaCell(sheet, `D${row}`, `=B${row}-C${row}`, 0);
    setFormulaCell(sheet, `F${row}`, `=IF(ABS(D${row})<=E${row},"OK","CONTROLEREN")`, "OK", "s");
  }
  setFormulaCell(sheet, "B4", '=IF(COUNTIF(F7:F10,"<>OK")=0,"PASS","FAIL")', "PASS", "s");
  return sheet;
}

function bankSummaryValues(row: BankExportRow, data: BankExportData) {
  const reportPeriods = yearPeriodsForExport(data.reportYear);
  const cutoff = `${data.reportYear}-${data.actualThroughMonth}`;
  const actualPeriods = reportPeriods.filter((period) => period <= cutoff);
  const remainingPeriods = reportPeriods.filter((period) => period > cutoff);
  const projection = bankProjection(row, data);
  const actualYtd = aggregateBankValues(row.actual, actualPeriods, row.aggregation);
  const budgetYtd = aggregateBankValues(row.budget, actualPeriods, row.aggregation);
  const budgetRemainder = aggregateBankValues(row.budget, remainingPeriods, row.aggregation);
  const forecast = aggregateBankValues(projection, reportPeriods, row.aggregation);
  const yearBudget = aggregateBankValues(row.budget, reportPeriods, row.aggregation);
  return {
    actualYtd,
    budgetYtd,
    budgetRemainder,
    forecast,
    yearBudget,
    variance: forecast - yearBudget,
    nextYearBudget: aggregateBankValues(
      row.budget,
      yearPeriodsForExport(data.nextYear),
      row.aggregation,
    ),
  };
}

function bankProjection(row: BankExportRow, data: BankExportData) {
  if (row.projection) return row.projection;
  const cutoff = `${data.reportYear}-${data.actualThroughMonth}`;
  return Object.fromEntries(
    data.months.map((period) => [
      period,
      period <= cutoff ? Number(row.actual[period] ?? 0) : Number(row.budget[period] ?? 0),
    ]),
  );
}

function modelColumnName(
  data: BankExportData,
  block: "actual" | "budget" | "projection",
  period: string,
) {
  const periodIndex = data.months.indexOf(period);
  if (periodIndex < 0) throw new Error(`Periode ${period} ontbreekt in het bankmodel`);
  const blockOffset = block === "actual" ? 0 : block === "budget" ? 1 : 2;
  return columnName(5 + blockOffset * data.months.length + periodIndex);
}

function modelAggregateFormula(
  sheetName: string,
  modelRow: number,
  data: BankExportData,
  block: "actual" | "budget" | "projection",
  periods: string[],
  aggregation: BankExportRow["aggregation"] = "sum",
) {
  if (periods.length === 0) return "=0";
  const first = `'${sheetName}'!${modelColumnName(data, block, periods[0])}${modelRow}`;
  const last = `'${sheetName}'!${modelColumnName(data, block, periods.at(-1)!)}${modelRow}`;
  if (aggregation === "opening") return `=${first}`;
  if (aggregation === "ending") return `=${last}`;
  if (aggregation === "max") return `=MAX(0,${first}:${last.split("!")[1]})`;
  return `=SUM(${first}:${last.split("!")[1]})`;
}

function derivedCashflowProjectionFormula(
  key: string,
  periodIndex: number,
  data: BankExportData,
  rowByKey: Map<string, number>,
) {
  const period = data.months[periodIndex];
  const column = modelColumnName(data, "projection", period);
  const cell = (rowKey: string, cellColumn = column) => {
    const row = rowByKey.get(rowKey);
    return row ? `${cellColumn}${row}` : "0";
  };
  const sumRows = (keys: string[]) => `SUM(${keys.map((rowKey) => cell(rowKey)).join(",")})`;

  if (key === "opening-cash-balance") {
    const sourceBlock =
      period <= `${data.reportYear}-${data.actualThroughMonth}` ? "actual" : "budget";
    const sourceOpening = cell(key, modelColumnName(data, sourceBlock, period));
    const previousPeriod = data.months[periodIndex - 1];
    if (!previousPeriod) return `=${sourceOpening}`;

    const previousSourceBlock =
      previousPeriod <= `${data.reportYear}-${data.actualThroughMonth}` ? "actual" : "budget";
    const previousProjectionColumn = modelColumnName(data, "projection", previousPeriod);
    const previousProjectionClosing = cell("closing-cash-balance", previousProjectionColumn);
    if (sourceBlock !== previousSourceBlock) return `=${previousProjectionClosing}`;

    const previousSourceClosing = cell(
      "closing-cash-balance",
      modelColumnName(data, previousSourceBlock, previousPeriod),
    );
    return `=IF(ABS(${sourceOpening}-${previousSourceClosing})>=0.005,${sourceOpening},${previousProjectionClosing})`;
  }
  if (key === "closing-cash-balance") {
    return `=${cell("opening-cash-balance")}+${cell("net-cashflow")}`;
  }

  if (key === "cash-need-heading") return "=0";
  if (key === "cash-before-funding") {
    return `=${sumRows([
      "operating-result",
      "investment-total",
      "debt_loans_repaid",
      "debt_interest_paid",
      "debt_interest_received",
      "equity_dividend_paid",
    ])}`;
  }
  if (key === "planned-funding") {
    return `=${sumRows(["debt_loans_received", "equity_shareholder_contributions"])}`;
  }
  if (key === "cumulative-before-funding") {
    const previousPeriod = data.months[periodIndex - 1];
    const previousColumn = previousPeriod
      ? modelColumnName(data, "projection", previousPeriod)
      : column;
    const base =
      periodIndex === 0
        ? cell("opening-cash-balance")
        : cell("cumulative-before-funding", previousColumn);
    return `=${base}+${cell("cash-before-funding")}`;
  }
  if (key === "funding-need") return `=MAX(0,-${cell("cumulative-before-funding")})`;
  if (key === "cumulative-after-funding") return `=${cell("closing-cash-balance")}`;
  if (key === "additional-cash-need") {
    return `=MAX(0,-${cell("cumulative-after-funding")})`;
  }
  return null;
}

function setFormulaCell(
  sheet: import("xlsx").WorkSheet,
  address: string,
  formula: string,
  cachedValue: string | number,
  type: "n" | "s" = "n",
) {
  sheet[address] = {
    t: type,
    f: formula.replace(/^=/, ""),
    v: cachedValue,
    z: type === "n" ? "€ #,##0;[Red](€ #,##0);-" : undefined,
  };
}

function safeSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Brondata";
}

function aggregateBankValues(
  values: Record<string, number>,
  periods: string[],
  aggregation: BankExportRow["aggregation"] = "sum",
) {
  if (periods.length === 0) return 0;
  if (aggregation === "opening") return Number(values[periods[0]] ?? 0);
  if (aggregation === "ending") return Number(values[periods.at(-1)!] ?? 0);
  if (aggregation === "max") {
    return Math.max(0, ...periods.map((period) => Number(values[period] ?? 0)));
  }
  return periods.reduce((sum, period) => sum + Number(values[period] ?? 0), 0);
}

function yearPeriodsForExport(year: string) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function setBankPrintLayout(sheet: import("xlsx").WorkSheet) {
  const printableSheet = sheet as import("xlsx").WorkSheet & {
    "!pageSetup"?: Record<string, unknown>;
    "!margins"?: Record<string, number>;
  };
  printableSheet["!pageSetup"] = {
    orientation: "landscape",
    paperSize: 9,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  printableSheet["!margins"] = {
    left: 0.25,
    right: 0.25,
    top: 0.5,
    bottom: 0.5,
    header: 0.2,
    footer: 0.2,
  };
}

function applyBankSheetStyles(
  sheet: import("xlsx").WorkSheet,
  rows: BankExportRow[],
  dataStartRow: number,
  columnCount: number,
) {
  setRowStyle(sheet, 0, columnCount, titleStyle());
  setRowStyle(sheet, 1, columnCount, metadataStyle());
  setRowStyle(sheet, 2, columnCount, metadataStyle());
  setRowStyle(sheet, 4, columnCount, headerStyle());
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const sheetRow = dataStartRow + rowIndex;
    if (row.kind === "result") setRowStyle(sheet, sheetRow, columnCount, resultStyle());
    else if (row.kind !== "normal") setRowStyle(sheet, sheetRow, columnCount, subtotalStyle());
    for (let column = 2; column < columnCount; column += 1) {
      const cell = sheet[cellAddress(sheetRow, column)];
      if (cell) cell.z = "€ #,##0;[Red](€ #,##0);-";
    }
  }
}

function bankForecastHeaderStyle(): import("xlsx").CellStyle {
  return {
    ...headerStyle(),
    fill: { fgColor: { rgb: COLORS.red } },
  };
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
  logoData,
  title,
  rows,
  trendRow,
  data,
  chartTitle,
  slideNumber,
}: {
  pptx: InstanceType<(typeof import("pptxgenjs"))["default"]>;
  logoData: string;
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
    w: 9.45,
    h: 0.52,
    fontFace: "Cambria",
    fontSize: 25,
    bold: true,
    color: COLORS.charcoal,
    margin: 0,
  });
  slide.addImage({
    data: logoData,
    x: 10.38,
    y: 0.12,
    w: 2.42,
    h: 0.81,
  });
  slide.addText(data.selectionLabel.toUpperCase(), {
    x: 10.25,
    y: 0.91,
    w: 2.5,
    h: 0.16,
    fontFace: "Calibri",
    fontSize: 8,
    bold: true,
    color: COLORS.gray,
    align: "right",
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
      chartColors: [COLORS.charcoal, COLORS.gray, COLORS.pink],
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
    "opening-cash-balance",
    "operating-result",
    "investment-afs-total",
    "investment_office_property",
    "investment_other_fixed_assets",
    "investment-total",
    "debt_loans_received",
    "debt_loans_repaid",
    "financing-total",
    "net-cashflow",
    "closing-cash-balance",
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
  if (months.length > 0 && row.aggregation === "opening") {
    return statementMetricValue(row, months[0], column);
  }
  if (months.length > 0 && row.aggregation === "ending") {
    return statementMetricValue(row, months.at(-1)!, column);
  }
  if (row.aggregation === "max") {
    return Math.max(0, ...months.map((period) => statementMetricValue(row, period, column)));
  }
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

function formatExportPercentage(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%`;
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
