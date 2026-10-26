// Trash is stored with the existing native record, so restore survives sessions.
export const isTrashed = b => !!b?.meta?.trashedAt;
export function libraryState(records, nativeLists) {
 const deleted = new Set(records.filter(b => b.meta.kind === 'workspace' && isTrashed(b)).map(b => b.meta.workspaceId));
 return {
  books: records.filter(b => !['workspace','conversation'].includes(b.meta.kind) && !isTrashed(b)),
  lists: nativeLists.filter(l => !deleted.has(l.id)),
  trashedBooks: records.filter(b => !['workspace','conversation'].includes(b.meta.kind) && isTrashed(b)),
  trashedLists: nativeLists.filter(l => deleted.has(l.id))
 };
}
export function trashPatch(at = new Date().toISOString()) { return {trashedAt:at}; }
export function restorePatch() { return {trashedAt:null}; }
export function sourceEdit(values, b) {
 const title=String(values.title||'').trim();
 if(!title)throw Error('请填写资料标题。');
 if(title.length>500)throw Error('标题不能超过 500 字。');
 const native={title};
 if(b.content?.type==='text' && values.documentText !== undefined)native.text=String(values.documentText);
 return {native,meta:{reason:String(values.reason||''),category:String(values.category||'未分类'),resourceType:values.resourceType||b.meta.resourceType,reading:values.reading||b.meta.reading}};
}
