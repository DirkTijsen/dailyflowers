import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/instellingen")({
  head: () => ({ meta: [{ title: "Instellingen — Daily Flowers" }] }),
  component: SettingsPage,
});

const apiBaseUrl =
  typeof window !== "undefined" ? window.location.origin : import.meta.env.VITE_SUPABASE_URL || "";

function SettingsPage() {
  const qc = useQueryClient();
  const machinesQ = useQuery({
    queryKey: ["machines-all"],
    queryFn: async () =>
      (await supabase.from("machines").select("*").order("afs_number")).data ?? [],
  });
  const vatQ = useQuery({
    queryKey: ["vat_rates"],
    queryFn: async () => (await supabase.from("vat_rates").select("*").order("rate")).data ?? [],
  });
  const shopQ = useQuery({
    queryKey: ["shopify_connections"],
    queryFn: async () =>
      (await (supabase as any).from("shopify_connections").select("*").order("created_at")).data ??
      [],
  });
  const mollieStatusQ = useQuery({
    queryKey: ["mollie_settings_status"],
    queryFn: async () =>
      (await (supabase as any).from("mollie_settings_status").select("*").limit(1)).data ?? [],
  });
  const articlesQ = useQuery({
    queryKey: ["bold_articles"],
    queryFn: async () =>
      (await (supabase as any)
        .from("bold_articles")
        .select("*")
        .order("article_number")).data ?? [],
  });

  const [newAfs, setNewAfs] = useState("");
  const [newMachineId, setNewMachineId] = useState("");
  const [newName, setNewName] = useState("");
  const [newArticleNumber, setNewArticleNumber] = useState("");
  const [newArticleName, setNewArticleName] = useState("");
  const [newArticlePrice, setNewArticlePrice] = useState("");
  const [newArticleVat, setNewArticleVat] = useState("9");
  const [newArticleCategory, setNewArticleCategory] = useState("");
  const [newRate, setNewRate] = useState("");
  const [newRateLabel, setNewRateLabel] = useState("");
  const [shopLabel, setShopLabel] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [shopClient, setShopClient] = useState("");
  const [shopToken, setShopToken] = useState("");
  const [mollieToken, setMollieToken] = useState("");

  async function addShop() {
    if (!shopLabel || !shopDomain || !shopClient || !shopToken) {
      toast.error("Label, shop-domein, client ID en app secret zijn verplicht");
      return;
    }
    const domain = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const { error } = await (supabase as any).from("shopify_connections").insert({
      label: shopLabel,
      shop_domain: domain,
      client_id: shopClient || null,
      access_token: shopToken,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Shopify-koppeling toegevoegd");
      setShopLabel("");
      setShopDomain("");
      setShopClient("");
      setShopToken("");
      qc.invalidateQueries({ queryKey: ["shopify_connections"] });
    }
  }
  async function toggleShop(id: string, active: boolean) {
    await (supabase as any).from("shopify_connections").update({ active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["shopify_connections"] });
  }
  async function deleteShop(id: string) {
    if (!confirm("Shopify-koppeling verwijderen?")) return;
    await (supabase as any).from("shopify_connections").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["shopify_connections"] });
  }

  async function saveMollieToken() {
    const token = mollieToken.trim();
    if (!token) {
      toast.error("Mollie API-token is verplicht");
      return;
    }

    const currentSettings = mollieStatusQ.data?.[0];
    const request = currentSettings
      ? (supabase as any)
          .from("mollie_settings")
          .update({ api_key: token, active: true })
          .eq("id", "default")
      : (supabase as any)
          .from("mollie_settings")
          .insert({ id: "default", api_key: token, active: true });
    const { error } = await request;

    if (error) toast.error(error.message);
    else {
      toast.success("Mollie-token opgeslagen");
      setMollieToken("");
      qc.invalidateQueries({ queryKey: ["mollie_settings_status"] });
    }
  }

  async function toggleMollie(active: boolean) {
    const { error } = await (supabase as any)
      .from("mollie_settings")
      .update({ active })
      .eq("id", "default");

    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["mollie_settings_status"] });
  }

  async function addMachine() {
    if (!newAfs || !newName) {
      toast.error("AFS-nummer en naam zijn verplicht");
      return;
    }
    const { error } = await supabase
      .from("machines")
      .insert({ afs_number: newAfs, machine_id: newMachineId || null, display_name: newName });
    if (error) toast.error(error.message);
    else {
      toast.success("Machine toegevoegd");
      setNewAfs("");
      setNewMachineId("");
      setNewName("");
      qc.invalidateQueries({ queryKey: ["machines-all"] });
      qc.invalidateQueries({ queryKey: ["machines"] });
    }
  }

  async function toggleMachine(id: string, active: boolean) {
    await supabase.from("machines").update({ active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["machines-all"] });
  }
  async function renameMachine(id: string, display_name: string) {
    await supabase.from("machines").update({ display_name }).eq("id", id);
  }
  async function updateMachine(id: string, values: Record<string, string | null>) {
    await supabase.from("machines").update(values).eq("id", id);
    qc.invalidateQueries({ queryKey: ["machines-all"] });
    qc.invalidateQueries({ queryKey: ["machines"] });
  }
  async function deleteMachine(id: string) {
    if (!confirm("Machine verwijderen?")) return;
    const { error } = await supabase.from("machines").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Verwijderd");
      qc.invalidateQueries({ queryKey: ["machines-all"] });
    }
  }

  async function addVat() {
    const r = Number(newRate);
    if (!r || !newRateLabel) {
      toast.error("Tarief en label vereist");
      return;
    }
    const { error } = await supabase.from("vat_rates").insert({ rate: r, label: newRateLabel });
    if (error) toast.error(error.message);
    else {
      setNewRate("");
      setNewRateLabel("");
      qc.invalidateQueries({ queryKey: ["vat_rates"] });
    }
  }

  async function addArticle() {
    if (!newArticleNumber || !newArticleName) {
      toast.error("Artikelnummer en productnaam zijn verplicht");
      return;
    }
    const price = parseMoney(newArticlePrice);
    const vat = Number(newArticleVat);
    const { error } = await (supabase as any).from("bold_articles").upsert(
      {
        article_number: newArticleNumber,
        product_name: newArticleName,
        price_gross: price,
        vat_rate: Number.isFinite(vat) ? vat : null,
        category: newArticleCategory || null,
        active: true,
      },
      { onConflict: "article_number" },
    );
    if (error) toast.error(error.message);
    else {
      toast.success("Artikel opgeslagen");
      setNewArticleNumber("");
      setNewArticleName("");
      setNewArticlePrice("");
      setNewArticleVat("9");
      setNewArticleCategory("");
      qc.invalidateQueries({ queryKey: ["bold_articles"] });
    }
  }

  async function importArticles(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const rows = parseArticleImport(text);
    if (rows.length === 0) {
      toast.error("Geen artikelen gevonden");
      return;
    }
    const { error } = await (supabase as any)
      .from("bold_articles")
      .upsert(rows, { onConflict: "article_number" });
    if (error) toast.error(error.message);
    else {
      toast.success(`${rows.length} artikelen geimporteerd`);
      qc.invalidateQueries({ queryKey: ["bold_articles"] });
    }
  }

  async function updateArticle(id: string, values: Record<string, string | number | boolean | null>) {
    await (supabase as any).from("bold_articles").update(values).eq("id", id);
    qc.invalidateQueries({ queryKey: ["bold_articles"] });
  }

  async function toggleArticle(id: string, active: boolean) {
    await updateArticle(id, { active });
  }

  async function deleteArticle(id: string) {
    if (!confirm("Artikel verwijderen?")) return;
    const { error } = await (supabase as any).from("bold_articles").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Artikel verwijderd");
      qc.invalidateQueries({ queryKey: ["bold_articles"] });
    }
  }

  const mollieStatus = mollieStatusQ.data?.[0];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Instellingen</h1>
        <p className="text-sm text-muted-foreground">
          Beheer machines (AFS-nummer → leesbare naam) en btw-tarieven.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bold/AFS machines</CardTitle>
          <CardDescription>
            Koppel het AFS-nummer uit de Mollie-omschrijving aan een leesbare locatienaam.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[140px_160px_1fr_auto] gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground">AFS-code</label>
              <Input
                value={newAfs}
                onChange={(e) => setNewAfs(e.target.value)}
                placeholder="AFS-001"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Machine-ID</label>
              <Input
                value={newMachineId}
                onChange={(e) => setNewMachineId(e.target.value)}
                placeholder="optioneel"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Locatienaam</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Hoog Catharijne P5"
              />
            </div>
            <Button onClick={addMachine}>
              <Plus className="h-4 w-4 mr-1" />
              Toevoegen
            </Button>
          </div>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">AFS-code</th>
                  <th className="px-3 py-2 font-medium">Machine-ID</th>
                  <th className="px-3 py-2 font-medium">Naam</th>
                  <th className="px-3 py-2 font-medium">Actief</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {machinesQ.data?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      Nog geen machines.
                    </td>
                  </tr>
                )}
                {machinesQ.data?.map((m: any) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2">
                      <Input
                        defaultValue={m.afs_number}
                        onBlur={(e) => updateMachine(m.id, { afs_number: e.target.value })}
                        className="h-8 font-mono text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        defaultValue={m.machine_id ?? ""}
                        onBlur={(e) =>
                          updateMachine(m.id, { machine_id: e.target.value || null })
                        }
                        className="h-8 font-mono text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        defaultValue={m.display_name}
                        onBlur={(e) => renameMachine(m.id, e.target.value)}
                        className="h-8"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Switch checked={m.active} onCheckedChange={(v) => toggleMachine(m.id, v)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteMachine(m.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bold artikelen</CardTitle>
          <CardDescription>
            Beheer de Bold/AFS artikellijst en importeer periodiek de export uit Bold. Testproducten
            worden bij import overgeslagen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[110px_1fr_120px_100px_150px_auto_auto] gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Art.nr.</label>
              <Input
                value={newArticleNumber}
                onChange={(e) => setNewArticleNumber(e.target.value)}
                placeholder="018"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Productnaam</label>
              <Input
                value={newArticleName}
                onChange={(e) => setNewArticleName(e.target.value)}
                placeholder="Sparkly roses"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Prijs incl.</label>
              <Input
                value={newArticlePrice}
                onChange={(e) => setNewArticlePrice(e.target.value)}
                placeholder="14,95"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Btw %</label>
              <Input
                type="number"
                step="0.01"
                value={newArticleVat}
                onChange={(e) => setNewArticleVat(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Categorie</label>
              <Input
                value={newArticleCategory}
                onChange={(e) => setNewArticleCategory(e.target.value)}
                placeholder="Luxury"
              />
            </div>
            <Button onClick={addArticle}>
              <Plus className="h-4 w-4 mr-1" />
              Opslaan
            </Button>
            <Button variant="outline" asChild>
              <label>
                Importeren
                <input
                  type="file"
                  accept=".txt,.csv,text/plain,text/csv"
                  className="hidden"
                  onChange={(e) => importArticles(e.target.files?.[0] ?? null)}
                />
              </label>
            </Button>
          </div>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Art.nr.</th>
                  <th className="px-3 py-2 font-medium">Productnaam</th>
                  <th className="px-3 py-2 font-medium">Categorie</th>
                  <th className="px-3 py-2 font-medium">Prijs incl.</th>
                  <th className="px-3 py-2 font-medium">Btw</th>
                  <th className="px-3 py-2 font-medium">Actief</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {articlesQ.data?.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                      Nog geen artikelen.
                    </td>
                  </tr>
                )}
                {articlesQ.data?.map((a: any) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-2">
                      <Input
                        defaultValue={a.article_number}
                        onBlur={(e) => updateArticle(a.id, { article_number: e.target.value })}
                        className="h-8 font-mono text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        defaultValue={a.product_name}
                        onBlur={(e) => updateArticle(a.id, { product_name: e.target.value })}
                        className="h-8"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        defaultValue={a.category ?? ""}
                        onBlur={(e) =>
                          updateArticle(a.id, { category: e.target.value || null })
                        }
                        className="h-8"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        defaultValue={Number(a.price_gross ?? 0).toFixed(2)}
                        onBlur={(e) =>
                          updateArticle(a.id, { price_gross: parseMoney(e.target.value) })
                        }
                        className="h-8 tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        defaultValue={a.vat_rate ?? ""}
                        onBlur={(e) => {
                          const vat = Number(e.target.value.replace(",", "."));
                          updateArticle(a.id, { vat_rate: Number.isFinite(vat) ? vat : null });
                        }}
                        className="h-8 tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Switch checked={a.active} onCheckedChange={(v) => toggleArticle(a.id, v)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteArticle(a.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Btw-tarieven</CardTitle>
          <CardDescription>
            Configureerbaar. Voor Bold/AFS wordt het tarief uit de Mollie-omschrijving gebruikt (09
            of 21).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-[120px_1fr_auto] gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Tarief (%)</label>
              <Input
                type="number"
                step="0.01"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Label</label>
              <Input value={newRateLabel} onChange={(e) => setNewRateLabel(e.target.value)} />
            </div>
            <Button onClick={addVat}>
              <Plus className="h-4 w-4 mr-1" />
              Toevoegen
            </Button>
          </div>
          <div className="border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Tarief</th>
                  <th className="px-3 py-2 font-medium">Label</th>
                  <th className="px-3 py-2 font-medium">Actief</th>
                </tr>
              </thead>
              <tbody>
                {vatQ.data?.map((v: any) => (
                  <tr key={v.id} className="border-t">
                    <td className="px-3 py-2 tabular-nums">{v.rate}%</td>
                    <td className="px-3 py-2">{v.label}</td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={v.active}
                        onCheckedChange={async (val) => {
                          await supabase.from("vat_rates").update({ active: val }).eq("id", v.id);
                          qc.invalidateQueries({ queryKey: ["vat_rates"] });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shopify-koppelingen</CardTitle>
          <CardDescription>
            Beheer meerdere Shopify-apps. Geef per koppeling een label, het shop-domein (bijv.{" "}
            <code className="text-xs">dailyflowers.myshopify.com</code>), de client-ID en de app
            secret. De dagelijkse sweep wisselt deze server-side om voor een Shopify access token en
            haalt orders op tot maximaal 60 dagen terug.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Label</label>
              <Input
                value={shopLabel}
                onChange={(e) => setShopLabel(e.target.value)}
                placeholder="Daily Flowers Webshop"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Shop-domein</label>
              <Input
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder="shopnaam.myshopify.com"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Client ID</label>
              <Input
                value={shopClient}
                onChange={(e) => setShopClient(e.target.value)}
                placeholder="Shopify client ID"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">App secret / access token</label>
              <Input
                type="password"
                value={shopToken}
                onChange={(e) => setShopToken(e.target.value)}
                placeholder="shpss_… of access token"
              />
            </div>
          </div>
          <Button onClick={addShop}>
            <Plus className="h-4 w-4 mr-1" />
            Koppeling toevoegen
          </Button>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Label</th>
                  <th className="px-3 py-2 font-medium">Shop-domein</th>
                  <th className="px-3 py-2 font-medium">Laatste sync</th>
                  <th className="px-3 py-2 font-medium">Actief</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {shopQ.data?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      Nog geen Shopify-koppelingen.
                    </td>
                  </tr>
                )}
                {shopQ.data?.map((c: any) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2">{c.label}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.shop_domain}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {c.last_synced_at ? new Date(c.last_synced_at).toLocaleString("nl-NL") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Switch checked={c.active} onCheckedChange={(v) => toggleShop(c.id, v)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteShop(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mollie-koppeling</CardTitle>
          <CardDescription>
            Sla het Mollie API-token op voor de webhook en daily sweep. Het token wordt na opslaan
            niet teruggetoond.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground">API-token</label>
              <Input
                type="password"
                value={mollieToken}
                onChange={(e) => setMollieToken(e.target.value)}
                placeholder="live_xxx of test_xxx"
                autoComplete="new-password"
              />
            </div>
            <Button onClick={saveMollieToken} disabled={!mollieToken.trim()}>
              <KeyRound className="h-4 w-4 mr-1" />
              Token opslaan
            </Button>
          </div>

          <div className="border rounded-md p-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-center text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <div>{mollieStatus?.api_key_configured ? "Ingesteld" : "Nog niet ingesteld"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Laatst gewijzigd</div>
              <div>
                {mollieStatus?.updated_at
                  ? new Date(mollieStatus.updated_at).toLocaleString("nl-NL")
                  : "-"}
              </div>
            </div>
            {mollieStatus && (
              <div className="flex items-center gap-2 justify-start md:justify-end">
                <span className="text-xs text-muted-foreground">Actief</span>
                <Switch checked={mollieStatus.active} onCheckedChange={toggleMollie} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook- en sweep-URL's</CardTitle>
          <CardDescription>
            Gebruik deze URL's om webhooks te registreren bij Shopify en Mollie. De daily-sweep
            wordt 1×/dag automatisch aangeroepen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm font-mono break-all">
          <div>
            <div className="text-xs text-muted-foreground font-sans">Shopify webhook</div>
            {apiBaseUrl}/functions/v1/shopify-webhook
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-sans">Mollie webhook</div>
            {apiBaseUrl}/functions/v1/mollie-webhook
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-sans">
              Daily sweep (handmatig of via cron)
            </div>
            {apiBaseUrl}/functions/v1/daily-sweep
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function parseMoney(value: string) {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseArticleImport(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [articleNumber, productName, priceRaw, vatRaw, statusRaw, categoryRaw] = line
        .split(/\t+/)
        .map((part) => part.trim());

      if (!articleNumber || !productName || productName.toLowerCase().includes("test product")) {
        return null;
      }

      const vatRate = Number((vatRaw ?? "").replace(/[^\d,.-]/g, "").replace(",", "."));

      return {
        article_number: articleNumber,
        product_name: productName,
        price_gross: parseMoney(priceRaw ?? ""),
        vat_rate: Number.isFinite(vatRate) ? vatRate : null,
        active: /^actief$/i.test(statusRaw ?? ""),
        category: categoryRaw || null,
      };
    })
    .filter(
      (
        row,
      ): row is {
        article_number: string;
        product_name: string;
        price_gross: number;
        vat_rate: number | null;
        active: boolean;
        category: string | null;
      } => Boolean(row),
    );
}
