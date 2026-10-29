import reader from './index.js';
import {hotTopicsRoute} from './hot-topics.js';

// Original RSS handlers and scheduled collection are passed through unchanged.
export default {
 ...reader,
 async fetch(request,env,ctx){
  const response=await hotTopicsRoute(request,env);
  return response||reader.fetch(request,env,ctx);
 }
};
