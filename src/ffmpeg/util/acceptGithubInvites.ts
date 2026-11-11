import { config } from '../../config';

const INVITES_TIMEOUT_MS = 10_000;

interface Invitation {
  id: number;
  repository: { full_name: string };
}

const ghHeaders = (token: string) => ({
  Accept: 'application/vnd.github.v3+json',
  Authorization: `token ${token}`,
  'User-Agent': 'ffmpeglab/1.0',
});

/**
 * Accept pending repository invitations for the bot's GitHub user.
 * No-op for non-GitHub URLs. Failure is logged but not thrown — the
 * clone that follows is the real test of access.
 */
export const acceptGitHubInvitesIfNeeded = async (
  url: string,
): Promise<void> => {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return; // malformed URL — the clone itself will fail with a clear error
  }
  if (host !== 'github.com') return;

  const token = config.git.httpsToken;
  if (!token) return; // cloneRepo's own check will throw

  const headers = ghHeaders(token);
  let lastResponse = '';
  let lastCount = 0;

  do {
    let invitations: Invitation[] = [];
    try {
      const res = await fetch(
        'https://api.github.com/user/repository_invitations',
        { headers, signal: AbortSignal.timeout(INVITES_TIMEOUT_MS) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body = await res.text();
      if (body === lastResponse) break; // no progress — avoid infinite loop
      lastResponse = body;
      invitations = JSON.parse(body) as Invitation[];
    } catch (err) {
      console.error('github_invites: list failed', err);
      return;
    }

    lastCount = invitations.length;
    if (lastCount === 0) break;

    for (const inv of invitations) {
      try {
        const r = await fetch(
          `https://api.github.com/user/repository_invitations/${inv.id}`,
          {
            method: 'PATCH',
            headers,
            signal: AbortSignal.timeout(INVITES_TIMEOUT_MS),
          },
        );
        if (r.ok) {
          console.info(
            `github_invites: accepted #${inv.id} (${inv.repository.full_name})`,
          );
        } else {
          console.error(`github_invites: accept #${inv.id} → HTTP ${r.status}`);
        }
      } catch (err) {
        console.error(`github_invites: accept #${inv.id} failed`, err);
      }
    }
  } while (lastCount > 0);
};
