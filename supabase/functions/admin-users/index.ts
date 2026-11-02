import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const roles = new Set(["owner", "admin", "cashier"]);

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return response({ error: "Metode tidak diizinkan." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase Edge Function secrets are missing.");
    return response({ error: "Konfigurasi server untuk manajemen akun belum lengkap." }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response({ error: "Sesi login diperlukan." }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const getActiveOwnerIds = async () => {
    const { data: ownerProfiles, error: ownersError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("role", "owner");
    if (ownersError) throw ownersError;

    const activeAuthIds = new Set<string>();
    for (let page = 1; ; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      data.users
        .filter((user) => !user.banned_until || new Date(user.banned_until) <= new Date())
        .forEach((user) => activeAuthIds.add(user.id));
      if (data.users.length < 1000) break;
    }
    return (ownerProfiles || [])
      .filter((profile) => activeAuthIds.has(profile.id))
      .map((profile) => profile.id);
  };
  const accessToken = authorization.slice("Bearer ".length);
  const { data: userResult, error: userError } = await adminClient.auth.getUser(accessToken);
  if (userError || !userResult.user) {
    return response({ error: "Sesi login tidak valid." }, 401);
  }

  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userResult.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Unable to verify caller role:", profileError.message);
    return response({ error: "Role pengguna gagal diverifikasi." }, 500);
  }
  if (callerProfile?.role !== "owner") {
    return response({ error: "Hanya Owner yang dapat mengelola akun." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response({ error: "Permintaan tidak valid." }, 400);
  }

  if (body.action === "list") {
    const users = [];
    for (let page = 1; ; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error("Unable to list auth users:", error.message);
        return response({ error: "Daftar pengguna gagal dimuat." }, 500);
      }
      users.push(...data.users);
      if (data.users.length < 1000) break;
    }

    const { data: profiles, error } = await adminClient
      .from("profiles")
      .select("id, full_name, role");
    if (error) {
      console.error("Unable to list profiles:", error.message);
      return response({ error: "Profil pengguna gagal dimuat." }, 500);
    }
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    if (users.some((user) => !profileById.has(user.id))) {
      console.error("An auth user is missing its profile.");
      return response({ error: "Ada pengguna tanpa profil role. Periksa migration profil Supabase." }, 500);
    }
    const listedUsers = [];
    for (const user of users) {
      const profile = profileById.get(user.id);
      if (!profile) {
        console.error(`Auth user ${user.id} is missing its profile.`);
        return response({ error: "Ada pengguna tanpa profil role. Periksa migration profil Supabase." }, 500);
      }
      listedUsers.push({
        id: user.id,
        email: user.email,
        full_name: profile.full_name ?? user.user_metadata?.full_name ?? "",
        role: profile.role,
        disabled: Boolean(user.banned_until && new Date(user.banned_until) > new Date()),
      });
    }
    return response({ users: listedUsers });
  }

  if (body.action === "create") {
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = typeof body.role === "string" ? body.role : "";
    if (fullName.length < 2 || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response({ error: "Nama lengkap atau email tidak valid." }, 400);
    }
    if (password.length < 8 || password.length > 128) {
      return response({ error: "Password harus memiliki 8 sampai 128 karakter." }, 400);
    }
    if (!roles.has(role)) {
      return response({ error: "Role pengguna tidak valid." }, 400);
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      console.error("Unable to create auth user:", error.message);
      return response({ error: error.message }, 400);
    }
    const { error: saveProfileError } = await adminClient.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName,
      role,
      updated_at: new Date().toISOString(),
    });
    if (saveProfileError) {
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(data.user.id);
      if (rollbackError) console.error("Unable to roll back incomplete user creation:", rollbackError.message);
      console.error("Unable to save new user profile:", saveProfileError.message);
      return response({ error: "Profil akun gagal disimpan. Akun tidak berhasil dibuat." }, 500);
    }
    return response({ userId: data.user.id });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId || userId === userResult.user.id) {
    return response({ error: "ID akun tidak valid atau Anda tidak dapat mengubah akun sendiri." }, 400);
  }

  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (targetError) {
    console.error("Unable to load target profile:", targetError.message);
    return response({ error: "Profil akun tujuan gagal dimuat." }, 500);
  }
  if (!targetProfile) return response({ error: "Akun tidak ditemukan." }, 404);

  if (body.action === "set-role") {
    const role = typeof body.role === "string" ? body.role : "";
    if (!roles.has(role)) return response({ error: "Role pengguna tidak valid." }, 400);
    if (targetProfile.role === "owner" && role !== "owner") {
      let owners: string[];
      try {
        owners = await getActiveOwnerIds();
      } catch (error) {
        console.error("Unable to verify remaining active owners:", error);
        return response({ error: "Jumlah Owner aktif gagal diverifikasi." }, 500);
      }
      if (owners.filter((ownerId) => ownerId !== userId).length === 0) {
        return response({ error: "Akun Owner aktif terakhir tidak dapat diturunkan rolenya." }, 409);
      }
    }
    const { error } = await adminClient.from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) {
      console.error("Unable to update user role:", error.message);
      return response({ error: "Role pengguna gagal diperbarui." }, 500);
    }
    return response({ success: true });
  }

  if (body.action === "set-active" && typeof body.active === "boolean") {
    if (!body.active && targetProfile.role === "owner") {
      let owners: string[];
      try {
        owners = await getActiveOwnerIds();
      } catch (error) {
        console.error("Unable to verify active owners:", error);
        return response({ error: "Status Owner gagal diverifikasi." }, 500);
      }
      if (owners.filter((ownerId) => ownerId !== userId).length === 0) {
        return response({ error: "Akun Owner aktif terakhir tidak dapat dinonaktifkan." }, 409);
      }
    }
    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: body.active ? "none" : "876000h",
    });
    if (error) {
      console.error("Unable to update user active status:", error.message);
      return response({ error: "Status akun gagal diperbarui." }, 500);
    }
    return response({ success: true });
  }

  return response({ error: "Aksi manajemen akun tidak dikenali." }, 400);
});
