// Invite-only sign-in by email link. Sign-ups are switched off in Supabase, so only invited friends get a link.

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Icon, Pup } from "./Icons";

/** Turns Supabase's auth errors into something a person can act on. */
function explain(error: { message?: string; status?: number; code?: string }): string {
  const msg = (error.message ?? "").toLowerCase();
  if (error.status === 429 || msg.includes("rate limit") || msg.includes("security purposes"))
    return "Too many sign-in emails have been sent recently. Wait a little and try again, or tap the link in your invitation email instead.";
  if (msg.includes("signups not allowed") || msg.includes("not found") || error.code === "otp_disabled")
    return "That email isn't on the invite list yet. Ask whoever shared Sniffari with you to send an invite.";
  return `The sign-in email couldn't be sent (${error.message ?? "unknown error"}). Try again in a minute.`;
}

export default function SignIn({ db, onClose }: { db: SupabaseClient; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [problem, setProblem] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await db.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: location.origin } });
    if (error) setProblem(explain(error));
    setState(error ? "error" : "sent");
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <div className="grab" />
        <div className="sheethead">
          <Pup size={44} />
          <div className="grow"><h2 id="signin-title">Join the pack</h2><p className="meta">Sniffari is invite-only for now.</p></div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">{Icon.close()}</button>
        </div>
        {state === "sent" ? (
          <p>Check your email for a sign-in link. Open it on this phone.</p>
        ) : (
          <form className="signin" onSubmit={submit}>
            <label htmlFor="email">Your email</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <button className="btn primary" type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a sign-in link"}</button>
            {state === "error" && <p className="warnbox">{problem}</p>}
          </form>
        )}
      </section>
    </>
  );
}
