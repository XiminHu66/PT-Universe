// The same lightweight Gemini default is already used by the verified PT catalog.
export const DEFAULT_MODEL='gemini-3.5-flash-lite';
const valid=id=>typeof id==='string'&&/^[@\w./:+-]+$/.test(id);
export function modelSettings(saved={}){
  if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
  const provider=typeof saved.provider==='string'&&saved.provider?saved.provider:'gemini';
  return {provider,model:valid(saved.model)?saved.model:provider==='gemini'?DEFAULT_MODEL:'',accountId:typeof saved.accountId==='string'?saved.accountId:''};
}
export function chooseModel(rows,selected,provider){
  const ids=rows.map(m=>m.id).filter(valid);
  if(ids.includes(selected))return selected;
  if(provider==='gemini'&&ids.includes(DEFAULT_MODEL))return DEFAULT_MODEL;
  return ids[0]||(valid(selected)?selected:provider==='gemini'?DEFAULT_MODEL:'');
}
