import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { KeyRound, Save, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/gebruikers")({
  head: () => ({ meta: [{ title: "Gebruikers - Daily Flowers" }] }),
  component: GebruikersPage,
});

type UserRow = {
  id: string;
  email: string;
  created_at: string | null;
};

function GebruikersPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("users")
        .select("id,email,created_at")
        .order("email");
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail || !password) {
      toast.error("E-mail en wachtwoord zijn verplicht");
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase as any).from("users").insert({
        email: nextEmail,
        password,
      });
      if (error) throw error;

      toast.success("Gebruiker toegevoegd");
      setEmail("");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (error) {
      toast.error("Gebruiker toevoegen mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Gebruikers</h1>
        <p className="text-sm text-muted-foreground">
          Beheer gebruikers voor het boekhouddashboard. Wachtwoorden worden alleen gehasht opgeslagen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gebruiker toevoegen</CardTitle>
          <CardDescription>Maak een login aan met e-mail en tijdelijk wachtwoord.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(180px,0.8fr)_auto]" onSubmit={addUser}>
            <Input
              type="email"
              autoComplete="username"
              placeholder="email@dailyflowers.nl"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Wachtwoord"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" disabled={saving}>
              <UserPlus className="mr-2 h-4 w-4" />
              Toevoegen
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bestaande gebruikers</CardTitle>
          <CardDescription>Wijzig e-mailadressen of zet een nieuw wachtwoord zonder het oude te tonen.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">E-mail</th>
                  <th className="px-4 py-3 text-left font-medium">Aangemaakt</th>
                  <th className="px-4 py-3 text-left font-medium">Nieuw wachtwoord</th>
                  <th className="px-4 py-3 text-right font-medium">Acties</th>
                </tr>
              </thead>
              <tbody>
                {(usersQ.data ?? []).map((user) => (
                  <UserTableRow key={user.id} user={user} />
                ))}
                {!usersQ.isLoading && (usersQ.data ?? []).length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted-foreground" colSpan={4}>
                      Nog geen gebruikers gevonden.
                    </td>
                  </tr>
                ) : null}
                {usersQ.isLoading ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted-foreground" colSpan={4}>
                      Gebruikers laden...
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UserTableRow({ user }: { user: UserRow }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function saveUser() {
    const nextEmail = email.trim().toLowerCase();
    const payload: Record<string, string> = {};
    if (nextEmail && nextEmail !== user.email) payload.email = nextEmail;
    if (password) payload.password = password;

    if (Object.keys(payload).length === 0) {
      toast.message("Geen wijzigingen om op te slaan");
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase as any).from("users").update(payload).eq("id", user.id);
      if (error) throw error;
      toast.success("Gebruiker bijgewerkt");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (error) {
      toast.error("Gebruiker bijwerken mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser() {
    if (!window.confirm(`Gebruiker ${user.email} verwijderen?`)) return;

    setDeleting(true);
    try {
      const { error } = await (supabase as any).from("users").delete().eq("id", user.id);
      if (error) throw error;
      toast.success("Gebruiker verwijderd");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (error) {
      toast.error("Gebruiker verwijderen mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-3 align-middle">
        <Input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </td>
      <td className="px-4 py-3 align-middle text-muted-foreground tabular-nums">
        {formatDate(user.created_at)}
      </td>
      <td className="px-4 py-3 align-middle">
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            type="password"
            autoComplete="new-password"
            placeholder="Nieuw wachtwoord"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={saveUser} disabled={saving || deleting}>
            <Save className="mr-2 h-4 w-4" />
            Opslaan
          </Button>
          <Button variant="outline" size="sm" onClick={deleteUser} disabled={saving || deleting}>
            <Trash2 className="mr-2 h-4 w-4" />
            Verwijderen
          </Button>
        </div>
      </td>
    </tr>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
