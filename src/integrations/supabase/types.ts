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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_events: {
        Row: {
          created_at: string
          event_data_json: Json | null
          event_name: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_data_json?: Json | null
          event_name: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_data_json?: Json | null
          event_name?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      applications: {
        Row: {
          created_at: string
          grant_version_id: string
          id: string
          inputs_json: Json | null
          status: Database["public"]["Enums"]["application_status"]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grant_version_id: string
          id?: string
          inputs_json?: Json | null
          status?: Database["public"]["Enums"]["application_status"]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grant_version_id?: string
          id?: string
          inputs_json?: Json | null
          status?: Database["public"]["Enums"]["application_status"]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_grant_version_id_fkey"
            columns: ["grant_version_id"]
            isOneToOne: false
            referencedRelation: "grant_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_value_json: Json | null
          old_value_json: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value_json?: Json | null
          old_value_json?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value_json?: Json | null
          old_value_json?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      email_events: {
        Row: {
          brevo_message_id: string | null
          created_at: string
          email_outbox_id: string | null
          event_data_json: Json | null
          event_type: string
          id: string
        }
        Insert: {
          brevo_message_id?: string | null
          created_at?: string
          email_outbox_id?: string | null
          event_data_json?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          brevo_message_id?: string | null
          created_at?: string
          email_outbox_id?: string | null
          event_data_json?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_events_email_outbox_id_fkey"
            columns: ["email_outbox_id"]
            isOneToOne: false
            referencedRelation: "email_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          brevo_message_id: string | null
          created_at: string
          id: string
          sent_at: string | null
          status: string
          subject: string | null
          template_key: string
          to_email: string
          user_id: string | null
          variables_json: Json | null
        }
        Insert: {
          brevo_message_id?: string | null
          created_at?: string
          id?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_key: string
          to_email: string
          user_id?: string | null
          variables_json?: Json | null
        }
        Update: {
          brevo_message_id?: string | null
          created_at?: string
          id?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_key?: string
          to_email?: string
          user_id?: string | null
          variables_json?: Json | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          brevo_template_id: number
          created_at: string
          description: string | null
          id: string
          template_key: string
          updated_at: string
        }
        Insert: {
          brevo_template_id: number
          created_at?: string
          description?: string | null
          id?: string
          template_key: string
          updated_at?: string
        }
        Update: {
          brevo_template_id?: number
          created_at?: string
          description?: string | null
          id?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      entitlement_consumptions: {
        Row: {
          consumed_at: string
          entitlement_id: string
          id: string
          report_id: string | null
        }
        Insert: {
          consumed_at?: string
          entitlement_id: string
          id?: string
          report_id?: string | null
        }
        Update: {
          consumed_at?: string
          entitlement_id?: string
          id?: string
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_consumptions_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlement_consumptions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          created_at: string
          entitlement_type: string
          expires_at: string | null
          id: string
          order_id: string | null
          quantity: number
          used_quantity: number
          user_id: string
        }
        Insert: {
          created_at?: string
          entitlement_type: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          quantity?: number
          used_quantity?: number
          user_id: string
        }
        Update: {
          created_at?: string
          entitlement_type?: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          quantity?: number
          used_quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_items: {
        Row: {
          application_id: string
          citation_text: string | null
          created_at: string
          file_path: string | null
          id: string
          metadata_json: Json | null
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          application_id: string
          citation_text?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          metadata_json?: Json | null
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          application_id?: string
          citation_text?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          metadata_json?: Json | null
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_items_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_versions: {
        Row: {
          created_at: string
          grant_id: string
          guidelines_json: Json | null
          id: string
          is_published: boolean
          published_at: string | null
          required_inputs_json: Json | null
          rubric_json: Json | null
          version_number: number
        }
        Insert: {
          created_at?: string
          grant_id: string
          guidelines_json?: Json | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          required_inputs_json?: Json | null
          rubric_json?: Json | null
          version_number: number
        }
        Update: {
          created_at?: string
          grant_id?: string
          guidelines_json?: Json | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          required_inputs_json?: Json | null
          rubric_json?: Json | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "grant_versions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
        ]
      }
      grants: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          paid_at: string | null
          product_id: string
          status: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          paid_at?: string | null
          product_id: string
          status?: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          product_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_cents: number
          product_key: string
          stripe_price_id: string | null
          stripe_product_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_cents: number
          product_key: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          product_key?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      report_run_steps: {
        Row: {
          citations_json: Json | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          outputs_json: Json | null
          report_run_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["step_status"]
          step_name: string
          step_number: number
        }
        Insert: {
          citations_json?: Json | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          outputs_json?: Json | null
          report_run_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["step_status"]
          step_name: string
          step_number: number
        }
        Update: {
          citations_json?: Json | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          outputs_json?: Json | null
          report_run_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["step_status"]
          step_name?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_run_steps_report_run_id_fkey"
            columns: ["report_run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_runs: {
        Row: {
          application_id: string
          completed_at: string | null
          created_at: string
          current_step: number
          id: string
          report_template_version_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["step_status"]
          total_steps: number
        }
        Insert: {
          application_id: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          report_template_version_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["step_status"]
          total_steps?: number
        }
        Update: {
          application_id?: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          report_template_version_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["step_status"]
          total_steps?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_runs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_runs_report_template_version_id_fkey"
            columns: ["report_template_version_id"]
            isOneToOne: false
            referencedRelation: "report_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      report_template_versions: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          published_at: string | null
          report_template_id: string
          sections_json: Json | null
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          report_template_id: string
          sections_json?: Json | null
          version_number: number
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          report_template_id?: string
          sections_json?: Json | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_template_versions_report_template_id_fkey"
            columns: ["report_template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          application_id: string
          citations_json: Json
          content_json: Json
          created_at: string
          docx_path: string | null
          grant_version_id: string
          id: string
          inputs_snapshot_json: Json
          pdf_path: string | null
          report_run_id: string
          report_template_version_id: string
          user_id: string
          version_number: number
        }
        Insert: {
          application_id: string
          citations_json?: Json
          content_json?: Json
          created_at?: string
          docx_path?: string | null
          grant_version_id: string
          id?: string
          inputs_snapshot_json?: Json
          pdf_path?: string | null
          report_run_id: string
          report_template_version_id: string
          user_id: string
          version_number?: number
        }
        Update: {
          application_id?: string
          citations_json?: Json
          content_json?: Json
          created_at?: string
          docx_path?: string | null
          grant_version_id?: string
          id?: string
          inputs_snapshot_json?: Json
          pdf_path?: string | null
          report_run_id?: string
          report_template_version_id?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "reports_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_grant_version_id_fkey"
            columns: ["grant_version_id"]
            isOneToOne: false
            referencedRelation: "grant_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_report_run_id_fkey"
            columns: ["report_run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_report_template_version_id_fkey"
            columns: ["report_template_version_id"]
            isOneToOne: false
            referencedRelation: "report_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "researcher" | "admin" | "super_admin"
      application_status: "draft" | "in_progress" | "ready" | "failed"
      order_status: "pending" | "paid" | "failed" | "refunded"
      step_status: "pending" | "running" | "completed" | "failed"
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
      app_role: ["researcher", "admin", "super_admin"],
      application_status: ["draft", "in_progress", "ready", "failed"],
      order_status: ["pending", "paid", "failed", "refunded"],
      step_status: ["pending", "running", "completed", "failed"],
    },
  },
} as const
