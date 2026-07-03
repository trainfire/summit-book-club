import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret) {
    return Response.json({ ok: false, error: "CRON_SECRET is not set" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { ok: false, error: "Supabase environment is not configured" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { error, count } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true });

  if (error) {
    return Response.json(
      {
        ok: false,
        error: "Supabase keepalive query failed",
        details: error.message
      },
      { status: 502 }
    );
  }

  return Response.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    memberCount: count ?? 0
  });
}
