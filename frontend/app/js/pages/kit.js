// Kit page: every component in every state. Route '/_kit' (#/_kit), no permission.
import { h } from '../dom.js';
import { chip } from '../ui/chip.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { tabs } from '../ui/tabs.js';
import { listRow } from '../ui/list-row.js';
import { table } from '../ui/table.js';
import { timeline } from '../ui/timeline.js';
import { statTile } from '../ui/stat-tile.js';
import { checkList } from '../ui/check-list.js';
import { citationChip } from '../ui/citation-chip.js';
import { sourcePanel } from '../ui/source-panel.js';
import { pdfViewer } from '../ui/pdf-viewer.js';
import { stepper } from '../ui/stepper.js';
import { modal } from '../ui/modal.js';
import { drawer } from '../ui/drawer.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/confirm.js';
import { emptyState } from '../ui/empty-state.js';
import { errorState } from '../ui/error-state.js';
import { skeleton } from '../ui/skeleton.js';
import { banner } from '../ui/banner.js';
import { field, input, textarea, select } from '../ui/form.js';

const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center' }, ...kids);

function render() {
  const tones = ['neutral', 'primary', 'danger', 'warn', 'info'];
  const m = modal({ title: 'Modal title', body: 'Body text. Press Esc or Tab to test focus handling.', actions: button({ label: 'Close', variant: 'primary', onClick: () => m.close() }) });
  const d = drawer({ title: 'Drawer title', body: 'Drawer body.' });
  const emailField = field({ label: 'Email', input: input({ type: 'email', name: 'email' }), hint: 'Work address', required: true });
  const bad = field({ label: 'With error', input: input({ name: 'x' }), error: 'This field is required' });
  const section = (title, ...kids) => card({ title }, h('div', { style: 'display:flex;flex-direction:column;gap:var(--s4)' }, ...kids));

  return h('div', { style: 'display:flex;flex-direction:column;gap:var(--s6)' },
    h('h1', { style: 'margin:0;font:500 var(--fs-h1)/var(--lh-h1) var(--font-serif)' }, 'Component kit'),
    banner({ tone: 'warn', message: 'Sample data: this banner shows the warn tone.' }),
    banner({ tone: 'danger', message: 'You are offline.', action: { label: 'Retry', onClick: () => toast('Retrying') } }),
    section('Chips', row(...tones.map((t) => chip({ label: t, tone: t, icon: t === 'primary' ? 'check' : undefined })))),
    section('Buttons',
      row(button({ label: 'Primary', variant: 'primary' }), button({ label: 'Secondary' }), button({ label: 'Ghost', variant: 'ghost' }),
        button({ label: 'Danger', variant: 'danger' }), button({ label: 'Disabled', disabled: true }), button({ label: 'As link', href: '#/_kit' }))),
    section('Tabs', tabs({ items: [{ id: 'a', label: 'Overview' }, { id: 'b', label: 'Citations', badge: 4 }, { id: 'c', label: 'History' }], active: 'a' })),
    section('List rows',
      h('div', {},
        listRow({ title: 'State of X v. Y', meta: '2021, Supreme Court', status: chip({ label: 'Followed', tone: 'primary' }), href: '#/_kit' }),
        listRow({ title: 'Selected row', meta: 'Selected state', selected: true, onClick: () => {}, status: chip({ label: 'Doubted', tone: 'warn' }) }),
        listRow({ title: 'Static row', meta: 'No action' }))),
    section('Table',
      table({ columns: [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role', render: (r) => chip({ label: r.role, tone: 'info' }) }],
        rows: [{ name: 'A. Sharma', role: 'Judge' }, { name: 'B. Rao', role: 'Clerk' }], onRowClick: (r) => toast(`Opened ${r.name}`) }),
      table({ columns: [{ key: 'a', label: 'A' }], rows: [], empty: { title: 'No rows', message: 'Empty table state.' } })),
    section('Timeline', timeline([{ time: '10:02', title: 'Draft created', detail: 'Section 1 to 4 generated', user: 'Clerk' }, { time: '11:30', title: 'Reviewed', user: 'Judge' }])),
    section('Stat tiles', h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:var(--s4)' },
      statTile({ label: 'Judgments', value: '1,18,096', hint: 'In corpus' }), statTile({ label: 'Overruled', value: 2, tone: 'danger' }), statTile({ label: 'Pending', value: 7, tone: 'warn' }))),
    section('Check list', checkList([{ label: 'Citation found', state: 'pass' }, { label: 'Not overruled', state: 'fail', detail: 'Overruled in 2019' }, { label: 'Checking', state: 'pending' }, { label: 'Not checked', state: 'unchecked' }])),
    section('Citation chips', row(citationChip({ citation: 'AIR 1973 SC 1461', status: 'verified', href: '#/_kit' }), citationChip({ citation: '(2010) 5 SCC 1', status: 'unverified' }),
      citationChip({ citation: '1978 SCR 1', status: 'overruled', curated: true }), citationChip({ citation: 'Plain', status: 'unknown' }))),
    section('Source panel', sourcePanel({ title: 'Judgment text', subtitle: 'Supreme Court, 1973', pdfUrl: '#', highlights: ['basic structure'], body: 'The doctrine of basic structure limits amendments. See the basic structure test.' })),
    section('PDF viewer (no URL)', pdfViewer({ url: '' })),
    section('Stepper', stepper({ steps: [{ id: '1', label: 'Upload' }, { id: '2', label: 'Review' }, { id: '3', label: 'Generate' }], current: '2' })),
    section('Overlays', row(button({ label: 'Open modal', onClick: () => m.open() }), button({ label: 'Open drawer', onClick: () => d.open() }),
      button({ label: 'Confirm dialog', onClick: async () => toast(await confirmDialog({ title: 'Delete draft?', message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }) ? 'Confirmed' : 'Cancelled') }),
      ...tones.map((t) => button({ label: `Toast ${t}`, variant: 'ghost', onClick: () => toast(`A ${t} toast`, { tone: t }) })))),
    section('States', emptyState({ title: 'No drafts yet', message: 'Create your first draft.', action: button({ label: 'New draft', variant: 'primary' }) }),
      errorState({ message: 'Could not load drafts.', requestId: 'req-1234', onRetry: () => toast('Retry') }), skeleton({ lines: 3 })),
    section('Form fields', emailField, bad, field({ label: 'Notes', input: textarea({ name: 'n' }) }),
      field({ label: 'Court', input: select({ name: 'c', options: [{ value: 'sc', label: 'Supreme Court' }, { value: 'hc', label: 'High Court' }] }) })));
}

export default { route: '/_kit', title: 'Component kit', permission: null, render, onLeave() {} };
