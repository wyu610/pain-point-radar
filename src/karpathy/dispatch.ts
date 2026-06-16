import { Octokit } from '@octokit/rest';

export interface DispatchPick {
  rank: number;
  query: string;
}

/**
 * Triggers a workflow_dispatch on the GitHub Actions repo containing the
 * autoresearch workflow. Inputs: weekEnding, picks JSON, callback URL.
 *
 * The HMAC secret is NOT passed as an input — on a public repo, workflow_dispatch
 * input values are recorded in the run metadata and publicly visible. The workflow
 * reads it from `secrets.WEBHOOK_SECRET` instead (set via `gh secret set`).
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

  if (!token || !owner || !repo || !callback) {
    throw new Error('GH_DISPATCH_TOKEN, GH_WORKFLOW_OWNER, GH_WORKFLOW_REPO, APP_URL must be set');
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
    },
  });
}
