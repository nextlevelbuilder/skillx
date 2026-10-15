import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { Navbar } from "./components/layout/navbar";
import { Footer } from "./components/layout/footer";
import { WebMcpBridge } from "./components/webmcp-bridge";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0A0A0A" />
        <Meta />
        <Links />
      </head>
      <body className="bg-sx-bg text-sx-fg min-h-screen antialiased flex flex-col">
        <Navbar />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <>
      <Outlet />
      {/* Progressive enhancement: inert where WebMCP is unavailable. */}
      <WebMcpBridge />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="font-mono text-6xl font-bold text-sx-accent">{message}</h1>
        <p className="mt-4 text-sx-fg-muted">{details}</p>
        {stack && (
          <pre className="mt-6 max-h-60 overflow-auto rounded-lg bg-sx-bg-elevated border border-sx-border p-4 text-left font-mono text-xs text-sx-fg-muted">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
