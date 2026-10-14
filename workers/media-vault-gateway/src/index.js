// Media Vault private VPC gateway: no user-controlled upstream URLs.
// A Workers VPC Service binding pins traffic to one internal host and port.
// Never expose Aria2, MeTube, Suwayomi, or the original adapter directly.
const ORIGIN = 'https://ximinhu66.github.io';
const ALLOWED = new Map([
  ['/health', new Set(['GET'])],
  ['/jobs', new Set(['GET','POST'])],
  ['/jobs/files', new Set(['GET'])],
  ['/jobs/cancel', new Set(['POST'])],
  ['/download-ticket', new Set(['POST'])],
  ['/download', new Set(['GET'])],
  ['/resolve', new Set(['POST'])],
]);

function baseHeaders(origin, type='application/json; charset=utf-8') {
  const headers = new Headers({
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  if (origin === ORIGIN) {
    headers.set('Access-Control-Allow-Origin', ORIGIN);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

function reject(status, message, origin) {
  return new Response(JSON.stringify({error:message}), {status, headers:baseHeaders(origin)});
}

async function readSmallBody(req) {
  if (!req.body) throw new Error('Empty JSON body');
  const reader = req.body.getReader();
  const pieces=[];
  let n=0;
  try {
    while(true) {
      const {value,done}=await reader.read();
      if(done) break;
      n+=value.byteLength;
      if(n>16384) throw new RangeError('Request too large');
      pieces.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(n);
  let p=0;
  for (const piece of pieces){combined.set(piece,p);p+=piece.byteLength;}
  return combined;
}

export async function handle(request, env) {
  const origin=request.headers.get('Origin');
  if(origin && origin !== ORIGIN) return reject(403,'Origin denied',origin);
  const url = new URL(request.url);
  if (url.username || url.password || !ALLOWED.has(url.pathname))
    return reject(404,'Unknown route',origin);
  if (request.method === 'OPTIONS') {
    if(origin !== ORIGIN) return reject(403,'Origin denied',origin);
    const h=baseHeaders(origin,'text/plain');
    h.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    h.set('Access-Control-Allow-Headers','Authorization,Content-Type');
    h.set('Access-Control-Max-Age','600');
    return new Response(null,{status:204,headers:h});
  }
  if (!ALLOWED.get(url.pathname).has(request.method))
    return reject(405,'Method not allowed',origin);
  const auth=request.headers.get('Authorization');
  if(url.pathname !== '/download' && (!auth || !/^Bearer [A-Za-z0-9_-]{32,256}$/.test(auth)))
    return reject(401,'Authentication required',origin);
  if(url.pathname === '/download') {
    const ticket=url.searchParams.get('ticket');
    if (!ticket || !/^[A-Za-z0-9_-]{32,160}$/.test(ticket))
      return reject(400,'Invalid file ticket',origin);
  }
  if (!env?.INTERNAL_MEDIA?.fetch) return reject(503,'Private VPC binding unavailable',origin);

  const headers = new Headers();
  if(auth) headers.set('Authorization',auth);
  if(origin) headers.set('Origin',origin);
  let body;
  if(request.method === 'POST'){
    if (!request.headers.get('Content-Type')?.startsWith('application/json'))
      return reject(415,'JSON required',origin);
    try{body=await readSmallBody(request);}
    catch(err){return reject(err instanceof RangeError?413:400,'Invalid request body',origin);}
    headers.set('Content-Type','application/json');
  }
  // The VPC Service points only to the local Media Vault adapter. All
  // routes and query strings are fixed by this gateway, never user origins.
  const internal = 'http://adapter:8789'+url.pathname+url.search;
  let upstream;
  try {
    upstream=await env.INTERNAL_MEDIA.fetch(internal,{
      method:request.method,
      headers,
      ...(body?{body}:{}),
      redirect:'manual',
    });
  } catch(err) {
    return reject(503,'Private Media Vault service unavailable',origin);
  }
  // Do not forward a redirect, Set-Cookie, or arbitrary origin headers.
  if(upstream.status >= 300 && upstream.status < 400)
    return reject(502,'Unexpected upstream redirect',origin);
  const upstreamType=upstream.headers.get('Content-Type') || 'application/octet-stream';
  const resultHeaders=baseHeaders(origin,upstreamType);
  for(const name of ['Content-Disposition','Content-Length']) {
    const value=upstream.headers.get(name);
    if(value)resultHeaders.set(name,value);
  }
  return new Response(upstream.body,{status:upstream.status,headers:resultHeaders});
}

export default {fetch:handle};
