export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bold_articles: {
        Row: {
          active: boolean
          article_number: string
          category: string | null
          created_at: string
          id: string
          price_gross: number
          product_name: string
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          active?: boolean
          article_number: string
          category?: string | null
          created_at?: string
          id?: string
          price_gross?: number
          product_name: string
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          active?: boolean
          article_number?: string
          category?: string | null
          created_at?: string
          id?: string
          price_gross?: number
          product_name?: string
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount: number
          channel: Database["public"]["Enums"]["tx_channel"]
          created_at: string
          id: string
          machine_id: string | null
          period: string
          updated_at: string
        }
        Insert: {
          amount: number
          channel: Database["public"]["Enums"]["tx_channel"]
          created_at?: string
          id?: string
          machine_id?: string | null
          period: string
          updated_at?: string
        }
        Update: {
          amount?: number
          channel?: Database["public"]["Enums"]["tx_channel"]
          created_at?: string
          id?: string
          machine_id?: string | null
          period?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_budget_lines: {
        Row: {
          amount: number
          budget_year: number
          created_at: string
          id: string
          kind: string
          line_key: string
          line_label: string
          period: string
          section: string
          sort_order: number
          source_label: string
          source_sheet: string
          source_workbook: string
          updated_at: string
        }
        Insert: {
          amount?: number
          budget_year: number
          created_at?: string
          id?: string
          kind?: string
          line_key: string
          line_label: string
          period: string
          section: string
          sort_order?: number
          source_label: string
          source_sheet: string
          source_workbook: string
          updated_at?: string
        }
        Update: {
          amount?: number
          budget_year?: number
          created_at?: string
          id?: string
          kind?: string
          line_key?: string
          line_label?: string
          period?: string
          section?: string
          sort_order?: number
          source_label?: string
          source_sheet?: string
          source_workbook?: string
          updated_at?: string
        }
        Relationships: []
      }
      machines: {
        Row: {
          active: boolean
          afs_number: string
          created_at: string
          display_name: string
          id: string
          machine_id: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          afs_number: string
          created_at?: string
          display_name: string
          id?: string
          machine_id?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          afs_number?: string
          created_at?: string
          display_name?: string
          id?: string
          machine_id?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mollie_settings: {
        Row: {
          active: boolean
          api_key: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          api_key: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          api_key?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      mollie_transactions: {
        Row: {
          amount_gross: number
          amount_net: number | null
          created_at: string
          description_raw: string | null
          discount_amount: number | null
          id: string
          machine_id: string | null
          mollie_created_at: string | null
          mollie_paid_at: string | null
          parse_error_message: string | null
          parse_status: Database["public"]["Enums"]["parse_status"]
          parsed_afs_number: string | null
          parsed_article_number: string | null
          parsed_invoice_number: string | null
          parsed_paid_at: string | null
          payment_id: string
          raw_payload: Json | null
          sales_action: "not_parsed" | "added" | "already_exists"
          sales_transaction_id: string | null
          status: Database["public"]["Enums"]["tx_status"]
          updated_at: string
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          amount_gross?: number
          amount_net?: number | null
          created_at?: string
          description_raw?: string | null
          discount_amount?: number | null
          id?: string
          machine_id?: string | null
          mollie_created_at?: string | null
          mollie_paid_at?: string | null
          parse_error_message?: string | null
          parse_status?: Database["public"]["Enums"]["parse_status"]
          parsed_afs_number?: string | null
          parsed_article_number?: string | null
          parsed_invoice_number?: string | null
          parsed_paid_at?: string | null
          payment_id: string
          raw_payload?: Json | null
          sales_action?: "not_parsed" | "added" | "already_exists"
          sales_transaction_id?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          amount_gross?: number
          amount_net?: number | null
          created_at?: string
          description_raw?: string | null
          discount_amount?: number | null
          id?: string
          machine_id?: string | null
          mollie_created_at?: string | null
          mollie_paid_at?: string | null
          parse_error_message?: string | null
          parse_status?: Database["public"]["Enums"]["parse_status"]
          parsed_afs_number?: string | null
          parsed_article_number?: string | null
          parsed_invoice_number?: string | null
          parsed_paid_at?: string | null
          payment_id?: string
          raw_payload?: Json | null
          sales_action?: "not_parsed" | "added" | "already_exists"
          sales_transaction_id?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mollie_transactions_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mollie_transactions_sales_transaction_id_fkey"
            columns: ["sales_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_connections: {
        Row: {
          access_token: string
          active: boolean
          client_id: string | null
          created_at: string
          id: string
          label: string
          last_synced_at: string | null
          shop_domain: string
          updated_at: string
        }
        Insert: {
          access_token: string
          active?: boolean
          client_id?: string | null
          created_at?: string
          id?: string
          label: string
          last_synced_at?: string | null
          shop_domain: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          active?: boolean
          client_id?: string | null
          created_at?: string
          id?: string
          label?: string
          last_synced_at?: string | null
          shop_domain?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          channel: string
          last_sweep_at: string | null
          last_sweep_message: string | null
          last_sweep_status: string | null
          records_processed: number | null
          updated_at: string
        }
        Insert: {
          channel: string
          last_sweep_at?: string | null
          last_sweep_message?: string | null
          last_sweep_status?: string | null
          records_processed?: number | null
          updated_at?: string
        }
        Update: {
          channel?: string
          last_sweep_at?: string | null
          last_sweep_message?: string | null
          last_sweep_status?: string | null
          records_processed?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_gross: number
          amount_net: number | null
          article_number: string | null
          channel: Database["public"]["Enums"]["tx_channel"]
          created_at: string
          description_raw: string | null
          discount_amount: number | null
          external_id: string
          id: string
          invoice_number: string | null
          invoice_url: string | null
          machine_id: string | null
          paid_at: string | null
          parse_error_message: string | null
          parse_status: Database["public"]["Enums"]["parse_status"]
          product_name: string | null
          raw_payload: Json | null
          source: Database["public"]["Enums"]["tx_source"]
          status: Database["public"]["Enums"]["tx_status"]
          updated_at: string
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          amount_gross?: number
          amount_net?: number | null
          article_number?: string | null
          channel: Database["public"]["Enums"]["tx_channel"]
          created_at?: string
          description_raw?: string | null
          discount_amount?: number | null
          external_id: string
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          machine_id?: string | null
          paid_at?: string | null
          parse_error_message?: string | null
          parse_status?: Database["public"]["Enums"]["parse_status"]
          product_name?: string | null
          raw_payload?: Json | null
          source: Database["public"]["Enums"]["tx_source"]
          status?: Database["public"]["Enums"]["tx_status"]
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          amount_gross?: number
          amount_net?: number | null
          article_number?: string | null
          channel?: Database["public"]["Enums"]["tx_channel"]
          created_at?: string
          description_raw?: string | null
          discount_amount?: number | null
          external_id?: string
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          machine_id?: string | null
          paid_at?: string | null
          parse_error_message?: string | null
          parse_status?: Database["public"]["Enums"]["parse_status"]
          product_name?: string | null
          raw_payload?: Json | null
          source?: Database["public"]["Enums"]["tx_source"]
          status?: Database["public"]["Enums"]["tx_status"]
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_rates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          rate: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          rate: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          rate?: number
        }
        Relationships: []
      }
    }
    Views: {
      vw_monthly_channel: {
        Row: {
          channel: Database["public"]["Enums"]["tx_channel"] | null
          gross_total: number | null
          net_total: number | null
          period: string | null
          tx_count: number | null
          vat_total: number | null
        }
        Relationships: []
      }
      vw_monthly_machine: {
        Row: {
          afs_number: string | null
          channel: Database["public"]["Enums"]["tx_channel"] | null
          display_name: string | null
          gross_total: number | null
          machine_id: string | null
          net_total: number | null
          period: string | null
          tx_count: number | null
          vat_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_monthly_vat: {
        Row: {
          channel: Database["public"]["Enums"]["tx_channel"] | null
          gross_total: number | null
          net_total: number | null
          period: string | null
          tx_count: number | null
          vat_rate: number | null
          vat_total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      parse_status: "ok" | "parse_error"
      tx_channel:
        | "shopify_webshop"
        | "shopify_winkel"
        | "bold_afs"
        | "mollie_facturen"
        | "wefact_facturen"
      tx_source: "shopify" | "mollie"
      tx_status:
        | "paid"
        | "pending"
        | "open"
        | "failed"
        | "canceled"
        | "expired"
        | "refunded"
        | "partially_refunded"
        | "authorized"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      parse_status: ["ok", "parse_error"],
      tx_channel: [
        "shopify_webshop",
        "shopify_winkel",
        "bold_afs",
        "mollie_facturen",
        "wefact_facturen",
      ],
      tx_source: ["shopify", "mollie"],
      tx_status: [
        "paid",
        "pending",
        "open",
        "failed",
        "canceled",
        "expired",
        "refunded",
        "partially_refunded",
        "authorized",
        "other",
      ],
    },
  },
} as const
