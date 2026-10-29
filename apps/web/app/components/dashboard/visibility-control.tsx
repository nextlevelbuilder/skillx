import { useState } from "react";
import { PACKAGE_VISIBILITIES } from "@skillx/contracts";
import type { PackageVisibility } from "@skillx/contracts";
import { ConfirmDialog } from "./confirm-dialog";
import { packageActionUrl, useOwnerAction } from "./use-owner-action";

interface VisibilityControlProps {
  identity: string;
  visibility: string;
  disabled?: boolean;
}

const MEANING: Record<PackageVisibility, string> = {
  public: "Readable by anyone, and it may be listed in public discovery.",
  unlisted: "Readable by anyone who knows its name or a release digest, but never listed in public discovery.",
  private: "Readable only by you and accounts holding an entitlement.",
};

/**
 * Visibility selector. Every change is confirmed; making a package public
 * takes a second explicit approval (the API accepts it only from this signed-in
 * session with `approve: true`). Narrowing visibility never recalls copies
 * already downloaded or installed.
 */
export function VisibilityControl({ identity, visibility, disabled = false }: VisibilityControlProps) {
  const { run, busy, error, clearError } = useOwnerAction();
  const [target, setTarget] = useState<PackageVisibility | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const close = () => {
    setTarget(null);
    setStep(1);
    clearError();
  };
  const apply = async () => {
    if (target === null) return;
    const ok = await run(packageActionUrl(identity, "visibility"), { from: visibility, to: target, ...(target === "public" ? { approve: true } : {}) });
    if (ok) close();
  };

  return (
    <>
      <label className="sr-only" htmlFor={`vis-${identity}`}>
        Visibility of {identity}
      </label>
      <select
        id={`vis-${identity}`}
        value={visibility}
        disabled={disabled || busy}
        onChange={(e) => setTarget(e.target.value as PackageVisibility)}
        className="rounded border border-sx-border bg-sx-bg-elevated px-2 py-1 font-mono text-xs text-sx-fg disabled:opacity-50"
      >
        {!(PACKAGE_VISIBILITIES as readonly string[]).includes(visibility) && <option value={visibility}>{visibility}</option>}
        {PACKAGE_VISIBILITIES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      {target === "public" && step === 1 && (
        <ConfirmDialog title={`Make ${identity} public?`} confirmLabel="Continue" onConfirm={() => setStep(2)} onCancel={close}>
          <p>{MEANING.public}</p>
          <p>Every release that is not yanked or quarantined becomes downloadable by anyone, without signing in.</p>
        </ConfirmDialog>
      )}
      {target === "public" && step === 2 && (
        <ConfirmDialog title="Approve making it public" confirmLabel="Approve and make public" busy={busy} error={error} onConfirm={apply} onCancel={close}>
          <p>
            This is a separate approval: <code className="font-mono text-sx-fg">{identity}</code> becomes readable by anyone. Making it private again later
            does not recall copies people downloaded in the meantime.
          </p>
        </ConfirmDialog>
      )}
      {target !== null && target !== "public" && (
        <ConfirmDialog title={`Make ${identity} ${target}?`} confirmLabel={`Make ${target}`} busy={busy} error={error} onConfirm={apply} onCancel={close}>
          <p>{MEANING[target]}</p>
          {(target === "private" || visibility === "public") && <p>Copies already downloaded or installed are not recalled; only new reads are refused.</p>}
        </ConfirmDialog>
      )}
    </>
  );
}
