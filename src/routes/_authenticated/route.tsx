import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  ListOrdered,
  Target,
  FileSpreadsheet,
  Settings,
  LogOut,
  Flower2,
  Upload,
  CreditCard,
  FileText,
  Scale,
  BookOpen,
  BarChart3,
  Users,
  HandCoins,
  WalletCards,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/budgetten", label: "Omzet monitoring", icon: Target },
  { to: "/winst-verlies", label: "W&V", icon: BarChart3 },
  { to: "/btw-export", label: "Btw-export", icon: FileSpreadsheet },
  { to: "/instellingen", label: "Instellingen", icon: Settings },
] as const;

const beheerNav = [
  { to: "/transacties", label: "Verkooptransacties", icon: ListOrdered },
  { to: "/afs-huur", label: "AFS huurafspraken", icon: HandCoins },
  { to: "/mollie-transacties", label: "Mollie transacties", icon: CreditCard },
  { to: "/shopify-betalingen", label: "Shopify betalingen", icon: WalletCards },
  { to: "/exact-transacties", label: "Exact transacties", icon: FileText },
  { to: "/bold-afs-aansluiting", label: "Bold <> Mollie aansluiting", icon: Scale },
  { to: "/grootboek", label: "Grootboek", icon: BookOpen },
  { to: "/import-csv", label: "CSV import", icon: Upload },
  { to: "/gebruikers", label: "Gebruikers", icon: Users },
] as const;

function AuthedLayout() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [updatedThroughDate, setUpdatedThroughDate] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.navigate({ to: "/auth" });
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    supabase
      .from("vw_gl_yearly_status" as never)
      .select("updated_through_date")
      .not("updated_through_date", "is", null)
      .order("updated_through_date", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const value =
          (data as { updated_through_date?: string | null } | null)?.updated_through_date ?? null;
        setUpdatedThroughDate(value);
      })
      .catch(() => setUpdatedThroughDate(null));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }

  return (
    <SidebarProvider>
      <Toaster richColors position="top-right" />
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-2">
            <Flower2 className="h-6 w-6 text-primary" />
            <div className="leading-tight">
              <div className="font-semibold text-sm">Daily Flowers</div>
              <div className="text-xs text-muted-foreground">Boekhouddashboard</div>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild>
                      <Link
                        to={item.to}
                        activeProps={{
                          className: "bg-sidebar-accent text-sidebar-accent-foreground",
                        }}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Beheer schermen</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {beheerNav.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild>
                      <Link
                        to={item.to}
                        activeProps={{
                          className: "bg-sidebar-accent text-sidebar-accent-foreground",
                        }}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="px-2 py-2 space-y-2">
            <div className="text-xs text-muted-foreground truncate">{email}</div>
            <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5 mr-2" /> Uitloggen
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4 sticky top-0 bg-background z-10">
          <SidebarTrigger />
          <div className="font-medium text-sm">Intern boekhoud-/controledashboard</div>
          <div className="ml-auto text-right text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Bijgewerkt t/m</span>{" "}
            <span className="tabular-nums">{formatLooseDate(updatedThroughDate) ?? "-"}</span>
          </div>
        </header>
        <main className="p-6 max-w-[1400px] w-full">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
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
