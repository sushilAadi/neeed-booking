"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";
import { type LoginState, signIn } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    signIn,
    { message: "" },
  );
  return (
    <form action={action} className="grid gap-4">
      <label htmlFor="key" className="grid gap-2">
        <span className="text-sm font-semibold">Your key</span>
        <input
          id="key"
          name="key"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="DR-XXXX-XXXX-XXXX"
          aria-invalid={state.message ? true : undefined}
          aria-describedby="key-help"
          className="field display tracking-[0.12em] uppercase"
        />
      </label>
      <output id="key-help" className="block min-h-5 text-sm">
        {state.message ? (
          <span className="text-danger">{state.message}</span>
        ) : (
          <span className="text-muted">
            The key you saved when your account or staff login was created.
          </span>
        )}
      </output>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        <KeyRound size={18} aria-hidden />
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
