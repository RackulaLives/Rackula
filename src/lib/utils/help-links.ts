/**
 * External help destinations, shared by the help panel links and the palette
 * commands so the two cannot drift apart.
 */
import { VERSION } from "$lib/version";

export const GITHUB_URL = "https://github.com/RackulaLives/Rackula";
export const DOCS_URL = "https://docs.racku.la";
export const DISCUSSIONS_URL = `${GITHUB_URL}/discussions`;

/** New-issue URL pre-filled with the bug template and the running build. */
export function getBugReportUrl(): string {
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent : "Unknown";
  const params = new URLSearchParams({
    template: "bug-report.yml",
    browser: `Rackula v${VERSION} on ${userAgent}`,
  });
  return `${GITHUB_URL}/issues/new?${params.toString()}`;
}
