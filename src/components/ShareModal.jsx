import { useEffect, useState } from "react";
import { Check, Copy, Send, Trash2, X } from "lucide-react";
import {
  cancelPendingInvite,
  createShareLink,
  inviteEditor,
  listCollaborators,
  listPendingInvites,
  listShareLinks,
  removeCollaborator,
  revokeShareLink,
} from "../lib/sharing.js";
import { shareLinkUrl } from "../lib/router.js";
import { useI18n } from "../lib/i18n.js";

const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * Owner-only sharing panel: invite editors by email (immediately if they
 * already have an account, otherwise a pending invite that resolves itself
 * the moment that email signs up — see supabase/schema.sql), and create/
 * revoke view-only links anyone can open without an account.
 */
export default function ShareModal({ trip, onClose }) {
  const { t } = useI18n();
  const [collaborators, setCollaborators] = useState([]);
  const [pending, setPending] = useState([]);
  const [links, setLinks] = useState([]);
  const [loadError, setLoadError] = useState(false);

  const [email, setEmail] = useState("");
  const [inviteState, setInviteState] = useState("idle"); // idle | sending | added | pending | error
  const [emailSent, setEmailSent] = useState(true);

  const [label, setLabel] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(null);
  const [actionError, setActionError] = useState(false);

  const refresh = () => {
    Promise.all([
      listCollaborators(trip.id),
      listPendingInvites(trip.id),
      listShareLinks(trip.id),
    ])
      .then(([c, p, l]) => {
        setCollaborators(c);
        setPending(p);
        setLinks(l);
      })
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submitInvite = async (e) => {
    e.preventDefault();
    if (inviteState === "sending") return;
    if (!looksLikeEmail(email)) {
      setInviteState("error");
      return;
    }
    setInviteState("sending");
    try {
      const { status, emailSent: sent } = await inviteEditor(
        trip.id,
        email.trim(),
      );
      setInviteState(status);
      setEmailSent(sent ?? true);
      setEmail("");
      refresh();
    } catch {
      setInviteState("error");
    }
  };

  const doRemoveCollaborator = async (userId) => {
    setActionError(false);
    try {
      await removeCollaborator(trip.id, userId);
      refresh();
    } catch {
      setActionError(true);
    }
  };

  const doCancelInvite = async (id) => {
    setActionError(false);
    try {
      await cancelPendingInvite(id);
      refresh();
    } catch {
      setActionError(true);
    }
  };

  const doCreateLink = async () => {
    setActionError(false);
    setCreatingLink(true);
    try {
      await createShareLink(trip.id, label);
      setLabel("");
      refresh();
    } catch {
      setActionError(true);
    } finally {
      setCreatingLink(false);
    }
  };

  const doRevokeLink = async (token) => {
    if (!window.confirm(t("share.confirmRevoke"))) return;
    setActionError(false);
    try {
      await revokeShareLink(token);
      refresh();
    } catch {
      setActionError(true);
    }
  };

  const copyLink = async (token) => {
    const url = shareLinkUrl(token);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt(t("share.copyLink"), url);
    }
    setCopiedToken(token);
    setTimeout(
      () => setCopiedToken((cur) => (cur === token ? null : cur)),
      2000,
    );
  };

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("nav.share")}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-card bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">
              {t("nav.share")}
            </p>
            <p className="truncate text-xs text-muted">{t("share.subtitle")}</p>
          </div>
          <button
            type="button"
            className="btn-ghost !px-2"
            onClick={onClose}
            aria-label={t("share.close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          {loadError && (
            <p role="alert" className="text-sm text-accent">
              {t("share.loadError")}
            </p>
          )}
          {actionError && (
            <p role="alert" className="text-sm text-accent">
              {t("share.actionError")}
            </p>
          )}

          {/* Editor invites */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">
              {t("share.inviteLabel")}
            </h3>
            <form onSubmit={submitInvite} noValidate className="flex gap-2">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                className="field flex-1"
                placeholder={t("share.emailPlaceholder")}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (inviteState === "error") setInviteState("idle");
                }}
                aria-invalid={inviteState === "error"}
              />
              <button
                type="submit"
                className="btn-primary shrink-0"
                disabled={inviteState === "sending"}
              >
                <Send size={14} />
                {inviteState === "sending"
                  ? t("share.inviting")
                  : t("share.invite")}
              </button>
            </form>
            {inviteState === "error" && (
              <p role="alert" className="mt-1.5 text-xs text-accent">
                {looksLikeEmail(email)
                  ? t("share.inviteError")
                  : t("auth.invalidEmail")}
              </p>
            )}
            {inviteState === "added" && (
              <p className="mt-1.5 text-xs text-accent">{t("share.invited")}</p>
            )}
            {inviteState === "pending" && (
              <p className="mt-1.5 text-xs text-accent">
                {t(
                  emailSent
                    ? "share.invitePending"
                    : "share.invitePendingNoEmail",
                )}
              </p>
            )}

            <ul className="mt-3 space-y-1.5">
              {collaborators.length === 0 && pending.length === 0 && (
                <li className="text-xs text-muted">
                  {t("share.noCollaborators")}
                </li>
              )}
              {collaborators.map((c) => (
                <li
                  key={c.user_id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-raised px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-fg">
                    {c.email}
                    {c.status !== "accepted" && (
                      <span className="ms-2 rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-fg">
                        {t("share.awaitingAccept")}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 text-xs"
                    onClick={() => doRemoveCollaborator(c.user_id)}
                    aria-label={t("share.removeCollaborator", {
                      email: c.email,
                    })}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-raised px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-fg">
                    {p.email}
                    <span className="ms-2 rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-fg">
                      {t("share.pendingInvites")}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 text-xs"
                    onClick={() => doCancelInvite(p.id)}
                    aria-label={t("share.cancelInvite", { email: p.email })}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="border-t border-line" />

          {/* View-only links */}
          <section>
            <h3 className="mb-1 text-sm font-semibold text-fg">
              {t("share.linkTitle")}
            </h3>
            <p className="mb-2 text-xs text-muted">{t("share.linkHint")}</p>
            <div className="flex gap-2">
              <input
                type="text"
                className="field flex-1"
                placeholder={t("share.labelPlaceholder")}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <button
                type="button"
                className="btn-soft shrink-0"
                onClick={doCreateLink}
                disabled={creatingLink}
              >
                {creatingLink ? t("share.creatingLink") : t("share.createLink")}
              </button>
            </div>

            <ul className="mt-3 space-y-1.5">
              {links.length === 0 && (
                <li className="text-xs text-muted">{t("share.noLinks")}</li>
              )}
              {links.map((l) => (
                <li
                  key={l.token}
                  className="flex items-center justify-between gap-2 rounded-lg bg-raised px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-fg">
                    {l.label || t("share.linkTitle")}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="btn-ghost !px-2 !py-1 text-xs"
                      onClick={() => copyLink(l.token)}
                      aria-label={t("share.copyLink")}
                    >
                      {copiedToken === l.token ? (
                        <Check size={13} className="text-accent" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !px-2 !py-1 text-xs"
                      onClick={() => doRevokeLink(l.token)}
                      aria-label={t("share.revokeLink")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
