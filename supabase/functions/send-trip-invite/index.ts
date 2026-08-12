// Emails a pending collaborator that someone wants to share a trip with them,
// with a button back to the app. Only fires for emails with no account yet —
// see supabase/schema.sql's pending_trip_invites; an already-registered
// collaborator is added directly and just sees the trip on their next sign-in.
//
// Uses Supabase's own built-in "invite user" email (Auth admin API) — no
// external email provider, domain, or API key needed. Its content/branding
// comes from the project's Auth → Email Templates → "Invite user" template
// in the Supabase dashboard, not from this function.
//
// Auth: the caller's own JWT (forwarded automatically by supabase-js) scopes a
// client so RLS decides what it can see — ownership is confirmed by that
// query succeeding, never by trusting anything the client claims. A second,
// service-role client is used only for the actual invite call, which requires
// admin privileges the caller's own JWT could never have.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return json({ error: "Missing Authorization header" }, 401);

    const { tripId, email } = await req.json();
    if (!tripId || !email) {
      return json({ error: "tripId and email are required" }, 400);
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAsUser = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } =
      await supabaseAsUser.auth.getUser();
    if (userError || !userData.user)
      return json({ error: "Not signed in" }, 401);

    // Only the owner sends invites — RLS would return this row for an
    // editor collaborator too, so ownership is checked explicitly.
    const { data: trip, error: tripError } = await supabaseAsUser
      .from("trips")
      .select("owner_id, data")
      .eq("id", tripId)
      .single();
    if (tripError || !trip || trip.owner_id !== userData.user.id) {
      return json({ error: "Not the trip owner" }, 403);
    }

    // The app always creates this row before calling here — confirms there's
    // actually something to invite about rather than trusting the request.
    const { data: invite, error: inviteError } = await supabaseAsUser
      .from("pending_trip_invites")
      .select("id")
      .eq("trip_id", tripId)
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (inviteError || !invite) {
      return json({ error: "No pending invite for that email" }, 404);
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? supabaseUrl;
    const tripTitle = trip.data?.title || "a trip";
    const inviterEmail = userData.user.email ?? "Someone";

    // Creates the account (in an unconfirmed "invited" state) and sends
    // Supabase's own invite email. That auth.users insert immediately fires
    // resolve_pending_invites (see schema.sql), converting this row into a
    // real trip_members membership before the invitee even opens the email.
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: sendError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
        redirectTo: siteUrl,
        data: { inviterEmail, tripTitle },
      });
    if (sendError) {
      console.error("Supabase invite error:", sendError);
      return json({ error: "Failed to send invite email" }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ error: "Unexpected error" }, 500);
  }
});
