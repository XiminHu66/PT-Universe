// GitHub Pages can serve a cached HTML document with the latest module.
const url = new URL(location.href);
if (document.querySelector('.page-title')) {
  await import('./view.mjs?v=2');
} else if (url.searchParams.get('v') !== '2') {
  url.searchParams.set('v', '2');
  location.replace(url);
}
