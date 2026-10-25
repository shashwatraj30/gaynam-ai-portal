// Minimal DOM shim for node --test (no deps). installDom() sets globals: document, Node, Element, Event.
// Supports what js/dom.js and js/ui/* use: create/append/remove, attributes, classList, events with bubbling, focus.
export function installDom() {
  class Evt {
    constructor(type, init = {}) { Object.assign(this, init); this.type = type; this.defaultPrevented = false; this.target = null; this._stop = false; }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._stop = true; }
  }
  class Node {
    constructor() { this.childNodes = []; this.parentNode = null; this._l = {}; }
    get firstChild() { return this.childNodes[0] || null; }
    get children() { return this.childNodes.filter((c) => c instanceof Element); }
    append(...kids) { for (const k of kids) this.appendChild(typeof k === 'string' ? new Text(k) : k); }
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; } return c; }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    addEventListener(t, fn) { (this._l[t] ||= []).push(fn); }
    removeEventListener(t, fn) { this._l[t] = (this._l[t] || []).filter((f) => f !== fn); }
    dispatchEvent(e) {
      e.target ||= this;
      for (let n = this; n && !e._stop; n = n.parentNode) for (const f of [...(n._l[e.type] || [])]) f.call(n, e);
      return !e.defaultPrevented;
    }
    get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
    set textContent(v) { this.childNodes = []; if (v !== '' && v != null) this.appendChild(new Text(String(v))); }
  }
  class Text extends Node {
    constructor(t) { super(); this.data = t; this.nodeType = 3; }
    get textContent() { return this.data; }
    set textContent(v) { this.data = v; }
  }
  class Element extends Node {
    constructor(tag, ns) { super(); this.tagName = tag.toUpperCase(); this.nodeType = 1; this.namespaceURI = ns; this._a = new Map(); this.dataset = {}; this.style = {}; }
    setAttribute(k, v) { this._a.set(k, String(v)); }
    getAttribute(k) { return this._a.has(k) ? this._a.get(k) : null; }
    hasAttribute(k) { return this._a.has(k); }
    removeAttribute(k) { this._a.delete(k); }
    get className() { return this._a.get('class') || ''; }
    set className(v) { this._a.set('class', v); }
    get id() { return this.getAttribute('id') || ''; }
    get classList() {
      const self = this; const list = () => self.className.split(/\s+/).filter(Boolean);
      return {
        add: (c) => { if (!list().includes(c)) self.className = [...list(), c].join(' '); },
        remove: (c) => { self.className = list().filter((x) => x !== c).join(' '); },
        contains: (c) => list().includes(c),
      };
    }
    focus() { document.activeElement = this; this.dispatchEvent(new Evt('focus')); }
    click() { this.dispatchEvent(new Evt('click', { bubbles: true })); }
    walk(fn) { for (const c of this.children) { fn(c); c.walk(fn); } }
    find(pred) { const out = []; this.walk((e) => { if (pred(e)) out.push(e); }); return out; }
    byClass(c) { return this.find((e) => e.classList.contains(c)); }
    byTag(t) { return this.find((e) => e.tagName === t.toUpperCase()); }
    byRole(r) { return this.find((e) => e.getAttribute('role') === r); }
  }
  const body = new Element('body');
  const doc = new Node();
  Object.assign(doc, {
    body, activeElement: body,
    createElement: (t) => new Element(t),
    createElementNS: (ns, t) => new Element(t, ns),
    createTextNode: (t) => new Text(String(t)),
  });
  body.parentNode = doc;
  Object.assign(globalThis, { document: doc, Node, Element, Event: Evt });
  globalThis.window = globalThis;
  return { document: doc, key: (type, key, extra = {}) => new Evt(type, { key, bubbles: true, ...extra }) };
}
