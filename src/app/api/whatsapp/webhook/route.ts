import { after, type NextRequest } from "next/server";
import { routeIncoming } from "@/lib/bot/route";
import { createSupabaseStore } from "@/lib/db/supabase-store";
import { parseWebhook, verifySignature } from "@/lib/wa/webhook";

// Meta's subscription check.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (
    q.get("hub.mode") === "subscribe" &&
    q.get("hub.verify_token") === process.env.WA_VERIFY_TOKEN &&
    process.env.WA_VERIFY_TOKEN
  )
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

// Ack fast (Meta retries slow responses), handle after the response.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (
    !verifySignature(
      raw,
      req.headers.get("x-hub-signature-256"),
      process.env.WA_APP_SECRET ?? "",
    )
  )
    return new Response("Bad signature", { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const msgs = parseWebhook(body);
  if (msgs.length) {
    after(async () => {
      const store = createSupabaseStore();
      // sequential: two messages from one user in one webhook must not race on the same conversation row
      for (const m of msgs) await routeIncoming(store, m, new Date());
    });
  }
  return new Response("OK", { status: 200 });
}
