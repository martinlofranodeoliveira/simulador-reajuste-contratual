import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {guardEngineSource}=require('./engine_guard.cjs');
const root=new URL('../',import.meta.url);
const engine=new URL('engine.mjs',root);
const cases=JSON.parse(readFileSync(new URL(process.argv[2],root),"utf8"));
guardEngineSource(readFileSync(engine,'utf8'));
const {evaluate}=await import(engine);
assert.ok(Array.isArray(cases)&&cases.length>0);
for(const [i,[input,expected]] of cases.entries()){
  const previous=structuredClone(input);
  try {
    assert.deepEqual(evaluate(input),expected);
    assert.deepEqual(input,previous);
    assert.deepEqual(evaluate(structuredClone(input)),expected);
  } catch {
    process.stderr.write(`case=${i+1}\n`);
    process.exit(2);
  }
}
console.log('CASES '+cases.length);
