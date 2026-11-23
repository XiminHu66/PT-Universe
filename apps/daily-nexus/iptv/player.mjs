import { filterChannels, parseCatalog } from './catalog.mjs';

const PLAYLISTS = [
  'https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv4.m3u',
  'https://live.zbds.top/tv/iptv4.m3u',
];
const CACHED_CATALOG = 'pt-nexus-iptv-catalog-v1';
const FAVORITES = 'pt-nexus-iptv-favorites-v1';
const SYNC_INTERVAL = 4 * 60 * 60 * 1000;
const byId = id => document.getElementById(id);
const video = byId('video');
const search = byId('search');
const group = byId('group');
const list = byId('channels');
const syncStatus = byId('sync-status');
const playStatus = byId('play-status');
const refreshButton = byId('refresh');
const favoritesButton = byId('favorites');
const retryButton = byId('retry');

function readStore(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch { return null; }
}

function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Keep the current session usable. */ }
}

const savedFavorites = readStore(FAVORITES);
const favorites = new Set(Array.isArray(savedFavorites) ? savedFavorites : []);
let channels = [];
let syncedAt = 0;
let selectedId = null;
let playback = null;

function render() {
  const onlyFavorites = favoritesButton.getAttribute('aria-pressed') === 'true';
  const displayed = filterChannels(channels, {
    group: group.value, query: search.value, favorites, onlyFavorites,
  });
  byId('channel-count').textContent = String(displayed.length);
  byId('empty').hidden = Boolean(displayed.length);
  byId('empty').textContent = onlyFavorites ? '还没有符合条件的收藏' : '没有符合条件的频道';
  list.replaceChildren(...displayed.map(channel => {
    const row = document.createElement('li');
    row.className = 'channel';
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'choose';
    choose.dataset.channel = channel.id;
    if (channel.id === selectedId) choose.setAttribute('aria-current', 'true');
    const name = document.createElement('span');
    name.textContent = channel.name;
    const category = document.createElement('small');
    category.textContent = channel.sources.length > 1 ? channel.group + ' · ' + channel.sources.length + ' 条线路' : channel.group;
    choose.append(name, category);
    choose.onclick = () => selectChannel(channel);
    const star = document.createElement('button');
    star.className = 'star';
    star.type = 'button';
    const setStar = () => {
      const saved = favorites.has(channel.id);
      star.textContent = saved ? '★' : '☆';
      star.setAttribute('aria-pressed', String(saved));
      star.setAttribute('aria-label', (saved ? '移除收藏 ' : '收藏 ') + channel.name);
    };
    setStar();
    star.onclick = () => {
      if (favorites.has(channel.id)) favorites.delete(channel.id);
      else favorites.add(channel.id);
      writeStore(FAVORITES, [...favorites]);
      if (onlyFavorites) render();
      else setStar();
    };
    row.append(choose, star);
    return row;
  }));
}

function displayCatalog(text, time) {
  const parsed = parseCatalog(text);
  const previousGroup = group.value;
  group.length = 2;
  for (const category of new Set(parsed.map(channel => channel.group))) {
    group.add(new Option(category, category));
  }
  group.value = Array.from(group.options).some(option => option.value === previousGroup) ? previousGroup : 'featured';
  channels = parsed;
  syncedAt = time;
  render();
}

function syncTime() {
  return new Date(syncedAt).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

async function refreshCatalog(force = false) {
  if (refreshButton.disabled || (!force && syncedAt && Date.now() - syncedAt < SYNC_INTERVAL)) return;
  refreshButton.disabled = true;
  syncStatus.textContent = '正在读取频道';
  try {
    for (const url of PLAYLISTS) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 9000);
      try {
        const result = await fetch(url, { cache: 'no-cache', credentials: 'omit', signal: abort.signal });
        if (!result.ok) continue;
        const text = await result.text();
        if (text.length > 1_000_000) continue;
        displayCatalog(text, Date.now());
        writeStore(CACHED_CATALOG, { text, time: syncedAt });
        syncStatus.textContent = '已读取 · ' + syncTime();
        return;
      } catch {
        // Try the upstream's alternate address.
      } finally {
        clearTimeout(timer);
      }
    }
    syncStatus.textContent = channels.length ? '更新失败 · 保留 ' + syncTime() : '读取失败 · 请刷新频道';
  } finally {
    refreshButton.disabled = false;
  }
}

function cleanupPlayer() {
  playback?.stop();
  playback = null;
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function selectChannel(channel, attempt = 0) {
  cleanupPlayer();
  if (selectedId !== channel.id) {
    selectedId = channel.id;
    list.querySelector('[aria-current]')?.removeAttribute('aria-current');
    Array.from(list.querySelectorAll('.choose')).find(button => button.dataset.channel === channel.id)?.setAttribute('aria-current', 'true');
  }
  byId('screen').dataset.empty = 'false';
  byId('now-playing').textContent = channel.name;
  retryButton.hidden = true;
  retryButton.onclick = () => selectChannel(channels.find(item => item.id === channel.id) || channel);
  const url = channel.sources[attempt];
  if (!url) {
    playStatus.textContent = '当前线路不可播放。可重试或换一个频道。';
    retryButton.hidden = false;
    return;
  }
  const native = video.canPlayType('application/vnd.apple.mpegurl');
  if (!native && !window.Hls?.isSupported()) {
    playStatus.textContent = '无法加载 HLS 播放组件。请刷新页面或换用 Safari、Chrome。';
    retryButton.hidden = false;
    return;
  }

  let hls;
  let timer;
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const session = {
    stop() {
      clearTimeout(timer);
      controller.abort();
      hls?.destroy();
    },
  };
  playback = session;
  const nextSource = () => {
    if (playback === session) selectChannel(channel, attempt + 1);
  };
  const markReady = () => {
    clearTimeout(timer);
    playStatus.textContent = video.paused ? '已就绪 · 点击播放' : '正在直播';
  };
  const markWaiting = () => {
    if (video.paused) return;
    playStatus.textContent = '正在缓冲…';
    clearTimeout(timer);
    timer = setTimeout(nextSource, 18000);
  };
  const play = () => video.play().catch(error => {
    if (playback !== session || error.name === 'AbortError') return;
    if (error.name === 'NotAllowedError') {
      playStatus.textContent = '点击播放器上的播放按钮';
    } else nextSource();
  });
  video.addEventListener('loadeddata', markReady, options);
  video.addEventListener('playing', markReady, options);
  video.addEventListener('waiting', markWaiting, options);
  video.addEventListener('pause', () => {
    if (video.readyState >= 2) markReady();
  }, options);
  video.addEventListener('error', nextSource, options);
  playStatus.textContent = attempt ? '正在切换备用线路…' : '正在连接直播…';
  timer = setTimeout(nextSource, 16000);
  if (native) {
    video.src = url;
    void play();
  } else {
    hls = new window.Hls({ maxBufferLength: 20, maxMaxBufferLength: 40 });
    hls.on(window.Hls.Events.ERROR, (_, error) => { if (error.fatal) nextSource(); });
    hls.attachMedia(video);
    hls.loadSource(url);
    void play();
  }
}

const previous = readStore(CACHED_CATALOG);
if (typeof previous?.text === 'string' && Number.isFinite(previous.time)) {
  try {
    displayCatalog(previous.text, previous.time);
    syncStatus.textContent = '已读取 · ' + syncTime();
  } catch { /* Invalid cached content is replaced on the next fetch. */ }
}
refreshButton.onclick = () => refreshCatalog(true);
search.oninput = render;
group.onchange = () => {
  favoritesButton.setAttribute('aria-pressed', 'false');
  search.value = '';
  render();
};
favoritesButton.onclick = () => {
  const active = favoritesButton.getAttribute('aria-pressed') === 'true';
  favoritesButton.setAttribute('aria-pressed', String(!active));
  search.value = '';
  render();
};
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refreshCatalog();
});
setInterval(() => { if (!document.hidden) void refreshCatalog(); }, 20 * 60 * 1000);
void refreshCatalog();
