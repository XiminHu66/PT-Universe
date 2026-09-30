(()=>{'use strict';
 const q=new URLSearchParams(location.search);
 if(q.get('embedded')==='workspace'||q.get('standalone')==='1')return;
 const slug=location.pathname.match(/\/apps\/([^/]+)/)?.[1];
 const routes={'signal-audit':['investment-desk','audit'],'stock-alert':['investment-desk','market'],'thesis-lab':['investment-desk','thesis'],'eastside-weekend':['life-desk','weekend'],'meal-orbit':['life-desk','dinner']};
 const route=routes[slug];if(!route)return;
 const dest=new URL('../'+route[0]+'/',location.href);q.delete('v');q.set('tab',route[1]);dest.search=q.toString();location.replace(dest.href);
})();