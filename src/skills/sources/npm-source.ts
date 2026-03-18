export async function fetchNpmSkills(packageName: string): Promise<string[]> {
  try {
    const encodedPkg = encodeURIComponent(packageName);
    const listResp = await fetch(`https://unpkg.com/${encodedPkg}/?meta`);
    if (!listResp.ok) return [];

    const meta = (await listResp.json()) as { files?: Array<{ path: string }> };
    const mdPaths = (meta.files ?? [])
      .filter((f) => f.path.endsWith('.md') && f.path.includes('/skills/'))
      .map((f) => f.path);

    const contents = await Promise.all(
      mdPaths.map(async (p) => {
        const resp = await fetch(`https://unpkg.com/${encodedPkg}${p}`);
        return resp.ok ? resp.text() : '';
      })
    );

    return contents.filter(Boolean);
  } catch {
    return [];
  }
}
