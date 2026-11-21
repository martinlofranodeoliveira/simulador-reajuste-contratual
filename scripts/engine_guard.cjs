'use strict';
// Admission restriction only: parsing is never a replacement for isolation/tests.
const fs = require('node:fs');
const crypto = require('node:crypto');
const acornPath = require('node:path').join(__dirname, 'vendor/acorn.cjs');
const ACORN_SHA256 = '24974706ffc00984a334f9ee085cc3cb2bf0a0ec80787ea9374ab5b5b6535681';
if (crypto.createHash('sha256').update(fs.readFileSync(acornPath)).digest('hex') !== ACORN_SHA256) throw new Error('GUARD_DEPENDENCY');
const acorn = require(acornPath);
const MAX_SOURCE = 131072;
const STATIC = Object.freeze({
  Array: new Set(['isArray']),
  Object: new Set(['keys', 'values', 'entries', 'hasOwn']),
  Number: new Set(['isInteger', 'isFinite', 'isSafeInteger']),
  Math: new Set(['floor', 'ceil', 'round', 'abs', 'min', 'max', 'trunc']),
});
const METHODS = new Set(['push', 'pop', 'slice', 'concat', 'includes', 'indexOf', 'join',
  'sort', 'reverse', 'fill', 'add', 'has', 'delete', 'clear', 'test', 'trim',
  'toLowerCase', 'toUpperCase', 'split', 'get', 'set', 'replace', 'startsWith', 'endsWith', 'substring', 'charCodeAt', 'at']);
const FORBIDDEN = new Set(['constructor', 'prototype', '__proto__', 'eval', 'Function',
  'Reflect', 'Proxy', 'Date', 'process', 'require', 'module', 'exports', 'global',
  'globalThis', 'window', 'self', 'navigator', 'location', 'fetch', 'XMLHttpRequest',
  'WebSocket', 'Worker', 'SharedWorker', 'importScripts', 'WebAssembly', 'Buffer',
  'Promise', 'Atomics', 'SharedArrayBuffer', 'setTimeout', 'setInterval',
  'setImmediate', 'queueMicrotask', 'performance', 'console', 'Intl',
  'toString', 'valueOf', 'call', 'apply', 'bind', '__defineGetter__', '__lookupGetter__']);
const CONSTRUCTORS = new Set(['Set', 'Map', 'Array', 'Error', 'TypeError', 'RangeError']);
const CALLS = new Set(['Number', 'String', 'Boolean', 'Array', 'Error', 'TypeError', 'RangeError']);
const NODES = new Set(['Program', 'ExportNamedDeclaration', 'FunctionDeclaration',
  'BlockStatement', 'VariableDeclaration', 'VariableDeclarator', 'Identifier',
  'Literal', 'ExpressionStatement', 'AssignmentExpression', 'UpdateExpression',
  'UnaryExpression', 'BinaryExpression', 'LogicalExpression', 'ConditionalExpression',
  'IfStatement', 'ReturnStatement', 'ThrowStatement', 'CallExpression',
  'NewExpression', 'MemberExpression', 'ObjectExpression', 'Property',
  'ArrayExpression', 'ForStatement', 'ForOfStatement', 'WhileStatement',
  'BreakStatement', 'ContinueStatement', 'EmptyStatement', 'SpreadElement']);
const GUARD_POLICY = Object.freeze({export: 'export function evaluate(input)',
  maxSourceBytes: MAX_SOURCE, helpers: 'module-level function declarations only',
  moduleConstants: 'const primitive literals only', staticMethods: Object.fromEntries(
    Object.entries(STATIC).map(([k,v]) => [k,[...v]])), pureMethods: [...METHODS],
  numericIndex: 'numeric literal, proven numeric local, or numeric-coercing arithmetic; no dynamic string keys',
  noImportsIOCodegenPrototypeOrGlobalObjects: true});

function reject() { throw new ValueError(); }
class ValueError extends Error { constructor() { super('ENGINE_REJECTED'); } }
function nameOK(name) { return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(name) && !FORBIDDEN.has(name); }
function kids(node) {
  const out=[];
  for (const [key,value] of Object.entries(node)) {
    if (key==='start'||key==='end'||key==='loc') continue;
    if (Array.isArray(value)) for(const item of value) { if(item&&typeof item.type==='string') out.push(item); }
    else if (value&&typeof value.type==='string') out.push(value);
  }
  return out;
}
function walk(node, fn, parent=null) { fn(node,parent); for(const child of kids(node)) walk(child,fn,node); }
function primitive(node) {
  return node && ((node.type==='Literal' && !node.regex && !node.bigint &&
    (node.value===null || ['string','number','boolean'].includes(typeof node.value)) &&
    (typeof node.value!=='number'||Number.isFinite(node.value))) ||
    (node.type==='UnaryExpression'&&['+','-'].includes(node.operator)&&primitive(node.argument)));
}
function binding(scope,name) { for(let s=scope;s;s=s.parent) if(s.vars.has(name)) return s.vars.get(name); return null; }
function numeric(node, scope) {
  if(!node) return false;
  if(node.type==='Literal') return typeof node.value==='number'&&Number.isFinite(node.value);
  if(node.type==='Identifier') { const b=binding(scope,node.name); return !!(b&&b.numeric); }
  if(node.type==='UnaryExpression'&&['+','-','~'].includes(node.operator)) return true;
  if(node.type==='BinaryExpression') {
    if(['-','*','/','%','**','<<','>>','>>>','|','&','^'].includes(node.operator)) return true;
    return node.operator==='+'&&numeric(node.left,scope)&&numeric(node.right,scope);
  }
  return false;
}
function declare(scope,id,init=null) {
  if(!id||id.type!=='Identifier'||!nameOK(id.name)||STATIC[id.name]||CONSTRUCTORS.has(id.name)||CALLS.has(id.name)) reject();
  if(scope.vars.has(id.name)) reject();
  scope.vars.set(id.name,{numeric:false,init,writes:[]});
}
function blockScope(parent, statements) {
  const scope={parent,vars:new Map()};
  for(const n of statements) if(n.type==='VariableDeclaration') {
    if(n.kind==='var') reject();
    for(const d of n.declarations) declare(scope,d.id,d.init);
  }
  return scope;
}
function guardEngineSource(source) {
  if(typeof source!=='string'||Buffer.byteLength(source,'utf8')>MAX_SOURCE) reject();
  let tree;
  try { tree=acorn.parse(source,{ecmaVersion:2022,sourceType:'module',allowAwaitOutsideFunction:false}); }
  catch(_) { reject(); }
  const globals={parent:null,vars:new Map()}, functions=new Set();
  let exported=0;
  for(const outer of tree.body) {
    let n=outer;
    if(n.type==='ExportNamedDeclaration') {
      exported++;
      if(n.source||n.specifiers.length||!n.declaration||n.declaration.type!=='FunctionDeclaration'||n.declaration.id.name!=='evaluate') reject();
      n=n.declaration;
      if(n.params.length!==1||n.params[0].type!=='Identifier'||n.params[0].name!=='input') reject();
    }
    if(n.type==='FunctionDeclaration') {
      if(!n.id||!nameOK(n.id.name)||functions.has(n.id.name)||globals.vars.has(n.id.name)) reject();
      if(n.async||n.generator) reject();
      functions.add(n.id.name); globals.vars.set(n.id.name,{numeric:false,fn:true});
    } else if(n.type==='VariableDeclaration'&&n.kind==='const') {
      for(const d of n.declarations) { if(!primitive(d.init)) reject(); declare(globals,d.id,d.init); }
    } else reject();
  }
  if(exported!==1||!functions.has('evaluate')) reject();
  function visit(node,parent,scope) {
    if(!NODES.has(node.type)) reject();
    if(node.type==='FunctionDeclaration') {
      if(parent && !['Program','ExportNamedDeclaration'].includes(parent.type)) reject();
      const local={parent:globals,vars:new Map()};
      if(node.async||node.generator||node.params.length>8) reject();
      for(const p of node.params) declare(local,p);
      visit(node.body,node,local); return;
    }
    if(node.type==='BlockStatement') {
      const local=blockScope(scope,node.body);
      // Prove numeric indexes conservatively; every assignment must preserve it.
      for(const b of local.vars.values()) b.numeric=numeric(b.init,local);
      for(let round=0;round<local.vars.size+1;round++) for(const b of local.vars.values()) if(numeric(b.init,local)) b.numeric=true;
      for(let round=0;round<local.vars.size+1;round++) {for(const b of local.vars.values()) if(b.numeric&&!numeric(b.init,local)) b.numeric=false;walk(node,(n)=>{
        const id=n.type==='AssignmentExpression'&&n.left.type==='Identifier'?n.left:null;
        if(id&&local.vars.has(id.name)) { const b=local.vars.get(id.name); if(!numeric(n.right,local)||!['=','+=','-=','*=','/=','%='].includes(n.operator)) b.numeric=false; }
      });}
      for(const child of node.body) visit(child,node,local); return;
    }
    if(node.type==='ForStatement'||node.type==='ForOfStatement') {
      const local={parent:scope,vars:new Map()}; const decl=node.type==='ForStatement'?node.init:node.left;
      if(decl&&decl.type==='VariableDeclaration') {
        if(decl.kind==='var') reject();
        for(const d of decl.declarations) { declare(local,d.id,d.init); local.vars.get(d.id.name).numeric=numeric(d.init,local); }
        for(let round=0;round<local.vars.size+1;round++) {for(const b of local.vars.values()) if(b.numeric&&!numeric(b.init,local)) b.numeric=false;walk(node,(n)=>{if(n.type==='AssignmentExpression'&&n.left.type==='Identifier'&&local.vars.has(n.left.name)&&!numeric(n.right,local)) local.vars.get(n.left.name).numeric=false;});}
      }
      for(const child of kids(node)) visit(child,node,local); return;
    }
    if(node.type==='VariableDeclaration') { if(node.kind==='var') reject(); for(const d of node.declarations) if(d.init) visit(d.init,d,scope); return; }
    if(node.type==='Identifier') {
      if(parent && ((parent.type==='MemberExpression'&&parent.property===node&&!parent.computed)||
        (parent.type==='Property'&&parent.key===node&&!parent.computed&&!parent.shorthand))) return;
      if(!nameOK(node.name)) reject();
      const global=STATIC[node.name]||CONSTRUCTORS.has(node.name)||CALLS.has(node.name);
      if(global) {
        if(STATIC[node.name]&&parent&&parent.type==='MemberExpression'&&parent.object===node&&!parent.computed) return;
        if(parent&&['CallExpression','NewExpression'].includes(parent.type)&&parent.callee===node) return;
        reject();
      }
      if(node.name==='undefined') return;
      const b=binding(scope,node.name); if(!b) reject();
      if(b.fn && !(parent&&parent.type==='CallExpression'&&(parent.callee===node||
          (parent.callee.type==='MemberExpression'&&!parent.callee.computed&&parent.callee.property.name==='sort'&&parent.arguments[0]===node)))) reject();
      return;
    }
    if(node.type==='Literal'&&(node.bigint||(typeof node.value==='number'&&!Number.isFinite(node.value))||
       (node.regex&&/[gy]/.test(node.regex.flags)))) reject();
    if(node.type==='Property') { if(node.computed||node.method||node.kind!=='init') reject(); const key=node.key.name===undefined?node.key.value:node.key.name; if(typeof key==='string'&&(!nameOK(key)||FORBIDDEN.has(key))) reject(); }
    if(node.type==='MemberExpression') {
      if(node.optional) reject();
      let property;
      if(node.computed) {
        if(node.property.type==='Literal'&&typeof node.property.value==='string') property=node.property.value;
        else if(!numeric(node.property,scope)) reject();
      } else property=node.property.name;
      if(property!==undefined&&(!nameOK(property)||FORBIDDEN.has(property))) reject();
      const staticName=node.object.type==='Identifier'&&STATIC[node.object.name]?node.object.name:null;
      const call=parent&&parent.type==='CallExpression'&&parent.callee===node;
      if(staticName) { if(node.computed||!call||!STATIC[staticName].has(property)) reject(); }
      else if(property!==undefined&&METHODS.has(property)&&!call) reject();
      if(call&&!staticName&&(property===undefined||!METHODS.has(property))) reject();
    }
    if(node.type==='CallExpression') {
      if(node.optional) reject();
      if(node.callee.type==='Identifier') { if(!functions.has(node.callee.name)&&!CALLS.has(node.callee.name)) reject(); }
      else if(node.callee.type!=='MemberExpression') reject();
      const method=node.callee.type==='MemberExpression'?(node.callee.computed?node.callee.property.value:node.callee.property.name):null;
      if(method==='sort') {
        if(node.arguments.length!==1||node.arguments[0].type!=='Identifier'||!functions.has(node.arguments[0].name)) reject();
      }
      for(const arg of node.arguments) if(arg.type==='Identifier'&&functions.has(arg.name)&&
        !(node.callee.type==='MemberExpression'&&!node.callee.computed&&node.callee.property.name==='sort')) reject();
    }
    if(node.type==='NewExpression') {
      if(node.callee.type!=='Identifier'||!CONSTRUCTORS.has(node.callee.name)) reject();
      if(['Error','TypeError','RangeError'].includes(node.callee.name)&&
        (!(parent&&parent.type==='ThrowStatement')||node.arguments.length>1||node.arguments.some(a=>a.type!=='Literal'||typeof a.value!=='string'||a.value.length>80))) reject();
    }
    if(node.type==='AssignmentExpression') {
      if(!['Identifier','MemberExpression'].includes(node.left.type)) reject();
      if(node.left.type==='Identifier'&&(!binding(scope,node.left.name)||globals.vars.has(node.left.name))) reject();
    }
    if(node.type==='UpdateExpression'&&(node.argument.type!=='Identifier'||!binding(scope,node.argument.name)||globals.vars.has(node.argument.name))) reject();
    if(node.type==='UnaryExpression'&&node.operator==='delete') reject();
    for(const child of kids(node)) visit(child,node,scope);
  }
  visit(tree,null,globals);
  return {export:'evaluate',policy:'closed-pure-fcfs-v1'};
}
module.exports={guardEngineSource,GUARD_POLICY};
if(require.main===module) {
  try {
    const chunks=[];let size=0;
    while(true) {const buf=Buffer.alloc(16384);const n=fs.readSync(0,buf,0,buf.length,null);if(!n)break;size+=n;if(size>MAX_SOURCE)reject();chunks.push(buf.subarray(0,n));}
    const input=Buffer.concat(chunks);
    const source=new TextDecoder('utf-8',{fatal:true}).decode(input);
    guardEngineSource(source);process.stdout.write('ENGINE_OK\n');
  } catch(_) {process.stderr.write('ENGINE_REJECTED\n');process.exitCode=2;}
}
