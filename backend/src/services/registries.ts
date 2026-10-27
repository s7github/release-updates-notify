import axios from 'axios';

/**
 * Package-registry sources (npm, PyPI).
 *
 * Registries return versions and publish dates as JSON, so for anything shipped
 * as a package there is nothing to scrape and nothing for the model to guess.
 * The parsers are pure so they can be tested without the network.
 */

export interface RegistryRelease {
  version: string;
  releaseDate: string | null;
}

export interface RegistrySummary {
  latest: string | null;
  /** Newest first. */
  releases: RegistryRelease[];
  /** Repository URL the package declares, used to verify a name match. */
  repositoryUrl: string | null;
}

interface NpmDoc {
  'dist-tags'?: { latest?: string };
  time?: Record<string, string>;
  repository?: string | { url?: string };
}

interface PypiDoc {
  info?: { version?: string; project_urls?: Record<string, string> | null; home_page?: string | null };
  releases?: Record<string, Array<{ upload_time_iso_8601?: string; yanked?: boolean }>>;
}

const PRERELEASE = /-(?:alpha|beta|rc|canary|next|nightly|dev|pre)\b/i;

function byDateDesc(a: RegistryRelease, b: RegistryRelease): number {
  return (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '');
}

export function summariseNpm(doc: NpmDoc, limit = 3): RegistrySummary {
  const time = doc.time ?? {};
  const releases = Object.entries(time)
    // `created` and `modified` are bookkeeping keys, not versions.
    .filter(([version]) => version !== 'created' && version !== 'modified')
    .filter(([version]) => !PRERELEASE.test(version))
    .map(([version, releaseDate]) => ({ version, releaseDate }))
    .sort(byDateDesc)
    .slice(0, limit);

  const repo = doc.repository;
  const repositoryUrl = typeof repo === 'string' ? repo : (repo?.url ?? null);
  return { latest: doc['dist-tags']?.latest ?? null, releases, repositoryUrl };
}

export function summarisePypi(doc: PypiDoc, limit = 3): RegistrySummary {
  const releases = Object.entries(doc.releases ?? {})
    .map(([version, files]) => {
      const live = files.filter((f) => !f.yanked && f.upload_time_iso_8601);
      const first = live.map((f) => f.upload_time_iso_8601 as string).sort()[0];
      return first ? { version, releaseDate: first } : null;
    })
    .filter((r): r is { version: string; releaseDate: string } => r !== null)
    .filter((r) => !/(?:a|b|rc|dev)\d+$/i.test(r.version))
    .sort(byDateDesc)
    .slice(0, limit);

  const urls = doc.info?.project_urls ?? {};
  const repositoryUrl =
    Object.values(urls).find((u) => /github\.com|gitlab\.com/i.test(u)) ??
    doc.info?.home_page ??
    null;
  return { latest: doc.info?.version ?? null, releases, repositoryUrl };
}

/** `git+https://github.com/o/r.git` and friends -> `o/r`, for comparison. */
export function repoSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/(?:github|gitlab)\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/#?].*)?$/i);
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

const NPM_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const PYPI_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isValidNpmName(name: string): boolean {
  return name.length <= 214 && NPM_NAME.test(name);
}

export function isValidPypiName(name: string): boolean {
  return name.length <= 100 && PYPI_NAME.test(name);
}

const TIMEOUT = { timeout: 10_000, validateStatus: (s: number) => s === 200 };

export async function fetchNpmDoc(pkg: string): Promise<NpmDoc | null> {
  if (!isValidNpmName(pkg)) return null;
  try {
    const res = await axios.get<NpmDoc>(
      `https://registry.npmjs.org/${pkg.replace('/', '%2F')}`,
      TIMEOUT,
    );
    return res.data;
  } catch {
    return null;
  }
}

export async function fetchPypiDoc(pkg: string): Promise<PypiDoc | null> {
  if (!isValidPypiName(pkg)) return null;
  try {
    const res = await axios.get<PypiDoc>(
      `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`,
      TIMEOUT,
    );
    return res.data;
  } catch {
    return null;
  }
}
