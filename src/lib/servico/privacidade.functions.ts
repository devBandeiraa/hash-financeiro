/** Direito ao esquecimento (LGPD). */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Direito ao esquecimento (LGPD): apaga transações, contas e regras do usuário
 * e remove a própria conta de acesso. Só o dono pode executar sobre si mesmo.
 */
export const excluirMinhaConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    await supabase.from("insights_mensais").delete().eq("usuario_id", userId);
    await supabase.from("transacoes").delete().eq("usuario_id", userId);
    await supabase.from("regras_categorizacao").delete().eq("usuario_id", userId);
    await supabase.from("categorias").delete().eq("usuario_id", userId);
    await supabase.from("contas").delete().eq("usuario_id", userId);
    await supabase.from("perfis").delete().eq("id", userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error("Dados apagados, mas a conta de acesso não pôde ser removida.");

    return { ok: true };
  });
