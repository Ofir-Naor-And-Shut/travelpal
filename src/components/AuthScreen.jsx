import { useEffect, useState } from "react";
import {
  BedDouble,
  Check,
  Lock,
  LogIn,
  MailCheck,
  MoveRight,
  Plane,
  RefreshCw,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import AppControls from "./AppControls.jsx";
import {
  sendMagicLink,
  setLocalOnly,
  signInWithPassword,
} from "../lib/auth.js";
import { useI18n } from "../lib/i18n.js";

// Deliberately forgiving — the real check is Supabase sending the mail. This
// just catches an obviously empty or malformed entry before a round-trip.
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * Passwordless sign-in / sign-up. One email field: the first link for an
 * address creates the account, every later one just logs in — so there's no
 * separate "sign up" to get wrong. "Continue without an account" drops into the
 * local-only path the whole app still supports.
 */
export default function AuthScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [resend, setResend] = useState("idle"); // idle | sending | sent | error
  const sent = status === "sent";

  // A password-based alternative, off by default — only an account with a
  // password set (in practice, the one admin account) can use it; a regular
  // magic-link-only account just gets "incorrect email or password".
  const [showPassword, setShowPassword] = useState(false);
  const [pwEmail, setPwEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pwStatus, setPwStatus] = useState("idle"); // idle | sending | error

  // Let the "Link sent" confirmation settle, then re-arm the button so a second
  // resend is possible if the first mail still hasn't arrived.
  useEffect(() => {
    if (resend !== "sent") return undefined;
    const id = setTimeout(() => setResend("idle"), 4000);
    return () => clearTimeout(id);
  }, [resend]);

  const submitPassword = async (e) => {
    e.preventDefault();
    if (pwStatus === "sending") return;
    setPwStatus("sending");
    try {
      await signInWithPassword(pwEmail.trim(), password);
      // On success, onAuthStateChange (auth.js) picks up the session and this
      // screen unmounts — nothing else to do here.
    } catch {
      setPwStatus("error");
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (status === "sending") return;
    if (!looksLikeEmail(email)) {
      setStatus("error");
      return;
    }
    setStatus("sending");
    try {
      await sendMagicLink(email.trim());
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  const resendLink = async () => {
    if (resend === "sending") return;
    setResend("sending");
    try {
      await sendMagicLink(email.trim());
      setResend("sent");
    } catch {
      // Keep the confirmation screen — the address is still valid, only the
      // send failed — and report it inline rather than dropping to the form.
      setResend("error");
    }
  };

  return (
    <div className="bg-wander relative flex min-h-full flex-col lg:flex-row">
      <div className="absolute inset-x-0 top-0 z-10 flex justify-center p-4 lg:justify-end lg:pe-6">
        <AppControls />
      </div>

      {/* Hero panel — sets the mood; hidden on phones where the card below
          carries the same message more compactly. Transparent so the shared
          page backdrop shows through both halves. */}
      <div className="relative hidden lg:flex lg:w-1/2 lg:items-center lg:justify-center lg:p-16 xl:p-24">
        <div className="relative z-10 w-full max-w-md">
          <img
            src="/logo.png"
            alt={t("app.name")}
            className="mb-8 h-20 w-20 rounded-2xl shadow-sm"
          />

          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-fg">
            {t("auth.heroHeadline")}
          </h1>
          <p className="mt-4 max-w-sm text-base text-muted">
            {t("auth.heroBody")}
          </p>

          <div className="mt-10 flex gap-3">
            <div className="grid size-14 place-items-center rounded-2xl border border-line bg-surface/80 shadow-sm backdrop-blur">
              <Plane size={22} className="text-cat-transport" />
            </div>
            <div className="grid size-14 place-items-center rounded-2xl border border-line bg-surface/80 shadow-sm backdrop-blur">
              <BedDouble size={22} className="text-cat-sleeping" />
            </div>
            <div className="grid size-14 place-items-center rounded-2xl border border-line bg-surface/80 shadow-sm backdrop-blur">
              <UtensilsCrossed size={22} className="text-cat-reservations" />
            </div>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 lg:w-1/2 lg:px-16">
        <div className="card w-full max-w-sm p-7 shadow-xl shadow-shadow/20">
          <div className="mb-6 text-center lg:hidden">
            <h1 className="sr-only">{t("app.name")}</h1>
            <img
              src="/logo.png"
              alt={t("app.name")}
              className="mx-auto mb-3 h-16 w-16 rounded-2xl shadow-sm"
            />
            <p className="mt-1 text-sm text-muted">{t("auth.tagline")}</p>
          </div>

          <div className="mb-6 hidden text-center lg:block lg:text-start">
            <h2 className="text-2xl font-semibold tracking-tight text-fg">
              {t("auth.welcomeTitle")}
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              {t("auth.welcomeSubtitle")}
            </p>
          </div>

          {sent ? (
          <div className="rounded-xl border border-line bg-raised px-4 py-5 text-center">
            <MailCheck size={22} className="mx-auto mb-2 text-accent" />
            <p className="font-medium text-fg">{t("auth.sentTitle")}</p>
            <p className="mt-1 text-sm text-muted">
              {t("auth.sentBody", { email: email.trim() })}
            </p>
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <button
                type="button"
                className="btn-soft !py-1.5 text-xs"
                onClick={resendLink}
                disabled={resend === "sending"}
              >
                {resend === "sent" ? (
                  <Check size={14} className="text-accent" />
                ) : (
                  <RefreshCw
                    size={14}
                    className={resend === "sending" ? "animate-spin" : ""}
                  />
                )}
                {resend === "sending"
                  ? t("auth.resending")
                  : resend === "sent"
                    ? t("auth.resent")
                    : t("auth.resend")}
              </button>
              {resend === "error" && (
                <p role="alert" className="text-xs text-accent">
                  {t("auth.error")}
                </p>
              )}
              <button
                type="button"
                className="btn-ghost !py-1 text-xs"
                onClick={() => {
                  setStatus("idle");
                  setResend("idle");
                  setEmail("");
                }}
              >
                {t("auth.differentEmail")}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <label
              htmlFor="auth-email"
              className="mb-1.5 block text-sm font-medium text-fg"
            >
              {t("auth.emailLabel")}
            </label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              className="field"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              aria-invalid={status === "error"}
            />
            {status === "error" && (
              <p role="alert" className="mt-1.5 text-sm text-accent">
                {looksLikeEmail(email)
                  ? t("auth.error")
                  : t("auth.invalidEmail")}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary mt-4 w-full"
              disabled={status === "sending"}
            >
              <Sparkles size={15} />
              {status === "sending" ? t("auth.sending") : t("auth.send")}
            </button>
          </form>
        )}

        <div className="mt-5 border-t border-line pt-4 text-center">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted underline-offset-2 hover:text-fg hover:underline"
            onClick={() => setLocalOnly(true)}
          >
            {t("auth.localOnly")}
            <MoveRight size={14} />
          </button>
          <p className="mt-1 text-xs text-subtle">{t("auth.localOnlyHint")}</p>
        </div>

        <div className="mt-4 text-center">
          {showPassword ? (
            <form onSubmit={submitPassword} className="text-start">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                className="field"
                placeholder={t("auth.emailPlaceholder")}
                value={pwEmail}
                onChange={(e) => {
                  setPwEmail(e.target.value);
                  if (pwStatus === "error") setPwStatus("idle");
                }}
              />
              <input
                type="password"
                autoComplete="current-password"
                className="field mt-2"
                placeholder={t("auth.passwordLabel")}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (pwStatus === "error") setPwStatus("idle");
                }}
                aria-invalid={pwStatus === "error"}
              />
              {pwStatus === "error" && (
                <p role="alert" className="mt-1.5 text-sm text-accent">
                  {t("auth.passwordError")}
                </p>
              )}
              <button
                type="submit"
                className="btn-soft mt-3 w-full !py-1.5 text-sm"
                disabled={pwStatus === "sending"}
              >
                <LogIn size={14} />
                {pwStatus === "sending"
                  ? t("auth.passwordSigningIn")
                  : t("auth.passwordSignIn")}
              </button>
              <button
                type="button"
                className="btn-ghost mt-1.5 w-full !py-1 text-xs"
                onClick={() => {
                  setShowPassword(false);
                  setPwStatus("idle");
                  setPassword("");
                }}
              >
                {t("auth.backToMagicLink")}
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="text-xs text-subtle underline-offset-2 hover:text-muted hover:underline"
              onClick={() => setShowPassword(true)}
            >
              {t("auth.passwordToggle")}
            </button>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-subtle">
          <Lock size={12} />
          {t("auth.trustNote")}
        </p>
      </div>
      </div>
    </div>
  );
}
