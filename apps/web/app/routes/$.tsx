import { Link, data, type MetaFunction } from "react-router";

/**
 * Every path no other route matches lands here. The loader sets the status so
 * the Not Found page answers HTTP 404, not 200, while still rendering below.
 */
export function loader() {
  return data(null, { status: 404 });
}

export const meta: MetaFunction = () => [{ title: "Page Not Found — SkillX.sh" }];


export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-14rem)] flex-col items-center justify-center px-4">
      <div className="text-center">
        <pre className="font-mono text-6xl font-bold text-sx-fg-muted">404</pre>
        <h1 className="mt-4 font-mono text-2xl font-bold text-sx-fg">
          Page Not Found
        </h1>
        <p className="mt-2 text-sx-fg-muted">
          The page you're looking for doesn't exist.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-lg bg-sx-accent px-6 py-2 font-mono text-sm font-semibold text-white transition-colors hover:bg-sx-accent/90"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
