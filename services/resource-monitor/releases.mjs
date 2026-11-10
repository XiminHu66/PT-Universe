const OWNER = 'XiminHu66';
const API = 'https://api.github.com/repos/' + OWNER + '/';
const WEB = 'https://github.com/' + OWNER + '/';
const MAX_RUNS = 4;
const projects = [
  {id: 'nexus', repo: 'PT-Universe', workflow: 'pages.yml', public: true},
  {id: 'anime', repo: 'anime-player', workflow: 'windows.yml', publish: 'Publish verified release', asset: 'Anime1Player.exe'},
  {id: 'video', repo: 'video-streamer', workflow: 'windows.yml', publish: 'Publish complete portable release', asset: 'VideoStreamer-Portable.zip'}
];
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value) ? value : null;
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const integer = value => Number.isSafeInteger(value) && value > 0;

export async function collectReleases(reader, env, clock = Date.now) {
  const headers = reader.ghHeaders(env);
  const at = new Date(clock()).toISOString();
  const items = await Promise.all(projects.map(async ({id, repo, workflow, public: isPublic, publish, asset}) => {
    const row = {id, checkedAt: at};
    if (!isPublic && !env.RESOURCE_GITHUB_TOKEN) return {...row, state: 'needs_authorization'};
    const base = API + repo;
    const url = WEB + repo;
    const read = (path, auth = headers) => reader.json(base + path, auth);
    const publicHeaders = isPublic ? reader.ghHeaders({}) : headers;
    const [head, workflowData, release] = await Promise.allSettled([
      read('/commits?sha=main&per_page=1', publicHeaders),
      read('/actions/workflows/' + workflow + '/runs?per_page=' + MAX_RUNS + (isPublic ? '&branch=main' : ''), publicHeaders),
      isPublic ? null : read('/releases/latest')
    ]);
    const commit = head.value?.[0];
    const headSha = sha(commit?.sha);
    if (headSha) row.head = {sha: headSha, at: time(commit.commit?.committer?.date), url: url + '/commit/' + headSha};
    const runs = Array.isArray(workflowData.value?.workflow_runs)
      ? workflowData.value.workflow_runs.filter(run => integer(run.id) && sha(run.head_sha)).slice(0, MAX_RUNS)
      : [];
    const summarize = run => ({
      sha: sha(run.head_sha), at: time(run.updated_at || run.created_at),
      url: url + '/actions/runs/' + run.id,
      state: run.status === 'completed' ? (run.conclusion || 'unknown') : (run.status || 'unknown')
    });
    if (runs.length) row.run = summarize(runs[0]);
    if (isPublic) return {...row, state: row.head && row.run ? 'ok' : 'partial'};

    const published = release.value;
    if (integer(published?.id) && published.draft === false && published.prerelease === false && time(published.published_at) &&
        typeof published.tag_name === 'string' && published.tag_name.length <= 120) {
      const file = Array.isArray(published.assets) && published.assets.find(item => item?.name === asset && item.state === 'uploaded');
      row.publication = {
        kind: 'release', identity: 'release:' + published.id + ':' + published.published_at,
        label: published.tag_name, at: published.published_at,
        url: url + '/releases/tag/' + encodeURIComponent(published.tag_name),
        asset: file ? asset : null
      };
    } else if (runs.length) {
      // Existing Actions-read scopes can show a successful publish step. This
      // proves that the step ran, while release existence/assets require Contents.
      const completed = runs.filter(run => run.status === 'completed' && run.conclusion !== 'skipped');
      const jobs = await Promise.allSettled(completed.map(run => read(
        '/actions/runs/' + run.id + '/jobs?per_page=10'
      )));
      const index = jobs.findIndex(result => Array.isArray(result.value?.jobs) && result.value.jobs.some(job =>
        Array.isArray(job.steps) && job.steps.some(step => step.name === publish && step.conclusion === 'success')
      ));
      if (index >= 0) {
        const run = completed[index], step = jobs[index].value.jobs.flatMap(job => job.steps || [])
          .find(step => step.name === publish && step.conclusion === 'success');
        row.publishRun = {...summarize(run), at: time(step.completed_at) || time(run.updated_at)};
      }
    }
    return {...row, state: row.head && row.run && row.publication ? 'ok' :
      row.head || row.run || row.publication || row.publishRun ? 'partial' : 'unavailable'};
  }));
  const state = items.every(item => item.state === 'ok') ? 'ok' :
    items.some(item => item.state === 'ok' || item.state === 'partial') ? 'partial' : 'unavailable';
  return {items, status: {provider: 'github-releases', state, checkedAt: at}};
}
