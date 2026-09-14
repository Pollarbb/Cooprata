import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply(405, { error: "Método não permitido." });
  try {
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return reply(401, { error: "Entre novamente." });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: identity, error: identityError } = await admin.auth.getUser(authorization.slice(7));
    if (identityError || !identity.user) return reply(401, { error: "Sessão inválida. Entre novamente." });
    const body = await request.json();
    if (!body || !["supermercado", "agropecuaria"].includes(body.department)) return reply(400, { error: "Departamento inválido." });
    const { data: permission, error: permissionError } = await admin.from("dashboard_memberships")
      .select("role").eq("user_id", identity.user.id).eq("department", body.department).maybeSingle();
    if (permissionError) return reply(503, { error: "Não foi possível verificar suas permissões." });
    if (permission?.role !== "admin") return reply(403, { error: "Somente o administrador deste departamento pode cadastrar usuários." });

    if (body.action === "departments") {
      const { data, error } = await admin.from("dashboard_memberships").select("department")
        .eq("user_id", identity.user.id).eq("role", "admin");
      if (error) return reply(503, { error: "Não foi possível carregar os departamentos." });
      return reply(200, { departments: data.map(row => row.department) });
    }
    if (body.action !== "create") return reply(400, { error: "Ação inválida." });
    const { name, email, password, role, department } = body;
    if (typeof name !== "string" || !name.trim() || name.length > 80 ||
        typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof password !== "string" || password.length < 12 || password.length > 128 ||
        !["editor", "viewer"].includes(role)) return reply(400, { error: "Confira nome, e-mail, perfil e senha (12 a 128 caracteres)." });
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(), password, email_confirm: true,
      user_metadata: { display_name: name.trim() },
    });
    if (createError || !created.user) return reply(400, { error: "Não foi possível criar o usuário. O e-mail pode já estar cadastrado ou a senha não atender aos requisitos." });
    const { error: membershipError } = await admin.from("dashboard_memberships").insert({
      user_id: created.user.id, department, role,
    });
    if (membershipError) {
      // Roll back only the identity created by this request, never an existing user.
      const { error: rollbackError } = await admin.auth.admin.deleteUser(created.user.id);
      return reply(500, { error: rollbackError
        ? "O cadastro foi criado sem acesso. Contate o administrador para concluir a permissão no Supabase."
        : "Não foi possível atribuir acesso. O cadastro foi cancelado; tente novamente." });
    }
    return reply(201, { user: { id: created.user.id, email: created.user.email, name: name.trim(), department, role } });
  } catch {
    return reply(400, { error: "Não foi possível processar o cadastro. Tente novamente." });
  }
});