const {test}=require('node:test'),assert=require('node:assert/strict'),Export=require('../dist/export.js');
test('offline export escapes note text and names, omits trash and unsafe media, and links included references',()=>{
 const html=Export.html([{id:'one',created:'2026-01-01',content:'<script>alert(1)</script> & "正文"',references:['two','trash'],images:['https://example.com/tracker.png','data:image/png;base64,AAAA']},{id:'two',created:'2026-01-02',content:'第二条'},{id:'trash',content:'已删除的秘密',deleted:true}],'<img onerror=alert(1)>');
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('https://example.com'));assert.ok(!html.includes('已删除的秘密'));assert.ok(html.includes('href="#memo-two"'));assert.ok(html.includes('src="data:image/png;base64,AAAA"'));assert.ok(html.includes("default-src 'none'"));assert.ok(html.includes('共 2 条'));
});
test('CSV sample includes BOM, supported headers and quoted multiline content',()=>{const csv=Export.csvSample();assert.ok(csv.startsWith('\uFEFFcontent,created_at\r\n'));assert.ok(csv.includes('"支持多行内容：\n'));assert.ok(csv.includes('#阅读'));});
