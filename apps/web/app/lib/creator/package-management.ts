/**
 * Owner management of a package: change its visibility, soft-delete it and
 * restore it. Authorization mirrors the release state API:
 *
 * - An account (session or unscoped key) must own the package's publisher;
 *   anyone else gets the unknown-package `404 not_found`, so the endpoints
 *   cannot test whether a package exists. The owner of a suspended or revoked
 *   publisher gets `403 publisher_revoked`.
 * - The admin (`X-Admin-Secret`) may delete and restore, never change
 *   visibility (`403 visibility.owner_only`). A package the admin deleted
 *   can only be restored by the admin (`403 restore.admin_deleted`).
 * - A visibility change is a compare-and-set on `from` (`409
 *   visibility_conflict`). Widening it, so anonymous callers can read more
 *   (private to unlisted or public, unlisted to public), needs an interactive
 *   web session and `"approve": true`, never an API key (`403
 *   visibility.approval_required`): unlisted is anonymously readable by name.
 *   Narrowing (public to unlisted, anything to private) is allowed with a
 *   session or an unscoped key. A deleted package cannot change visibility
 *   (`404`).
 */
import type { PackageVisibility } from "@skillx/contracts";
import { notFound } from "~/lib/releases/release-access";
import { releaseError } from "~/lib/releases/release-http";
import type { RequestActor } from "~/lib/releases/release-state-http";
import { applyAudited, restoreDeleted, softDelete } from "./owner-audit";
import type { LifecycleSubject } from "./owner-audit";

interface PackageSubject {
  id: string;
  name: string;
  visibility: string;
  deleted_at: number | null;
  owner_user_id: string | null;
  publisher_state: string;
}

/** The package by name, deleted or not, with its publisher's owner and standing. */
async function loadPackage(db: D1Database, identity: string): Promise<PackageSubject | null> {
  return db
    .prepare(
      `SELECT p.id, p.name, p.visibility, p.deleted_at, pub.owner_user_id, pub.state AS publisher_state
         FROM packages p JOIN publishers pub ON pub.id = p.publisher_id
        WHERE p.name = ?`,
    )
    .bind(identity)
    .first<PackageSubject>();
}

/** The package the actor may manage: 404 for anyone but its owner (and the admin), 403 for the owner of an inactive publisher. */
async function managedPackage(db: D1Database, identity: string, actor: RequestActor): Promise<PackageSubject> {
  const pkg = await loadPackage(db, identity);
  if (pkg === null) throw notFound();
  if (actor.kind === "admin") return pkg;
  if (pkg.owner_user_id === null || pkg.owner_user_id === "" || pkg.owner_user_id !== actor.id) throw notFound();
  if (pkg.publisher_state !== "active") throw releaseError(403, "publisher_revoked", "the publisher of this package is suspended or revoked");
  return pkg;
}

const lifecycleSubject = (pkg: PackageSubject): LifecycleSubject => ({
  kind: "package",
  table: "packages",
  id: pkg.id,
  name: pkg.name,
  deletedAt: pkg.deleted_at === null ? null : Number(pkg.deleted_at),
});

export interface VisibilityChange {
  from: PackageVisibility;
  to: PackageVisibility;
  /** The explicit approval a widening change (out of private, or to public) needs. */
  approve: boolean;
  /** A signed-in web session: no API key and no admin secret. */
  interactive: boolean;
  actor: RequestActor;
  now: Date;
}

export async function changePackageVisibility(db: D1Database, identity: string, change: VisibilityChange) {
  const { from, to, actor } = change;
  if (actor.kind === "admin") throw releaseError(403, "visibility.owner_only", "only the package owner may change its visibility");
  const pkg = await managedPackage(db, identity, actor);
  if (pkg.deleted_at !== null) throw notFound();
  if (from === to) throw releaseError(400, "invalid_request", "from and to must differ");
  const widening = from === "private" ? to !== "private" : to === "public";
  if (widening && !(change.interactive && change.approve)) {
    throw releaseError(
      403,
      "visibility.approval_required",
      `making a ${from} package ${to} needs explicit approval in a signed-in web session ("approve": true), never an API key`,
    );
  }
  if (pkg.visibility !== from) throw releaseError(409, "visibility_conflict", `${identity} is no longer ${from}; reload it and retry`);
  const at = change.now.getTime();
  const guard = "EXISTS (SELECT 1 FROM packages WHERE id = ? AND visibility = ? AND deleted_at IS NULL)";
  const ok = await applyAudited(
    db,
    { subjectKind: "package", subjectId: pkg.id, subjectName: pkg.name, actor, action: "visibility", from, to, at },
    { sql: guard, binds: [pkg.id, from] },
    { sql: "UPDATE packages SET visibility = ?, updated_at = ? WHERE id = ? AND visibility = ? AND deleted_at IS NULL", binds: [to, at, pkg.id, from] },
  );
  if (!ok) throw releaseError(409, "visibility_conflict", `${identity} is no longer ${from}; reload it and retry`);
  return { identity, from, to, visibility: to, changedAt: change.now.toISOString() };
}

export async function deletePackage(db: D1Database, identity: string, actor: RequestActor, now: Date) {
  const pkg = await managedPackage(db, identity, actor);
  const { deletedAt, restoreDeadline } = await softDelete(db, lifecycleSubject(pkg), actor, now);
  return { identity, deletedAt: new Date(deletedAt).toISOString(), restoreDeadline: new Date(restoreDeadline).toISOString() };
}

export async function restorePackage(db: D1Database, identity: string, actor: RequestActor, now: Date) {
  const pkg = await managedPackage(db, identity, actor);
  const { restoredAt } = await restoreDeleted(db, lifecycleSubject(pkg), actor, now);
  return { identity, visibility: pkg.visibility, restoredAt: new Date(restoredAt).toISOString() };
}
