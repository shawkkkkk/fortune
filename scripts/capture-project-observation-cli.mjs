import {captureProjectObservation} from './capture-project-observation.mjs';
try{
 if(process.env.FORTUNE_RESEARCH_CAPTURE_ENABLED!=='true')throw Error('Disabled');
 const [path,token,id,expectedHead,...extra]=process.argv.slice(2);
 if(!path||!token||!id||!expectedHead||extra.length)throw Error('Arguments');
 console.log(JSON.stringify(await captureProjectObservation({path,token,id,expectedHead})));
}catch{
 console.error('Project observation capture stopped. Check explicit enablement, protected existing notebook, project, unique capture ID, expected head and official API availability. Inspect history before retrying an uncertain outcome. No wallet action or publication was performed.');process.exitCode=1;
}
