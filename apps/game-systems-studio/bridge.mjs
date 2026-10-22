import {fromCardLab,validate,id} from './model.mjs';
export const HANDOFF='pt.gss.cardlab.handoff.v1';
export function handoffCardLab(config){const data=validate(fromCardLab(config)),token=id('transfer');localStorage.setItem(HANDOFF,JSON.stringify({token,createdAt:Date.now(),data}));return new URL('cards.html?handoff='+encodeURIComponent(token)+'#lab',new URL('./',import.meta.url)).href}
