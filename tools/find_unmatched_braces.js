const fs = require('fs');
const path = process.argv[2];
if(!path){
  console.error('Usage: node find_unmatched_braces.js <file>');
  process.exit(2);
}
const s = fs.readFileSync(path,'utf8');
const stack = [];
for(let i=0;i<s.length;i++){
  const c = s[i];
  if(c === '{') stack.push(i);
  else if(c === '}'){
    if(stack.length) stack.pop();
    else { console.log('Extra } at', i); process.exit(0); }
  }
}
if(stack.length){
  const pos = stack[stack.length-1];
  const lines = s.slice(0,pos).split(/\r?\n/);
  const line = lines.length;
  const col = lines[lines.length-1].length + 1;
  console.log('Unclosed { at index', pos, 'line', line, 'col', col);
  const ctx = s.slice(Math.max(0,pos-200), Math.min(s.length,pos+200));
  console.log('---context---\n' + ctx + '\n---end---');
  process.exit(0);
}
console.log('Braces balanced');
