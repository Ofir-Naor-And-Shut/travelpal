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
  UserPlus,
  UtensilsCrossed,
} from "lucide-react";
import AppControls from "./AppControls.jsx";
import {
  sendPasswordResetLink,
  setLocalOnly,
  signInWithPassword,
  signUpWithPassword,
} from "../lib/auth.js";
import { useI18n } from "../lib/i18n.js";

// Deliberately forgiving — the real check is Supabase sending the mail. This
// just catches an obviously empty or malformed entry before a round-trip.
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * Email + password sign-in / sign-up, plus a "forgot password" mode that also
 * carries the whole "no account yet" backward-compat case: signing up on an
 * email that already exists (e.g. an old magic-link-only account) is handled
 * silently by auth.js as a password-reset send, so the "check your inbox"
 * panel here is deliberately identical for every case that reaches it —
 * never revealing whether the account already existed.
 */
export default function AuthScreen() {
  const { t } = useI18n();
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | error
  const [errorKey, setErrorKey] = useState("auth.error");
  const [sent, setSent] = useState(false);
  const [resend, setResend] = useState("idle"); // idle | sending | sent | error

  // Let the "sent" confirmation settle, then re-arm the button so a second
  // resend is possible if the first mail still hasn't arrived.
  useEffect(() => {
    if (resend !== "sent") return undefined;
    const id = setTimeout(() => setResend("idle"), 4000);
    return () => clearTimeout(id);
  }, [resend]);

  const resetMessages = () => {
    if (status === "error") setStatus("idle");
  };

  const changeMode = (next) => {
    setMode(next);
    setStatus("idle");
    setSent(false);
    setResend("idle");
    setPassword("");
    setConfirmPassword("");
  };

  const sendLink = async () => {
    if (mode === "signup") await signUpWithPassword(email.trim(), password);
    else await sendPasswordResetLink(email.trim());
  };

  const submit = async (e) => {
    e.preventDefault();
    if (status === "sending") return;
    if (!looksLikeEmail(email)) {
      setErrorKey("auth.invalidEmail");
      setStatus("error");
      return;
    }

    if (mode === "signin") {
      setStatus("sending");
      try {
        await signInWithPassword(email.trim(), password);
        // On success, onAuthStateChange (auth.js) picks up the session and
        // this screen unmounts — nothing else to do here.
      } catch {
        setErrorKey("auth.signInError");
        setStatus("error");
      }
      return;
    }

    if (mode === "signup") {
      if (password.length < 8) {
        setErrorKey("auth.passwordTooShort");
        setStatus("error");
        return;
      }
      if (password !== confirmPassword) {
        setErrorKey("auth.passwordMismatch");
        setStatus("error");
        return;
      }
    }

    setStatus("sending");
    try {
      await sendLink();
      setSent(true);
    } catch {
      setErrorKey("auth.error");
      setStatus("error");
    }
  };

  const resendLink = async () => {
    if (resend === "sending") return;
    setResend("sending");
    try {
      await sendLink();
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
                    changeMode(mode);
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
                  resetMessages();
                }}
                aria-invalid={status === "error"}
              />

              {mode !== "forgot" && (
                <>
                  <label
                    htmlFor="auth-password"
                    className="mb-1.5 mt-3 block text-sm font-medium text-fg"
                  >
                    {t("auth.passwordLabel")}
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    className="field"
                    placeholder={t("auth.passwordLabel")}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      resetMessages();
                    }}
                    aria-invalid={status === "error"}
                  />
                  {mode === "signup" && (
                    <p className="mt-1 text-xs text-subtle">
                      {t("auth.passwordHint")}
                    </p>
                  )}
                </>
              )}

              {mode === "signup" && (
                <>
                  <label
                    htmlFor="auth-confirm-password"
                    className="mb-1.5 mt-3 block text-sm font-medium text-fg"
                  >
                    {t("auth.confirmPasswordLabel")}
                  </label>
                  <input
                    id="auth-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    className="field"
                    placeholder={t("auth.confirmPasswordLabel")}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      resetMessages();
                    }}
                    aria-invalid={status === "error"}
                  />
                </>
              )}

              {mode === "signin" && (
                <button
                  type="button"
                  className="mt-2 text-xs text-subtle underline-offset-2 hover:text-muted hover:underline"
                  onClick={() => changeMode("forgot")}
                >
                  {t("auth.forgotPassword")}
                </button>
              )}

              {status === "error" && (
                <p role="alert" className="mt-1.5 text-sm text-accent">
                  {t(errorKey)}
                </p>
              )}

              <button
                type="submit"
                className="btn-primary mt-4 w-full"
                disabled={status === "sending"}
              >
                {mode === "signup" ? (
                  <UserPlus size={15} />
                ) : (
                  <LogIn size={15} />
                )}
                {mode === "signin" &&
                  (status === "sending"
                    ? t("auth.passwordSigningIn")
                    : t("auth.passwordSignIn"))}
                {mode === "signup" &&
                  (status === "sending"
                    ? t("auth.signingUp")
                    : t("auth.signUp"))}
                {mode === "forgot" &&
                  (status === "sending"
                    ? t("auth.sending")
                    : t("auth.forgotSubmit"))}
              </button>
            </form>
          )}

          {!sent && (
            <div className="mt-4 text-center">
              {mode === "signin" && (
                <button
                  type="button"
                  className="text-xs text-subtle underline-offset-2 hover:text-muted hover:underline"
                  onClick={() => changeMode("signup")}
                >
                  {t("auth.signUpToggle")}
                </button>
              )}
              {mode === "signup" && (
                <button
                  type="button"
                  className="text-xs text-subtle underline-offset-2 hover:text-muted hover:underline"
                  onClick={() => changeMode("signin")}
                >
                  {t("auth.signInToggle")}
                </button>
              )}
              {mode === "forgot" && (
                <button
                  type="button"
                  className="text-xs text-subtle underline-offset-2 hover:text-muted hover:underline"
                  onClick={() => changeMode("signin")}
                >
                  {t("auth.backToSignIn")}
                </button>
              )}
            </div>
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
            <p className="mt-1 text-xs text-subtle">
              {t("auth.localOnlyHint")}
            </p>
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
