// svg.ts – Pipeline graph to SVG (themeable, responsive, with transparent background)
// No external dependencies

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface ThemeColors {
  bg?: string;
  text?: string;
  nodeBg?: string;
  nodeBorder?: string;
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
  background?: string; // e.g., '#ffffff', 'transparent'
}

// ----------------------------------------------------------------------------
// THEMES
// ----------------------------------------------------------------------------

const lightTheme: Required<ThemeColors> = {
  bg: '#ffffff',
  text: '#1f2937',
  nodeBg: '#f9fafb',
  nodeBorder: '#d1d5db',
  startBg: '#e3f2fd',
  startBorder: '#1976d2',
  startText: '#0d47a1',
  keepBg: '#e8f5e9',
  keepBorder: '#2e7d32',
  keepText: '#1b5e20',
  waitBg: '#fce4ec',
  waitBorder: '#c62828',
  waitText: '#b71c1c',
  templateBg: '#fff3e0',
  templateBorder: '#e65100',
  templateText: '#bf360c',
  sourceBg: '#e8eaf6',
  sourceBorder: '#283593',
  sourceText: '#1a237e',
  edgeColor: '#6b7280',
  edgeLabelBg: '#ffffff',
  edgeLabelText: '#374151',
};

const darkTheme: Required<ThemeColors> = {
  bg: '#1a1a2e',
  text: '#e5e7eb',
  nodeBg: '#2d2d44',
  nodeBorder: '#4a4a6a',
  startBg: '#1a2a4a',
  startBorder: '#4a8aef',
  startText: '#90caf9',
  keepBg: '#1a3a2a',
  keepBorder: '#4a8a5a',
  keepText: '#a5d6a7',
  waitBg: '#3a1a1a',
  waitBorder: '#c62828',
  waitText: '#ef9a9a',
  templateBg: '#3a2a1a',
  templateBorder: '#e65100',
  templateText: '#ffcc80',
  sourceBg: '#1a1a3a',
  sourceBorder: '#5a6aef',
  sourceText: '#9fa8da',
  edgeColor: '#6b7280',
  edgeLabelBg: '#2d2d44',
  edgeLabelText: '#e5e7eb',
};

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------

function extractBucket(condition: string): string | null {
  const match = condition?.match(/NEW\.bucket_id\s*=\s*'([^']+)'/);
  if (match) return match[1];
  const inMatch = condition?.match(/NEW\.bucket_id\s+IN\s*\(([^)]+)\)/);
  if (inMatch) {
    const buckets = inMatch[1]
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''));
    return buckets[0];
  }
  return null;
}

function resolveTheme(options: SVGOptions): Required<ThemeColors> {
  const { theme, background } = options;
  let baseTheme: Required<ThemeColors>;
  if (theme === 'dark') {
    baseTheme = { ...darkTheme };
  } else if (typeof theme === 'object' && theme !== null) {
    baseTheme = { ...lightTheme, ...theme };
  } else {
    baseTheme = { ...lightTheme };
  }
  if (background !== undefined) {
    baseTheme.bg = background;
  }
  return baseTheme;
}

// Helper to get the destination bucket for a step
function getStepDestination(step: any, outputBucket: string): string {
  if (step.keep) return outputBucket;
  if (step.next_bucket) return step.next_bucket;
  return outputBucket; // fallback
}

// ----------------------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------------------

export function pipelineToSVG(config: any, options: SVGOptions = {}): string {
  const t = resolveTheme(options);

  // --- Extract data from config ---
  const steps = config.steps || [];
  const outputBucket = config.storage?.output_bucket;
  const pipelineId =
    config.pipelineId ||
    config.name?.toLowerCase().replace(/\s+/g, '-') ||
    'pipeline';
  const runIdTemplate = config.runId?.template || '{uuid}';

  // --- Build graph ---
  const outputToSteps: Record<string, string[]> = {};
  const triggerToSteps: Record<string, string[]> = {};
  const stepMap: Record<string, any> = {};

  steps.forEach((step: any) => {
    stepMap[step.id] = step;
    const triggerBucket = extractBucket(step.trigger?.condition || '');
    if (triggerBucket) {
      if (!triggerToSteps[triggerBucket]) triggerToSteps[triggerBucket] = [];
      triggerToSteps[triggerBucket].push(step.id);
    }
    let outBucket: string | null = null;
    if (step.keep) {
      outBucket = outputBucket;
    } else if (step.next_bucket) {
      outBucket = step.next_bucket;
    }
    if (outBucket) {
      if (!outputToSteps[outBucket]) outputToSteps[outBucket] = [];
      outputToSteps[outBucket].push(step.id);
    }
  });

  const startBuckets: string[] = [];
  for (const bucket in triggerToSteps) {
    if (!outputToSteps[bucket]) {
      startBuckets.push(bucket);
    }
  }

  const nodes: any[] = steps.map((s: any) => {
    const editor = s.editor || {};
    const hasTemplate = !!s.template;
    const hasSource = !!s.source && Object.keys(s.source).length > 0;
    const hasWaitFor = !!s.wait_for && s.wait_for.length > 0;
    const outputFormat = editor.output || 'mp4';
    const preset = editor.preset || 'medium';
    const resolution =
      editor.width && editor.height ? `${editor.width}x${editor.height}` : null;
    let outputPathPattern = s.output_path || '';
    outputPathPattern = outputPathPattern.replace(
      /\{\{pipelineId\}\}/g,
      pipelineId,
    );
    outputPathPattern = outputPathPattern.replace(
      /\{\{runId\}\}/g,
      `{${runIdTemplate}}`,
    );
    outputPathPattern = outputPathPattern.replace(
      /\{\{userId\}\}/g,
      '{userId}',
    );
    outputPathPattern = outputPathPattern.replace(
      /\{\{baseFilename\}\}/g,
      '{filename}',
    );

    return {
      id: s.id,
      label: s.id,
      type: 'step',
      keep: s.keep || false,
      command: s.command,
      hasTemplate,
      hasSource,
      hasWaitFor,
      outputFormat,
      preset,
      resolution,
      editor,
      outputPath: outputPathPattern,
      nextBucket: s.next_bucket,
      // store the step object for destination lookup
      step: s,
    };
  });

  let startNodeId: string | null = null;
  if (startBuckets.length > 0) {
    const label =
      startBuckets.length === 1 ? `📤 ${startBuckets[0]}` : '📤 Upload';
    startNodeId = 'Start';
    nodes.unshift({ id: startNodeId, label, type: 'start', keep: false });
  }

  const edges: { from: string; to: string; label: string }[] = [];
  const depMap: Record<string, Set<string>> = {};
  steps.forEach((s: any) => {
    depMap[s.id] = new Set();
  });

  // Connect producers to consumers via bucket
  for (const bucket in outputToSteps) {
    if (triggerToSteps[bucket]) {
      const producers = outputToSteps[bucket];
      const consumers = triggerToSteps[bucket];
      producers.forEach((producer) => {
        consumers.forEach((consumer) => {
          if (producer !== consumer) {
            depMap[consumer].add(producer);
            // Edge label: the bucket that connects them (the output of producer, trigger of consumer)
            edges.push({ from: producer, to: consumer, label: bucket });
          }
        });
      });
    }
  }

  // Connect start node to steps triggered by start buckets
  if (startNodeId) {
    startBuckets.forEach((bucket) => {
      const consumers = triggerToSteps[bucket] || [];
      consumers.forEach((consumer) => {
        const step = stepMap[consumer];
        if (step) {
          // For edges from start, show the destination bucket of the step
          const destBucket = getStepDestination(step, outputBucket);
          edges.push({ from: startNodeId!, to: consumer, label: destBucket });
        } else {
          // fallback
          edges.push({ from: startNodeId!, to: consumer, label: bucket });
        }
      });
    });
  }

  // --- Level assignment (topological sort) ---
  const levels: Record<string, number> = {};
  const inDegree: Record<string, number> = {};
  const allNodeIds = nodes.map((n) => n.id);
  allNodeIds.forEach((id) => {
    inDegree[id] = 0;
  });
  edges.forEach((e) => {
    inDegree[e.to] = (inDegree[e.to] || 0) + 1;
  });

  const queue: string[] = [];
  allNodeIds.forEach((id) => {
    if (inDegree[id] === 0) {
      queue.push(id);
      levels[id] = 0;
    }
  });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels[current] || 0;
    const outgoing = edges.filter((e) => e.from === current);
    outgoing.forEach((e) => {
      const to = e.to;
      if (!levels[to] || levels[to] < currentLevel + 1) {
        levels[to] = currentLevel + 1;
      }
      inDegree[to]--;
      if (inDegree[to] === 0) {
        queue.push(to);
      }
    });
  }

  allNodeIds.forEach((id) => {
    if (levels[id] === undefined) levels[id] = 0;
  });

  // --- Positioning ---
  const nodeWidth = 240;
  const nodeHeight = 100;
  const hGap = 100;
  const vGap = 80;

  const groups: Record<number, string[]> = {};
  allNodeIds.forEach((id) => {
    const level = levels[id] || 0;
    if (!groups[level]) groups[level] = [];
    groups[level].push(id);
  });

  const maxLevel = Math.max(...Object.keys(groups).map(Number));
  const positions: Record<string, { x: number; y: number }> = {};

  for (let level = 0; level <= maxLevel; level++) {
    const ids = groups[level] || [];
    const totalHeight = ids.length * (nodeHeight + vGap) - vGap;
    const startY = ids.length > 1 ? (800 - totalHeight) / 2 : 350;
    ids.forEach((id, idx) => {
      const x = level * (nodeWidth + hGap) + 60;
      const y = startY + idx * (nodeHeight + vGap);
      positions[id] = { x, y };
    });
  }

  // --- Compute viewBox ---
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  nodes.forEach((node) => {
    const pos = positions[node.id];
    if (!pos) return;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + nodeWidth);
    maxY = Math.max(maxY, pos.y + nodeHeight);
  });

  edges.forEach((e) => {
    const from = positions[e.from];
    const to = positions[e.to];
    if (!from || !to) return;
    const x1 = from.x + nodeWidth;
    const y1 = from.y + nodeHeight / 2;
    const x2 = to.x;
    const y2 = to.y + nodeHeight / 2;
    const cx = (x1 + x2) / 2;
    const cy = Math.min(y1, y2) + Math.abs(y1 - y2) / 2;
    minX = Math.min(minX, x1, x2, cx);
    maxX = Math.max(maxX, x1, x2, cx);
    minY = Math.min(minY, y1, y2, cy);
    maxY = Math.max(maxY, y1, y2, cy);
  });

  const padding = 60;
  const viewBoxX = minX - padding;
  const viewBoxY = minY - padding;
  const viewBoxWidth = maxX - minX + padding * 2;
  const viewBoxHeight = maxY - minY + padding * 2;

  // --- Build SVG ---
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;background:${t.bg};font-family:system-ui,-apple-system,sans-serif;">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="${t.edgeColor}"/>
    </marker>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.15"/>
    </filter>
    <linearGradient id="startGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${t.startBg}"/>
      <stop offset="100%" stop-color="${t.startBg}"/>
    </linearGradient>
    <linearGradient id="keepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${t.keepBg}"/>
      <stop offset="100%" stop-color="${t.keepBg}"/>
    </linearGradient>
    <linearGradient id="templateGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${t.templateBg}"/>
      <stop offset="100%" stop-color="${t.templateBg}"/>
    </linearGradient>
    <linearGradient id="sourceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${t.sourceBg}"/>
      <stop offset="100%" stop-color="${t.sourceBg}"/>
    </linearGradient>
    <linearGradient id="waitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${t.waitBg}"/>
      <stop offset="100%" stop-color="${t.waitBg}"/>
    </linearGradient>
  </defs>`;

  // Edges
  edges.forEach((e) => {
    const from = positions[e.from];
    const to = positions[e.to];
    if (!from || !to) return;
    const x1 = from.x + nodeWidth;
    const y1 = from.y + nodeHeight / 2;
    const x2 = to.x;
    const y2 = to.y + nodeHeight / 2;

    const cx = (x1 + x2) / 2;
    const cy = Math.min(y1, y2) + Math.abs(y1 - y2) / 2;

    const isWaitEdge =
      e.label && (e.label.includes('wait') || e.label.includes('temp'));
    svg += `<path d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}" fill="none" stroke="${isWaitEdge ? t.waitBorder : t.edgeColor}" stroke-width="${isWaitEdge ? '3' : '2'}" stroke-dasharray="${isWaitEdge ? '8,4' : ''}" marker-end="url(#arrow)"/>`;

    // Edge label with destination bucket
    if (e.label) {
      const labelX = (x1 + x2) / 2;
      const labelY = (y1 + y2) / 2 - 10;
      svg += `<rect x="${labelX - 45}" y="${labelY - 14}" width="90" height="24" rx="4" fill="${t.edgeLabelBg}" stroke="${t.edgeColor}" stroke-width="1.5" opacity="0.95"/>`;
      svg += `<text x="${labelX}" y="${labelY + 2}" text-anchor="middle" dominant-baseline="central" fill="${t.edgeLabelText}" font-size="11" font-weight="600">→ ${e.label}</text>`;
    }
  });

  // Nodes
  nodes.forEach((node) => {
    const pos = positions[node.id];
    if (!pos) return;
    const { x, y } = pos;

    let fill = t.nodeBg;
    let stroke = t.nodeBorder;
    let textColor = t.text;
    let borderDash = '';
    let badges: string[] = [];

    if (node.type === 'start') {
      fill = 'url(#startGrad)';
      stroke = t.startBorder;
      textColor = t.startText;
    } else {
      if (node.hasWaitFor) {
        fill = 'url(#waitGrad)';
        stroke = t.waitBorder;
        textColor = t.waitText;
        borderDash = 'stroke-dasharray="8,4"';
        badges.push('⏳');
      } else if (node.hasTemplate) {
        fill = 'url(#templateGrad)';
        stroke = t.templateBorder;
        textColor = t.templateText;
        badges.push('📋');
      } else if (node.hasSource) {
        fill = 'url(#sourceGrad)';
        stroke = t.sourceBorder;
        textColor = t.sourceText;
        badges.push('🔗');
      }

      if (node.keep) {
        if (!node.hasWaitFor && !node.hasTemplate && !node.hasSource) {
          fill = 'url(#keepGrad)';
          stroke = t.keepBorder;
          textColor = t.keepText;
        }
        badges.push('KEEP');
      }
    }

    svg += `<rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2" ${borderDash} filter="url(#shadow)"/>`;

    // Node label
    svg += `<text x="${x + nodeWidth / 2}" y="${y + 18}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" font-size="12" font-weight="600">${node.label}</text>`;

    // Badges
    if (badges.length > 0) {
      let badgeX = x + nodeWidth - 10;
      const badgeY = y + 8;
      for (let i = badges.length - 1; i >= 0; i--) {
        const badge = badges[i];
        const isKeep = badge === 'KEEP';
        const bgColor = isKeep
          ? t.keepBorder
          : badge === '⏳'
            ? t.waitBorder
            : badge === '📋'
              ? t.templateBorder
              : t.sourceBorder;
        const width = isKeep ? 36 : 24;
        const xPos = badgeX - width;
        svg += `<rect x="${xPos}" y="${badgeY}" width="${width}" height="18" rx="4" fill="${bgColor}" opacity="0.9"/>`;
        svg += `<text x="${xPos + width / 2}" y="${badgeY + 9}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="8" font-weight="bold">${badge}</text>`;
        badgeX -= width + 4;
      }
    }

    // Output path
    if (node.type !== 'start' && node.outputPath) {
      const pathText =
        node.outputPath.length > 40
          ? node.outputPath.slice(0, 38) + '…'
          : node.outputPath;
      const pathColor = node.keep ? t.keepText : t.text;
      svg += `<text x="${x + nodeWidth / 2}" y="${y + 42}" text-anchor="middle" dominant-baseline="central" fill="${pathColor}" font-size="9" font-family="monospace">📁 ${pathText}</text>`;
    }

    // Next bucket
    if (node.type !== 'start' && node.nextBucket) {
      svg += `<text x="${x + nodeWidth / 2}" y="${y + 58}" text-anchor="middle" dominant-baseline="central" fill="${t.text}" font-size="8">→ ${node.nextBucket}</text>`;
    }

    // Editor info
    let editorInfo = '';
    if (node.resolution && node.resolution !== '0x0') {
      editorInfo += `${node.resolution} `;
    }
    if (node.outputFormat && node.outputFormat !== 'mp4') {
      editorInfo += `${node.outputFormat} `;
    }
    if (node.preset && node.preset !== 'medium') {
      editorInfo += `(${node.preset})`;
    }
    if (editorInfo.trim()) {
      svg += `<text x="${x + nodeWidth / 2}" y="${y + 74}" text-anchor="middle" dominant-baseline="central" fill="${t.text}" font-size="8">${editorInfo.trim()}</text>`;
    }

    // Wait_for indicator
    if (node.hasWaitFor && node.wait_for) {
      const waitText = node.wait_for.join(', ');
      const truncated =
        waitText.length > 20 ? waitText.slice(0, 18) + '…' : waitText;
      svg += `<text x="${x + 10}" y="${y + nodeHeight - 8}" fill="${t.waitText}" font-size="7" font-weight="bold">⌛ ${truncated}</text>`;
    }
  });

  svg += `</svg>`;
  return svg;
}
