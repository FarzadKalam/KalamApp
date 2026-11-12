// Serialize with earlier main releases without cancelling another agent's work.
const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const revision = process.env.GITHUB_SHA;
const runId = process.env.GITHUB_RUN_ID;
if (!token || !repository || !revision || !runId) throw new Error('Missing release identity');
const api = async (path) => {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Release coordination failed: HTTP ${response.status}`);
  return response.json();
};
const deadline = Date.now() + 40 * 60_000;
while (true) {
  const comparison = await api(`compare/main...${revision}`);
  if (!['ahead', 'identical'].includes(comparison.status)) {
    throw new Error('Main has newer changes: preserve them and validate before deploying');
  }
  const { workflow_runs: runs } = await api('actions/runs?branch=main&per_page=20');
  const earlier = runs.filter((run) => String(run.id) !== runId
    && run.head_sha !== revision && run.status !== 'completed'
    && run.path === '.github/workflows/ci-cd.yml');
  if (!earlier.length) break;
  if (Date.now() >= deadline) throw new Error('Earlier main deployment is still running; release was not modified');
  console.log(`Waiting for earlier main workflow: ${earlier.map((run) => run.id).join(', ')}`);
  await new Promise((resolve) => setTimeout(resolve, 30000));
}
console.log('Earlier main workflows finished; committed main changes are preserved');
