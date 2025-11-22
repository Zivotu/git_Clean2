import fs from 'fs';
const p = 'apps/web/messages/hr.json';
const s = fs.readFileSync(p,'utf8');
function findAll(sub){let idx=-1; const res=[]; while(true){idx=s.indexOf(sub, idx+1); if(idx===-1) break; res.push(idx);} return res;}
const badgesIdx = s.indexOf('"badges":');
console.log('badgesIdx', badgesIdx);
if(badgesIdx!==-1){console.log('context:', JSON.stringify(s.slice(Math.max(0,badgesIdx-80), badgesIdx+200)))}
const lastChar = s[s.length-1];
console.log('length', s.length, 'lastCharCode', lastChar?lastChar.charCodeAt(0):null);
const pos50753 = s.slice(Math.max(0, s.length-200));
console.log('tailSnippet:', JSON.stringify(pos50753));
