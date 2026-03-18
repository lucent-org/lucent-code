// NOTE: REGISTRY_BASE is a placeholder. Update when the actual superpowers registry URL is known.
const REGISTRY_BASE = 'https://registry.superpowers.ai';

export async function fetchMarketplaceSkills(slug: string, version = 'latest'): Promise<string[]> {
  try {
    const metaResp = await fetch(`${REGISTRY_BASE}/${slug}/${version}/manifest.json`);
    if (!metaResp.ok) return [];

    const meta = (await metaResp.json()) as { skills?: string[]; baseUrl?: string };
    const skillNames = meta.skills ?? [];
    const baseUrl = meta.baseUrl ?? `${REGISTRY_BASE}/${slug}/${version}/skills`;

    const contents = await Promise.all(
      skillNames.map(async (name) => {
        const resp = await fetch(`${baseUrl}/${name}.md`);
        return resp.ok ? resp.text() : '';
      })
    );

    return contents.filter(Boolean);
  } catch {
    return [];
  }
}
