import { mediaRoute } from '../../workers/pt-universe-api/src/media';
export default {async fetch(r:Request){try{return Response.json(await mediaRoute(r));}catch(e){return Response.json({error:String(e)},{status:400});}}};
