import {edit, example, readForm} from './forms.mjs';

const get = id => document.getElementById(id);
const status = get('status');
const form = get('entry-form');
const download = get('download');
const insights = get('insights');
const currency = new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'});
const percent = new Intl.NumberFormat('pt-BR', {style:'percent',maximumFractionDigits:2});
let last = null;
let sequence = 0;
let activeWorker = null;

const labels = {
  id:'Identificador', name:'Arquivo', status:'Situação', occurrences:'Ocorrências', issues:'Pendências',
  duplicates:'Duplicatas', missing:'Ausentes', extra:'Extras', duplicateNames:'Nomes repetidos',
  duplicateContent:'Conteúdo repetido', duplicateContentGroups:'Grupos de conteúdo repetido',
  removed:'Removido', added:'Adicionado', same:'Sem mudança', changed:'Alterado',
  baseCents:'Valor inicial', valueCents:'Valor do período', finalCents:'Valor final', changeCents:'Variação',
  rateBps:'Índice', factorPpm:'Fator acumulado', cumulativePoints:'Pontos acumulados',
  grossCents:'Valor bruto', discountCents:'Desconto', netCents:'Valor líquido',
  excess:'Excedente', excessItems:'Com excedente', lateEntries:'Registros em atraso',
  overdue:'Prazo vencido', overdueItems:'Itens vencidos', pending:'Pendentes', pendingItems:'Itens pendentes',
  received:'Recebido', valid:'Válidos', invalid:'Inválidos', fotoConferida:'Foto conferida',
  medidor:'Hidrômetro', inicialLitros:'Inicial (L)', finalLitros:'Final (L)', sequenciaValida:'Sequência de leituras',
  computedCents:'Total calculado', declaredCents:'Total informado', differenceCents:'Diferença',
  referenceCents:'Referência', aboveReference:'Acima da referência', totalMismatch:'Total divergente',
  totalMismatches:'Totais divergentes', remaining:'Saldo disponível', afterProposed:'Saldo após pedido',
  daysUntilExpiry:'Dias até vencer', nearExpiry:'Perto do vencimento', overBalance:'Acima do saldo', expired:'Vencido',
  kind:'Tipo', code:'Referência', references:'Referências', unreferenced:'Sem referência',
  OK:'Confirmado', MISSING:'Ausente', EXTRA:'Extra', ADDED:'Adicionado', REMOVED:'Removido',
  SAME:'Igual', CHANGED:'Alterado', PENDING:'Pendente', PARTIAL:'Parcial', COMPLETE:'Completo', EXCESS:'Excedente',
  INVALID:'Inválido', DUPLICATE:'Duplicado', FOUND:'Encontrada', UNREFERENCED:'Sem referência',
  CLAUSE:'Cláusula', ANNEX:'Anexo', true:'Sim', false:'Não',
};
for (const group of JSON.parse(get('field-config').content.textContent)) {
  for (const entry of group.fields ?? [group]) if (entry.key && !labels[entry.key]) labels[entry.key] = entry.label;
}

function label(value) {
  const key = String(value);
  if (Object.hasOwn(labels,key)) return labels[key];
  const words = key.replace(/([a-z])([A-Z])/g,'$1 $2');
  return words.charAt(0).toUpperCase()+words.slice(1);
}
function format(key,value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && key.endsWith('Cents')) return currency.format(value/100);
  if (typeof value === 'number' && key.endsWith('Bps')) return percent.format(value/10000);
  if (key === 'factorPpm') return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:6}).format(value/1000000);
  if (key === 'issues') return String(value).split(', ').map(label).join(', ');
  if (key === 'status' || key === 'kind' || typeof value === 'boolean') return label(value);
  return String(value);
}
function make(tag,text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function showInsights(value, data) {
  insights?.replaceChildren();
  if (!insights || !value.rows.length) return;
  const shape = document.querySelector('main').dataset.layoutProfile;
  const path = make('ol');
  if (shape === 'simulador-reajuste-contratual') {
    path.className = 'reajuste-trajectory';
    path.setAttribute('aria-label','Evolução por período');
    for (const row of value.rows) {
      const item = make('li');
      item.append(make('span',String(row.id)),make('strong',format('valueCents',row.valueCents)),
        make('small',format('rateBps',row.rateBps)));
      path.append(item);
    }
  } else if (shape === 'caderno-leituras-hidrometro') {
    path.className = 'reading-log';
    path.setAttribute('aria-label','Consumo por leitura');
    for (const row of value.rows) {
      if (row.status !== 'OK') continue;
      const item = make('li');
      const liters = row.finalLitros - row.inicialLitros;
      item.append(make('span', row.medidor), make('strong', `${liters.toLocaleString('pt-BR')} L`));
      path.append(item);
    }
  } else if (shape === 'conferidor-entregas-cronograma') {
    path.className = 'delivery-progress';
    path.setAttribute('aria-label','Recebimento por item');
    const expected = new Map(data.schedule.map(item => [item.id,item.expected]));
    for (const row of value.rows) {
      const total = expected.get(row.id);
      if (!Number.isFinite(total) || total <= 0) continue;
      const item = make('li');
      const progress = make('progress');
      progress.max = total;
      progress.value = Math.min(total,row.received);
      progress.setAttribute('aria-label', `Quantidade recebida do item ${row.id}`);
      item.append(make('strong', String(row.id)),progress,
        make('span', `${row.received.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`));
      path.append(item);
    }
  }
  if (path.children.length) insights.append(path);
}
function render(value, data) {
  const stats = get('stats'), result = get('result');
  stats.replaceChildren();
  result.replaceChildren();
  insights?.replaceChildren();
  download.disabled = true;
  last = null;
  if (!value || value.error || !Array.isArray(value.rows) || !value.summary) {
    status.textContent = 'A conferência não foi concluída. Revise os valores e os identificadores preenchidos.';
    return;
  }
  for (const [key,count] of Object.entries(value.summary)) {
    const item = make('div');
    item.dataset.metric = key;
    item.append(make('dt',label(key)),make('dd',format(key,count)));
    stats.append(item);
  }
  const keys = [...new Set(value.rows.flatMap(row => Object.keys(row)))];
  const primary = keys.findIndex(key => key === 'id' || key === 'name' || key === 'code');
  if (primary > 0) keys.unshift(...keys.splice(primary,1));
  showInsights(value,data);
  if (keys.length) {
    const table = make('table'), header = table.createTHead().insertRow();
    table.setAttribute('aria-label','Detalhes da conferência');
    for (const key of keys) {
      const th = make('th',label(key));
      th.scope = 'col';
      header.append(th);
    }
    const body = table.createTBody();
    for (const row of value.rows) {
      const line = body.insertRow();
      for (const key of keys) {
        const cell = make('td',format(key,row[key]));
        if (key === 'status') {
          const chip = make('span',cell.textContent);
          chip.className = 'result-status';
          chip.dataset.status = String(row[key]);
          cell.replaceChildren(chip);
        }
        if (key === 'added' || key === 'removed') cell.dataset.diff = key;
        line.append(cell);
      }
    }
    result.append(table);
  }
  status.textContent = value.rows.length ? `Conferência concluída. ${value.rows.length} ${value.rows.length === 1 ? 'registro' : 'registros'}.` : 'Conferência concluída. Nenhum registro encontrado.';
  last = {rows:value.rows,keys};
  download.disabled = !keys.length;
}
async function filesFrom(selected) {
  if (selected.length > 100 || selected.some(file => file.size > 20*1024*1024) ||
      selected.reduce((bytes,file) => bytes+file.size,0) > 150*1024*1024) {
    throw new Error('Selecione até 100 arquivos, com até 20 MB por arquivo e 150 MB no total.');
  }
  const entries = [];
  for (const file of selected) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()));
    entries.push({name:file.name,sha256:Array.from(bytes,byte => byte.toString(16).padStart(2,'0')).join('')});
  }
  return entries;
}
async function evaluate(data,sample=false) {
  const request = ++sequence;
  activeWorker?.terminate();
  last = null;
  download.disabled = true;
  status.textContent = 'Conferindo os dados…';
  if (Object.hasOwn(data,'files')) {
    try {
      data.files = sample ? example.files : await filesFrom(data.files);
    } catch (error) {
      if (request === sequence) status.textContent = error instanceof Error ? error.message : 'Confira os arquivos escolhidos.';
      return;
    }
    if (request !== sequence) return;
  }
  const worker = new Worker('./worker.mjs',{type:'module'});
  activeWorker = worker;
  function complete(result) {
    clearTimeout(timeout);
    worker.terminate();
    if (request === sequence) render(result,data);
  }
  const timeout = setTimeout(() => complete(null),3000);
  worker.onmessage = event => complete(event.data);
  worker.onerror = () => complete(null);
  worker.postMessage(data);
}
function run() {
  const data = readForm();
  if (data) void evaluate(data);
}
function reset() {
  edit(example);
  const data = readForm();
  if (data) void evaluate(data,true);
}
form.addEventListener('submit',event => {
  event.preventDefault();
  run();
});
if (get('run').form !== form || get('run').type !== 'submit') get('run').addEventListener('click',run);
get('reset').addEventListener('click',reset);
form.addEventListener('input',() => {
  sequence++;
  activeWorker?.terminate();
  last = null;
  download.disabled = true;
  status.textContent = 'Dados alterados. Execute a conferência para atualizar o relatório.';
});

function csv(text) {
  const value = String(text);
  const plain = /^[\s]*[=+\-@]/.test(value) && !/^-\d+(?:[,.]\d+)?$/.test(value) ? "'" + value : value;
  return '"' + plain.replaceAll('"','""') + '"';
}
download.addEventListener('click',() => {
  if (!last) return;
  const rows = [last.keys.map(key => csv(label(key))).join(';')];
  for (const row of last.rows) rows.push(last.keys.map(key => csv(format(key,row[key]))).join(';'));
  const href = URL.createObjectURL(new Blob(['\uFEFF',rows.join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'}));
  const link = make('a');
  link.href = href;
  link.download = 'conferencia.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(href),1000);
});
reset();
