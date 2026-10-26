const fs=require('node:fs'),path=require('node:path');const dir=path.join(__dirname,'..','extension');const core=fs.readFileSync(path.join(dir,'core.js'),'utf8');fs.writeFileSync(path.join(dir,'core-isolated.js'),core);fs.writeFileSync(path.join(dir,'content-bundle.js'),core+'\n'+fs.readFileSync(path.join(dir,'feedback.js'),'utf8')+'\n'+fs.readFileSync(path.join(dir,'content.js'),'utf8'));

fs.writeFileSync(path.join(dir,'bridge-bundle.js'),core+'\n'+fs.readFileSync(path.join(dir,'bridge.js'),'utf8'));
