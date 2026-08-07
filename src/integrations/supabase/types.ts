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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      categorias: {
        Row: {
          cor: string
          criado_em: string
          id: string
          nome: string
          usuario_id: string | null
        }
        Insert: {
          cor?: string
          criado_em?: string
          id?: string
          nome: string
          usuario_id?: string | null
        }
        Update: {
          cor?: string
          criado_em?: string
          id?: string
          nome?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      insights_mensais: {
        Row: {
          gerado_em: string
          id: string
          impressao: string
          mes: string
          texto: string
          usuario_id: string
        }
        Insert: {
          gerado_em?: string
          id?: string
          impressao: string
          mes: string
          texto: string
          usuario_id: string
        }
        Update: {
          gerado_em?: string
          id?: string
          impressao?: string
          mes?: string
          texto?: string
          usuario_id?: string
        }
        Relationships: []
      }
      contas: {
        Row: {
          criado_em: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["tipo_conta"]
          usuario_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          nome: string
          tipo?: Database["public"]["Enums"]["tipo_conta"]
          usuario_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["tipo_conta"]
          usuario_id?: string
        }
        Relationships: []
      }
      perfis: {
        Row: {
          criado_em: string
          id: string
          nome_exibicao: string | null
        }
        Insert: {
          criado_em?: string
          id: string
          nome_exibicao?: string | null
        }
        Update: {
          criado_em?: string
          id?: string
          nome_exibicao?: string | null
        }
        Relationships: []
      }
      regras_categorizacao: {
        Row: {
          ativa: boolean
          categoria_id: string
          criado_em: string
          id: string
          origem: Database["public"]["Enums"]["categoria_origem"]
          palavra_chave: string
          prioridade: number
          usuario_id: string | null
        }
        Insert: {
          ativa?: boolean
          categoria_id: string
          criado_em?: string
          id?: string
          origem?: Database["public"]["Enums"]["categoria_origem"]
          palavra_chave: string
          prioridade?: number
          usuario_id?: string | null
        }
        Update: {
          ativa?: boolean
          categoria_id?: string
          criado_em?: string
          id?: string
          origem?: Database["public"]["Enums"]["categoria_origem"]
          palavra_chave?: string
          prioridade?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regras_categorizacao_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      transacoes: {
        Row: {
          categoria_id: string | null
          categoria_origem: Database["public"]["Enums"]["categoria_origem"]
          conta_id: string
          criado_em: string
          data: string
          descricao: string
          hash_dedupe: string
          id: string
          origem: Database["public"]["Enums"]["origem_import"]
          tipo: Database["public"]["Enums"]["tipo_transacao"]
          usuario_id: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          categoria_origem?: Database["public"]["Enums"]["categoria_origem"]
          conta_id: string
          criado_em?: string
          data: string
          descricao: string
          hash_dedupe: string
          id?: string
          origem?: Database["public"]["Enums"]["origem_import"]
          tipo: Database["public"]["Enums"]["tipo_transacao"]
          usuario_id: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          categoria_origem?: Database["public"]["Enums"]["categoria_origem"]
          conta_id?: string
          criado_em?: string
          data?: string
          descricao?: string
          hash_dedupe?: string
          id?: string
          origem?: Database["public"]["Enums"]["origem_import"]
          tipo?: Database["public"]["Enums"]["tipo_transacao"]
          usuario_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      categoria_origem: "sistema" | "usuario" | "ia"
      origem_import: "CSV" | "PDF" | "MANUAL"
      tipo_conta: "CORRENTE" | "POUPANCA" | "CARTAO"
      tipo_transacao: "DEBITO" | "CREDITO"
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
      origem_import: ["CSV", "PDF", "MANUAL"],
      tipo_conta: ["CORRENTE", "POUPANCA", "CARTAO"],
      tipo_transacao: ["DEBITO", "CREDITO"],
    },
  },
} as const
