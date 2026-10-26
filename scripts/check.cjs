const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');const root=path.join(__dirname,'..','extension');let n=0;
for(const file of fs.readdirSync(root))if(file.endsWith('.js')){cp.execFileSync(process.execPath,['--check',path.join(root,file)]);n++;}
const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));for(const file of [m.background.service_worker,...m.content_scripts.flatMap(c=>c.js),...Object.values(m.icons)])if(!fs.existsSync(path.join(root,file)))throw new Error('Missing '+file);
const html=fs.readFileSync(path.join(root,'panel.html'),'utf8');for(const match of html.matchAll(/(?:src|href)="([^"#:]+)"/g)){if(!match[1].startsWith('https:')&&!fs.existsSync(path.join(root,match[1])))throw new Error('Missing '+match[1]);}
console.log(`${n} scripts parsed; manifest references and panel assets verified.`);

if(fs.readFileSync(path.join(root,'core.js'),'utf8')!==fs.readFileSync(path.join(root,'core-isolated.js'),'utf8'))throw new Error('Isolated-world core is stale');
