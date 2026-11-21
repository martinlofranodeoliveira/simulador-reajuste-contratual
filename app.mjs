const get = id => document.getElementById(id);
const editor = get('editor');
const example = editor.value;
const status = get('status');
const download = get('download');
let last = null;
let task;
const labels = {rows:'Linhas', summary:'Resumo', name:'Nome', status:'Situação', duplicates:'Duplicatas', occurrences:'Ocorrências',
  missing:'Ausentes', extra:'Extras', duplicateNames:'Nomes repetidos', duplicateContent:'Conteúdo repetido',
  duplicateContentGroups:'Grupos de conteúdo repetido', id:'ID', removed:'Removido', added:'Adicionado',
  same:'Sem mudança', changed:'Alterado', OK:'OK', MISSING:'Ausente', EXTRA:'Extra', ADDED:'Adicionado',
  REMOVED:'Removido', SAME:'Sem mudança', CHANGED:'Alterado', true:'Sim', false:'Não'};
function label(value){const key=String(value);return Object.hasOwn(labels,key) ? labels[key] : key.replace(/([a-z])([A-Z])/g,'$1 $2');}
function element(tag,value){const node=document.createElement(tag);if(value!==undefined)node.textContent=label(value);return node;}
function render(value){
  const stats=get('stats'), result=get('result');
  stats.replaceChildren();result.replaceChildren();download.disabled=true;last=null;
  if(!value || value.error || !Array.isArray(value.rows) || !value.summary){status.textContent='Confira o formato dos dados de entrada.';return;}
  for(const [key,count] of Object.entries(value.summary)){
    const card=element('div');card.append(element('dt',key),element('dd',count));stats.append(card);
  }
  if(value.rows.length){
    const keys=[...new Set(value.rows.flatMap(row=>Object.keys(row)))];
    const table=element('table'), header=table.createTHead().insertRow();
    for(const key of keys){const th=element('th',key);th.scope='col';header.append(th);}
    const body=table.createTBody();
    for(const row of value.rows){const line=body.insertRow();for(const key of keys)line.append(element('td',row[key]??'—'));}
    result.append(table);
  }
  status.textContent=value.rows.length ? `Conferência concluída. ${value.rows.length} linhas.` : 'Conferência concluída. Nenhuma linha encontrada.';
  last=value;download.disabled=false;
}
get('run').addEventListener('click',()=>{
  let data;
  task?.terminate();last=null;download.disabled=true;
  try{if(editor.value.length>240000)throw Error();data=JSON.parse(editor.value);}
  catch{status.textContent='Confira a sintaxe e o tamanho do JSON.';return;}
  status.textContent='Conferindo os dados…';
  task=new Worker('./worker.mjs',{type:'module'});
  const timeout=setTimeout(()=>{task?.terminate();render(null);},3000);
  task.onmessage=event=>{clearTimeout(timeout);task?.terminate();render(event.data);};
  task.onerror=()=>{clearTimeout(timeout);task?.terminate();render(null);};
  task.postMessage(data);
});
get('reset').addEventListener('click',()=>{editor.value=example;get('run').click();editor.focus();});
download.addEventListener('click',()=>{
  if(!last)return;
  const href=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)+'\n'],{type:'application/json'}));
  const link=element('a');link.href=href;link.download='conferencia.json';link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
});
get('files')?.addEventListener('change', async event=>{
  const files=[...event.currentTarget.files];
  if(!files.length)return;
  if(files.length>100 || files.some(file=>file.size>20*1024*1024) || files.reduce((bytes,file)=>bytes+file.size,0)>150*1024*1024){
    status.textContent='Selecione até 100 arquivos, com até 20 MB por arquivo e 150 MB no total.';return;
  }
  try{
    const data=JSON.parse(editor.value), entries=[];
    for(const file of files){
      const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()));
      entries.push({name:file.name,sha256:Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('')});
    }
    data.files=entries;editor.value=JSON.stringify(data,null,2);get('run').click();
  }catch{status.textContent='Confira a lista esperada antes de selecionar os arquivos.';}
});
get('run').click();
