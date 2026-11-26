import { recordToolVisit } from './pt-usage.mjs?v=2';

const tool = /^\/PT-Universe\/apps\/(reading-desk|investment-desk|rss-dashboard|tsugi-checker|3c-scout|deal-radar)(?:\/|$)/i
  .exec(location.pathname)?.[1]?.toLowerCase();
const frame = window.frameElement;
const visible = () => !document.hidden && (!frame || frame.getClientRects().length > 0);
let pending = false;
async function record() {
  if (!tool || pending || !visible()) return;
  pending = true;
  try { await recordToolVisit(tool); }
  finally { pending = false; }
}
if (tool) {
  void record();
  document.addEventListener('visibilitychange', record);
  if (frame) {
    let observer = new ResizeObserver(() => { if (visible()) void record(); });
    observer.observe(frame);
    window.addEventListener('pagehide', () => { observer.disconnect(); }, {once:true});
    window.addEventListener('pageshow', event => { if (event.persisted) observer.observe(frame); });
  }
}
