const definitions = JSON.parse(document.getElementById('field-config').content.textContent);
export const example = JSON.parse(document.getElementById('sample-data').content.textContent);
const fields = document.getElementById('fields');
const form = document.getElementById('entry-form');
let elements = [];
let nextId = 0;
const absent = Symbol('absent');
const money = new Intl.NumberFormat('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false});

function node(tag, text, classes) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (classes) element.className = classes;
  return element;
}

function decimal(value) {
  const parts = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(value);
  if (!parts) return null;
  const amount = Number(parts[2]) * 100 + Number((parts[3] || '').padEnd(2, '0'));
  return Number.isSafeInteger(amount) ? (parts[1] ? -amount : amount) : null;
}

function control(options, value, parent) {
  const {key, label, kind, optional} = options;
  const field = node('div', '', 'field');
  const input = node(kind === 'multiline' ? 'textarea' : 'input');
  const caption = node('label', label);
  input.id = 'input-' + ++nextId;
  caption.htmlFor = input.id;
  input.dataset.field = key;
  if (kind === 'checkbox') {
    input.type = 'checkbox';
    input.checked = value === true;
    field.classList.add('field-check');
    field.append(input, caption);
  } else {
    if (kind === 'multiline') {
      input.rows = key === 'text' ? 4 : 3;
      input.maxLength = key === 'text' ? 60000 : 12000;
    } else {
      input.type = kind === 'date' ? 'date' : kind === 'files' ? 'file' : 'text';
      if (kind === 'integer') input.inputMode = 'numeric';
      if (kind === 'money' || kind === 'percent') input.inputMode = 'decimal';
      if (input.type === 'text') input.maxLength = kind === 'text' ? 512 : 24;
    }
    if (kind === 'files') {
      input.id = 'files';
      caption.htmlFor = input.id;
      input.multiple = true;
    } else if (value !== undefined) {
      input.value = kind === 'money' ? money.format(value / 100)
        : kind === 'percent' ? String(value / 100).replace('.', ',') : value;
    }
    input.required = !optional && kind !== 'files';
    field.append(caption, input);
  }
  parent.append(field);
  input.addEventListener('input', () => input.setCustomValidity(''));

  function read() {
    if (kind === 'checkbox') return input.checked;
    if (kind === 'files') return [...input.files];
    const text = input.value.trim();
    if (optional && !text) return absent;
    if (kind === 'money' || kind === 'percent' || kind === 'integer') {
      const number = kind !== 'integer' ? decimal(text) : /^-?\d+$/.test(text) ? Number(text) : null;
      input.setCustomValidity(Number.isSafeInteger(number) ? '' : kind === 'integer'
        ? 'Digite um número inteiro.' : 'Digite um valor com até duas casas decimais.');
      return number;
    }
    return text;
  }
  return {read, input};
}

function collection(options, initial) {
  const container = node('fieldset', '', 'form-group field-section');
  container.dataset.group = options.key;
  const title = node('legend', options.label, 'group-title');
  const rows = node('div', '', 'field-rows');
  const tools = node('div', '', 'row-actions');
  const add = node('button', 'Adicionar ' + options.singular, 'quiet');
  add.type = 'button';
  add.dataset.addRow = options.key;
  tools.append(add);
  container.append(title, rows, tools);
  fields.append(container);
  const entries = new Map();
  const scalar = options.fields[0].key === '';

  function append(value, focus) {
    if (entries.size >= options.maximum) return;
    const row = node('div', '', 'field-row');
    row.dataset.row = options.key;
    const grid = node('div', '', 'form-grid');
    const remove = node('button', 'Remover', 'quiet remove-row');
    remove.type = 'button';
    remove.dataset.removeRow = options.key;
    remove.setAttribute('aria-label', 'Remover ' + options.singular);
    const readers = options.fields.map(field => ({
      key: field.key,
      ...control(field, scalar ? value : value?.[field.key], grid),
    }));
    remove.addEventListener('click', () => {
      entries.delete(row);
      row.remove();
      add.disabled = false;
      add.focus();
      form.dispatchEvent(new Event('input'));
    });
    entries.set(row, readers);
    row.append(grid, remove);
    rows.append(row);
    add.disabled = entries.size >= options.maximum;
    if (focus) readers[0].input.focus();
  }
  for (const value of initial) append(value, false);
  add.addEventListener('click', () => {
    append(undefined, true);
    form.dispatchEvent(new Event('input'));
  });

  return () => [...entries.values()].map(readers => scalar
    ? readers[0].read()
    : Object.fromEntries(readers.map(({key, read}) => [key, read()]).filter(([, value]) => value !== absent)));
}

export function edit(data) {
  fields.replaceChildren();
  elements = [];
  for (const definition of definitions) {
    const {key} = definition;
    const read = definition.fields ? collection(definition, data[key] || []) : control(definition, data[key], fields).read;
    elements.push([key, read]);
  }
}

export function readForm() {
  const data = Object.fromEntries(elements.map(([key, read]) => [key, read()]).filter(([, value]) => value !== absent));
  return form.reportValidity() ? data : null;
}
