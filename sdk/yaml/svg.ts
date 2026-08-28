// svg.ts – Pipeline graph to SVG (GitWidget design system, SMIL-animated, click-to-run)
// No external dependencies

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface ThemeColors {
  bg?: string;
  bgFoot?: string;
  border?: string;
  pillBg?: string;
  pillBorder?: string;
  text?: string;
  textDim?: string;
  textMute?: string;
  accent?: string;
  accentAlt?: string;
  ok?: string;
  err?: string;
  stepBg?: string;
  startBg?: string;
  startBorder?: string;
  startText?: string;
  keepBg?: string;
  keepBorder?: string;
  keepText?: string;
  waitBg?: string;
  waitBorder?: string;
  waitText?: string;
  templateBg?: string;
  templateBorder?: string;
  templateText?: string;
  sourceBg?: string;
  sourceBorder?: string;
  sourceText?: string;
  edgeColor?: string;
  edgeLabelBg?: string;
  edgeLabelText?: string;
}

export interface SVGOptions {
  theme?: 'light' | 'dark' | ThemeColors;
  background?: string;
  animated?: boolean;   // default: true
  autoStart?: boolean;  // default: false – if true, run animation without click
  renderUrl?: string;   // base URL used by the "open render" buttons
}

// ----------------------------------------------------------------------------
// THEMES
// ----------------------------------------------------------------------------

const darkTheme: Required<ThemeColors> = {
  bg: '#15121F',
  bgFoot: '#100D19',
  border: '#2C2741',
  pillBg: '#221E33',
  pillBorder: '#322C49',
  text: '#D6D2E6',
  textDim: '#A9A4C2',
  textMute: '#6F6A87',
  accent: '#FC6D26',
  accentAlt: '#744EC5',
  ok: '#8FCF9B',
  err: '#E07A7A',

  stepBg: '#17141F',
  startBg: '#221E33',
  startBorder: '#FC6D26',
  startText: '#FC6D26',
  keepBg: 'rgba(143,207,155,.06)',
  keepBorder: '#2E4A36',
  keepText: '#8FCF9B',
  waitBg: 'rgba(224,122,122,.05)',
  waitBorder: '#4A2C2C',
  waitText: '#E07A7A',
  templateBg: 'rgba(116,78,197,.08)',
  templateBorder: '#3D2E63',
  templateText: '#B8A0F0',
  sourceBg: 'rgba(116,78,197,.04)',
  sourceBorder: '#2C2741',
  sourceText: '#A9A4C2',

  edgeColor: '#322C49',
  edgeLabelBg: '#221E33',
  edgeLabelText: '#A9A4C2',
};

const lightTheme: Required<ThemeColors> = {
  bg: '#ffffff',
  bgFoot: '#fafafa',
  border: '#e2e2ee',
  pillBg: '#f4f3f9',
  pillBorder: '#ddd9ea',
  text: '#2a2735',
  textDim: '#5c5870',
  textMute: '#8f8ba5',
  accent: '#e85d12',
  accentAlt: '#6a48bb',
  ok: '#3f8a4e',
  err: '#c04a4a',

  stepBg: '#fafafc',
  startBg: '#fff4ec',
  startBorder: '#e85d12',
  startText: '#c24d0c',
  keepBg: '#f0f9f1',
  keepBorder: '#a8d5b0',
  keepText: '#3f8a4e',
  waitBg: '#fdf2f2',
  waitBorder: '#e8bcbc',
  waitText: '#c04a4a',
  templateBg: '#f5f1fd',
  templateBorder: '#cbb8ef',
  templateText: '#6a48bb',
  sourceBg: '#f7f6fc',
  sourceBorder: '#d8d4ea',
  sourceText: '#5c5870',

  edgeColor: '#c9c5da',
  edgeLabelBg: '#ffffff',
  edgeLabelText: '#5c5870',
};

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------

function extractBucket(condition: string): string | null {
  const match = condition?.match(/NEW\.bucket_id\s*=\s*'([^']+)'/);
  if (match) return match[1];
  const inMatch = condition?.match(/NEW\.bucket_id\s+IN\s*\(([^)]+)\)/);
  if (inMatch) {
    return inMatch[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))[0];
  }
  return null;
}

function resolveTheme(options: SVGOptions): Required<ThemeColors> {
  const { theme, background } = options;
  let base: Required<ThemeColors>;
  if (theme === 'dark') base = { ...darkTheme };
  else if (typeof theme === 'object' && theme !== null)
    base = { ...lightTheme, ...theme };
  else base = { ...lightTheme };
  if (background !== undefined) base.bg = background;
  return base;
}

function getStepDestination(step: any, outputBucket: string): string {
  if (step.keep) return outputBucket;
  if (step.next_bucket) return step.next_bucket;
  return outputBucket;
}

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function orthogonalPath(x1: number, y1: number, x2: number, y2: number): string {
  const r = 10;
  const mid = (x1 + x2) / 2;
  if (Math.abs(y2 - y1) < 1) return `M${x1},${y1} L${x2},${y2}`;
  const dir = y2 > y1 ? 1 : -1;
  return [
    `M${x1},${y1}`,
    `L${mid - r},${y1}`,
    `Q${mid},${y1} ${mid},${y1 + dir * r}`,
    `L${mid},${y2 - dir * r}`,
    `Q${mid},${y2} ${mid + r},${y2}`,
    `L${x2},${y2}`,
  ].join(' ');
}

// ----------------------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------------------

export function pipelineToSVG(config: any, options: SVGOptions = {}): string {
  const t = resolveTheme(options);
  const animate = options.animated !== false;
  const autoStart = options.autoStart === true;
  const renderBase = options.renderUrl || config.renderUrl || '';

  const steps = config.steps || [];
  const outputBucket = config.storage?.output_bucket;
  const pipelineId =
    config.pipelineId ||
    config.name?.toLowerCase().replace(/\s+/g, '-') ||
    'pipeline';
  const runIdTemplate = config.runId?.template || '{uuid}';

  // --- Build graph -----------------------------------------------------------
  const outputToSteps: Record<string, string[]> = {};
  const triggerToSteps: Record<string, string[]> = {};
  const stepMap: Record<string, any> = {};

  steps.forEach((step: any) => {
    stepMap[step.id] = step;
    const triggerBucket = extractBucket(step.trigger?.condition || '');
    if (triggerBucket) (triggerToSteps[triggerBucket] ??= []).push(step.id);
    const outBucket = step.keep ? outputBucket : step.next_bucket || null;
    if (outBucket) (outputToSteps[outBucket] ??= []).push(step.id);
  });

  const startBuckets = Object.keys(triggerToSteps).filter(
    (b) => !outputToSteps[b],
  );

  const nodes: any[] = steps.map((s: any) => {
    const editor = s.editor || {};
    let outputPathPattern = s.output_path || '';
    outputPathPattern = outputPathPattern
      .replace(/\{\{pipelineId\}\}/g, pipelineId)
      .replace(/\{\{runId\}\}/g, `{${runIdTemplate}}`)
      .replace(/\{\{userId\}\}/g, '{userId}')
      .replace(/\{\{baseFilename\}\}/g, '{filename}');

    return {
      id: s.id,
      label: s.id,
      type: 'step',
      keep: s.keep || false,
      hasTemplate: !!s.template,
      hasSource: !!s.source && Object.keys(s.source).length > 0,
      hasWaitFor: !!s.wait_for && s.wait_for.length > 0,
      wait_for: s.wait_for,
      outputFormat: editor.output || 'mp4',
      preset: editor.preset || 'medium',
      resolution:
        editor.width && editor.height
          ? `${editor.width}x${editor.height}`
          : null,
      outputPath: outputPathPattern,
      nextBucket: s.next_bucket,
      step: s,
    };
  });

  let startNodeId: string | null = null;
  if (startBuckets.length > 0) {
    startNodeId = 'Start';
    const label = startBuckets.length === 1 ? startBuckets[0] : 'upload';
    nodes.unshift({ id: startNodeId, label, type: 'start', keep: false });
  }

  const edges: { from: string; to: string; label: string; dashed?: boolean }[] =
    [];
  const depMap: Record<string, Set<string>> = {};
  steps.forEach((s: any) => (depMap[s.id] = new Set()));

  for (const bucket in outputToSteps) {
    if (triggerToSteps[bucket]) {
      outputToSteps[bucket].forEach((producer) => {
        triggerToSteps[bucket].forEach((consumer) => {
          if (producer !== consumer) {
            depMap[consumer].add(producer);
            edges.push({ from: producer, to: consumer, label: bucket });
          }
        });
      });
    }
  }

  if (startNodeId) {
    startBuckets.forEach((bucket) => {
      (triggerToSteps[bucket] || []).forEach((consumer) => {
        const step = stepMap[consumer];
        edges.push({
          from: startNodeId!,
          to: consumer,
          label: step ? getStepDestination(step, outputBucket) : bucket,
        });
      });
    });
  }

  // --- Level assignment (topological) ----------------------------------------
  const levels: Record<string, number> = {};
  const inDegree: Record<string, number> = {};
  const allNodeIds = nodes.map((n) => n.id);
  allNodeIds.forEach((id) => (inDegree[id] = 0));
  edges.forEach((e) => (inDegree[e.to] = (inDegree[e.to] || 0) + 1));

  const queue = allNodeIds.filter((id) => inDegree[id] === 0);
  queue.forEach((id) => (levels[id] = 0));
  while (queue.length > 0) {
    const current = queue.shift()!;
    edges
      .filter((e) => e.from === current)
      .forEach((e) => {
        levels[e.to] = Math.max(levels[e.to] ?? 0, levels[current] + 1);
        if (--inDegree[e.to] === 0) queue.push(e.to);
      });
  }
  allNodeIds.forEach((id) => (levels[id] ??= 0));

  // --- Positioning ------------------------------------------------------------
  const NODE_W = 248;
  const NODE_H = 108;
  const H_GAP = 120;
  const V_GAP = 70;
  const CANVAS_H = 800;

  const groups: Record<number, string[]> = {};
  allNodeIds.forEach((id) => (groups[levels[id]] ??= []).push(id));
  const maxLevel = Math.max(...Object.keys(groups).map(Number));
  const positions: Record<string, { x: number; y: number }> = {};

  for (let level = 0; level <= maxLevel; level++) {
    const ids = groups[level] || [];
    const totalHeight = ids.length * (NODE_H + V_GAP) - V_GAP;
    const startY = (CANVAS_H - totalHeight) / 2;
    ids.forEach((id, idx) => {
      positions[id] = {
        x: level * (NODE_W + H_GAP) + 60,
        y: startY + idx * (NODE_H + V_GAP),
      };
    });
  }

  // --- Viewbox ---------------------------------------------------------------
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const expand = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  nodes.forEach((n) => {
    const p = positions[n.id];
    if (!p) return;
    expand(p.x, p.y);
    expand(p.x + NODE_W, p.y + NODE_H);
  });
  edges.forEach((e) => {
    const f = positions[e.from],
      to = positions[e.to];
    if (!f || !to) return;
    const mid = (f.x + NODE_W + to.x) / 2;
    expand(f.x + NODE_W, f.y + NODE_H / 2);
    expand(to.x, to.y + NODE_H / 2);
    expand(mid, Math.min(f.y, to.y) + NODE_H / 2);
    expand(mid, Math.max(f.y, to.y) + NODE_H / 2);
  });

  const PAD = 50;
  const vbX = minX - PAD,
    vbY = minY - PAD;
  const vbW = maxX - minX + PAD * 2,
    vbH = maxY - minY + PAD * 2;

  // --- Timing (all chained off the click on the start node) -------------------
  const LEVEL_MS = 380;   // per-level stagger
  const EDGE_MS = 450;    // edge draw-in
  const NODE_MS = 350;    // card fade/rise
  const FILL_MS = 700;    // liquid fill left → right
  const PRESS_MS = 260;   // press flash before cascade
  const levelAt = (level: number) => PRESS_MS + Math.max(0, level) * LEVEL_MS;

  // begin= value: absolute (autoStart) or relative to the click event
  const at = (ms: number) =>
    autoStart ? `${ms / 1000}s` : `startHit.click + ${ms / 1000}s`;

  // --- SVG assembly -----------------------------------------------------------
  const FONT = `ui-monospace,SFMono-Regular,Menlo,monospace`;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;background:${t.bg};font-family:${FONT};">`,
  );

  // clipPaths for the liquid fills
  parts.push(`<defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="${t.textMute}"/>
    </marker>
    <linearGradient id="shimmer" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${t.accent}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${t.accent}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${t.accent}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="liquidG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>`);

  nodes.forEach((n) => {
    const p = positions[n.id];
    if (!p) return;
    parts.push(
      `<clipPath id="clip-${esc(n.id)}"><rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="10"/></clipPath>`,
    );
  });

  // Header band
  const dotPulse = animate
    ? `<animate attributeName="opacity" values="1;0.35;1" dur="2.4s" repeatCount="indefinite"/>`
    : '';
  const shimmer = animate
    ? `<rect x="${vbX}" y="${vbY + 42}" width="120" height="2.5" fill="url(#shimmer)" rx="1">
        <animate attributeName="x" from="${vbX}" to="${vbX + vbW - 120}" dur="6s" repeatCount="indefinite"/>
      </rect>`
    : '';
  parts.push(`
    <rect x="${vbX}" y="${vbY}" width="${vbW}" height="44" fill="${t.bgFoot}"/>
    <line x1="${vbX}" y1="${vbY + 44}" x2="${vbX + vbW}" y2="${vbY + 44}" stroke="${t.border}"/>
    ${shimmer}
    <circle cx="${vbX + 26}" cy="${vbY + 22}" r="6" fill="${t.accent}">${dotPulse}</circle>
    <text x="${vbX + 44}" y="${vbY + 23}" dominant-baseline="central" fill="${t.accent}" font-size="12" font-weight="700" letter-spacing="1">pipeline</text>
    <text x="${vbX + 118}" y="${vbY + 23}" dominant-baseline="central" fill="${t.textMute}" font-size="11">${esc(pipelineId)}</text>
    <rect x="${vbX + vbW - 130}" y="${vbY + 10}" width="110" height="24" rx="12" fill="${t.pillBg}" stroke="${t.pillBorder}"/>
    <text x="${vbX + vbW - 75}" y="${vbY + 22}" text-anchor="middle" dominant-baseline="central" fill="${t.textDim}" font-size="10">${steps.length} steps</text>`);

  // --- Edges -------------------------------------------------------------------
  const edgeSvg: string[] = [];
  edges.forEach((e) => {
    const from = positions[e.from];
    const to = positions[e.to];
    if (!from || !to) return;
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const mid = (x1 + x2) / 2;
    const d = orthogonalPath(x1, y1, x2, y2);
    const dash = e.dashed ? ' stroke-dasharray="5,4"' : '';
    const level = levels[e.to] ?? 0;
    const begin = at(levelAt(level - 1) + 100);

    if (animate) {
      edgeSvg.push(
        `<path d="${d}" pathLength="1" fill="none" stroke="${t.edgeColor}" stroke-width="1.5"${dash} stroke-dasharray="1" stroke-dashoffset="1" marker-end="url(#arrow)">
          <animate attributeName="stroke-dashoffset" from="1" to="0" dur="${EDGE_MS / 1000}s" begin="${begin}" fill="freeze" calcMode="spline" keySplines="0.4 0 0.2 1" keyTimes="0;1" values="1;0"/>
          <animate attributeName="opacity" values="0.7;1;0.7" dur="3.2s" begin="${at(levelAt(level) + EDGE_MS)}" repeatCount="indefinite"/>
        </path>`,
        `<path d="${d}" pathLength="100" fill="none" stroke="${t.accent}" stroke-width="1.5" stroke-linecap="round" opacity="0">
          <animate attributeName="opacity" values="0;0.35;0.35;0" keyTimes="0;0.12;0.88;1" dur="2.4s" begin="${at(levelAt(level - 1) + 500)}" repeatCount="indefinite"/>
          <animate attributeName="stroke-dasharray" values="3 97;3 97" dur="2.4s" begin="${at(levelAt(level - 1) + 500)}" repeatCount="indefinite"/>
          <animate attributeName="stroke-dashoffset" from="20" to="0" dur="2.4s" begin="${at(levelAt(level - 1) + 500)}" repeatCount="indefinite"/>
        </path>`,
      );
    } else {
      edgeSvg.push(
        `<path d="${d}" fill="none" stroke="${t.edgeColor}" stroke-width="1.5"${dash} marker-end="url(#arrow)"/>`,
      );
    }

    if (e.label) {
      const isHorizontal = Math.abs(y2 - y1) < 1;
      let lx, ly;
      if (isHorizontal) {
        lx = (x1 + x2) / 2;
        ly = y1;
      } else {
        lx = mid;
        ly = (y1 + y2) / 2;
      }

      let labelText = e.label;
      let w = Math.max(34, labelText.length * 7 + 18);
      const availableGap = isHorizontal ? x2 - x1 : Infinity;

      if (isHorizontal && availableGap - 10 < w) {
        const maxLabelWidth = Math.max(34, availableGap - 10);
        const maxChars = Math.floor((maxLabelWidth - 18) / 7);
        if (maxChars > 0 && labelText.length > maxChars) {
          labelText = labelText.slice(0, Math.max(1, maxChars - 1)) + '…';
        }
        w = Math.max(34, labelText.length * 7 + 18);
      }

      const labelG =
        `<rect x="${lx - w / 2}" y="${ly - 11}" width="${w}" height="22" rx="11" fill="${t.edgeLabelBg}" stroke="${t.pillBorder}" stroke-width="1"/>` +
        `<text x="${lx}" y="${ly + 1}" text-anchor="middle" dominant-baseline="central" fill="${t.edgeLabelText}" font-size="10">${esc(labelText)}</text>`;
      if (animate) {
        const fadeBegin = at(levelAt(level) + 100);
        edgeSvg.push(
          `<g opacity="0">
            <animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="${fadeBegin}" fill="freeze"/>
          </g>`,
        );
      } else {
        edgeSvg.push(`<g>${labelG}</g>`);
      }
    }
  });
  parts.push(...edgeSvg);

  // --- Nodes -------------------------------------------------------------------
  const pill = (
    x: number,
    y: number,
    w: number,
    text: string,
    fg: string,
    border: string,
  ) =>
    `<rect x="${x}" y="${y}" width="${w}" height="18" rx="9" fill="${t.pillBg}" stroke="${border}" stroke-width="1"/>` +
    `<text x="${x + w / 2}" y="${y + 9.5}" text-anchor="middle" dominant-baseline="central" fill="${fg}" font-size="8" letter-spacing="0.5">${esc(text)}</text>`;

  nodes.forEach((node, nodeIdx) => {
    const pos = positions[node.id];
    if (!pos) return;
    const { x, y } = pos;
    const level = levels[node.id] ?? 0;
    const phase = (nodeIdx * 0.7) % 2;
    const fireAt = levelAt(level); // when this node "fires"

    // Liquid color: red for wait/pending nodes, green for the rest
    const isRed = node.type !== 'start' && node.hasWaitFor;
    const liquidColor = isRed ? t.err : t.ok;

    let fill = t.stepBg;
    let stroke = t.border;
    let textColor = t.text;
    let dashed = false;

    if (node.type === 'start') {
      fill = t.startBg;
      stroke = t.startBorder;
      textColor = t.startText;
    } else {
      if (node.hasWaitFor) {
        fill = t.waitBg;
        stroke = t.waitBorder;
        textColor = t.waitText;
        dashed = true;
      } else if (node.hasTemplate) {
        fill = t.templateBg;
        stroke = t.templateBorder;
        textColor = t.templateText;
      } else if (node.hasSource) {
        fill = t.sourceBg;
        stroke = t.sourceBorder;
        textColor = t.sourceText;
      } else if (node.keep) {
        fill = t.keepBg;
        stroke = t.keepBorder;
        textColor = t.keepText;
      }
    }

    if (animate) {
      // Cards idle dim, fire up on cascade
      parts.push(`<g opacity="${node.type === 'start' ? 1 : 0.25}">
        ${node.type !== 'start' ? `<animate attributeName="opacity" from="0.25" to="1" dur="${NODE_MS / 1000}s" begin="${at(fireAt)}" fill="freeze" calcMode="spline" keySplines=".22 1 0.36 1" keyTimes="0;1" values="0.25;1"/>` : ''}
      `);
    }

    // Card
    parts.push(
      `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dashed ? ' stroke-dasharray="6,4"' : ''}/>`,
    );

    // Ambient stroke breathing (only after the node has fired)
    if (animate) {
      parts.push(
        `<rect x="${x + 1}" y="${y + 1}" width="${NODE_W - 2}" height="${NODE_H - 2}" rx="9" fill="none" stroke="${stroke}" stroke-width="2" opacity="0">
          <animate attributeName="opacity" values="0;0.45;0" dur="${(3 + phase).toFixed(1)}s" begin="${at(fireAt + NODE_MS)}" repeatCount="indefinite"/>
        </rect>`,
      );
    }

    // Title
    parts.push(
      `<text x="${x + 16}" y="${y + 24}" dominant-baseline="central" fill="${textColor}" font-size="12" font-weight="700">${esc(node.label)}</text>`,
    );

    // Status pills
    const statusPills: { text: string; fg: string; border: string }[] = [];
    if (node.keep)
      statusPills.push({ text: 'keep', fg: t.keepText, border: t.keepBorder });
    if (node.hasWaitFor)
      statusPills.push({ text: 'wait', fg: t.waitText, border: t.waitBorder });
    if (node.hasTemplate)
      statusPills.push({ text: 'template', fg: t.templateText, border: t.templateBorder });
    if (node.hasSource)
      statusPills.push({ text: 'source', fg: t.sourceText, border: t.sourceBorder });

    let pillX = x + NODE_W - 12;
    statusPills.forEach((p) => {
      const w = p.text.length * 6 + 16;
      pillX -= w;
      parts.push(pill(pillX, y + 12, w, p.text, p.fg, p.border));
      pillX -= 6;
    });

    if (node.type === 'start') {
      parts.push(
        `<text id="startHint" x="${x + 16}" y="${y + 62}" dominant-baseline="central" fill="${t.textMute}" font-size="10">▸ drop files here to begin</text>`,
      );

      // ---- CLICK TARGET + PRESS ANIMATION ----
      if (animate) {
        // Idle "press me" halo pulsing until clicked
        parts.push(
          `<rect x="${x - 4}" y="${y - 4}" width="${NODE_W + 8}" height="${NODE_H + 8}" rx="13" fill="none" stroke="${t.startBorder}" stroke-width="1.5" opacity="0">
            <animate attributeName="opacity" values="0.6;0;0" keyTimes="0;0.55;1" dur="2.6s" begin="0s" repeatCount="indefinite" end="startHit.click"/>
            <animate attributeName="stroke-width" values="2.5;0.75;0.75" keyTimes="0;0.55;1" dur="2.6s" begin="0s" repeatCount="indefinite" end="startHit.click"/>
          </rect>`,
        );

        // Press flash: white inner glow + expanding halo, fires once on click
        parts.push(
          `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="10" fill="${t.accent}" opacity="0">
            <animate attributeName="opacity" values="0.45;0" dur="0.5s" begin="${at(0)}" fill="freeze"/>
          </rect>
          <rect x="${x - 4}" y="${y - 4}" width="${NODE_W + 8}" height="${NODE_H + 8}" rx="13" fill="none" stroke="${t.startBorder}" stroke-width="2.5" opacity="0">
            <animate attributeName="opacity" values="0.9;0" dur="0.7s" begin="${at(0)}" fill="freeze"/>
            <animate attributeName="stroke-width" values="4;2;0.5;0.5" keyTimes="0;0.55;0.85;1" dur="0.7s" begin="${at(0)}" fill="freeze"/>
          </rect>`,
        );
      }

      // Transparent click target — everything chains off this event
      parts.push(
        `<rect id="startHit" x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="10" fill="transparent" style="cursor:pointer">
          <title>Run pipeline</title>
        </rect>`,
      );

      if (animate) parts.push(`</g>`);
      return;
    }

    // Output path
    if (node.outputPath) {
      const pathText =
        node.outputPath.length > 36
          ? node.outputPath.slice(0, 34) + '…'
          : node.outputPath;
      parts.push(
        `<text x="${x + 16}" y="${y + 50}" dominant-baseline="central" fill="${node.keep ? t.keepText : t.textDim}" font-size="9.5">${esc(pathText)}</text>`,
      );
    }

    // Editor meta
    const meta: string[] = [];
    if (node.resolution) meta.push(node.resolution);
    if (node.outputFormat && node.outputFormat !== 'mp4')
      meta.push(node.outputFormat);
    if (node.preset && node.preset !== 'medium') meta.push(node.preset);
    if (meta.length) {
      let mx = x + 16;
      meta.forEach((m) => {
        const w = m.length * 6 + 14;
        parts.push(pill(mx, y + 66, w, m, t.textMute, t.pillBorder));
        mx += w + 6;
      });
    }

    // Wait-for footnote
    if (node.hasWaitFor && node.wait_for?.length) {
      const waitText = node.wait_for.join(', ');
      const trunc = waitText.length > 24 ? waitText.slice(0, 22) + '…' : waitText;
      parts.push(
        `<text x="${x + 16}" y="${y + NODE_H - 10}" dominant-baseline="central" fill="${t.waitText}" font-size="8">⌛ ${esc(trunc)}</text>`,
      );
    }

    // ---- LIQUID FILL (jar filling left → right) ----
    if (animate) {
      const fillW = NODE_W - 2;
      const fillBegin = at(fireAt + NODE_MS);
      parts.push(
        `<g clip-path="url(#clip-${esc(node.id)})">
          <!-- liquid body -->
          <rect x="${x + 1}" y="${y + 1}" width="0" height="${NODE_H - 2}" fill="${liquidColor}" opacity="0.14">
            <animate attributeName="width" from="0" to="${fillW}" dur="${FILL_MS / 1000}s" begin="${fillBegin}" fill="freeze" calcMode="spline" keySplines="0.3 0 0.3 1" keyTimes="0;1" values="0;${fillW}"/>
            <animate attributeName="opacity" from="0.14" to="0.14" dur="0.01s" begin="${fillBegin}" fill="freeze"/>
          </rect>
          <!-- brighter bottom pool for depth -->
          <rect x="${x + 1}" y="${y + NODE_H - 14}" width="0" height="13" fill="${liquidColor}" opacity="0.18">
            <animate attributeName="width" from="0" to="${fillW}" dur="${FILL_MS / 1000}s" begin="${fillBegin}" fill="freeze" calcMode="spline" keySplines="0.3 0 0.3 1" keyTimes="0;1" values="0;${fillW}"/>
          </rect>
          <!-- gloss highlight riding on top of the liquid -->
          <rect x="${x + 1}" y="${y + 1}" width="0" height="26" fill="url(#liquidG)">
            <animate attributeName="width" from="0" to="${fillW}" dur="${FILL_MS / 1000}s" begin="${fillBegin}" fill="freeze" calcMode="spline" keySplines="0.3 0 0.3 1" keyTimes="0;1" values="0;${fillW}"/>
          </rect>
          <!-- meniscus: leading edge of the liquid -->
          <rect x="${x + 1}" y="${y + 1}" width="2.5" height="${NODE_H - 2}" fill="${liquidColor}" opacity="0">
            <animate attributeName="opacity" values="0;0.7;0.7;0" keyTimes="0;0.05;0.92;1" dur="${FILL_MS / 1000}s" begin="${fillBegin}" fill="freeze"/>
            <animate attributeName="x" from="${x + 1}" to="${x + 1 + fillW - 2.5}" dur="${FILL_MS / 1000}s" begin="${fillBegin}" fill="freeze" calcMode="spline" keySplines="0.3 0 0.3 1" keyTimes="0;1" values="${x + 1};${x + 1 + fillW - 2.5}"/>
          </rect>
          <!-- settle glow when full -->
          <rect x="${x + 1}" y="${y + 1}" width="${fillW}" height="${NODE_H - 2}" rx="9" fill="none" stroke="${liquidColor}" stroke-width="1.5" opacity="0">
            <animate attributeName="opacity" values="0;0.5;0" dur="0.9s" begin="${at(fireAt + NODE_MS + FILL_MS)}" fill="freeze"/>
          </rect>
        </g>`,
      );
    }

    // ---- "OPEN RENDER" BUTTON ----
    {
      const btnW = 108;
      const btnH = 20;
      const btnX = x + NODE_W - btnW - 12;
      const btnY = y + NODE_H - btnH - 10;
      const href =
        renderBase
          ? `${renderBase.replace(/\/$/, '')}/${esc(encodeURIComponent(node.id))}`
          : '#';
      const btnBody =
        `<rect x="${btnX}" y="${btnY}" width="${btnW}" height="${btnH}" rx="${btnH / 2}" fill="${isRed ? t.waitBg : t.keepBg}" stroke="${isRed ? t.waitBorder : t.keepBorder}" stroke-width="1" style="cursor:pointer">
          <set attributeName="fill" to="${t.pillBg}" begin="btn-${esc(node.id)}.mouseover" end="btn-${esc(node.id)}.mouseout"/>
        </rect>
        <text x="${btnX + btnW / 2}" y="${btnY + btnH / 2 + 0.5}" text-anchor="middle" dominant-baseline="central" fill="${isRed ? t.waitText : t.keepText}" font-size="9" letter-spacing="0.5" style="cursor:pointer">↗ open render</text>`;
      const btnG = `<a href="${href}" target="_blank" rel="noopener"><g id="btn-${esc(node.id)}">${btnBody}</g></a>`;

      if (animate) {
        const btnAt = at(fireAt + NODE_MS + FILL_MS + 150);
        parts.push(
          `<g opacity="0">${btnG}
            <animate attributeName="opacity" from="0" to="1" dur="0.35s" begin="${btnAt}" fill="freeze"/>
            <animateTransform attributeName="transform" type="scale" additive="sum" values="1;1.06;1" dur="0.5s" begin="${btnAt}" fill="freeze"/>
          </g>`,
        );
      } else {
        parts.push(btnG);
      }
    }

    // Success ping on keep nodes
    if (node.keep && animate) {
      const pingBegin = at(fireAt + NODE_MS + FILL_MS + 300);
      parts.push(
        `<circle cx="${x + NODE_W - 20}" cy="${y + NODE_H - 16}" r="3" fill="${t.keepText}" opacity="0">
          <animate attributeName="opacity" values="0.9;0.9;0" keyTimes="0;0.3;1" dur="2.8s" begin="${pingBegin}" repeatCount="indefinite"/>
          <animate attributeName="r" values="2;2;5" keyTimes="0;0.3;1" dur="2.8s" begin="${pingBegin}" repeatCount="indefinite"/>
        </circle>
        <circle cx="${x + NODE_W - 20}" cy="${y + NODE_H - 16}" r="2" fill="${t.keepText}">
          <animate attributeName="opacity" values="1;0.4;1" dur="${(2.2 + phase).toFixed(1)}s" begin="${pingBegin}" repeatCount="indefinite"/>
        </circle>`,
      );
    }

    if (animate) parts.push(`</g>`);
  });

  // Footer band
  const footPulse = animate
    ? `<animate attributeName="opacity" values="0.6;1;0.6" dur="3.5s" repeatCount="indefinite"/>`
    : '';
  const footDotBegin = animate ? at(levelAt(maxLevel) + FILL_MS) : '';
  parts.push(`
    <rect x="${vbX}" y="${vbY + vbH - 36}" width="${vbW}" height="36" fill="${t.bgFoot}"/>
    <line x1="${vbX}" y1="${vbY + vbH - 36}" x2="${vbX + vbW}" y2="${vbY + vbH - 36}" stroke="${t.border}"/>
    <circle cx="${vbX + 24}" cy="${vbY + vbH - 18}" r="3.5" fill="${t.ok}" opacity="${animate && !autoStart ? 0.25 : 1}">
      ${animate ? `<animate attributeName="opacity" values="0.6;1;0.6" dur="3.5s" begin="${footDotBegin}" fill="freeze" repeatCount="indefinite"/>` : ''}
    </circle>
    <text x="${vbX + 36}" y="${vbY + vbH - 18}" dominant-baseline="central" fill="${t.textMute}" font-size="10">output: ${esc(outputBucket || '—')}</text>
    ${animate && !autoStart ? `<text id="cta" x="${vbX + vbW - 24}" y="${vbY + vbH - 18}" text-anchor="end" dominant-baseline="central" fill="${t.accent}" font-size="10" font-weight="700" letter-spacing="0.5">▶ click the upload node to run
      <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.9;1" dur="0.1s" begin="startHit.click" fill="freeze"/>
    </text>` : ''}`);

  parts.push(`</svg>`);
  return parts.join('\n');
}