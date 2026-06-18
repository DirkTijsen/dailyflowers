import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  CheckSquare,
  Download,
  FileText,
  FilePlus2,
  Mail,
  Plus,
  ReceiptText,
  Save,
  Send,
  Unplug,
  type LucideIcon,
} from "lucide-react";
import { currentMonth, formatDateNL, formatDateTimeNL, formatEUR, monthLabel } from "@/lib/format";

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
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  kvk_number: string | null;
  vat_number: string | null;
  iban: string | null;
  notes: string | null;
  active: boolean;
};

type LandlordInvoiceDetails = Pick<
  Landlord,
  | "id"
  | "name"
  | "invoice_name"
  | "email"
  | "phone"
  | "address_line1"
  | "postal_code"
  | "city"
  | "country"
  | "kvk_number"
  | "vat_number"
  | "iban"
  | "notes"
>;

type Agreement = {
  id: string;
  machine_id: string;
  landlord_id: string;
  start_period: string;
  end_period: string | null;
  fixed_fee_net: number | string;
  energy_cost_net: number | string;
  turnover_rate_percent: number | string;
  turnover_threshold_net: number | string;
  invoice_vat_rate: number | string;
  invoice_reference: string | null;
  status: "active" | "inactive";
  notes: string | null;
  machines?: Pick<Machine, "id" | "display_name" | "afs_number" | "machine_id"> | null;
  afs_landlords?: LandlordInvoiceDetails | null;
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
  energy_cost_net: number | string;
  turnover_rate_percent: number | string;
  turnover_threshold_net: number | string;
  variable_fee_net: number | string;
  subtotal_net: number | string;
  vat_rate: number | string;
  vat_amount: number | string;
  total_gross: number | string;
  status: InvoiceStatus;
  notes: string | null;
  sent_at: string | null;
  email_to: string | null;
  email_subject: string | null;
  email_last_error: string | null;
  email_status: EmailStatus;
  queued_at: string | null;
  sending_started_at: string | null;
  email_body: string | null;
  email_provider: string | null;
  email_provider_message_id: string | null;
  email_attempts: number | null;
  machines?: Pick<Machine, "id" | "display_name" | "afs_number" | "machine_id"> | null;
  afs_landlords?: LandlordInvoiceDetails | null;
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
  energyCostNet: number;
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
type EmailStatus = "not_queued" | "queued" | "sending" | "sent" | "failed";
type InvoiceArtifactAction = "download_pdf" | "download_ubl";
type InvoiceFunctionPayload = {
  filename?: string;
  content_type?: string;
  base64?: string;
  message?: string;
  auth_url?: string;
  state?: string;
  found?: number;
  queued?: number;
  sent?: number;
  failed?: number;
  errors?: string[];
};

type GmailConnectionStatus = {
  connected: boolean;
  source: "env" | "database" | null;
  from_email: string;
  connected_email: string;
  connected_at: string | null;
  disconnected_at: string | null;
  last_error: string | null;
  client_configured: boolean;
  message?: string;
};

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

const emailStatusLabels: Record<EmailStatus, string> = {
  not_queued: "Niet in queue",
  queued: "In queue",
  sending: "Bezig",
  sent: "Gmail verzonden",
  failed: "Gmail fout",
};

const emailStatusVariants: Record<
  EmailStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  not_queued: "outline",
  queued: "secondary",
  sending: "secondary",
  sent: "default",
  failed: "destructive",
};

function AfsRentPage() {
  const qc = useQueryClient();
  const [initialYear, initialMonth] = currentMonth().split("-");
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const period = `${year}-${month}`;

  const [landlordForm, setLandlordForm] = useState(emptyLandlordForm);
  const [editingLandlordId, setEditingLandlordId] = useState("");
  const [agreementForm, setAgreementForm] = useState({
    machine_id: "",
    landlord_id: "",
    start_period: period,
    end_period: "",
    fixed_fee_net: "",
    energy_cost_net: "",
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
  const [invoiceActionId, setInvoiceActionId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());

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
        .select(
          "id,name,invoice_name,email,phone,address_line1,postal_code,city,country,kvk_number,vat_number,iban,notes,active",
        )
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
          "*, machines(id,display_name,afs_number,machine_id), afs_landlords(id,name,invoice_name,email,phone,address_line1,postal_code,city,country,kvk_number,vat_number,iban,notes)",
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
          "*, machines(id,display_name,afs_number,machine_id), afs_landlords(id,name,invoice_name,email,phone,address_line1,postal_code,city,country,kvk_number,vat_number,iban,notes)",
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

  const gmailStatusQ = useQuery({
    queryKey: ["afs-gmail-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<GmailConnectionStatus>(
        "afs-rental-invoice",
        { body: { action: "gmail_status" } },
      );
      if (error) throw error;
      if (data?.message) throw new Error(data.message);
      return data as GmailConnectionStatus;
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
  const selectableCandidates = useMemo(
    () =>
      candidates.filter(
        (row) =>
          row.machine.active &&
          row.agreement &&
          row.landlord &&
          row.calculation &&
          !row.invoice &&
          missingSelfBillingFields(row.landlord).length === 0,
      ),
    [candidates],
  );
  const selectableCandidateIds = useMemo(
    () => selectableCandidates.map((row) => row.machine.id),
    [selectableCandidates],
  );
  const selectableCandidateKey = selectableCandidateIds.join("|");
  const selectedCandidates = selectableCandidates.filter((row) =>
    selectedCandidateIds.has(row.machine.id),
  );
  const allSelectableSelected =
    selectableCandidateIds.length > 0 &&
    selectableCandidateIds.every((id) => selectedCandidateIds.has(id));
  const someSelectableSelected =
    !allSelectableSelected && selectableCandidateIds.some((id) => selectedCandidateIds.has(id));
  const totals = candidates.reduce(
    (sum, row) => {
      if (!row.calculation) return sum;
      sum.turnoverNet += row.calculation.turnoverNet;
      sum.fixedFeeNet += row.calculation.fixedFeeNet;
      sum.energyCostNet += row.calculation.energyCostNet;
      sum.variableFeeNet += row.calculation.variableFeeNet;
      sum.toInvoiceNet += row.invoice ? 0 : row.calculation.subtotalNet;
      return sum;
    },
    { turnoverNet: 0, fixedFeeNet: 0, energyCostNet: 0, variableFeeNet: 0, toInvoiceNet: 0 },
  );
  const invoicedNet = periodInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.subtotal_net ?? 0),
    0,
  );

  useEffect(() => {
    setSelectedCandidateIds(new Set(selectableCandidateIds));
  }, [period, selectableCandidateIds, selectableCandidateKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code) return;

    const expectedState = sessionStorage.getItem("afs-gmail-oauth-state");
    if (!state || state !== expectedState) {
      toast.error("Gmail koppeling geweigerd", { description: "OAuth state klopt niet." });
      return;
    }

    sessionStorage.removeItem("afs-gmail-oauth-state");
    window.history.replaceState(null, "", window.location.pathname);
    exchangeGmailCode(code);
    // Google returns the OAuth code once on page load; re-running this effect would retry exchange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetLandlordForm() {
    setEditingLandlordId("");
    setLandlordForm(emptyLandlordForm());
  }

  function selectLandlordForEdit(id: string) {
    if (id === "new") {
      resetLandlordForm();
      return;
    }
    const landlord = landlordsById.get(id);
    if (!landlord) return;
    setEditingLandlordId(id);
    setLandlordForm(landlordToForm(landlord));
  }

  async function saveLandlord() {
    const name = landlordForm.name.trim();
    const missing = missingSelfBillingFields(landlordForm);
    if (missing.length > 0) {
      toast.error("Verhuurdergegevens incompleet", {
        description: `Vul voor self-billing in: ${missing.join(", ")}.`,
      });
      return;
    }

    const payload = {
      name,
      invoice_name: emptyToNull(landlordForm.invoice_name),
      email: emptyToNull(landlordForm.email),
      phone: emptyToNull(landlordForm.phone),
      address_line1: emptyToNull(landlordForm.address_line1),
      postal_code: emptyToNull(landlordForm.postal_code),
      city: emptyToNull(landlordForm.city),
      country: landlordForm.country.trim() || "NL",
      kvk_number: emptyToNull(landlordForm.kvk_number),
      vat_number: emptyToNull(landlordForm.vat_number),
      iban: emptyToNull(landlordForm.iban),
      notes: emptyToNull(landlordForm.notes),
    };

    const { error } = editingLandlordId
      ? await db.from<unknown>("afs_landlords").update(payload).eq("id", editingLandlordId)
      : await db.from<unknown>("afs_landlords").insert({ ...payload, active: true });

    if (error) {
      toast.error("Verhuurder opslaan mislukt", { description: error.message });
      return;
    }

    toast.success(editingLandlordId ? "Verhuurder bijgewerkt" : "Verhuurder toegevoegd");
    resetLandlordForm();
    qc.invalidateQueries({ queryKey: ["afs-landlords"] });
    qc.invalidateQueries({ queryKey: ["afs-rental-agreements"] });
    qc.invalidateQueries({ queryKey: ["afs-rental-invoices"] });
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
      energy_cost_net: parseMoneyInput(agreementForm.energy_cost_net),
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
      energy_cost_net: "",
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
    const missing = candidate.landlord
      ? missingSelfBillingFields(candidate.landlord)
      : ["verhuurder"];
    if (missing.length > 0) {
      toast.error("Verhuurdergegevens incompleet", {
        description: `Vul voor self-billing in: ${missing.join(", ")}.`,
      });
      return;
    }
    const invoiceDate = todayIso();
    setInvoiceDraft({
      candidate,
      invoice_number: suggestInvoiceNumber(candidate, period, invoicesQ.data ?? []),
      invoice_date: invoiceDate,
      due_date: addDaysIso(invoiceDate, 14),
      status: "draft",
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
      energy_cost_net: calculation.energyCostNet,
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

  function toggleCandidateSelection(machineId: string, checked: boolean) {
    setSelectedCandidateIds((current) => {
      const next = new Set(current);
      if (checked) next.add(machineId);
      else next.delete(machineId);
      return next;
    });
  }

  function toggleAllCandidates(checked: boolean) {
    setSelectedCandidateIds(checked ? new Set(selectableCandidateIds) : new Set());
  }

  async function createSelectedInvoices() {
    if (selectedCandidates.length === 0) {
      toast.error("Selecteer minimaal een factuurconcept");
      return;
    }
    const incomplete = selectedCandidates.find(
      (candidate) => !candidate.landlord || missingSelfBillingFields(candidate.landlord).length > 0,
    );
    if (incomplete) {
      toast.error("Verhuurdergegevens incompleet", {
        description: `Controleer ${incomplete.landlord?.invoice_name || incomplete.landlord?.name || incomplete.machine.display_name}.`,
      });
      return;
    }

    const invoiceDate = todayIso();
    const dueDate = addDaysIso(invoiceDate, 14);
    const usedInvoiceNumbers = new Set(
      (invoicesQ.data ?? []).map((invoice) => invoice.invoice_number),
    );
    const rows = selectedCandidates.map((candidate) => {
      const calculation = candidate.calculation!;
      const invoiceNumber = suggestInvoiceNumber(
        candidate,
        period,
        invoicesQ.data ?? [],
        usedInvoiceNumbers,
      );
      usedInvoiceNumbers.add(invoiceNumber);
      return {
        period,
        machine_id: candidate.machine.id,
        agreement_id: candidate.agreement!.id,
        landlord_id: candidate.agreement!.landlord_id,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate,
        turnover_net: calculation.turnoverNet,
        fixed_fee_net: calculation.fixedFeeNet,
        energy_cost_net: calculation.energyCostNet,
        turnover_rate_percent: calculation.ratePercent,
        turnover_threshold_net: calculation.thresholdNet,
        variable_fee_net: calculation.variableFeeNet,
        subtotal_net: calculation.subtotalNet,
        vat_rate: calculation.vatRate,
        vat_amount: calculation.vatAmount,
        total_gross: calculation.totalGross,
        status: "draft",
        notes: emptyToNull(candidate.agreement!.invoice_reference ?? ""),
      };
    });

    setBulkAction("create_invoices");
    const { error } = await db.from<unknown>("afs_rental_invoices").insert(rows);
    setBulkAction(null);

    if (error) {
      toast.error("Facturen aanmaken mislukt", { description: error.message });
      return;
    }

    toast.success(`${rows.length} factuur${rows.length === 1 ? "" : "en"} aangemaakt`);
    qc.invalidateQueries({ queryKey: ["afs-rental-invoices"] });
  }

  async function downloadInvoiceArtifact(invoice: RentalInvoice, action: InvoiceArtifactAction) {
    const actionKey = `${invoice.id}:${action}`;
    setInvoiceActionId(actionKey);
    try {
      const { data, error } = await supabase.functions.invoke<InvoiceFunctionPayload>(
        "afs-rental-invoice",
        {
          body: { action, invoice_id: invoice.id },
        },
      );
      if (error) throw error;
      if (!data?.base64) throw new Error("Geen document ontvangen");

      downloadBase64File(data);
      toast.success(action === "download_pdf" ? "PDF aangemaakt" : "UBL aangemaakt");
    } catch (error) {
      toast.error("Document aanmaken mislukt", { description: errorMessage(error) });
    } finally {
      setInvoiceActionId(null);
    }
  }

  async function queuePeriodInvoices() {
    setBulkAction("queue_period");
    try {
      const { data, error } = await supabase.functions.invoke<InvoiceFunctionPayload>(
        "afs-rental-invoice",
        {
          body: {
            action: "queue_period",
            period,
          },
        },
      );
      if (error) throw error;
      if (data?.message) throw new Error(data.message);

      toast.success(`${data?.queued ?? 0} factuur${data?.queued === 1 ? "" : "en"} in Gmail-queue`);
      if (data?.failed) {
        toast.error(`${data.failed} factuur${data.failed === 1 ? "" : "en"} niet in queue`, {
          description: data.errors?.slice(0, 2).join("\n"),
        });
      }
      qc.invalidateQueries({ queryKey: ["afs-rental-invoices"] });
    } catch (error) {
      toast.error("Queue vullen mislukt", { description: errorMessage(error) });
    } finally {
      setBulkAction(null);
    }
  }

  async function processEmailQueue() {
    setBulkAction("process_queue");
    try {
      const { data, error } = await supabase.functions.invoke<InvoiceFunctionPayload>(
        "afs-rental-invoice",
        {
          body: {
            action: "process_queue",
            limit: 100,
          },
        },
      );
      if (error) throw error;
      if (data?.message) throw new Error(data.message);

      toast.success(
        `${data?.sent ?? 0} factuur${data?.sent === 1 ? "" : "en"} verzonden via Gmail`,
      );
      if (data?.failed) {
        toast.error(`${data.failed} Gmail fout${data.failed === 1 ? "" : "en"}`, {
          description: data.errors?.slice(0, 2).join("\n"),
        });
      }
      qc.invalidateQueries({ queryKey: ["afs-rental-invoices"] });
    } catch (error) {
      toast.error("Gmail queue verzenden mislukt", { description: errorMessage(error) });
    } finally {
      setBulkAction(null);
    }
  }

  async function startGmailOAuth() {
    if (typeof window === "undefined") return;
    setBulkAction("gmail_auth");
    try {
      const redirectUri = `${window.location.origin}/afs-huur`;
      const { data, error } = await supabase.functions.invoke<InvoiceFunctionPayload>(
        "afs-rental-invoice",
        {
          body: {
            action: "gmail_auth_url",
            redirect_uri: redirectUri,
          },
        },
      );
      if (error) throw error;
      if (data?.message) throw new Error(data.message);
      if (!data?.auth_url || !data.state) throw new Error("Gmail auth URL ontbreekt");

      sessionStorage.setItem("afs-gmail-oauth-state", data.state);
      window.location.href = data.auth_url;
    } catch (error) {
      toast.error("Gmail koppeling starten mislukt", { description: errorMessage(error) });
      setBulkAction(null);
    }
  }

  async function exchangeGmailCode(code: string) {
    if (typeof window === "undefined") return;
    setBulkAction("gmail_exchange");
    try {
      const redirectUri = `${window.location.origin}/afs-huur`;
      const { data, error } = await supabase.functions.invoke<GmailConnectionStatus>(
        "afs-rental-invoice",
        {
          body: {
            action: "gmail_exchange_code",
            code,
            redirect_uri: redirectUri,
          },
        },
      );
      if (error) throw error;
      if (data?.message) throw new Error(data.message);

      toast.success("Gmail gekoppeld");
      qc.invalidateQueries({ queryKey: ["afs-gmail-status"] });
    } catch (error) {
      toast.error("Gmail koppeling mislukt", { description: errorMessage(error) });
    } finally {
      setBulkAction(null);
    }
  }

  async function disconnectGmail() {
    setBulkAction("gmail_disconnect");
    try {
      const { data, error } = await supabase.functions.invoke<GmailConnectionStatus>(
        "afs-rental-invoice",
        { body: { action: "gmail_disconnect" } },
      );
      if (error) throw error;
      if (data?.message) throw new Error(data.message);

      toast.success("Gmail ontkoppeld");
      qc.invalidateQueries({ queryKey: ["afs-gmail-status"] });
    } catch (error) {
      toast.error("Gmail ontkoppelen mislukt", { description: errorMessage(error) });
    } finally {
      setBulkAction(null);
    }
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
          title="Energiekosten ex btw"
          value={formatEUR(totals.energyCostNet)}
          icon={Unplug}
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
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  Factuurconcepten voor {monthLabel(period)}
                </CardTitle>
                <CardDescription>
                  Vink de conceptregels aan die je wilt goedkeuren en aanmaken.
                </CardDescription>
              </div>
              <Button
                onClick={createSelectedInvoices}
                disabled={selectedCandidates.length === 0 || bulkAction === "create_invoices"}
              >
                <CheckSquare className="h-4 w-4 mr-1" />
                {selectedCandidates.length} aanmaken
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium w-[44px]">
                        <Checkbox
                          checked={
                            allSelectableSelected
                              ? true
                              : someSelectableSelected
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={(checked) => toggleAllCandidates(Boolean(checked))}
                          aria-label="Alle factureerbare concepten selecteren"
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">Machine</th>
                      <th className="px-3 py-2 font-medium">Verhuurder</th>
                      <th className="px-3 py-2 font-medium text-right">Omzet ex</th>
                      <th className="px-3 py-2 font-medium text-right">Vast ex</th>
                      <th className="px-3 py-2 font-medium text-right">Energie ex</th>
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
                        <td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">
                          Laden...
                        </td>
                      </tr>
                    )}
                    {candidates.length === 0 && !machinesQ.isLoading && (
                      <tr>
                        <td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">
                          Geen AFS-machines gevonden.
                        </td>
                      </tr>
                    )}
                    {candidates.map((row) => {
                      const missingLandlordFields = row.landlord
                        ? missingSelfBillingFields(row.landlord)
                        : [];
                      const selectable = selectableCandidateIds.includes(row.machine.id);
                      return (
                        <tr key={row.machine.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2 align-top">
                            <Checkbox
                              checked={selectedCandidateIds.has(row.machine.id)}
                              disabled={!selectable}
                              onCheckedChange={(checked) =>
                                toggleCandidateSelection(row.machine.id, Boolean(checked))
                              }
                              aria-label={`${row.machine.display_name} selecteren`}
                            />
                          </td>
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
                                {landlordAddressLine(row.landlord) && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {landlordAddressLine(row.landlord)}
                                  </div>
                                )}
                                {row.landlord.vat_number && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    Btw {row.landlord.vat_number}
                                  </div>
                                )}
                                {missingLandlordFields.length > 0 && (
                                  <div className="mt-2">
                                    <Badge variant="destructive">
                                      Mist {missingLandlordFields.join(", ")}
                                    </Badge>
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
                            {formatEUR(row.calculation?.energyCostNet ?? null)}
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
                                <div className="font-mono text-xs">
                                  {row.invoice.invoice_number}
                                </div>
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
                              disabled={!row.agreement || Boolean(row.invoice) || !selectable}
                              onClick={() => openInvoiceDialog(row)}
                              variant="outline"
                            >
                              <ReceiptText className="h-4 w-4 mr-1" />
                              Apart
                            </Button>
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

        <TabsContent value="afspraken" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verhuurder toevoegen of bijwerken</CardTitle>
              <CardDescription>
                Naam, NAW en btw-nummer voor factureren namens de verhuurder.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
                <Field label="Bestaande verhuurder">
                  <Select value={editingLandlordId || "new"} onValueChange={selectLandlordForEdit}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Nieuwe verhuurder</SelectItem>
                      {(landlordsQ.data ?? []).map((landlord) => (
                        <SelectItem key={landlord.id} value={landlord.id}>
                          {landlord.invoice_name || landlord.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Button variant="outline" onClick={resetLandlordForm}>
                  <Plus className="h-4 w-4 mr-1" />
                  Nieuw
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Naam *">
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
                      setLandlordForm((current) => ({
                        ...current,
                        invoice_name: event.target.value,
                      }))
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
                <Field label="Adres *">
                  <Input
                    value={landlordForm.address_line1}
                    onChange={(event) =>
                      setLandlordForm((current) => ({
                        ...current,
                        address_line1: event.target.value,
                      }))
                    }
                    placeholder="Straat 1"
                  />
                </Field>
                <Field label="Postcode *">
                  <Input
                    value={landlordForm.postal_code}
                    onChange={(event) =>
                      setLandlordForm((current) => ({
                        ...current,
                        postal_code: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Plaats *">
                  <Input
                    value={landlordForm.city}
                    onChange={(event) =>
                      setLandlordForm((current) => ({ ...current, city: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Land">
                  <Input
                    value={landlordForm.country}
                    onChange={(event) =>
                      setLandlordForm((current) => ({ ...current, country: event.target.value }))
                    }
                  />
                </Field>
                <Field label="KvK">
                  <Input
                    value={landlordForm.kvk_number}
                    onChange={(event) =>
                      setLandlordForm((current) => ({
                        ...current,
                        kvk_number: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Btw-nummer *">
                  <Input
                    value={landlordForm.vat_number}
                    onChange={(event) =>
                      setLandlordForm((current) => ({
                        ...current,
                        vat_number: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="IBAN">
                  <Input
                    value={landlordForm.iban}
                    onChange={(event) =>
                      setLandlordForm((current) => ({ ...current, iban: event.target.value }))
                    }
                  />
                </Field>
                <div className="flex items-end">
                  <Button onClick={saveLandlord} className="w-full">
                    <Save className="h-4 w-4 mr-1" />
                    {editingLandlordId ? "Bijwerken" : "Toevoegen"}
                  </Button>
                </div>
              </div>
              <Field label="Notitie">
                <Input
                  value={landlordForm.notes}
                  onChange={(event) =>
                    setLandlordForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  placeholder="optioneel"
                />
              </Field>
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
                <Field label="Energiekosten ex btw">
                  <Input
                    value={agreementForm.energy_cost_net}
                    onChange={(event) =>
                      setAgreementForm((current) => ({
                        ...current,
                        energy_cost_net: event.target.value,
                      }))
                    }
                    placeholder="0,00"
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
                <table className="w-full min-w-[1020px] text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Machine</th>
                      <th className="px-3 py-2 font-medium">Verhuurder</th>
                      <th className="px-3 py-2 font-medium">Looptijd</th>
                      <th className="px-3 py-2 font-medium text-right">Vast ex</th>
                      <th className="px-3 py-2 font-medium text-right">Energie ex</th>
                      <th className="px-3 py-2 font-medium text-right">Variabel</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(agreementsQ.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
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
                            <div>{landlord?.invoice_name || landlord?.name || "-"}</div>
                            {landlordAddressLine(landlord) && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {landlordAddressLine(landlord)}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {agreement.start_period} t/m {agreement.end_period ?? "doorlopend"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatEUR(agreement.fixed_fee_net)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatEUR(agreement.energy_cost_net)}
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
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Factuurhistorie {year}</CardTitle>
                <CardDescription>
                  Zet de maandfacturen in de Gmail-queue en verwerk de queue in batch.
                </CardDescription>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge
                    variant={gmailStatusQ.data?.connected ? "default" : "outline"}
                    className="whitespace-nowrap"
                  >
                    {gmailStatusQ.data?.connected ? "Gmail gekoppeld" : "Gmail niet gekoppeld"}
                  </Badge>
                  {gmailStatusQ.data?.from_email && <span>{gmailStatusQ.data.from_email}</span>}
                  {gmailStatusQ.data?.source && <span>bron: {gmailStatusQ.data.source}</span>}
                  {!gmailStatusQ.data?.client_configured && (
                    <span className="text-destructive">Client ID/secret ontbreken in Railway</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={startGmailOAuth}
                  disabled={bulkAction === "gmail_auth" || bulkAction === "gmail_exchange"}
                >
                  <Mail className="h-4 w-4 mr-1" />
                  {gmailStatusQ.data?.connected ? "Gmail opnieuw koppelen" : "Gmail koppelen"}
                </Button>
                {gmailStatusQ.data?.connected && gmailStatusQ.data.source === "database" && (
                  <Button
                    variant="outline"
                    onClick={disconnectGmail}
                    disabled={bulkAction === "gmail_disconnect"}
                  >
                    <Unplug className="h-4 w-4 mr-1" />
                    Ontkoppel
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={queuePeriodInvoices}
                  disabled={bulkAction === "queue_period"}
                >
                  <Mail className="h-4 w-4 mr-1" />
                  Maand in queue
                </Button>
                <Button
                  onClick={processEmailQueue}
                  disabled={bulkAction === "process_queue" || !gmailStatusQ.data?.connected}
                >
                  <Send className="h-4 w-4 mr-1" />
                  Verzend queue
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Factuur</th>
                      <th className="px-3 py-2 font-medium">Periode</th>
                      <th className="px-3 py-2 font-medium">Machine</th>
                      <th className="px-3 py-2 font-medium">Verhuurder</th>
                      <th className="px-3 py-2 font-medium text-right">Omzet ex</th>
                      <th className="px-3 py-2 font-medium text-right">Vast ex</th>
                      <th className="px-3 py-2 font-medium text-right">Energie ex</th>
                      <th className="px-3 py-2 font-medium text-right">Variabel ex</th>
                      <th className="px-3 py-2 font-medium text-right">Totaal incl</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Gmail</th>
                      <th className="px-3 py-2 font-medium">PDF/UBL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesQ.isLoading && (
                      <tr>
                        <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                          Laden...
                        </td>
                      </tr>
                    )}
                    {(invoicesQ.data ?? []).length === 0 && !invoicesQ.isLoading && (
                      <tr>
                        <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
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
                            <div>{landlord?.invoice_name || landlord?.name || "-"}</div>
                            {landlord?.email && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {landlord.email}
                              </div>
                            )}
                            {landlordAddressLine(landlord) && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {landlordAddressLine(landlord)}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatEUR(invoice.turnover_net)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatEUR(invoice.fixed_fee_net)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatEUR(invoice.energy_cost_net)}
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
                            {invoice.sent_at && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Mail {formatDateTimeNL(invoice.sent_at)}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 min-w-[190px]">
                            <Badge
                              variant={emailStatusVariants[invoice.email_status ?? "not_queued"]}
                            >
                              {emailStatusLabels[invoice.email_status ?? "not_queued"]}
                            </Badge>
                            {invoice.queued_at && invoice.email_status !== "sent" && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Queue {formatDateTimeNL(invoice.queued_at)}
                              </div>
                            )}
                            {invoice.email_provider_message_id && (
                              <div className="mt-1 max-w-[180px] truncate text-xs text-muted-foreground">
                                Gmail ID {invoice.email_provider_message_id}
                              </div>
                            )}
                            {invoice.email_attempts ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Pogingen {invoice.email_attempts}
                              </div>
                            ) : null}
                            {invoice.email_last_error && (
                              <div className="mt-1 max-w-[220px] text-xs text-destructive">
                                {invoice.email_last_error}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="outline"
                                title="PDF downloaden"
                                disabled={invoiceActionId === `${invoice.id}:download_pdf`}
                                onClick={() => downloadInvoiceArtifact(invoice, "download_pdf")}
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                title="UBL downloaden"
                                disabled={invoiceActionId === `${invoice.id}:download_ubl`}
                                onClick={() => downloadInvoiceArtifact(invoice, "download_ubl")}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
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
                      label="Energiekosten ex btw"
                      value={invoiceDraft.candidate.calculation?.energyCostNet ?? 0}
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

function emptyLandlordForm() {
  return {
    name: "",
    invoice_name: "",
    email: "",
    phone: "",
    address_line1: "",
    postal_code: "",
    city: "",
    country: "NL",
    kvk_number: "",
    vat_number: "",
    iban: "",
    notes: "",
  };
}

function landlordToForm(landlord: LandlordInvoiceDetails) {
  return {
    name: landlord.name ?? "",
    invoice_name: landlord.invoice_name ?? "",
    email: landlord.email ?? "",
    phone: landlord.phone ?? "",
    address_line1: landlord.address_line1 ?? "",
    postal_code: landlord.postal_code ?? "",
    city: landlord.city ?? "",
    country: landlord.country ?? "NL",
    kvk_number: landlord.kvk_number ?? "",
    vat_number: landlord.vat_number ?? "",
    iban: landlord.iban ?? "",
    notes: landlord.notes ?? "",
  };
}

function missingSelfBillingFields(
  landlord: Pick<
    LandlordInvoiceDetails,
    "name" | "address_line1" | "postal_code" | "city" | "vat_number"
  >,
) {
  return [
    [landlord.name, "naam"],
    [landlord.address_line1, "adres"],
    [landlord.postal_code, "postcode"],
    [landlord.city, "plaats"],
    [landlord.vat_number, "btw-nummer"],
  ]
    .filter(([value]) => !String(value ?? "").trim())
    .map(([, label]) => String(label));
}

function landlordAddressLine(landlord: LandlordInvoiceDetails | null | undefined) {
  if (!landlord) return "";
  return [landlord.address_line1, [landlord.postal_code, landlord.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

function downloadBase64File(payload: InvoiceFunctionPayload) {
  if (!payload.base64) return;
  const byteCharacters = atob(payload.base64);
  const byteNumbers = new Uint8Array(byteCharacters.length);
  for (let index = 0; index < byteCharacters.length; index += 1) {
    byteNumbers[index] = byteCharacters.charCodeAt(index);
  }

  const blob = new Blob([byteNumbers], {
    type: payload.content_type ?? "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = payload.filename ?? "factuur";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
  const energyCostNet = roundMoney(Number(agreement.energy_cost_net ?? 0));
  const ratePercent = Number(agreement.turnover_rate_percent ?? 0);
  const thresholdNet = roundMoney(Number(agreement.turnover_threshold_net ?? 0));
  const variableBaseNet = Math.max(0, roundMoney(turnoverNet) - thresholdNet);
  const variableFeeNet = roundMoney((variableBaseNet * ratePercent) / 100);
  const subtotalNet = roundMoney(fixedFeeNet + energyCostNet + variableFeeNet);
  const vatRate = Number(agreement.invoice_vat_rate ?? 21);
  const vatAmount = roundMoney((subtotalNet * vatRate) / 100);
  return {
    turnoverNet: roundMoney(turnoverNet),
    fixedFeeNet,
    energyCostNet,
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

function suggestInvoiceNumber(
  candidate: CandidateRow,
  period: string,
  invoices: RentalInvoice[],
  extraUsed: Set<string> = new Set(),
) {
  const afs = candidate.machine.afs_number.replace(/[^a-zA-Z0-9]/g, "");
  const base = `AFS-${period.replace("-", "")}-${afs || candidate.machine.id.slice(0, 6)}`;
  const used = new Set([...invoices.map((invoice) => invoice.invoice_number), ...extraUsed]);
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
