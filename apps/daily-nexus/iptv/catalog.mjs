const skippedNames = /^(?:更新时间|支持作者|www\.)/i;
const featuredGroups = new Set(['央视频道', '卫视频道']);

function streamUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (!/\.[a-z][a-z0-9-]*$/i.test(url.hostname) || /\.(?:local|localhost|internal|test|invalid)$/i.test(url.hostname)) return null;
    if (/\.(?:flv|mp4|webm|mkv|avi|mov|ts|mp3|txt|html?)$/i.test(url.pathname)) return null;
    if (url.protocol === 'http:' && url.port) return null;
    const priority = url.protocol === 'https:' ? 0 : 1;
    url.protocol = 'https:';
    url.hash = '';
    return { url: url.href, priority };
  } catch {
    return null;
  }
}

export function parseCatalog(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines[0]?.startsWith('#EXTM3U')) throw Error('频道列表格式无效');
  const channels = new Map();
  let entry;
  for (const line of lines.slice(1)) {
    if (line.startsWith('#EXTINF:')) {
      const metadata = line.match(/^#EXTINF:(?:[^,"\r\n]|"[^"]*")*,(.*)$/);
      const name = metadata?.[1].trim();
      const group = line.match(/\bgroup-title="([^"]+)"/i)?.[1].trim() || '其他频道';
      entry = name && group !== '更新时间' && !skippedNames.test(name) ? { name, group } : null;
      continue;
    }
    const value = line.trim();
    if (!entry || !value || value.startsWith('#')) continue;
    const { name, group } = entry;
    entry = null;
    const source = streamUrl(value);
    if (!source) continue;
    const id = name.normalize('NFKC').toLowerCase();
    const channel = channels.get(id) || { id, name, group, sources: [] };
    if (!featuredGroups.has(channel.group) && featuredGroups.has(group)) channel.group = group;
    const existing = channel.sources.find(candidate => candidate.url === source.url);
    if (existing) existing.priority = Math.min(existing.priority, source.priority);
    else channel.sources.push(source);
    channels.set(id, channel);
  }
  if (!channels.size) throw Error('没有可尝试的直播线路');
  return Array.from(channels.values(), channel => ({
    id: channel.id,
    name: channel.name,
    group: channel.group,
    sources: channel.sources.sort((a, b) => a.priority - b.priority).map(source => source.url),
  }));
}

export function filterChannels(channels, { group, query, favorites, onlyFavorites }) {
  const term = query.trim().normalize('NFKC').toLowerCase();
  return channels.filter(channel => {
    if (onlyFavorites && !favorites.has(channel.id)) return false;
    if (!onlyFavorites && group !== 'all' && !term) {
      if (group === 'featured' ? !featuredGroups.has(channel.group) : group !== channel.group) return false;
    }
    return !term || (channel.id + ' ' + channel.group).toLowerCase().includes(term);
  });
}
