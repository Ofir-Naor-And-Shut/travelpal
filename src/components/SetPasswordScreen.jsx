import { useState } from "react";
import { KeyRound } from "lucide-react";
import AppControls from "./AppControls.jsx";
import { updateUserPassword } from "../lib/auth.js";
import { useI18n } from "../lib/i18n.js";

/**
 * Shown after a password-reset/recovery link is opened — covers both "forgot
 * password" and an old magic-link-only account setting a password for the
 * first time. Saving here clears auth.js's recovery flag, after which the
 * normal App.jsx gate takes over with the session the link already created.
 */
export default function SetPasswordScreen() {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | error
  const [errorKey, setErrorKey] = useState("auth.error");

  const submit = async (e) => {
    e.preventDefault();
    if (status === "saving") return;
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
    setStatus("saving");
    try {
      await updateUserPassword(password);
      // usePasswordRecovery() flips false and App.jsx's gate takes it from
      // here — nothing else to do on success.
    } catch {
      setErrorKey("auth.error");
      setStatus("error");
    }
  };

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center bg-canvas px-5 py-12">
      <div className="absolute inset-x-0 top-0 flex justify-center p-4">
        <AppControls />
      </div>

      <div className="card w-full max-w-sm p-7 shadow-xl shadow-brand-950/10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-accent-soft text-2xl">
            <KeyRound size={24} className="text-accent" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">
            {t("auth.setPasswordTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("auth.setPasswordBody")}</p>
        </div>

        <form onSubmit={submit} noValidate>
          <label
            htmlFor="set-password"
            className="mb-1.5 block text-sm font-medium text-fg"
          >
            {t("auth.passwordLabel")}
          </label>
          <input
            id="set-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            className="field"
            placeholder={t("auth.passwordLabel")}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            aria-invalid={status === "error"}
          />
          <p className="mt-1 text-xs text-subtle">{t("auth.passwordHint")}</p>

          <label
            htmlFor="set-confirm-password"
            className="mb-1.5 mt-3 block text-sm font-medium text-fg"
          >
            {t("auth.confirmPasswordLabel")}
          </label>
          <input
            id="set-confirm-password"
            type="password"
            autoComplete="new-password"
            className="field"
            placeholder={t("auth.confirmPasswordLabel")}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            aria-invalid={status === "error"}
          />

          {status === "error" && (
            <p role="alert" className="mt-1.5 text-sm text-accent">
              {t(errorKey)}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary mt-4 w-full"
            disabled={status === "saving"}
          >
            <KeyRound size={15} />
            {status === "saving"
              ? t("auth.setPasswordSaving")
              : t("auth.setPasswordButton")}
          </button>
        </form>
      </div>
    </div>
  );
}
