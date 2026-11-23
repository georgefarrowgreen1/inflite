// Offline evaluator: compares externally measured baseline and candidate results.
import {readFileSync} from "node:fs";
export function compare(baseline,candidate){
 const metrics=["passed","failed","durationMs"];
 for(const record of [baseline,candidate]){
  if(!/^[a-f0-9]{40}$/i.test(record?.sha||""))throw Error("Commit SHA required");
  for(const key of metrics)if(!Number.isFinite(record[key])||record[key]<0)throw Error("Invalid metric "+key);
  if(!Number.isInteger(record.passed)||!Number.isInteger(record.failed)||record.passed+record.failed===0)throw Error("Invalid test counts");
 }
 const comparable=baseline.suite===candidate.suite&&typeof baseline.suite==="string"&&baseline.suite.length>0&&baseline.passed+baseline.failed===candidate.passed+candidate.failed;
 return {baseline:baseline.sha,candidate:candidate.sha,comparable,outcome:!comparable?"inconclusive":candidate.failed>0?"fail":"pass",durationDeltaMs:candidate.durationMs-baseline.durationMs,requiresHumanReview:true};
}
if(process.argv[1]&&import.meta.url===new URL("file:"+process.argv[1]).href){
 const [a,b]=process.argv.slice(2);console.log(JSON.stringify(compare(JSON.parse(readFileSync(a,"utf8")),JSON.parse(readFileSync(b,"utf8"))),null,2));
}
