import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/dom-shim.js';

const { document, key } = installDom();
const { tabs, nextTabIndex } = await import('../js/ui/tabs.js');
const { stepper, stepStates } = await import('../js/ui/stepper.js');
const { confirmDialog } = await import('../js/ui/confirm.js');
const { field, input } = await import('../js/ui/form.js');
const { splitHighlights } = await import('../js/ui/source-panel.js');
const { filterCommands, moveIndex, searchPalette } = await import('../js/ui/search-palette.js');
const { citationTone } = await import('../js/ui/citation-chip.js');
const { chip } = await import('../js/ui/chip.js');
const { modal } = await import('../js/ui/modal.js');
const { pdfViewer } = await import('../js/ui/pdf-viewer.js');
const { safeUrl } = await import('../js/ui/a11y.js');

test('nextTabIndex handles arrows, wrap, Home/End', () => {
  assert.equal(nextTabIndex('ArrowRight', 2, 3), 0);
  assert.equal(nextTabIndex('ArrowLeft', 0, 3), 2);
  assert.equal(nextTabIndex('Home', 2, 3), 0);
  assert.equal(nextTabIndex('End', 0, 3), 2);
  assert.equal(nextTabIndex('x', 0, 3), null);
});

test('tabs: keyboard moves selection, roving tabindex, onChange', () => {
  const seen = [];
  const el = tabs({ items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], active: 'a', onChange: (id) => seen.push(id) });
  document.body.append(el);
  const [a, b, c] = el.byRole('tab');
  assert.equal(a.getAttribute('aria-selected'), 'true');
  assert.equal(b.getAttribute('tabindex'), '-1');
  a.dispatchEvent(key('keydown', 'ArrowRight'));
  assert.equal(b.getAttribute('aria-selected'), 'true');
  assert.equal(document.activeElement, b);
  b.dispatchEvent(key('keydown', 'End'));
  assert.equal(document.activeElement, c);
  c.click();
  assert.deepEqual(seen, ['b', 'c']);
});

test('stepStates maps done/current/todo', () => {
  const steps = [{ id: '1' }, { id: '2' }, { id: '3' }];
  assert.deepEqual(stepStates(steps, '2'), ['done', 'current', 'todo']);
  assert.deepEqual(stepStates(steps, 'zz'), ['todo', 'todo', 'todo']);
  const el = stepper({ steps: [{ id: '1', label: 'One' }, { id: '2', label: 'Two' }], current: '1' });
  assert.equal(el.children[0].getAttribute('aria-current'), 'step');
});

test('confirmDialog resolves true on confirm, false on cancel and Esc; returns focus', async () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  let p = confirmDialog({ title: 'T', message: 'M', confirmLabel: 'Yes' });
  let btns = document.body.byClass('g-btn');
  assert.equal(document.body.byRole('alertdialog').length, 1);
  assert.equal(btns.find((b) => b.textContent === 'Yes').className.includes('primary'), true);
  btns.find((b) => b.textContent === 'Yes').click();
  assert.equal(await p, true);
  assert.equal(document.activeElement, opener);
  assert.equal(document.body.byRole('alertdialog').length, 0);

  p = confirmDialog({ title: 'T', message: 'M' });
  document.body.byClass('g-btn').find((b) => b.textContent === 'Cancel').click();
  assert.equal(await p, false);

  p = confirmDialog({ title: 'T', message: 'M', tone: 'danger' });
  document.body.byRole('alertdialog')[0].dispatchEvent(key('keydown', 'Escape'));
  assert.equal(await p, false);
});

test('modal: Tab is trapped inside, Esc closes, onClose fires once', () => {
  let closed = 0;
  const m = modal({ title: 'X', body: 'b', actions: [document.createElement('button')], onClose: () => closed++ });
  m.open();
  const panel = m.el.byRole('dialog')[0];
  const btns = panel.byTag('button');
  btns[btns.length - 1].focus();
  const ev = key('keydown', 'Tab');
  btns[btns.length - 1].dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(document.activeElement, btns[0]);
  m.el.dispatchEvent(key('keydown', 'Escape'));
  m.close();
  assert.equal(closed, 1);
});

test('field wires label, hint, error and aria-invalid', () => {
  const inp = input({ name: 'e' });
  const f = field({ label: 'Email', input: inp, hint: 'Hint', required: true });
  const label = f.byTag('label')[0];
  assert.equal(label.getAttribute('for'), inp.getAttribute('id'));
  assert.match(inp.getAttribute('aria-describedby'), /-hint$/);
  assert.equal(inp.getAttribute('aria-invalid'), null);
  f.setError('Required');
  assert.equal(inp.getAttribute('aria-invalid'), 'true');
  assert.match(inp.getAttribute('aria-describedby'), /-hint .*-err$/);
  assert.equal(f.byRole('alert')[0].textContent, 'Required');
  f.setError(null);
  assert.equal(inp.getAttribute('aria-invalid'), null);
  assert.doesNotMatch(inp.getAttribute('aria-describedby'), /-err/);
});

test('splitHighlights wraps phrases case-insensitively', () => {
  const s = splitHighlights('The Basic Structure test', ['basic structure']);
  assert.deepEqual(s.map((x) => [x.text, x.hit]), [['The ', false], ['Basic Structure', true], [' test', false]]);
});

test('palette filtering, index wrap, combobox semantics, Ctrl K', () => {
  const cmds = [{ id: 'a', label: 'Open research', keywords: 'search' }, { id: 'b', label: 'Audit log' }];
  assert.equal(filterCommands(cmds, 'search').length, 1);
  assert.equal(filterCommands(cmds, '').length, 2);
  assert.equal(moveIndex(1, 1, 2), 0);
  assert.equal(moveIndex(0, -1, 2), 1);
  let ran = 0;
  const p = searchPalette({ commands: [{ id: 'a', label: 'Go', run: () => ran++ }] });
  document.dispatchEvent(key('keydown', 'k', { ctrlKey: true }));
  const cb = p.el.byRole('combobox')[0];
  assert.ok(cb);
  assert.equal(cb.getAttribute('aria-activedescendant') != null, true);
  cb.dispatchEvent(key('keydown', 'Enter'));
  assert.equal(ran, 1);
  p.destroy();
});

test('status tone, chips always have text, urls are screened', () => {
  assert.equal(citationTone('verified'), 'primary');
  assert.equal(citationTone('unverified'), 'warn');
  assert.equal(citationTone('overruled'), 'danger');
  assert.equal(chip({ label: 'Followed', tone: 'primary' }).textContent, 'Followed');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  const pv = pdfViewer({ url: 'https://x.test/a.pdf' });
  assert.equal(pv.byTag('iframe')[0].getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(pv.byTag('a')[0].textContent, 'Open original');
});

test('palette setCommands replaces the command list (role preview / language change)', () => {
  let ran = '';
  const p = searchPalette({ commands: [{ id: 'a', label: 'Admin audit', run: () => { ran = 'a'; } }, { id: 'b', label: 'Home', run: () => { ran = 'b'; } }] });
  p.setCommands([{ id: 'b', label: 'Home', run: () => { ran = 'b2'; } }]);
  document.dispatchEvent(key('keydown', 'k', { ctrlKey: true }));
  const cb = p.el.byRole('combobox')[0];
  assert.equal(p.el.byRole('option').length, 1);
  cb.dispatchEvent(key('keydown', 'Enter'));
  assert.equal(ran, 'b2');
  p.setCommands([]);
  document.dispatchEvent(key('keydown', 'k', { ctrlKey: true }));
  assert.equal(p.el.byRole('option').length, 0);
  p.destroy();
});
