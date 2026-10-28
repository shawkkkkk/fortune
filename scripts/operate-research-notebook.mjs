import {readFileSync,statSync} from 'node:fs';import {ProjectResearchNotebook} from './project-research-notebook.mjs';
let book;
try{if(process.env.FORTUNE_RESEARCH_NOTEBOOK_ENABLED!=='true')throw Error('Disabled');const [mode,path,token,input,...extra]=process.argv.slice(2);
 if(!['init','read','append'].includes(mode)||!path||!token||extra.length||((mode==='append')!==Boolean(input)))throw Error('Arguments');
 if(mode==='init'){ProjectResearchNotebook.initialize(path,token);console.log(JSON.stringify({initialized:true,executionAuthorized:false}));}
 else{book=new ProjectResearchNotebook(path,token,{readOnly:mode==='read'});if(mode==='read')console.log(JSON.stringify(book.read()));else{if(statSync(input).size>20000)throw Error('Input bound');const bytes=readFileSync(input);if(bytes.length>20000)throw Error('Input bound');console.log(JSON.stringify(book.append(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)))));}}
}catch{console.error('Research notebook stopped. Check explicit enablement, protected initialized project file, bounded note, expected head, unique retry ID and host clock. No publication or wallet action occurred.');process.exitCode=1;}finally{book?.close();}
