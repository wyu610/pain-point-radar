import { Octokit } from '@octokit/rest';

export interface DispatchPick {
  rank: number;
  query: string;
}

/**
 * Triggers a workflow_dispatch on the GitHub Actions repo containing the
 * autoresearch workflow. Inputs: weekEnding, picks JSON, callback URL, secret.
 *
 * The workflow installs Python, clones karpathy/autoresearch, runs each query,
 * and POSTs results back to /api/validation with HMAC-signed bodies.
 */
export async function dispatchAutoresearch(weekEnding: string, picks: DispatchPick[]): Promise<void> {
  const token = process.env.GH_DISPATCH_TOKEN;
  const owner = process.env.GH_WORKFLOW_OWNER;
  const repo = process.env.GH_WORKFLOW_REPO;
  const workflow = process.env.GH_WORKFLOW_FILE ?? 'autoresearch.yml';
  const callback = process.env.APP_URL;
  const secret = process.env.WEBHOOK_SECRET;

  if (!token || !owner || !repo || !callback || !secret) {
    throw new Error(
      'GH_DISPATCH_TOKEN, GH_WORKFLOW_OWNER, GH_WORKFLOW_REPO, APP_URL, WEBHOOK_SECRET must be set'
    );
  }

  const octokit = new Octokit({ auth: token });
  await octokit.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: workflow,
    ref: 'main',
    inputs: {
      week_ending: weekEnding,
      picks: JSON.stringify(picks),
      callback_url: `${callback.replace(/\/$/, '')}/api/validation`,
      callback_secret: secret,
    },
  });
}
