const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'apps/daily-nexus/market-editor.js'),'utf8'),context);
const fit=options=>context.calculateMarketLayout({available:1759,share:68,desiredColumns:3,preferredWidth:380,gap:8,inset:16,contentHeight:682,count:13,maxRowHeight:104,...options});

test('13 cards retain three columns and five fitting rows with classic Windows scrollbars',()=>{
  for(const gutter of [0,15,17,21]){
    const result=fit({inset:16+gutter});
    assert.equal(result.columns,3);
    assert.equal(result.rows,5);
    assert.equal(result.cardWidth,380);
    assert.ok(result.rows*(result.rowHeight+2)+(result.rows-1)*8<=682);
    assert.ok(1759-result.panelWidth>=320);
  }
});

test('layout stays valid around fractional width thresholds and after gutter changes',()=>{
  for(const available of [1068,1202,1202.25,1375,1679,1758.5,1759,2200]){
    for(const gutter of [0,15,17,21]){
      const result=fit({available,inset:16+gutter});
      assert.ok(result.columns>=1&&result.columns<=3);
      assert.ok(result.cardWidth>0&&result.cardWidth<=380);
      assert.ok(available-result.panelWidth>=320);
      assert.equal(result.rows,Math.ceil(13/result.columns));
      assert.equal(result.panelWidth,16+gutter+result.columns*result.cardWidth+(result.columns-1)*8);
    }
  }
});

test('a narrower desktop fits complete columns without reducing quote scale',()=>{
  const result=fit({available:1202,preferredWidth:340,gap:6,inset:33,contentHeight:682,maxRowHeight:96});
  assert.equal(result.columns,2);
  assert.equal(result.rows,7);
  assert.equal(result.cardWidth,340);
  assert.ok(result.rows*(result.rowHeight+2)+(result.rows-1)*6<=682);
});

test('manual column limit is respected and large lists retain readable minimum row height',()=>{
  assert.equal(fit({desiredColumns:2}).columns,2);
  assert.equal(fit({count:100,contentHeight:400}).rowHeight,86);
  assert.equal(fit({count:0}).rows,1);
});

test('CSS uses the computed column count rather than a second auto-fill decision',()=>{
  const css=fs.readFileSync(path.join(root,'apps/daily-nexus/market-editor.css'),'utf8');
  assert.match(css,/grid-template-columns:repeat\(var\(--market-layout-cols,3\),minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css,/auto-fill|zoom:\s*\.(8|9)/);
});
