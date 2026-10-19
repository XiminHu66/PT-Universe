// One approved session, exactly 24 hours; setup never grants account read access.
export const OBSERVATION_DURATION=24*3600000;
export const OBSERVATION_SETUP=20*60000;
export const appObservation=env=>env?.MEDIA_APP_TEST_MODE==='observation';
export function observationWindowValid(env,now=Date.now()){
 const start=Number(env.MEDIA_APP_OBSERVATION_START),pairUntil=Number(env.MEDIA_APP_OBSERVATION_PAIR_UNTIL),until=Number(env.MEDIA_APP_OBSERVATION_UNTIL);
 return [start,pairUntil,until].every(Number.isSafeInteger)&&start>0&&start<=now&&now<until&&
  pairUntil-start===OBSERVATION_SETUP&&until-pairUntil===OBSERVATION_DURATION&&
  /^observe-test-[a-f0-9]{32}$/.test(env.MEDIA_APP_ACCOUNT_ID||'')&&
  env.ENABLE_APP_SUBMISSION==='false'&&env.ENABLE_DIRECT_STREAM==='false'&&
  ['MEDIA_APP_LOGIN_TEST_UNTIL','MEDIA_APP_SUBMISSION_TEST_UNTIL','MEDIA_STREAM_TEST_UNTIL','MEDIA_APP_FILE_TEST_START','MEDIA_APP_FILE_TEST_UNTIL','MEDIA_APP_NOVEL_TEST_START','MEDIA_APP_NOVEL_TEST_UNTIL'].every(key=>env[key]==='0')&&env.MEDIA_APP_FILE_TEST_FILES==='';
}
export const observationPairingOpen=(env,now=Date.now())=>observationWindowValid(env,now)&&now<Number(env.MEDIA_APP_OBSERVATION_PAIR_UNTIL);
