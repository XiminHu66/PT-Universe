import assert from 'node:assert/strict';
import {collectReleases} from '../../services/resource-monitor/releases.mjs';

const sha = 'a'.repeat(40), at = '2026-11-10T18:00:00Z';
const newRun = {id: 21, head_sha: sha, status: 'completed', conclusion: 'failure', updated_at: at};
const older = {id: 20, head_sha: 'b'.repeat(40), status: 'completed', conclusion: 'success', updated_at: at};
let requests = [];
const reader = {
  ghHeaders: env => env.RESOURCE_GITHUB_TOKEN ? {authorization: env.RESOURCE_GITHUB_TOKEN} : {},
  async json(url, headers) {
    requests.push(url);
    assert.match(url, /^https:\/\/api\.github\.com\/repos\/XiminHu66\/(PT-Universe|anime-player|video-streamer)\//);
    if (url.includes('PT-Universe')) assert.deepEqual(headers, {});
    else assert.deepEqual(headers, {authorization: 'secret'});
    if (url.includes('/commits?')) {
      if (url.includes('video-streamer')) throw Error('permission');
      return [{sha, commit: {committer: {date: at}}}];
    }
    if (url.includes('/workflows/')) return {workflow_runs: [newRun, older]};
    if (url.includes('/releases/latest')) {
      if (url.includes('video-streamer')) throw Error('permission');
      return {id: 101, draft: false, prerelease: false, tag_name: 'v1.0',
        published_at: at, assets: [{name: 'Anime1Player.exe', state: 'uploaded', browser_download_url: 'https://example.invalid/private'}]};
    }
    if (url.includes('/jobs?')) return {jobs: [{steps: [
      {name: 'Publish complete portable release', conclusion: url.includes('/20/') ? 'success' : 'skipped', completed_at: at}
    ]}]};
    assert.fail(url);
  }
};
const publicPacket = await collectReleases(reader, {});
assert.equal(requests.length, 2);
assert.ok(publicPacket.items.slice(1).every(row => row.state === 'needs_authorization'));
requests = [];
const result = await collectReleases(reader, {RESOURCE_GITHUB_TOKEN: 'secret'}, () => Date.parse(at));
const [nexus, anime, video] = result.items;
assert.equal(result.status.state, 'partial');
assert.equal(nexus.run.state, 'failure');
assert.equal(nexus.head.sha, sha);
assert.equal(anime.publication.asset, 'Anime1Player.exe');
assert.equal(anime.publication.label, 'v1.0');
assert.equal(anime.run.state, 'failure');
assert.equal(video.publication, undefined);
assert.equal(video.publishRun.sha, older.head_sha);
assert.match(video.publishRun.url, /runs\/20$/);
assert.ok(!JSON.stringify(result).includes('secret'));
assert.ok(!JSON.stringify(result).includes('example.invalid'));
assert.equal(requests.length, 10);
console.log('PASS: Pages and private Release sources, read-only fallback, failed recent run and no secrets or raw private asset URLs');
