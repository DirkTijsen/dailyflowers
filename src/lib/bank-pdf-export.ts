export type BankReportView = "profit-loss" | "cashflow" | "scenario" | "investment-agenda";

const PAGE_WIDTH_MM = 297;
const PAGE_HEIGHT_MM = 210;
const PAGE_MARGIN_MM = 7;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2;
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - PAGE_MARGIN_MM * 2 - 5;
const CAPTURE_PAGE_WIDTH_PX = 1440;
const SINGLE_PAGE_OVERFLOW_TOLERANCE = 1.2;

export async function exportBankReportPdf({
  views,
  fileName,
}: {
  views: BankReportView[];
  fileName: string;
}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);
  await document.fonts?.ready;

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  let hasPage = false;

  for (const view of views) {
    const source = document.querySelector<HTMLElement>(
      `.bank-report-sheet[data-bank-report-view="${view}"]`,
    );
    if (!source) continue;

    const clone = source.cloneNode(true) as HTMLElement;
    const sourceWidths = [
      source.scrollWidth,
      ...Array.from(source.querySelectorAll<HTMLElement>("*")).map(
        (element) => element.scrollWidth,
      ),
    ];
    const captureWidth = Math.max(
      CAPTURE_PAGE_WIDTH_PX,
      view === "cashflow" ? 3200 : 0,
      Math.min(4200, ...sourceWidths),
    );
    preparePdfClone(clone, captureWidth);

    const host = document.createElement("div");
    host.className = "bank-report-pdf-host";
    host.style.width = `${captureWidth}px`;
    host.appendChild(clone);
    document.body.appendChild(host);

    try {
      const canvas = await html2canvas(clone, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        width: captureWidth,
        height: clone.scrollHeight,
        windowWidth: captureWidth,
        windowHeight: clone.scrollHeight,
        ignoreElements: (element) => element.classList.contains("bank-report-no-print"),
      });
      const fullRenderedHeight = (canvas.height / canvas.width) * CONTENT_WIDTH_MM;
      const fitsWithSmallReduction =
        fullRenderedHeight <= CONTENT_HEIGHT_MM * SINGLE_PAGE_OVERFLOW_TOLERANCE;
      const sliceHeight = fitsWithSmallReduction
        ? canvas.height
        : Math.floor(canvas.width * (CONTENT_HEIGHT_MM / CONTENT_WIDTH_MM));

      for (let top = 0; top < canvas.height; top += sliceHeight) {
        if (hasPage) pdf.addPage("a4", "landscape");
        hasPage = true;

        const height = Math.min(sliceHeight, canvas.height - top);
        const tile = document.createElement("canvas");
        tile.width = canvas.width;
        tile.height = height;
        const context = tile.getContext("2d");
        if (!context) throw new Error("PDF-afbeelding kon niet worden opgebouwd");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, tile.width, tile.height);
        context.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height);

        const naturalHeight = (height / canvas.width) * CONTENT_WIDTH_MM;
        const renderedHeight = Math.min(CONTENT_HEIGHT_MM, naturalHeight);
        const renderedWidth =
          naturalHeight > CONTENT_HEIGHT_MM
            ? (CONTENT_HEIGHT_MM / naturalHeight) * CONTENT_WIDTH_MM
            : CONTENT_WIDTH_MM;
        pdf.addImage(
          tile.toDataURL("image/png"),
          "PNG",
          PAGE_MARGIN_MM,
          PAGE_MARGIN_MM,
          renderedWidth,
          renderedHeight,
          undefined,
          "FAST",
        );
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(100, 116, 139);
        pdf.text(
          `Daily Flowers - vertrouwelijk - ${viewLabel(view)}`,
          PAGE_MARGIN_MM,
          PAGE_HEIGHT_MM - 3,
        );
        pdf.text(
          `Pagina ${pdf.getNumberOfPages()}`,
          PAGE_WIDTH_MM - PAGE_MARGIN_MM,
          PAGE_HEIGHT_MM - 3,
          { align: "right" },
        );
      }
    } finally {
      host.remove();
    }
  }

  if (!hasPage) throw new Error("Geen bankrapportage gevonden om als PDF te exporteren");
  pdf.save(fileName);
}

function preparePdfClone(clone: HTMLElement, width: number) {
  clone.classList.add("bank-report-pdf-capture");
  clone.style.width = `${width}px`;
  clone.style.maxWidth = "none";
  clone.querySelectorAll<HTMLElement>(".bank-report-no-print").forEach((element) => {
    element.style.display = "none";
  });
  clone.querySelectorAll<HTMLElement>(".overflow-x-auto").forEach((element) => {
    element.style.overflow = "visible";
  });
  clone.querySelectorAll<HTMLElement>(".bank-report-table").forEach((element) => {
    element.style.width = "100%";
  });
}

function viewLabel(view: BankReportView) {
  if (view === "profit-loss") return "Resultaten en prognose";
  if (view === "cashflow") return "Cashflow en financieringsbehoefte";
  if (view === "investment-agenda") return "Investeringsagenda AFS";
  return "AFS-scenario's";
}
