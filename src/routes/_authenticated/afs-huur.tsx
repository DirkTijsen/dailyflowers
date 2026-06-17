import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Building2,
  Calculator,
  FilePlus2,
  Plus,
  ReceiptText,
  Save,
  type LucideIcon,
} from "lucide-react";
import { currentMonth, formatDateNL, formatEUR, monthLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/afs-huur")({
  head: () => ({ meta: [{ title: "AFS huurafspraken - Daily Flowers" }] }),
  component: AfsRentPage,
});

type Machine = {
  id: string;
  afs_number: string;
  machine_id: string | null;
  display_name: string;
  active: boolean;
};

type Landlord = {
  id: string;
  name: string;
  invoice_name: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
};

type Agreement = {
  id: string;
  machine_id: string;
  landlord_id: string;
  start_period: string;
  end_period: string | null;
  fixed_fee_net: number | string;
  turnover_rate_percent: number | string;
  turnover_threshold_net: number | string;
  invoice_vat_rate: number | string;
  invoice_reference: string | null;
  status: "active" | "inactive";
  notes: string | null;
  machines?: Pick<Machine, "id" | "display_name" | "afs_number" | "machine_id"> | null;
  afs_landlords?: Pick<Landlord, "id" | "name" | "invoice_name" | "email"> | null;
};

type RentalInvoice = {
  id: string;
  period: string;
  machine_id: string | null;
  agreement_id: string | null;
  landlord_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  turnover_net: number | string;
  fixed_fee_net: number | string;
  turnover_rate_percent: number | string;
  turnover_threshold_net: number | string;
  variable_fee_net: number | string;
  subtotal_net: number | string;
  vat_rate: number | string;
  vat_amount: number | string;
  total_gross: number | string;
  status: InvoiceStatus;
  notes: string | null;
  machines?: Pick<Machine, "id" | "display_name" | "afs_number" | "machine_id"> | null;
  afs_landlords?: Pick<Landlord, "id" | "name" | "invoice_name" | "email"> | null;
};

type ActualRow = {
  machine_id: string | null;
  net_total: number | string | null;
  gross_total: number | string | null;
  tx_count: number | null;
};

type RentCalculation = {
  turnoverNet: number;
  fixedFeeNet: number;
  thresholdNet: number;
  variableBaseNet: number;
  ratePercent: number;
  variableFeeNet: number;
  subtotalNet: number;
  vatRate: number;
  vatAmount: number;
  totalGross: number;
};

type CandidateRow = {
  machine: Machine;
  agreement: Agreement | null;
  landlord: Landlord | null;
  invoice: RentalInvoice | null;
  calculation: RentCalculation | null;
  txCount: number;
};

type InvoiceStatus = "draft" | "sent" | "paid" | "canceled";

type DbError = { message: string };
type QueryResult<T> = { data: T | null; error: DbError | null };
type QueryBuilder<T> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: unknown) => QueryBuilder<T>;
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => QueryBuilder<T>;
  gte: (column: string, value: unknown) => QueryBuilder<T>;
  lte: (column: string, value: unknown) => QueryBuilder<T>;
  eq: (column: string, value: unknown) => QueryBuilder<T>;
  insert: (values: unknown) => QueryBuilder<T>;
  update: (values: unknown) => QueryBuilder<T>;
};
type UntypedSupabase = {
  from: <T>(table: string) => QueryBuilder<T>;
};

const db = supabase as unknown as UntypedSupabase;

const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: "Concept",
  sent: "Verzonden",
  paid: "Betaald",
  canceled: "Geannuleerd",
};

const invoiceStatusVariants: Record<
  InvoiceStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  sent: "secondary",
  paid: "default",
  canceled: "destructive",
};

function AfsRentPage() {
  const qc = useQueryClient();
  const [initialYear, initialMonth] = currentMonth().split("-");
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const period = `${year}-${month}`;

  const [landlordForm, setLandlordForm] = useState({
    name: "",
    invoice_name: "",
    email: "",
    phone: "",
  });
  const [agreementForm, setAgreementForm] = useState({
    machine_id: "",
    landlord_id: "",
    start_period: period,
    end_period: "",
    fixed_fee_net: "",
    turnover_rate_percent: "",
    turnover_threshold_net: "0",
    invoice_vat_rate: "21",
    invoice_reference: "",
    notes: "",
  });
  const [invoiceDraft, setInvoiceDraft] = useState<{
    candidate: CandidateRow;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    status: InvoiceStatus;
    notes: string;
  } | null>(null);

  const machinesQ = useQuery({
    queryKey: ["machines-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("machines")
        .select("id,afs_number,machine_id,display_name,active")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as Machine[];
    },
  });

  const landlordsQ = useQuery({
    queryKey: ["afs-landlords"],
    queryFn: async () => {
      const { data, error } = await db
        .from<Landlord[]>("afs_landlords")
        .select("id,name,invoice_name,email,phone,active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Landlord[];
    },
  });

  const agreementsQ = useQuery({
    queryKey: ["afs-rental-agreements"],
    queryFn: async () => {
      const { data, error } = await db
        .from<Agreement[]>("afs_rental_agreements")
        .select(
          "*, machines(id,display_name,afs_number,machine_id), afs_landlords(id,name,invoice_name,email)",
        )
        .order("start_period", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Agreement[];
    },
  });

  const invoicesQ = useQuery({
    queryKey: ["afs-rental-invoices", year],
    queryFn: async () => {
      const { data, error } = await db
        .from<RentalInvoice[]>("afs_rental_invoices")
        .select(
          "*, machines(id,display_name,afs_number,machine_id), afs_landlords(id,name,invoice_name,email)",
        )
        .gte("period", `${year}-01`)
        .lte("period", `${year}-12`)
        .order("period", { ascending: false })
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RentalInvoice[];
    },
  });

  const actualsQ = useQuery({
    queryKey: ["afs-rental-actuals", period],
    queryFn: async () => {
      const { data, error } = await db
        .from<ActualRow[]>("vw_monthly_machine")
        .select("machine_id,net_total,gross_total,tx_count")
        .eq("period", period)
        .eq("channel", "bold_afs");
      if (error) throw error;
      return (data ?? []) as ActualRow[];
    },
  });

  const landlordsById = useMemo(
    () => new Map((landlordsQ.data ?? []).map((landlord) => [landlord.id, landlord])),
    [landlordsQ.data],
  );

  const candidates = useMemo(() => {
    const machines = machinesQ.data ?? [];
    const agreements = agreementsQ.data ?? [];
    const actualByMachine = new Map(
      (actualsQ.data ?? [])
        .filter((actual) => actual.machine_id)
        .map((actual) => [
          actual.machine_id!,
          {
            turnoverNet: Number(actual.net_total ?? actual.gross_total ?? 0),
            txCount: Number(actual.tx_count ?? 0),
          },
        ]),
    );
    const invoiceByMachine = new Map(
      (invoicesQ.data ?? [])
        .filter(
          (invoice) =>
            invoice.period === period && invoice.status !== "canceled" && invoice.machine_id,
        )
        .map((invoice) => [invoice.machine_id!, invoice]),
    );

    return machines
      .map((machine): CandidateRow => {
        const agreement = activeAgreementForPeriod(agreements, machine.id, period);
        const landlord = agreement ? (landlordsById.get(agreement.landlord_id) ?? null) : null;
        const actual = actualByMachine.get(machine.id) ?? { turnoverNet: 0, txCount: 0 };
        const invoice = invoiceByMachine.get(machine.id) ?? null;
        return {
          machine,
          agreement,
          landlord,
          invoice,
          calculation: agreement ? calculateRent(agreement, actual.turnoverNet) : null,
          txCount: actual.txCount,
        };
      })
      .filter((row) => row.machine.active || row.agreement || row.invoice || row.txCount > 0)
      .sort((a, b) => a.machine.display_name.localeCompare(b.machine.display_name));
  }, [actualsQ.data, agreementsQ.data, invoicesQ.data, landlordsById, machinesQ.data, period]);

  const periodInvoices = (invoicesQ.data ?? []).filter(
    (invoice) => invoice.period === period && invoice.status !== "canceled",
  );
  const totals = candidates.reduce(
    (sum, row) => {
      if (!row.calculation) return sum;
      sum.turnoverNet += row.calculation.turnoverNet;
      sum.fixedFeeNet += row.calculation.fixedFeeNet;
      sum.variableFeeNet += row.calculation.variableFeeNet;
      sum.toInvoiceNet += row.invoice ? 0 : row.calculation.subtotalNet;
      return sum;
    },
    { turnoverNet: 0, fixedFeeNet: 0, variableFeeNet: 0, toInvoiceNet: 0 },
  );
  const invoicedNet = periodInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.subtotal_net ?? 0),
    0,
  );

  async function addLandlord() {
    const name = landlordForm.name.trim();
    if (!name) {
      toast.error("Naam verhuurder is verplicht");
      return;
    }

    const { error } = await db.from<unknown>("afs_landlords").insert({
      name,
      invoice_name: emptyToNull(landlordForm.invoice_name),
      email: emptyToNull(landlordForm.email),
      phone: emptyToNull(landlordForm.phone),
      active: true,
    });

    if (error) {
      toast.error("Verhuurder opslaan mislukt", { description: error.message });
      return;
    }

    toast.success("Verhuurder toegevoegd");
    setLandlordForm({ name: "", invoice_name: "", email: "", phone: "" });
    qc.invalidateQueries({ queryKey: ["afs-landlords"] });
  }

  async function addAgreement() {
    if (!agreementForm.machine_id || !agreementForm.landlord_id) {
      toast.error("Machine en verhuurder zijn verplicht");
      return;
    }
    if (
      !isPeriod(agreementForm.start_period) ||
      (agreementForm.end_period && !isPeriod(agreementForm.end_period))
    ) {
      toast.error("Periode moet het formaat YYYY-MM hebben");
      return;
    }
    if (agreementForm.end_period && agreementForm.end_period < agreementForm.start_period) {
      toast.error("Eindperiode moet na de startperiode liggen");
      return;
    }

    const existingOverlap = (agreementsQ.data ?? []).some(
      (agreement) =>
        agreement.machine_id === agreementForm.machine_id &&
        agreement.status === "active" &&
        periodsOverlap(
          agreement.start_period,
          agreement.end_period,
          agreementForm.start_period,
          agreementForm.end_period || null,
        ),
    );
    if (existingOverlap) {
      toast.error("Deze machine heeft al een actieve afspraak in die periode");
      return;
    }

    const { error } = await db.from<unknown>("afs_rental_agreements").insert({
      machine_id: agreementForm.machine_id,
      landlord_id: agreementForm.landlord_id,
      start_period: agreementForm.start_period,
      end_period: emptyToNull(agreementForm.end_period),
      fixed_fee_net: parseMoneyInput(agreementForm.fixed_fee_net),
      turnover_rate_percent: parseNumberInput(agreementForm.turnover_rate_percent),
      turnover_threshold_net: parseMoneyInput(agreementForm.turnover_threshold_net),
      invoice_vat_rate: parseNumberInput(agreementForm.invoice_vat_rate) || 21,
      invoice_reference: emptyToNull(agreementForm.invoice_reference),
      notes: emptyToNull(agreementForm.notes),
      status: "active",
    });

    if (error) {
      toast.error("Afspraak opslaan mislukt", { description: error.message });
      return;
    }

    toast.success("Huurafspraak vastgelegd");
    setAgreementForm((current) => ({
      ...current,
      machine_id: "",
      fixed_fee_net: "",
      turnover_rate_percent: "",
      turnover_threshold_net: "0",
      invoice_reference: "",
      notes: "",
    }));
    qc.invalidateQueries({ queryKey: ["afs-rental-agreements"] });
  }

  async function updateAgreementStatus(id: string, status: Agreement["status"]) {
    const { error } = await db
      .from<unknown>("afs_rental_agreements")
      .update({ status })
      .eq("id", id);
    if (error) toast.error("Status wijzigen mislukt", { description: error.message });
    else qc.invalidateQueries({ queryKey: ["afs-rental-agreements"] });
  }

  function openInvoiceDialog(candidate: CandidateRow) {
    if (!candidate.agreement || !candidate.calculation) return;
    const invoiceDate = todayIso();
    setInvoiceDraft({
      candidate,
      invoice_number: suggestInvoiceNumber(candidate, period, invoicesQ.data ?? []),
      invoice_date: invoiceDate,
      due_date: addDaysIso(invoiceDate, 14),
      status: "sent",
      notes: candidate.agreement.invoice_reference ?? "",
    });
  }

  async function saveInvoice() {
    if (!invoiceDraft?.candidate.agreement || !invoiceDraft.candidate.calculation) return;
    const invoiceNumber = invoiceDraft.invoice_number.trim();
    if (!invoiceNumber) {
      toast.error("Factuurnummer is verplicht");
      return;
    }

    const { candidate } = invoiceDraft;
    const calculation = candidate.calculation;
    const { error } = await db.from<unknown>("afs_rental_invoices").insert({
      period,
      machine_id: candidate.machine.id,
      agreement_id: candidate.agreement.id,
      landlord_id: candidate.agreement.landlord_id,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDraft.invoice_date,
      due_date: emptyToNull(invoiceDraft.due_date),
      turnover_net: calculation.turnoverNet,
      fixed_fee_net: calculation.fixedFeeNet,
      turnover_rate_percent: calculation.ratePercent,
      turnover_threshold_net: calculation.thresholdNet,
      variable_fee_net: calculation.variableFeeNet,
      subtotal_net: calculation.subtotalNet,
      vat_rate: calculation.vatRate,
      vat_amount: calculation.vatAmount,
      total_gross: calculation.totalGross,
      status: invoiceDraft.status,
      notes: emptyToNull(invoiceDraft.notes),
    });

    if (error) {
      toast.error("Factuur vastleggen mislukt", { description: error.message });
      return;
    }

    toast.success("Factuur vastgelegd");
    setInvoiceDraft(null);
    qc.invalidateQueries({ queryKey: ["afs-rental-invoices"] });
  }

  async function updateInvoiceStatus(id: string, status: InvoiceStatus) {
    const { error } = await db.from<unknown>("afs_rental_invoices").update({ status }).eq("id", id);
    if (error) toast.error("Factuurstatus wijzigen mislukt", { description: error.message });
    else qc.invalidateQueries({ queryKey: ["afs-rental-invoices"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">AFS huurafspraken</h1>
          <p className="text-sm text-muted-foreground">
            Leg per AFS-machine de verhuurder, vaste huur en omzetcomponent vast en registreer de
            maandfactuur.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Jaar</div>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[120px]">
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
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Periode</div>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[150px]">
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
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard
          title="Omzetbasis ex btw"
          value={formatEUR(totals.turnoverNet)}
          icon={Calculator}
        />
        <MetricCard
          title="Vaste huur ex btw"
          value={formatEUR(totals.fixedFeeNet)}
          icon={Building2}
        />
        <MetricCard
          title="Variabel ex btw"
          value={formatEUR(totals.variableFeeNet)}
          icon={ReceiptText}
        />
        <MetricCard
          title="Nog te factureren ex btw"
          value={formatEUR(totals.toInvoiceNet)}
          detail={`${formatEUR(invoicedNet)} al vastgelegd`}
          icon={FilePlus2}
        />
      </div>

      <Tabs defaultValue="factureren" className="space-y-4">
        <TabsList>
          <TabsTrigger value="factureren">Factureren</TabsTrigger>
          <TabsTrigger value="afspraken">Afspraken</TabsTrigger>
          <TabsTrigger value="historie">Factuurhistorie</TabsTrigger>
        </TabsList>

        <TabsContent value="factureren">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Maandfacturen voor {monthLabel(period)}</CardTitle>
              <CardDescription>
                De omzetbasis komt uit Bold/AFS actuals ex btw voor dezelfde machine en periode.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Machine</th>
                      <th className="px-3 py-2 font-medium">Verhuurder</th>
                      <th className="px-3 py-2 font-medium text-right">Omzet ex</th>
                      <th className="px-3 py-2 font-medium text-right">Vast ex</th>
                      <th className="px-3 py-2 font-medium text-right">Variabel</th>
                      <th className="px-3 py-2 font-medium text-right">Totaal ex</th>
                      <th className="px-3 py-2 font-medium text-right">Totaal incl</th>
                      <th className="px-3 py-2 font-medium">Factuur</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(machinesQ.isLoading || agreementsQ.isLoading || actualsQ.isLoading) && (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                          Laden...
                        </td>
                      </tr>
                    )}
                    {candidates.length === 0 && !machinesQ.isLoading && (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                          Geen AFS-machines gevonden.
                        </td>
                      </tr>
                    )}
                    {candidates.map((row) => (
                      <tr key={row.machine.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 min-w-[220px]">
                          <div className="font-medium">{row.machine.display_name}</div>
                          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                            AFS {row.machine.afs_number}
                            {row.machine.machine_id ? ` - ID ${row.machine.machine_id}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2 min-w-[190px]">
                          {row.landlord ? (
                            <>
                              <div>{row.landlord.invoice_name || row.landlord.name}</div>
                              {row.landlord.email && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {row.landlord.email}
                                </div>
                              )}
                            </>
                          ) : (
                            <Badge variant="outline">Geen afspraak</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <div>{formatEUR(row.calculation?.turnoverNet ?? 0)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.txCount} transacties
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatEUR(row.calculation?.fixedFeeNet ?? null)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.calculation ? (
                            <>
                              <div>{formatEUR(row.calculation.variableFeeNet)}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatPercent(row.calculation.ratePercent)} over{" "}
                                {formatEUR(row.calculation.variableBaseNet)}
                              </div>
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {formatEUR(row.calculation?.subtotalNet ?? null)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.calculation ? (
                            <>
                              <div>{formatEUR(row.calculation.totalGross)}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                btw {formatPercent(row.calculation.vatRate)}
                              </div>
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-2 min-w-[150px]">
                          {row.invoice ? (
                            <>
                              <div className="font-mono text-xs">{row.invoice.invoice_number}</div>
                              <Badge
                                variant={invoiceStatusVariants[row.invoice.status]}
                                className="mt-1"
                              >
                                {invoiceStatusLabels[row.invoice.status]}
                              </Badge>
                            </>
                          ) : row.agreement ? (
                            <Badge variant="secondary">Nog niet vastgelegd</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            disabled={!row.agreement || Boolean(row.invoice)}
                            onClick={() => openInvoiceDialog(row)}
                          >
                            <ReceiptText className="h-4 w-4 mr-1" />
                            Vastleggen
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="afspraken" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verhuurder toevoegen</CardTitle>
              <CardDescription>
                Naam en optionele factuurgegevens voor factureren namens de verhuurder.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_150px_auto] items-end">
              <Field label="Naam">
                <Input
                  value={landlordForm.name}
                  onChange={(event) =>
                    setLandlordForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Verhuurder BV"
                />
              </Field>
              <Field label="Factuurnaam">
                <Input
                  value={landlordForm.invoice_name}
                  onChange={(event) =>
                    setLandlordForm((current) => ({ ...current, invoice_name: event.target.value }))
                  }
                  placeholder="optioneel"
                />
              </Field>
              <Field label="E-mail">
                <Input
                  type="email"
                  value={landlordForm.email}
                  onChange={(event) =>
                    setLandlordForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="facturen@..."
                />
              </Field>
              <Field label="Telefoon">
                <Input
                  value={landlordForm.phone}
                  onChange={(event) =>
                    setLandlordForm((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </Field>
              <Button onClick={addLandlord}>
                <Plus className="h-4 w-4 mr-1" />
                Toevoegen
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Huurafspraak vastleggen</CardTitle>
              <CardDescription>
                Per machine: vaste maandhuur ex btw plus een percentage over de omzetbasis boven de
                drempel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Machine">
                  <Select
                    value={agreementForm.machine_id}
                    onValueChange={(value) =>
                      setAgreementForm((current) => ({ ...current, machine_id: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Kies machine" />
                    </SelectTrigger>
                    <SelectContent>
                      {(machinesQ.data ?? []).map((machine) => (
                        <SelectItem key={machine.id} value={machine.id}>
                          {machine.display_name} ({machine.afs_number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Verhuurder">
                  <Select
                    value={agreementForm.landlord_id}
                    onValueChange={(value) =>
                      setAgreementForm((current) => ({ ...current, landlord_id: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Kies verhuurder" />
                    </SelectTrigger>
                    <SelectContent>
                      {(landlordsQ.data ?? [])
                        .filter((landlord) => landlord.active)
                        .map((landlord) => (
                          <SelectItem key={landlord.id} value={landlord.id}>
                            {landlord.invoice_name || landlord.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Startperiode">
                  <Input
                    value={agreementForm.start_period}
                    onChange={(event) =>
                      setAgreementForm((current) => ({
                        ...current,
                        start_period: event.target.value,
                      }))
                    }
                    placeholder="2026-06"
                  />
                </Field>
                <Field label="Eindperiode">
                  <Input
                    value={agreementForm.end_period}
                    onChange={(event) =>
                      setAgreementForm((current) => ({
                        ...current,
                        end_period: event.target.value,
                      }))
                    }
                    placeholder="optioneel"
                  />
                </Field>
                <Field label="Vast ex btw">
                  <Input
                    value={agreementForm.fixed_fee_net}
                    onChange={(event) =>
                      setAgreementForm((current) => ({
                        ...current,
                        fixed_fee_net: event.target.value,
                      }))
                    }
                    placeholder="250,00"
                    className="tabular-nums"
                  />
                </Field>
                <Field label="Omzet %">
                  <Input
                    value={agreementForm.turnover_rate_percent}
                    onChange={(event) =>
                      setAgreementForm((current) => ({
                        ...current,
                        turnover_rate_percent: event.target.value,
                      }))
                    }
                    placeholder="10"
                    className="tabular-nums"
                  />
                </Field>
                <Field label="Drempel ex btw">
                  <Input
                    value={agreementForm.turnover_threshold_net}
                    onChange={(event) =>
                      setAgreementForm((current) => ({
                        ...current,
                        turnover_threshold_net: event.target.value,
                      }))
                    }
                    placeholder="0,00"
                    className="tabular-nums"
                  />
                </Field>
                <Field label="Btw % factuur">
                  <Input
                    value={agreementForm.invoice_vat_rate}
                    onChange={(event) =>
                      setAgreementForm((current) => ({
                        ...current,
                        invoice_vat_rate: event.target.value,
                      }))
                    }
                    className="tabular-nums"
                  />
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end">
                <Field label="Referentie">
                  <Input
                    value={agreementForm.invoice_reference}
                    onChange={(event) =>
                      setAgreementForm((current) => ({
                        ...current,
                        invoice_reference: event.target.value,
                      }))
                    }
                    placeholder="contractnummer of kostenplaats"
                  />
                </Field>
                <Field label="Notitie">
                  <Input
                    value={agreementForm.notes}
                    onChange={(event) =>
                      setAgreementForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="optioneel"
                  />
                </Field>
                <Button onClick={addAgreement}>
                  <Save className="h-4 w-4 mr-1" />
                  Afspraak opslaan
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vastgelegde afspraken</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Machine</th>
                      <th className="px-3 py-2 font-medium">Verhuurder</th>
                      <th className="px-3 py-2 font-medium">Looptijd</th>
                      <th className="px-3 py-2 font-medium text-right">Vast ex</th>
                      <th className="px-3 py-2 font-medium text-right">Variabel</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(agreementsQ.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                          Nog geen huurafspraken.
                        </td>
                      </tr>
                    )}
                    {(agreementsQ.data ?? []).map((agreement) => {
                      const landlord =
                        agreement.afs_landlords ?? landlordsById.get(agreement.landlord_id);
                      return (
                        <tr key={agreement.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <div>{agreement.machines?.display_name ?? "Onbekende machine"}</div>
                            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                              AFS {agreement.machines?.afs_number ?? "-"}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {landlord?.invoice_name || landlord?.name || "-"}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {agreement.start_period} t/m {agreement.end_period ?? "doorlopend"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatEUR(agreement.fixed_fee_net)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatPercent(Number(agreement.turnover_rate_percent ?? 0))}
                            <div className="mt-1 text-xs text-muted-foreground">
                              drempel {formatEUR(agreement.turnover_threshold_net)}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={agreement.status}
                              onValueChange={(value) =>
                                updateAgreementStatus(agreement.id, value as Agreement["status"])
                              }
                            >
                              <SelectTrigger className="h-8 w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">Actief</SelectItem>
                                <SelectItem value="inactive">Inactief</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historie">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Factuurhistorie {year}</CardTitle>
              <CardDescription>
                Vastgelegde huurfacturen met factuurnummer, periode en status.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Factuur</th>
                      <th className="px-3 py-2 font-medium">Periode</th>
                      <th className="px-3 py-2 font-medium">Machine</th>
                      <th className="px-3 py-2 font-medium">Verhuurder</th>
                      <th className="px-3 py-2 font-medium text-right">Omzet ex</th>
                      <th className="px-3 py-2 font-medium text-right">Vast ex</th>
                      <th className="px-3 py-2 font-medium text-right">Variabel ex</th>
                      <th className="px-3 py-2 font-medium text-right">Totaal incl</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesQ.isLoading && (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                          Laden...
                        </td>
                      </tr>
                    )}
                    {(invoicesQ.data ?? []).length === 0 && !invoicesQ.isLoading && (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                          Geen facturen vastgelegd voor dit jaar.
                        </td>
                      </tr>
                    )}
                    {(invoicesQ.data ?? []).map((invoice) => {
                      const landlord =
                        invoice.afs_landlords ??
                        (invoice.landlord_id ? landlordsById.get(invoice.landlord_id) : null);
                      return (
                        <tr key={invoice.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <div className="font-mono text-xs">{invoice.invoice_number}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDateNL(invoice.invoice_date)}
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {monthLabel(invoice.period)}
                          </td>
                          <td className="px-3 py-2">
                            <div>{invoice.machines?.display_name ?? "Onbekende machine"}</div>
                            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                              AFS {invoice.machines?.afs_number ?? "-"}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {landlord?.invoice_name || landlord?.name || "-"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatEUR(invoice.turnover_net)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatEUR(invoice.fixed_fee_net)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatEUR(invoice.variable_fee_net)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {formatEUR(invoice.total_gross)}
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={invoice.status}
                              onValueChange={(value) =>
                                updateInvoiceStatus(invoice.id, value as InvoiceStatus)
                              }
                            >
                              <SelectTrigger className="h-8 w-[145px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(invoiceStatusLabels) as InvoiceStatus[]).map(
                                  (status) => (
                                    <SelectItem key={status} value={status}>
                                      {invoiceStatusLabels[status]}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(invoiceDraft)} onOpenChange={(open) => !open && setInvoiceDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Factuur vastleggen</DialogTitle>
            <DialogDescription>
              Controleer de berekening en registreer het factuurnummer voor deze AFS-huur.
            </DialogDescription>
          </DialogHeader>
          {invoiceDraft && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-md border bg-muted/20 p-3 text-sm md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Machine</div>
                  <div>{invoiceDraft.candidate.machine.display_name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Verhuurder</div>
                  <div>
                    {invoiceDraft.candidate.landlord?.invoice_name ||
                      invoiceDraft.candidate.landlord?.name}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Periode</div>
                  <div>{monthLabel(period)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Totaal incl btw</div>
                  <div className="font-medium tabular-nums">
                    {formatEUR(invoiceDraft.candidate.calculation?.totalGross)}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Factuurnummer">
                  <Input
                    value={invoiceDraft.invoice_number}
                    onChange={(event) =>
                      setInvoiceDraft((current) =>
                        current ? { ...current, invoice_number: event.target.value } : current,
                      )
                    }
                    className="font-mono"
                  />
                </Field>
                <Field label="Status">
                  <Select
                    value={invoiceDraft.status}
                    onValueChange={(value) =>
                      setInvoiceDraft((current) =>
                        current ? { ...current, status: value as InvoiceStatus } : current,
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(invoiceStatusLabels) as InvoiceStatus[]).map((status) => (
                        <SelectItem key={status} value={status}>
                          {invoiceStatusLabels[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Factuurdatum">
                  <Input
                    type="date"
                    value={invoiceDraft.invoice_date}
                    onChange={(event) =>
                      setInvoiceDraft((current) =>
                        current
                          ? {
                              ...current,
                              invoice_date: event.target.value,
                              due_date: current.due_date || addDaysIso(event.target.value, 14),
                            }
                          : current,
                      )
                    }
                  />
                </Field>
                <Field label="Vervaldatum">
                  <Input
                    type="date"
                    value={invoiceDraft.due_date}
                    onChange={(event) =>
                      setInvoiceDraft((current) =>
                        current ? { ...current, due_date: event.target.value } : current,
                      )
                    }
                  />
                </Field>
              </div>

              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <AmountRow
                      label="Omzetbasis ex btw"
                      value={invoiceDraft.candidate.calculation?.turnoverNet ?? 0}
                    />
                    <AmountRow
                      label="Vaste huur ex btw"
                      value={invoiceDraft.candidate.calculation?.fixedFeeNet ?? 0}
                    />
                    <AmountRow
                      label={`Variabel (${formatPercent(invoiceDraft.candidate.calculation?.ratePercent ?? 0)})`}
                      value={invoiceDraft.candidate.calculation?.variableFeeNet ?? 0}
                    />
                    <AmountRow
                      label="Subtotaal ex btw"
                      value={invoiceDraft.candidate.calculation?.subtotalNet ?? 0}
                      strong
                    />
                    <AmountRow
                      label={`Btw (${formatPercent(invoiceDraft.candidate.calculation?.vatRate ?? 0)})`}
                      value={invoiceDraft.candidate.calculation?.vatAmount ?? 0}
                    />
                    <AmountRow
                      label="Totaal incl btw"
                      value={invoiceDraft.candidate.calculation?.totalGross ?? 0}
                      strong
                    />
                  </tbody>
                </table>
              </div>

              <Field label="Notitie">
                <Input
                  value={invoiceDraft.notes}
                  onChange={(event) =>
                    setInvoiceDraft((current) =>
                      current ? { ...current, notes: event.target.value } : current,
                    )
                  }
                  placeholder="optioneel zichtbaar in historie"
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDraft(null)}>
              Annuleren
            </Button>
            <Button onClick={saveInvoice}>
              <Save className="h-4 w-4 mr-1" />
              Factuur vastleggen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function AmountRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <tr className="border-t first:border-t-0">
      <td className={`px-3 py-2 ${strong ? "font-medium" : ""}`}>{label}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${strong ? "font-semibold" : ""}`}>
        {formatEUR(value)}
      </td>
    </tr>
  );
}

function activeAgreementForPeriod(agreements: Agreement[], machineId: string, period: string) {
  return (
    agreements
      .filter(
        (agreement) =>
          agreement.machine_id === machineId &&
          agreement.status === "active" &&
          agreement.start_period <= period &&
          (!agreement.end_period || agreement.end_period >= period),
      )
      .sort((a, b) => b.start_period.localeCompare(a.start_period))[0] ?? null
  );
}

function calculateRent(agreement: Agreement, turnoverNet: number): RentCalculation {
  const fixedFeeNet = roundMoney(Number(agreement.fixed_fee_net ?? 0));
  const ratePercent = Number(agreement.turnover_rate_percent ?? 0);
  const thresholdNet = roundMoney(Number(agreement.turnover_threshold_net ?? 0));
  const variableBaseNet = Math.max(0, roundMoney(turnoverNet) - thresholdNet);
  const variableFeeNet = roundMoney((variableBaseNet * ratePercent) / 100);
  const subtotalNet = roundMoney(fixedFeeNet + variableFeeNet);
  const vatRate = Number(agreement.invoice_vat_rate ?? 21);
  const vatAmount = roundMoney((subtotalNet * vatRate) / 100);
  return {
    turnoverNet: roundMoney(turnoverNet),
    fixedFeeNet,
    thresholdNet,
    variableBaseNet,
    ratePercent,
    variableFeeNet,
    subtotalNet,
    vatRate,
    vatAmount,
    totalGross: roundMoney(subtotalNet + vatAmount),
  };
}

function periodsOverlap(startA: string, endA: string | null, startB: string, endB: string | null) {
  const normalizedEndA = endA ?? "9999-12";
  const normalizedEndB = endB ?? "9999-12";
  return startA <= normalizedEndB && startB <= normalizedEndA;
}

function suggestInvoiceNumber(candidate: CandidateRow, period: string, invoices: RentalInvoice[]) {
  const afs = candidate.machine.afs_number.replace(/[^a-zA-Z0-9]/g, "");
  const base = `AFS-${period.replace("-", "")}-${afs || candidate.machine.id.slice(0, 6)}`;
  const used = new Set(invoices.map((invoice) => invoice.invoice_number));
  let value = base;
  let counter = 2;
  while (used.has(value)) {
    value = `${base}-${counter}`;
    counter += 1;
  }
  return value;
}

function parseMoneyInput(value: string) {
  return parseNumberInput(value);
}

function parseNumberInput(value: string) {
  let normalized = String(value ?? "")
    .trim()
    .replace(/[\u20ac\s]/g, "");
  if (!normalized) return 0;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized =
      normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else {
    normalized = normalized.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatPercent(value: number | string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0%";
  return `${numeric.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%`;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isPeriod(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function yearOptions() {
  const current = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, index) => String(current + 2 - index));
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
