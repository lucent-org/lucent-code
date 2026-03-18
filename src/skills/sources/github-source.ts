const SKILL_DIRS = ['skills', '.claude/skills', 'src/skills'];

function toApiUrl(repoUrl: string, subpath: string): string {
  const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
  if (!match) throw new Error(`Invalid GitHub URL: ${repoUrl}`);
  return `https://api.github.com/repos/${match[1]}/contents/${subpath}`;
}

export async function fetchGitHubSkills(repoUrl: string): Promise<string[]> {
  try {
    for (const dir of SKILL_DIRS) {
      const apiUrl = toApiUrl(repoUrl, dir);
      const listResp = await fetch(apiUrl, { headers: { Accept: 'application/vnd.github.v3+json' } });
      if (!listResp.ok) continue;

      const files = (await listResp.json()) as Array<{ name: string; type: string; download_url: string }>;
      const mdFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.md'));

      const contents = await Promise.all(
        mdFiles.map(async (f) => {
          const resp = await fetch(f.download_url);
          return resp.ok ? resp.text() : '';
        })
      );

      return contents.filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}
