import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import { NotFound } from "./components/layout/not-found.tsx";
import { SiteHeader } from "./components/layout/site-header.tsx";
import { themeScript } from "./lib/theme.ts";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets `dark` on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Meta />
        <Links />
      </head>
      <body>
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

// The SPA fallback, copied to 404.html by the postbuild, renders only the root route: without
// JavaScript it shows this, and after hydration the unmatched path lands in the ErrorBoundary,
// which renders the same page.
export function HydrateFallback() {
  return <NotFound />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  return (
    <>
      <SiteHeader />
      <main id="content" className="mx-auto max-w-2xl px-4 py-24">
        <h1 className="text-2xl font-semibold">Error</h1>
        <p className="mt-3 text-muted-foreground">{message}</p>
        {import.meta.env.DEV && error instanceof Error && (
          <pre className="mt-6 overflow-x-auto rounded-lg bg-muted p-4 text-xs">
            {error.stack}
          </pre>
        )}
      </main>
    </>
  );
}
