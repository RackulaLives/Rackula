#!/usr/bin/env npx tsx
/**
 * Update contributors section in ACKNOWLEDGEMENTS.md
 *
 * Usage: npm run update-contributors
 *
 * Fetches contributors from GitHub API and updates the contributors table
 * in ACKNOWLEDGEMENTS.md with current data.
 */

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

interface GitHubContributor {
  login: string;
  contributions: number;
  type: string;
}

interface ContributorInfo {
  login: string;
  contributions: string;
  source: "code" | "issues" | "manual";
}

// Manual contributor entries (for bug reporters, idea contributors, etc.)
const MANUAL_CONTRIBUTORS: ContributorInfo[] = [
  { login: "Daishi1938", contributions: "Bug reports", source: "manual" },
];

// Contributors to exclude (bots, etc.)
const EXCLUDED_CONTRIBUTORS = ["dependabot[bot]", "github-actions[bot]"];

async function getCodeContributors(): Promise<ContributorInfo[]> {
  try {
    const result = execSync(
      `gh api repos/RackulaLives/Rackula/contributors --paginate --jq '.[] | "{\\(.login)}|{\\(.contributions)}|{\\(.type)}"'`,
      { encoding: "utf-8" },
    );

    return result
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        // Parse the JSON-like format
        const match = line.match(/^\{(.+?)\}\|\{(\d+)\}\|\{(.+?)\}$/);
        if (!match) return null;
        const [, login, contributions, type] = match;
        return { login, contributions: parseInt(contributions, 10), type };
      })
      .filter((c): c is GitHubContributor => c !== null)
      .filter((c) => !EXCLUDED_CONTRIBUTORS.includes(c.login))
      .filter((c) => c.type === "User")
      .map((c) => ({
        login: c.login,
        contributions:
          c.contributions === 1
            ? "Code contributions"
            : `${c.contributions} code contributions`,
        source: "code" as const,
      }));
  } catch (error) {
    console.error("Failed to fetch contributors from GitHub:", error);
    return [];
  }
}

function generateContributorTable(contributors: ContributorInfo[]): string {
  // Dedupe by login, preferring code contributions
  const seen = new Set<string>();
  const deduped: ContributorInfo[] = [];

  for (const c of contributors) {
    if (!seen.has(c.login)) {
      seen.add(c.login);
      deduped.push(c);
    }
  }

  // Sort: creator first, then by login
  deduped.sort((a, b) => {
    if (a.login === "ggfevans") return -1;
    if (b.login === "ggfevans") return 1;
    return a.login.localeCompare(b.login);
  });

  // Mark creator specially
  const rows = deduped.map((c) => {
    const role =
      c.login === "ggfevans" ? "Creator, maintainer" : c.contributions;
    return `| <img src="https://github.com/${c.login}.png" width="50" alt="${c.login}"> | [@${c.login}](https://github.com/${c.login}) | ${role} |`;
  });

  return `| Avatar | Contributor | Contributions |
|--------|-------------|---------------|
${rows.join("\n")}`;
}

async function main() {
  const acknowledgmentsPath = "ACKNOWLEDGEMENTS.md";

  // Read current file
  let content: string;
  try {
    content = readFileSync(acknowledgmentsPath, "utf-8");
  } catch {
    console.error(`Could not read ${acknowledgmentsPath}`);
    process.exit(1);
  }

  // Fetch contributors
  console.log("Fetching contributors from GitHub...");
  const codeContributors = await getCodeContributors();
  const allContributors = [...codeContributors, ...MANUAL_CONTRIBUTORS];

  console.log(`Found ${codeContributors.length} code contributors`);
  console.log(`Added ${MANUAL_CONTRIBUTORS.length} manual contributors`);

  // Generate new table
  const newTable = generateContributorTable(allContributors);

  // Replace content between markers
  const startMarker = "<!-- ALL-CONTRIBUTORS-LIST:START -->";
  const endMarker = "<!-- ALL-CONTRIBUTORS-LIST:END -->";

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error("Could not find contributor markers in ACKNOWLEDGEMENTS.md");
    process.exit(1);
  }

  const before = content.substring(0, startIdx + startMarker.length);
  const after = content.substring(endIdx);

  const newContent = `${before}\n\n${newTable}\n\n${after}`;

  // Write updated file
  writeFileSync(acknowledgmentsPath, newContent);
  console.log("Updated ACKNOWLEDGEMENTS.md");
}

main().catch(console.error);
