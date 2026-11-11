import { config } from '../config';

export interface OpenMrOptions {
  platform: string; //'github' | 'gitlab';
  repoFullName: string; // 'owner/repo'
  sourceBranch: string;
  targetBranch: string;
  title: string;
  body: string;
}

export interface OpenMrResult {
  url: string;
}

export const openMergeRequest = async (
  opts: OpenMrOptions,
): Promise<OpenMrResult> => {
  const { platform, repoFullName, sourceBranch, targetBranch, title, body } =
    opts;

  if (platform === 'github') {
    const res = await fetch(
      `https://api.github.com/repos/${repoFullName}/pulls`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.git.httpsToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          head: sourceBranch,
          base: targetBranch,
          body,
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`github_pr_failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { html_url: string };
    return { url: data.html_url };
  }

  if (platform === 'gitlab') {
    const encoded = encodeURIComponent(repoFullName);
    const res = await fetch(
      `https://gitlab.com/api/v4/projects/${encoded}/merge_requests`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.git.httpsToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_branch: sourceBranch,
          target_branch: targetBranch,
          title,
          description: body,
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`gitlab_mr_failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { web_url: string };
    return { url: data.web_url };
  }

  throw new Error(`unsupported_platform: ${platform}`);
};
