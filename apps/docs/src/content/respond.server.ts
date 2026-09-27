import { data } from "react-router";

export function textResponse(body: string, contentType: string): Response {
  return new Response(body, { headers: { "Content-Type": contentType } });
}

export function notFound(): never {
  throw data("Not found", { status: 404 });
}

/** The request's pathname without a trailing slash or the `.data` suffix of client navigations. */
export function requestPath(request: Request): string {
  const pathname = decodeURIComponent(new URL(request.url).pathname);
  return pathname.replace(/\.data$/, "").replace(/\/+$/, "") || "/";
}
