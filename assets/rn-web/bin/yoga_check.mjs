// Native-layout ground truth: lays out an RN-style tree with Yoga (the engine React Native uses on iOS and Android)
// and measures text with the app's real font files (fontkit, greedy word wrap like RN's default).
// Usage: node yoga_check.mjs spec.json   (or pipe JSON on stdin)
// Spec node: { name, style: { RN style props }, text?: { content, font: 'Figtree-SemiBold', size, lineHeight?, numberOfLines? }, children?: [] }
import Yoga, { Direction, FlexDirection, Justify, Align, Wrap, Edge, Gutter, MeasureMode, Display } from 'yoga-layout';
import * as fontkit from 'fontkit';
import fs from 'fs';

const FONT_DIR = process.env.FONT_DIR || `${process.env.HOME}/fonts`; // set FONT_DIR to the app font folder (ios/Fonts, assets/fonts...)
const fonts = {};
const font = (name) => {
  if (!fonts[name]) { const f = fs.readdirSync(FONT_DIR).find((x) => x.replace(/\.(otf|ttf)$/i, '') === name); fonts[name] = fontkit.openSync(`${FONT_DIR}/${f}`); }
  return fonts[name];
};
const textWidth = (f, size, s) => f.layout(s).glyphs.reduce((a, g) => a + g.advanceWidth, 0) * size / f.unitsPerEm;
function measureText(t, maxWidth, mode) {
  const f = font(t.font); const size = t.size;
  const lh = t.lineHeight || ((f.ascent - f.descent + (f.lineGap || 0)) * size / f.unitsPerEm);
  const words = t.content.split(/(\s+)/).filter((w) => w.length);
  const full = textWidth(f, size, t.content);
  if (mode === MeasureMode.Undefined || full <= maxWidth) return { width: full, height: lh, lines: [t.content] };
  const lines = []; let cur = '';
  for (const w of words) {
    const cand = cur + w;
    if (cur && textWidth(f, size, cand.trimEnd()) > maxWidth) { lines.push(cur.trimEnd()); cur = w.trimStart(); } else cur = cand;
  }
  if (cur) lines.push(cur.trimEnd());
  const maxLines = t.numberOfLines || lines.length;
  const shown = lines.slice(0, maxLines);
  const width = Math.min(maxWidth, Math.max(...shown.map((l) => textWidth(f, size, l))));
  const overflowWords = shown.some((l) => textWidth(f, size, l) > maxWidth + 0.5);
  return { width: overflowWords ? Math.max(...shown.map((l) => textWidth(f, size, l))) : width, height: lh * shown.length, lines: shown, truncated: lines.length > maxLines };
}
const E = { left: Edge.Left, right: Edge.Right, top: Edge.Top, bottom: Edge.Bottom, horizontal: Edge.Horizontal, vertical: Edge.Vertical, all: Edge.All, start: Edge.Start, end: Edge.End };
function build(spec, results) {
  const n = Yoga.Node.create(); const s = spec.style || {};
  // RN defaults: flexDirection column, flexShrink 0, alignContent flex-start, position relative.
  n.setFlexDirection({ row: FlexDirection.Row, column: FlexDirection.Column, 'row-reverse': FlexDirection.RowReverse, 'column-reverse': FlexDirection.ColumnReverse }[s.flexDirection || 'column']);
  if (s.flex !== undefined) { if (s.flex > 0) { n.setFlexGrow(s.flex); n.setFlexShrink(1); n.setFlexBasis(0); } else if (s.flex === 0) { n.setFlexGrow(0); n.setFlexShrink(0); } else { n.setFlexGrow(0); n.setFlexShrink(1); } }
  if (s.flexGrow !== undefined) n.setFlexGrow(s.flexGrow);
  if (s.flexShrink !== undefined) n.setFlexShrink(s.flexShrink);
  if (s.flexBasis !== undefined) n.setFlexBasis(s.flexBasis);
  for (const k of ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight']) if (s[k] !== undefined) n[`set${k[0].toUpperCase()}${k.slice(1)}`](s[k]);
  if (s.flexWrap === 'wrap') n.setFlexWrap(Wrap.Wrap);
  const J = { 'flex-start': Justify.FlexStart, center: Justify.Center, 'flex-end': Justify.FlexEnd, 'space-between': Justify.SpaceBetween, 'space-around': Justify.SpaceAround, 'space-evenly': Justify.SpaceEvenly };
  const A = { 'flex-start': Align.FlexStart, center: Align.Center, 'flex-end': Align.FlexEnd, stretch: Align.Stretch, baseline: Align.Baseline };
  if (s.justifyContent) n.setJustifyContent(J[s.justifyContent]);
  if (s.alignItems) n.setAlignItems(A[s.alignItems]);
  if (s.alignSelf) n.setAlignSelf(A[s.alignSelf]);
  if (s.gap !== undefined) n.setGap(Gutter.All, s.gap);
  for (const [k, e] of Object.entries({ padding: 'all', paddingHorizontal: 'horizontal', paddingVertical: 'vertical', paddingLeft: 'left', paddingRight: 'right', paddingTop: 'top', paddingBottom: 'bottom', paddingStart: 'start', paddingEnd: 'end' })) if (s[k] !== undefined) n.setPadding(E[e], s[k]);
  for (const [k, e] of Object.entries({ margin: 'all', marginHorizontal: 'horizontal', marginVertical: 'vertical', marginLeft: 'left', marginRight: 'right', marginTop: 'top', marginBottom: 'bottom', marginStart: 'start', marginEnd: 'end' })) if (s[k] !== undefined) n.setMargin(E[e], s[k]);
  if (s.borderWidth) n.setBorder(Edge.All, s.borderWidth);
  const rec = { name: spec.name, node: n, spec };
  results.push(rec);
  if (spec.text) {
    n.setMeasureFunc((w, wm) => { const m = measureText(spec.text, w, wm); rec.text = m; return { width: m.width, height: m.height }; });
  } else (spec.children || []).forEach((c, i) => n.insertChild(build(c, results), i));
  return n;
}
const spec = JSON.parse(process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8'));
const results = []; const root = build(spec, results);
root.calculateLayout(spec.style?.width ?? 390, spec.style?.height ?? undefined, spec.rtl ? Direction.RTL : Direction.LTR);
const abs = (rec) => { let x = 0; let n = rec.node; while (n) { x += n.getComputedLeft(); n = n.getParent(); } return x; };
for (const r of results) {
  const l = r.node.getComputedLayout(); const par = r.node.getParent();
  const pw = par ? par.getComputedWidth() - par.getComputedPadding(Edge.Left) - par.getComputedPadding(Edge.Right) : null;
  const overflow = par && (l.left < par.getComputedPadding(Edge.Left) - 0.5 || l.left + l.width > par.getComputedWidth() - par.getComputedPadding(Edge.Right) + 0.5);
  console.log(`${r.name.padEnd(28)} x=${abs(r).toFixed(1).padStart(6)} w=${l.width.toFixed(1).padStart(6)} h=${l.height.toFixed(1).padStart(5)}${overflow ? '  OVERFLOWS PARENT' : ''}${r.text ? `  lines=${JSON.stringify(r.text.lines)}${r.text.truncated ? ' (truncated)' : ''}` : ''}`);
}
