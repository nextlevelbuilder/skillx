import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { PageContainer } from "../components/layout/page-container";
import { KitsSection } from "../components/dashboard/kits-section";
import { PackagesSection } from "../components/dashboard/packages-section";
import type { SectionData } from "../components/dashboard/packages-section";
import { PublishPanel } from "../components/dashboard/publish-panel";
import { requireAuth } from "~/lib/auth/session-helpers";
import { listOwnedActivePublishers } from "~/lib/auth/user-api-keys";
import { getDb } from "~/lib/db";
import { DASHBOARD_KIT_LIMIT, DASHBOARD_PACKAGE_LIMIT, listOwnedKits, listOwnedPackages } from "~/lib/creator/creator-dashboard";
import type { DashboardKit, DashboardPackage } from "~/lib/creator/creator-dashboard";
import { personalKitsApiEnabled } from "~/lib/personal-kits/kit-http";
import { releasesApiEnabled } from "~/lib/releases/release-limits";

export const meta: MetaFunction = () => [{ title: "Creator dashboard | SkillX" }, { name: "robots", content: "noindex" }];

const RELEASES_OFF = "the releases API is not enabled on this deployment";
const KITS_OFF = "personal kits are not enabled on this deployment";

/**
 * Owner dashboard (session required). Packages need `SKILLX_RELEASES_API`;
 * kits also need `SKILLX_PERSONAL_KITS_API` (their management endpoints sit
 * behind both). A section whose flag is off says "unavailable", never empty.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const userId = session.user.id;
  const releasesOn = releasesApiEnabled(env);
  const kitsOn = releasesOn && personalKitsApiEnabled(env as { SKILLX_PERSONAL_KITS_API?: string });
  const [packages, kits, publishers] = await Promise.all([
    releasesOn ? listOwnedPackages(env.DB, userId) : null,
    kitsOn ? listOwnedKits(env.DB, userId) : null,
    listOwnedActivePublishers(getDb(env.DB), userId),
  ]);
  const packageData: SectionData<DashboardPackage> =
    packages === null ? { status: "unavailable", reason: RELEASES_OFF } : { status: "available", ...packages, limit: DASHBOARD_PACKAGE_LIMIT };
  const kitData: SectionData<DashboardKit> =
    kits === null ? { status: "unavailable", reason: releasesOn ? KITS_OFF : RELEASES_OFF } : { status: "available", ...kits, limit: DASHBOARD_KIT_LIMIT };
  return { packages: packageData, kits: kitData, handles: publishers.map((p) => p.handle), releasesOn };
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  return (
    <PageContainer>
      <div className="mb-8">
        <h1 className="font-mono text-3xl font-bold">Creator dashboard</h1>
        <p className="mt-2 text-sx-fg-muted">Manage the visibility, releases and lifecycle of your packages and personal kits. All releases are free.</p>
      </div>
      <PackagesSection data={data.packages} />
      <KitsSection data={data.kits} />
      {data.releasesOn && <PublishPanel handles={data.handles} />}
    </PageContainer>
  );
}
