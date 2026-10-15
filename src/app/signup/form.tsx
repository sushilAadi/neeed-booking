"use client";

import { Rise } from "cube-motion/react";
import { CheckCircle2, Send } from "lucide-react";
import { useActionState } from "react";
import { requestAccessAction, type SignupState } from "./actions";

const FIELDS = [
  {
    name: "doctorName",
    label: "Your name",
    placeholder: "Dr. Asha Rao",
    auto: "name",
  },
  {
    name: "clinicName",
    label: "Clinic name",
    placeholder: "Rao Family Clinic",
    auto: "organization",
  },
  {
    name: "city",
    label: "City",
    placeholder: "Tezpur",
    auto: "address-level2",
  },
  {
    name: "phone",
    label: "WhatsApp number (10 digits)",
    placeholder: "10-digit number",
    auto: "tel-national",
    mode: "numeric",
  },
  {
    name: "email",
    label: "Email (optional)",
    placeholder: "asha@raoclinic.in",
    auto: "email",
    mode: "email",
  },
] as const;

export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState | null, FormData>(
    requestAccessAction,
    null,
  );
  const errors = state && !state.ok ? state.errors : {};
  if (state?.ok)
    return (
      <Rise className="card grid justify-items-start gap-4 p-6 md:p-8">
        <span className="grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
          <CheckCircle2 size={28} strokeWidth={1.75} aria-hidden />
        </span>
        <h1 className="page-title display">Thanks, we'll be in touch</h1>
        <output className="block text-[15px] text-muted">
          We'll WhatsApp you within a day to set up your clinic and give you
          your login key.
        </output>
      </Rise>
    );
  return (
    <form action={action} noValidate className="card grid gap-5 p-6 md:p-8">
      <div className="grid gap-2">
        <p className="eyebrow">Join Neeed</p>
        <h1 className="page-title display">Request access</h1>
        <p className="text-[15px] text-muted">
          Tell us about your clinic. We'll set it up with you on WhatsApp.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => {
          const err = errors[f.name];
          return (
            <label
              key={f.name}
              className={`grid gap-1.5 ${f.name === "doctorName" || f.name === "email" ? "sm:col-span-2" : ""}`}
            >
              <span className="text-sm font-semibold">{f.label}</span>
              <span className="relative block">
                {f.name === "phone" && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-semibold text-muted"
                  >
                    +91
                  </span>
                )}
                <input
                  name={f.name}
                  defaultValue={state?.values[f.name]}
                  className={`field ${f.name === "phone" ? "pl-14 tracking-wide" : ""}`}
                  placeholder={f.placeholder}
                  autoComplete={f.auto}
                  inputMode={"mode" in f ? f.mode : undefined}
                  maxLength={
                    f.name === "phone" ? 10 : f.name === "email" ? 120 : 80
                  }
                  onInput={
                    f.name === "phone"
                      ? (e) => {
                          const el = e.currentTarget;
                          el.value = el.value.replace(/\D/g, "").slice(0, 10);
                        }
                      : undefined
                  }
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? `${f.name}-err` : undefined}
                />
              </span>
              {err && (
                <span
                  id={`${f.name}-err`}
                  className="text-sm font-semibold text-danger"
                >
                  {err}
                </span>
              )}
            </label>
          );
        })}
      </div>
      {errors.form && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {errors.form}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        <Send size={18} strokeWidth={1.75} aria-hidden />
        {pending ? "Sending…" : "Request access"}
      </button>
    </form>
  );
}
