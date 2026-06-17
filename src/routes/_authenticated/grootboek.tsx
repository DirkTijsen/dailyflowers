import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, Pencil, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  CHANNELS,
  PL_SECTIONS,
  channelLabel,
  downloadAccountTemplate,
  parseAccountWorkbook,
  sectionLabel,
  type GlAccount,
  type PlSection,
  type SalesChannel,
} from "@/lib/pl";

export const Route = createFileRoute("/_authenticated/grootboek")({
  head: () => ({ meta: [{ title: "Grootboek - Daily Flowers" }] }),
  component: GrootboekPage,
});

const emptyForm = {
  id: "",
  account_code: "",
  account_name: "",
  account_type: "",
  statement_type: "Winst & Verlies",
  debit_credit: "",
  classification: "",
  pl_section: "other" as PlSection,
  revenue_channel: "none",
  sort_order: "0",
  active: true,
};

function GrootboekPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("all");
  const [onlyPl, setOnlyPl] = useState(true);
  const [saving, setSaving] = useState(false);

  const accountsQ = useQuery({
    queryKey: ["gl-accounts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gl_accounts")
        .select("*")
        .order("sort_order")
        .order("account_code");
      if (error) throw error;
      return (data ?? []) as GlAccount[];
    },
  });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (accountsQ.data ?? []).filter((account) => {
      if (onlyPl && !String(account.statement_type ?? "").toLowerCase().includes("winst")) return false;
      if (section !== "all" && account.pl_section !== section) return false;
      if (!needle) return true;
      return [account.account_code, account.account_name, account.classification, account.account_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [accountsQ.data, onlyPl, search, section]);

  async function saveAccount() {
    if (!form.account_code.trim() || !form.account_name.trim()) {
      toast.error("Code en naam zijn verplicht");
      return;
    }

    setSaving(true);
    try {
      const row = {
        account_code: form.account_code.trim(),
        account_name: form.account_name.trim(),
        account_type: form.account_type.trim() || null,
        statement_type: form.statement_type.trim() || null,
        debit_credit: form.debit_credit.trim() || null,
        classification: form.classification.trim() || null,
        pl_section: form.pl_section,
        revenue_channel:
          form.pl_section === "revenue" && form.revenue_channel !== "none"
            ? (form.revenue_channel as SalesChannel)
            : null,
        sort_order: Number(form.sort_order) || 0,
        active: form.active,
      };

      const query = (supabase as any).from("gl_accounts");
      const { error } = form.id
        ? await query.update(row).eq("id", form.id)
        : await query.upsert(row, { onConflict: "account_code" });
      if (error) throw error;

      toast.success(form.id ? "Grootboekrekening bijgewerkt" : "Grootboekrekening opgeslagen");
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["gl-accounts"] });
    } catch (error) {
      toast.error("Opslaan mislukt", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  async function uploadSchema(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = await parseAccountWorkbook(file);
      if (rows.length === 0) {
        toast.error("Geen grootboekrekeningen gevonden");
        return;
      }

      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error } = await (supabase as any)
          .from("gl_accounts")
          .upsert(rows.slice(i, i + chunk), { onConflict: "account_code" });
        if (error) throw error;
      }

      toast.success(`${rows.length} grootboekrekeningen opgeslagen`);
      qc.invalidateQueries({ queryKey: ["gl-accounts"] });
    } catch (error) {
      toast.error("Grootboekschema importeren mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      event.target.value = "";
    }
  }

  function edit(account: GlAccount) {
    setForm({
      id: account.id,
      account_code: account.account_code,
      account_name: account.account_name,
      account_type: account.account_type ?? "",
      statement_type: account.statement_type ?? "",
      debit_credit: account.debit_credit ?? "",
      classification: account.classification ?? "",
      pl_section: account.pl_section,
      revenue_channel: account.revenue_channel ?? "none",
      sort_order: String(account.sort_order ?? 0),
      active: account.active,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Grootboek</h1>
          <p className="text-sm text-muted-foreground">
            Beheer het Exact-grootboekschema en map W&V-rekeningen naar rubrieken en omzetkanalen.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={downloadAccountTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Template
          </Button>
          <Button variant="outline" asChild>
            <label>
              <Upload className="mr-2 h-4 w-4" />
              Schema uploaden
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={uploadSchema} />
            </label>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{form.id ? "Grootboekrekening bewerken" : "Grootboekrekening toevoegen"}</CardTitle>
          <CardDescription>Omzetrekeningen kunnen optioneel aan een verkoopkanaal worden gekoppeld.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[120px_1fr_160px_170px_150px_1fr_180px_180px_100px_auto] items-end">
          <Field label="Code">
            <Input value={form.account_code} onChange={(event) => setForm({ ...form, account_code: event.target.value })} />
          </Field>
          <Field label="Naam">
            <Input value={form.account_name} onChange={(event) => setForm({ ...form, account_name: event.target.value })} />
          </Field>
          <Field label="Type">
            <Input value={form.account_type} onChange={(event) => setForm({ ...form, account_type: event.target.value })} />
          </Field>
          <Field label="Balans/W&V">
            <Input value={form.statement_type} onChange={(event) => setForm({ ...form, statement_type: event.target.value })} />
          </Field>
          <Field label="Debet/Credit">
            <Input value={form.debit_credit} onChange={(event) => setForm({ ...form, debit_credit: event.target.value })} />
          </Field>
          <Field label="Classificatie">
            <Input value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value })} />
          </Field>
          <Field label="W&V-rubriek">
            <Select value={form.pl_section} onValueChange={(value) => setForm({ ...form, pl_section: value as PlSection })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PL_SECTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Omzetkanaal">
            <Select
              value={form.revenue_channel}
              onValueChange={(value) => setForm({ ...form, revenue_channel: value })}
              disabled={form.pl_section !== "revenue"}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Niet gekoppeld</SelectItem>
                {CHANNELS.map((channel) => <SelectItem key={channel} value={channel}>{channelLabel(channel)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Volgorde">
            <Input value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} />
          </Field>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} />
            <span className="text-sm">Actief</span>
          </div>
          <div className="lg:col-span-10 flex gap-2">
            <Button onClick={saveAccount} disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>
            {form.id && <Button variant="outline" onClick={() => setForm(emptyForm)}>Annuleren</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grootboekschema</CardTitle>
          <CardDescription>{rows.length} van {accountsQ.data?.length ?? 0} rekeningen zichtbaar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          <div className="grid gap-3 px-6 md:grid-cols-[1fr_220px_auto] items-end">
            <Field label="Zoeken">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Code, naam of classificatie" />
            </Field>
            <Field label="Rubriek">
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle rubrieken</SelectItem>
                  {PL_SECTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-center gap-2 pb-2">
              <Switch checked={onlyPl} onCheckedChange={setOnlyPl} />
              <span className="text-sm">Alleen W&V</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Naam</th>
                  <th className="px-3 py-2 font-medium">Exact</th>
                  <th className="px-3 py-2 font-medium">W&V-rubriek</th>
                  <th className="px-3 py-2 font-medium">Kanaal</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((account) => (
                  <tr key={account.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{account.account_code}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{account.account_name}</div>
                      {account.classification && <div className="text-xs text-muted-foreground">{account.classification}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      <div>{account.statement_type || "-"}</div>
                      <div>{account.account_type || "-"} · {account.debit_credit || "-"}</div>
                    </td>
                    <td className="px-3 py-2">{sectionLabel(account.pl_section)}</td>
                    <td className="px-3 py-2">{channelLabel(account.revenue_channel)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={account.active ? "secondary" : "outline"}>{account.active ? "Actief" : "Inactief"}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => edit(account)} aria-label="Bewerken">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Geen rekeningen gevonden.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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
