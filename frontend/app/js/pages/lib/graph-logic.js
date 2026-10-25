// Pure logic for the citation graph page (no DOM). Payload: GET /api/judgment/{id}/graph
//   {judgment_id, nodes:[{id,title,citation,court,year,precedent_status,in_corpus,is_center}],
//    edges:[{source,target,relation:'cites'|'overruled_by',label?}], is_linked, message}
// Edge meaning: 'cites' = source cites target; 'overruled_by' = source was overruled by target.
// Layered layout: columns run from older/cited authorities (left) to later/overruling ones (right).

export const MAX_NODES = 30;
export const NODE_W = 208;
export const NODE_H = 64;
export const COL_GAP = 72;
export const ROW_GAP = 24;
export const PAD = 24;

const key = (v) => String(v);

/** Keep the centre plus the nodes closest to it (BFS order), at most `max`; drop edges that lose an end. */
export function limitGraph(nodes = [], edges = [], centerId, max = MAX_NODES) {
  if (nodes.length <= max) return { nodes: nodes.slice(), edges: edges.slice(), truncated: false, total: nodes.length };
  const byId = new Map(nodes.map((n) => [key(n.id), n]));
  const adj = new Map();
  for (const e of edges) {
    const s = key(e.source); const t = key(e.target);
    if (!adj.has(s)) adj.set(s, []);
    if (!adj.has(t)) adj.set(t, []);
    adj.get(s).push(t); adj.get(t).push(s);
  }
  const order = [];
  const seen = new Set();
  const start = byId.has(key(centerId)) ? key(centerId) : key(nodes[0].id);
  const q = [start]; seen.add(start);
  while (q.length) {
    const cur = q.shift(); order.push(cur);
    for (const nb of adj.get(cur) || []) if (!seen.has(nb) && byId.has(nb)) { seen.add(nb); q.push(nb); }
  }
  for (const n of nodes) if (!seen.has(key(n.id))) { seen.add(key(n.id)); order.push(key(n.id)); }
  const keep = new Set(order.slice(0, max));
  return {
    nodes: nodes.filter((n) => keep.has(key(n.id))),
    edges: edges.filter((e) => keep.has(key(e.source)) && keep.has(key(e.target))),
    truncated: true, total: nodes.length,
  };
}

function delta(relation) {
  if (relation === 'cites') return -1; // the cited authority is older: one column to the left
  return 1; // overruled_by (and unknown relations): the target is later: one column to the right
}

/** Map id -> layer index (0 = leftmost). BFS from the centre; unreachable nodes join the centre column. */
export function assignLayers(nodes, edges, centerId) {
  const layer = new Map();
  const ids = nodes.map((n) => key(n.id));
  const start = ids.includes(key(centerId)) ? key(centerId) : ids[0];
  if (start === undefined) return layer;
  layer.set(start, 0);
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    const lc = layer.get(cur);
    for (const e of edges) {
      const s = key(e.source); const t = key(e.target); const d = delta(e.relation);
      if (s === cur && !layer.has(t) && ids.includes(t)) { layer.set(t, lc + d); q.push(t); }
      else if (t === cur && !layer.has(s) && ids.includes(s)) { layer.set(s, lc - d); q.push(s); }
    }
  }
  for (const id of ids) if (!layer.has(id)) layer.set(id, 0);
  const min = Math.min(...layer.values());
  for (const [k, v] of layer) layer.set(k, v - min);
  return layer;
}

/** SVG path for an edge between two laid-out nodes (top-left x,y plus w,h). */
export function edgePath(a, b) {
  const ay = a.y + a.h / 2; const by = b.y + b.h / 2;
  let sx; let ex; let c1; let c2;
  if (a.x + a.w <= b.x) { sx = a.x + a.w; ex = b.x; c1 = (sx + ex) / 2; c2 = c1; }
  else if (b.x + b.w <= a.x) { sx = a.x; ex = b.x + b.w; c1 = (sx + ex) / 2; c2 = c1; }
  else { sx = a.x + a.w; ex = b.x + b.w; c1 = sx + 48; c2 = ex + 48; }
  return `M ${sx} ${ay} C ${c1} ${ay}, ${c2} ${by}, ${ex} ${by}`;
}

/** Full layout. Returns {nodes (with layer,x,y,w,h), edges (with d), width, height, truncated, total, centerId}. */
export function layoutGraph(data) {
  const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const rawEdges = Array.isArray(data?.edges) ? data.edges : [];
  const flagged = rawNodes.find((n) => n.is_center);
  const centerId = flagged ? flagged.id : (data?.judgment_id ?? rawNodes[0]?.id);
  const lim = limitGraph(rawNodes, rawEdges, centerId);
  const layers = assignLayers(lim.nodes, lim.edges, centerId);
  const cols = new Map();
  for (const n of lim.nodes) {
    const l = layers.get(key(n.id));
    if (!cols.has(l)) cols.set(l, []);
    cols.get(l).push(n);
  }
  const maxRows = Math.max(1, ...[...cols.values()].map((c) => c.length));
  const colH = (n) => n * NODE_H + (n - 1) * ROW_GAP;
  const height = colH(maxRows) + PAD * 2;
  const nodes = [];
  for (const [l, list] of cols) {
    const off = (colH(maxRows) - colH(list.length)) / 2;
    list.forEach((n, i) => {
      nodes.push({ ...n, layer: l, row: i, x: PAD + l * (NODE_W + COL_GAP), y: PAD + off + i * (NODE_H + ROW_GAP), w: NODE_W, h: NODE_H, isCenter: key(n.id) === key(centerId) });
    });
  }
  nodes.sort((a, b) => a.layer - b.layer || a.row - b.row);
  const byId = new Map(nodes.map((n) => [key(n.id), n]));
  const edges = lim.edges.map((e) => ({ ...e, d: edgePath(byId.get(key(e.source)), byId.get(key(e.target))), overruled: e.relation === 'overruled_by' }));
  const layerCount = cols.size ? Math.max(...cols.keys()) + 1 : 1;
  const width = PAD * 2 + layerCount * NODE_W + (layerCount - 1) * COL_GAP;
  return { nodes, edges, width, height, truncated: lim.truncated, total: lim.total, centerId };
}

/** Keyboard navigation between nodes: arrows move across columns/rows. Returns the id to focus or null. */
export function neighborByKey(model, id, keyName) {
  const cur = model.nodes.find((n) => key(n.id) === key(id));
  if (!cur) return null;
  const cy = cur.y + cur.h / 2;
  if (keyName === 'ArrowUp' || keyName === 'ArrowDown') {
    const same = model.nodes.filter((n) => n.layer === cur.layer).sort((a, b) => a.y - b.y);
    const nx = same[same.indexOf(cur) + (keyName === 'ArrowDown' ? 1 : -1)];
    return nx ? nx.id : null;
  }
  if (keyName === 'ArrowLeft' || keyName === 'ArrowRight') {
    const want = cur.layer + (keyName === 'ArrowRight' ? 1 : -1);
    const cand = model.nodes.filter((n) => n.layer === want);
    if (!cand.length) return null;
    cand.sort((a, b) => Math.abs(a.y + a.h / 2 - cy) - Math.abs(b.y + b.h / 2 - cy));
    return cand[0].id;
  }
  return null;
}

export const LINK_ORDER = ['overruled_by', 'overrules', 'relied_on', 'cited_by', 'indirect'];

/** Text-list equivalent of the graph: how each node relates to the centre. */
export function linkRows(model) {
  const c = key(model.centerId);
  const rows = [];
  for (const n of model.nodes) {
    if (key(n.id) === c) continue;
    const id = key(n.id);
    let kind = 'indirect'; let label = null;
    for (const e of model.edges) {
      const s = key(e.source); const t = key(e.target);
      if (s === c && t === id) { kind = e.relation === 'overruled_by' ? 'overruled_by' : 'relied_on'; label = e.label || null; break; }
      if (t === c && s === id) { kind = e.relation === 'overruled_by' ? 'overrules' : 'cited_by'; label = e.label || null; break; }
    }
    rows.push({ node: n, kind, label });
  }
  rows.sort((a, b) => LINK_ORDER.indexOf(a.kind) - LINK_ORDER.indexOf(b.kind));
  return rows;
}

export function truncate(s, n) {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, Math.max(0, n - 1)).trimEnd()}…` : str;
}

/** Split a title into at most `lines` lines of about `width` characters (for SVG text). */
export function wrapLines(s, width = 26, lines = 2) {
  const words = String(s ?? '').split(/\s+/).filter(Boolean);
  const out = []; let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > width) {
      out.push(cur); cur = w;
      if (out.length === lines) break;
    } else cur = (cur + ' ' + w).trim();
  }
  if (out.length < lines && cur) out.push(cur);
  const joined = out.join(' ');
  const full = words.join(' ');
  if (full.length > joined.length) out[out.length - 1] = truncate(`${out[out.length - 1]} …`, width);
  return out.map((l) => truncate(l, width));
}

export function nodeHref(node) { return node && node.in_corpus !== false && node.id != null ? `#/judgments/${encodeURIComponent(node.id)}` : null; }
export function graphHref(id) { return `#/graph/${encodeURIComponent(id)}`; }

/** True when there is nothing meaningful to draw. */
export function isEmptyGraph(data) {
  return !data || !Array.isArray(data.edges) || data.edges.length === 0 || data.is_linked === false;
}
