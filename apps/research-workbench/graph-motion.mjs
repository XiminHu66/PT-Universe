// The simulation only owns presentation positions. It never edits research records.
export const zoomLevel=(current,delta,mode=0,height=600)=>Math.max(0.08,Math.min(3.5,current*Math.exp(-Math.max(-160,Math.min(160,delta*(mode===1?16:mode===2?height:1)))*0.0045)));

export function createGraphMotion(cy,d3,{enabled,pinned,status}){
 let simulation=null,rows=[],byId=new Map(),active=enabled,grabbed='';
 const report=moving=>status(active&&moving);
 const apply=()=>{if(cy.destroyed())return;cy.batch(()=>{for(const r of rows){const n=cy.getElementById(r.id);if(!n.grabbed())n.position({x:r.x,y:r.y})}})};
 function stop(){simulation?.stop();report(false)}
 function make(){
  simulation?.stop();rows=cy.nodes().map(n=>({id:n.id(),kind:n.data('kind'),...n.position(),...(pinned.has(n.data('rawId'))?{fx:n.position('x'),fy:n.position('y')}: {})}));byId=new Map(rows.map(r=>[r.id,r]));
  const links=cy.edges().map(e=>({source:e.source().id(),target:e.target().id()}));
  simulation=d3.forceSimulation(rows).stop().alphaDecay(0.05).alphaMin(0.005).velocityDecay(0.45)
   .force('links',d3.forceLink(links).id(n=>n.id).distance(e=>e.source.kind==='Paper'||e.target.kind==='Paper'?165:115).strength(0.25))
   .force('charge',d3.forceManyBody().strength(-520).distanceMax(1000))
   .force('collision',d3.forceCollide(n=>n.kind==='Paper'?106:55).iterations(2))
   .force('x',d3.forceX(400).strength(0.018)).force('y',d3.forceY(320).strength(0.025))
   .on('tick',apply).on('end',()=>report(false));
 }
 function resume(alpha=0.35){if(!active||!simulation)return;report(true);simulation.alpha(Math.max(alpha,simulation.alpha())).alphaTarget(0).restart()}
 function reset({fit=true,initial=false}={}){
  make();simulation.tick(90);apply();if(fit)cy.fit(undefined,cy.width()<500?30:65);
  if(active){if(initial){for(const r of rows)if(r.fx==null){r.x=400+(r.x-400)*0.88;r.y=320+(r.y-320)*0.88;r.vx=0;r.vy=0}apply()}resume(0.45)}else report(false);
 }
 function setEnabled(value){active=value;if(active){make();resume()}else stop()}
 function togglePin(id){const n=cy.nodes().filter(n=>n.data('rawId')===id);if(!n.length)return;if(pinned.has(id))pinned.delete(id);else pinned.add(id);n.toggleClass('pinned',pinned.has(id));const r=byId.get(n.id());if(r){r.fx=pinned.has(id)?n.position('x'):null;r.fy=pinned.has(id)?n.position('y'):null;resume()}}
 function grab(e){const n=e.target,r=byId.get(n.id());if(!r)return;grabbed=n.id();r.fx=n.position('x');r.fy=n.position('y');if(active){report(true);simulation.alpha(0.3).alphaTarget(0.09).restart()}}
 function drag(e){const r=byId.get(e.target.id());if(r){r.x=r.fx=e.target.position('x');r.y=r.fy=e.target.position('y')}}
 function release(e){const r=byId.get(e.target.id());if(r&&!pinned.has(e.target.data('rawId'))){r.fx=null;r.fy=null}grabbed='';simulation?.alphaTarget(0);if(active)resume(0.22)}
 cy.on('grab','node',grab);cy.on('drag','node',drag);cy.on('free','node',release);
 return {reset,stop,resume,adopt(){make();stop()},setEnabled,togglePin,destroy(){stop();cy.off('grab','node',grab);cy.off('drag','node',drag);cy.off('free','node',release);rows=[];byId.clear();simulation=null},get dragging(){return Boolean(grabbed)}};
}
