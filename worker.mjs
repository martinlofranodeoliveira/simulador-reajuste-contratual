import {evaluate} from './engine.mjs';
self.addEventListener('message',event=>{
  try{ self.postMessage(evaluate(event.data)); }
  catch{ self.postMessage({error:'INVALID_INPUT'}); }
});
