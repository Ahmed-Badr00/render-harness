"""Build a self-contained HTML report + CSV from issues.json (findings grouped by root cause).

Usage: python report.py issues.json --out WORK/report [--title "..."]
Writes <out>/report.html and <out>/issues.csv (one row per affected screen). Stdlib only.
Evidence entries are local paths (made relative to <out>) or URLs; images become thumbnails.
Schema: see assets/issues.example.json. Refuses to write em or en dashes (house style); fix the input instead.
Optional top-level keys: "effect_label" (column header, default "User effect"; "Customer effect" for a shopper app),
"devices" (profile ids used; profiles marked approx in devices.json are then listed under "How this was tested").
"""
import argparse
import csv
import html
import io
import json
import os

SEV = {'High': 0, 'Medium': 1, 'Low': 2}
HERE = os.path.dirname(os.path.abspath(__file__))


def rel(p, out):
    return p if p.startswith(('http://', 'https://')) else os.path.relpath(os.path.abspath(p), os.path.abspath(out))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('issues')
    ap.add_argument('--out', required=True)
    ap.add_argument('--title')
    a = ap.parse_args()
    d = json.load(open(a.issues))
    os.makedirs(a.out, exist_ok=True)
    issues = sorted(d.get('issues', []), key=lambda i: (SEV.get(i.get('severity'), 9), -len(i.get('instances', []))))
    for i in issues:
        i['instances'] = sorted(i.get('instances', []), key=lambda x: (SEV.get(x.get('severity', i.get('severity')), 9), x.get('flow', '')))
        for x in i['instances']:
            x['evidence'] = [rel(e, a.out) for e in x.get('evidence', [])]
    for x in d.get('not_specific', []):
        x['evidence'] = [rel(e, a.out) for e in x.get('evidence', [])]
    method = list(d.get('method', []))
    try:
        known = json.load(open(os.path.join(HERE, 'devices.json')))['devices']
        approx = [f"{known[x].get('label', x)} ({'browser height' if known[x]['approx'] == 'web.h' else 'whole profile'})" for x in d.get('devices', []) if x in known and known[x].get('approx')]
        if approx:
            method.append('Approximate profiles (sizes not from a published spec, confirm on a device): ' + ', '.join(approx) + '.')
    except (OSError, KeyError, ValueError):
        pass
    data = dict(issues=issues, not_specific=d.get('not_specific', []), not_tested=d.get('not_tested', []),
                coverage=d.get('coverage', []), method=method, effect=d.get('effect_label', 'User effect'))
    title = a.title or d.get('title', 'UI audit')
    n_inst = sum(len(i['instances']) for i in issues)
    counts = {s: sum(1 for i in issues + d.get('not_specific', []) if i.get('severity') == s) for s in SEV}
    page = TEMPLATE.replace('__TITLE__', html.escape(title)).replace('__LEDE__', html.escape(d.get('subtitle', ''))) \
        .replace('__STATS__', ''.join(f'<div class="stat"><b class="s-{k}">{v}</b><span>{k}</span></div>' for k, v in counts.items())
                 + f'<div class="stat"><b>{len(issues)}</b><span>device issues</span></div><div class="stat"><b>{len(d.get("not_specific", []))}</b><span>not device specific</span></div><div class="stat"><b>{n_inst}</b><span>affected screens</span></div>') \
        .replace('__DATA__', json.dumps(data).replace('</', '<\\/'))
    for bad in ('\u2014', '\u2013'):
        if bad in page:
            raise SystemExit('em or en dash in the input; replace it with a colon, comma or period')
    open(os.path.join(a.out, 'report.html'), 'w').write(page)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['Issue', 'Issue title', 'Issue severity', 'Flow', 'Page', 'Element', 'Devices', 'Lang', 'Severity', 'Effect', 'Why', 'Fix', 'Code', 'Evidence', 'Ref'])
    for i in issues:
        for n, x in enumerate(i['instances']):
            w.writerow([i.get('id'), i.get('title'), i.get('severity'), x.get('flow', ''), x.get('page', ''), x.get('element', ''), x.get('devices', ''), x.get('lang', ''),
                        x.get('severity', i.get('severity')), x.get('effect', ''), i.get('why', '') if n == 0 else '', i.get('fix', '') if n == 0 else '', i.get('code', '') if n == 0 else '',
                        ' '.join(x['evidence']), x.get('ref', '')])
    for x in d.get('not_specific', []):
        w.writerow([x.get('id'), x.get('title'), x.get('severity'), x.get('flow', ''), '', '', 'All', '', x.get('severity'), x.get('effect', ''), '', x.get('fix', ''), '', ' '.join(x['evidence']), x.get('ref', '')])
    open(os.path.join(a.out, 'issues.csv'), 'w').write(buf.getvalue())
    print(os.path.join(a.out, 'report.html'), f'{len(issues)} issues, {n_inst} screens')


TEMPLATE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
:root{--bg:#f4f5f7;--surface:#fff;--ink:#14161a;--muted:#5b6170;--line:#e3e5ea;--soft:#f0f1f4;--link:#2450d6;--hi:#b42318;--hibg:#fde8e7;--me:#a15c07;--mebg:#fdf0dc;--lo:#475467;--lobg:#eef0f3}
@media (prefers-color-scheme:dark){:root{--bg:#111317;--surface:#1a1d22;--ink:#eceef2;--muted:#a3a9b6;--line:#2c3038;--soft:#22262d;--link:#8fb0ff;--hi:#ff8a80;--hibg:#3a1c1b;--me:#f5b05a;--mebg:#38291a;--lo:#b8c0cc;--lobg:#262b33}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,'Segoe UI',Roboto,Helvetica,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:32px 16px 64px;display:grid;gap:18px}h1{font-size:30px;margin:0}h2{font-size:18px;margin:0}
.lede{color:var(--muted);max-width:760px;margin:6px 0 0}.stats{display:flex;flex-wrap:wrap;gap:10px}.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 16px;min-width:110px;display:grid}
.stat b{font-size:22px}.stat span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.s-High{color:var(--hi)}.s-Medium{color:var(--me)}.s-Low{color:var(--lo)}
.box{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;min-width:0}.index ol{list-style:none;margin:0;padding:0}
.index li{display:grid;grid-template-columns:80px minmax(0,1fr) auto;gap:2px 12px;padding:10px 0;border-top:1px solid var(--line)}.index li:first-child{border-top:0}
.index a{color:var(--ink);font-weight:700;text-decoration:none}.index a:hover{text-decoration:underline}.sub{grid-column:2/-1;font-size:13px;color:var(--muted)}
.sev{font:700 11px/1 inherit;text-transform:uppercase;letter-spacing:.06em;border-radius:6px;padding:4px 8px;align-self:start;justify-self:start}
.sev.High{color:var(--hi);background:var(--hibg)}.sev.Medium{color:var(--me);background:var(--mebg)}.sev.Low{color:var(--lo);background:var(--lobg)}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.bar button{font:600 13px inherit;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:6px 12px;cursor:pointer}
.bar button[aria-pressed=true]{background:var(--ink);color:var(--bg)}.bar label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-left:8px}
.issue{background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;min-width:0}.issue .head{padding:14px 16px;display:grid;gap:4px;border-bottom:1px solid var(--line)}
.cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.cols>div{padding:12px 16px;min-width:0;overflow-wrap:anywhere}.cols>div+div{border-left:1px solid var(--line)}
.k{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.code{font:12px/1.5 ui-monospace,Menlo,monospace;color:var(--muted);overflow-wrap:anywhere;padding:0 16px 12px}
.tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;padding:8px 10px;border-top:1px solid var(--line);overflow-wrap:anywhere}
th{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;background:var(--soft)}.nw{white-space:nowrap;overflow-wrap:normal}.ev{display:flex;flex-wrap:wrap;gap:6px}.ev img{width:120px;height:80px;object-fit:cover;object-position:left top;border:1px solid var(--line);border-radius:6px}
.more{width:100%;border:0;border-top:1px solid var(--line);background:var(--soft);color:var(--link);font:600 13px inherit;padding:9px;cursor:pointer}a{color:var(--link)}
@media (max-width:760px){.cols{grid-template-columns:minmax(0,1fr)}.cols>div+div{border-left:0;border-top:1px solid var(--line)}}
</style></head><body><div class="wrap">
<header><h1>__TITLE__</h1><p class="lede">__LEDE__</p></header>
<div class="stats">__STATS__</div>
<section class="box index"><h2>All issues, highest priority first</h2><ol id="index"></ol></section>
<nav class="bar"><button id="vp" aria-pressed="true">By priority</button><button id="vf" aria-pressed="false">By flow</button><label>Severity</label><span id="fs"></span><label>Language</label><span id="fl"></span></nav>
<main id="main" style="display:grid;gap:14px"></main>
<section class="box" id="nsb"><h2>Not specific to these devices</h2><ul id="ns"></ul></section>
<section class="box" id="ntb"><h2>Not tested</h2><ul id="nt"></ul></section>
<section class="box" id="cvb"><details><summary><b>Coverage</b></summary><div class="tbl"><table><thead><tr><th>Area</th><th>Element</th><th>Tested by</th><th>Result</th></tr></thead><tbody id="cv"></tbody></table></div></details></section>
<section class="box" id="mtb"><h2>How this was tested</h2><ul id="mt"></ul></section>
</div><script>
const D=__DATA__;const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const S={view:'pri',sev:new Set(['High','Medium','Low']),lang:new Set([...new Set(D.issues.flatMap(i=>i.instances.map(x=>x.lang||'')))]),open:new Set()};
const ev=l=>'<div class="ev">'+(l||[]).map(e=>/\.(png|jpe?g|webp|gif)$/i.test(e)?`<a href="${esc(e)}" target="_blank"><img loading="lazy" src="${esc(e)}" alt=""></a>`:`<a href="${esc(e)}" target="_blank">${/^https?:/.test(e)?'link':esc(e.split('/').pop())}</a>`).join('')+'</div>';
const keep=x=>S.sev.has(x.severity)&&S.lang.has(x.lang||'');
const row=(x,i)=>`<tr><td>${esc(x.flow)}</td><td><b>${esc(x.page)}</b><br>${esc(x.element)}</td><td>${esc(Array.isArray(x.devices)?x.devices.join(', '):x.devices)}</td><td class="nw">${esc(x.lang)}</td><td class="nw">${esc(x.severity||i.severity)}</td><td>${esc(x.effect)}${x.ref?`<br><small>ref ${esc(x.ref)}</small>`:''}</td><td>${ev(x.evidence)}</td></tr>`;
const TH=`<thead><tr><th>Flow</th><th>Page / element</th><th>Devices</th><th class="nw">Lang</th><th class="nw">Sev</th><th>${esc(D.effect)}</th><th>Evidence</th></tr></thead>`;
function render(){
 const m=document.getElementById('main');
 if(S.view==='pri'){m.innerHTML=D.issues.map(i=>{const rows=i.instances.map(x=>({...x,severity:x.severity||i.severity})).filter(keep);if(!rows.length)return'';const o=S.open.has(i.id);
  return `<article class="issue" id="${esc(i.id)}"><div class="head"><span class="sev ${esc(i.severity)}">${esc(i.severity)}</span><h2>${esc(i.title)}</h2><small>${esc(i.id)} · ${i.instances.length} affected screens</small></div>
  <div class="cols"><div><div class="k">Why it happens</div>${esc(i.why)}</div><div><div class="k">Fix</div>${esc(i.fix)}</div></div>${i.code?`<div class="code">${esc(i.code)}</div>`:''}
  <div class="tbl"><table>${TH}<tbody>${rows.map((x,n)=>n>=6&&!o?'':row(x,i)).join('')}</tbody></table></div>${rows.length>6?`<button class="more" data-o="${esc(i.id)}">${o?'Show fewer':'Show all '+rows.length}</button>`:''}</article>`}).join('')}
 else{const by={};D.issues.forEach(i=>i.instances.forEach(x=>{const y={...x,severity:x.severity||i.severity};if(keep(y))(by[x.flow||'Other']??=[]).push([y,i])}));
  m.innerHTML=Object.keys(by).sort().map(f=>`<section class="issue"><div class="head"><h2>${esc(f)}</h2></div><div class="tbl"><table><thead><tr><th>Issue</th><th>Page / element</th><th>Devices</th><th class="nw">Sev</th><th>${esc(D.effect)}</th><th>Evidence</th></tr></thead><tbody>${by[f].map(([x,i])=>`<tr><td><a href="#${esc(i.id)}">${esc(i.id)}</a> ${esc(i.title)}</td><td><b>${esc(x.page)}</b><br>${esc(x.element)}</td><td>${esc(x.devices)}</td><td class="nw">${esc(x.severity)}</td><td>${esc(x.effect)}</td><td>${ev(x.evidence)}</td></tr>`).join('')}</tbody></table></div></section>`).join('')}
 document.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{const k=b.dataset.o;S.open.has(k)?S.open.delete(k):S.open.add(k);render()});
 document.getElementById('vp').setAttribute('aria-pressed',S.view==='pri');document.getElementById('vf').setAttribute('aria-pressed',S.view==='flow');}
const chips=(id,set,vals)=>{document.getElementById(id).innerHTML=vals.map(v=>`<button aria-pressed="true" data-v="${esc(v)}">${esc(v||'n/a')}</button>`).join('');document.querySelectorAll(`#${id} button`).forEach(b=>b.onclick=()=>{const v=b.dataset.v;set.has(v)?set.delete(v):set.add(v);b.setAttribute('aria-pressed',set.has(v));render()})};
chips('fs',S.sev,['High','Medium','Low']);chips('fl',S.lang,[...S.lang]);
document.getElementById('vp').onclick=()=>{S.view='pri';render()};document.getElementById('vf').onclick=()=>{S.view='flow';render()};
document.getElementById('index').innerHTML=D.issues.map(i=>`<li><span class="sev ${esc(i.severity)}">${esc(i.severity)}</span><a href="#${esc(i.id)}">${esc(i.title)}</a><span>${i.instances.length}</span><span class="sub">${esc([...new Set(i.instances.map(x=>x.flow))].join(', '))}</span></li>`).join('');
const fill=(id,box,items,fn)=>{if(!items.length){document.getElementById(box).hidden=true;return}document.getElementById(id).innerHTML=items.map(fn).join('')};
fill('ns','nsb',D.not_specific,x=>`<li><b>${esc(x.title)}</b> (${esc(x.flow)}): ${esc(x.effect)} Fix: ${esc(x.fix)} ${ev(x.evidence)}</li>`);
fill('nt','ntb',D.not_tested,x=>`<li>${esc(x)}</li>`);fill('mt','mtb',D.method,x=>`<li>${esc(x)}</li>`);
fill('cv','cvb',D.coverage,x=>`<tr><td>${esc(x.area)}</td><td>${esc(x.element)}</td><td>${esc(x.how)}</td><td>${esc(x.result)}</td></tr>`);
render();
</script></body></html>"""

if __name__ == '__main__':
    main()
