import { getManifest } from "../content/manifest.server.ts";
import { textResponse } from "../content/respond.server.ts";
import { searchIndexJson } from "../content/search.server.ts";

export function loader() {
  return textResponse(
    searchIndexJson(getManifest()),
    "application/json; charset=utf-8",
  );
}
