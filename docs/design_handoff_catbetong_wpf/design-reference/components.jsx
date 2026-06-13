/* components.jsx — shared UI for the Cắt bê tông (concrete cutting) tool.
   Built on the VinCADTools design system (gold/navy WPF skin).
   Exposes components to window for cross-file use. */

const { useState, useRef, useEffect } = React;

/* ============================================================
   Windows window chrome (Revit-hosted modal)
   ============================================================ */
function WindowsChrome({ title, children }) {
  return (
    <div className="win" data-screen-label={title}>
      <div className="win-title">
        <div className="app">
          <span className="logo"><span className="mi">content_cut</span></span>
          <span>{title}</span>
        </div>
        <div className="spacer" />
        <div className="winbtns">
          <div className="b"><svg viewBox="0 0 10 10"><line x1="0" y1="5" x2="10" y2="5" stroke="currentColor"/></svg></div>
          <div className="b"><svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg></div>
          <div className="b close"><svg viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor"/><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor"/></svg></div>
        </div>
      </div>
      {children}
    </div>
  );
}

/* App identity strip */
function AppStrip({ count, volume }) {
  return (
    <div className="app-strip">
      <span className="name">Cắt bê tông</span>
      <span className="sub">· ConcreteCut for Revit</span>
      <div style={{flex:1}} />
      <span className="stat">
        <b>{count}</b> ĐỐI TƯỢNG
        <span className="dotsep">·</span>
        <b>{volume}</b> m³
      </span>
    </div>
  );
}

/* ============================================================
   GroupBox
   ============================================================ */
function VGroup({ num, title, count, action, children, flex, flush, bodyStyle }) {
  return (
    <div className="v-grp" style={ flex ? {flex:1, minHeight:0} : null }>
      <div className="v-grp-header">
        {num !== undefined && <span className="num">{num}</span>}
        <span>{title}</span>
        {count !== undefined && <span className="count">{count}</span>}
        <div style={{flex:1}} />
        {action}
      </div>
      <div className={`v-grp-body ${flush ? 'flush':''}`} style={bodyStyle}>{children}</div>
    </div>
  );
}

/* ============================================================
   TopHeader TextBox (signature floating-label input)
   ============================================================ */
function VTopBox({ label, value, onChange, placeholder, mono, focused, trailing, unit, type }) {
  const [f, setF] = useState(false);
  return (
    <div className={`v-tb ${(focused||f)?'focused':''}`}>
      <span className="v-tb-label">{label}</span>
      <div className="v-tb-field">
        <input
          type={type || 'text'}
          className={mono ? 'mono' : ''}
          value={value}
          placeholder={placeholder}
          onChange={onChange ? (e)=>onChange(e.target.value) : undefined}
          readOnly={!onChange}
          onFocus={(e)=>{ setF(true); if(!onChange) e.target.select(); }}
          onBlur={()=>setF(false)}
        />
        {unit && <span className="v-unit">{unit}</span>}
        {trailing}
      </div>
    </div>
  );
}

function VCheck({ state }) {
  return (
    <span className={`v-cb ${state==='checked'?'checked':''} ${state==='indeterminate'?'indeterminate':''}`}>
      {state==='checked' && 'check'}
      {state==='indeterminate' && 'remove'}
    </span>
  );
}

/* ============================================================
   RadioButton — classic circular (gold dot), VinCAD skin
   ============================================================ */
function VRadio({ checked, onClick, label, hint, icon }) {
  return (
    <div className={`v-radio ${checked ? 'checked' : ''}`} onClick={onClick} role="radio" aria-checked={checked}>
      <span className="dot" />
      <span className="rcol">
        <span className="lbl">
          {icon && <span className="mi" style={{fontSize:16, opacity:0.7}}>{icon}</span>}
          {label}
        </span>
        {hint && <span className="rhint">{hint}</span>}
      </span>
    </div>
  );
}

/* ============================================================
   Cutting-plane segmented selector (XY / XZ / YZ)
   ============================================================ */
const PLANES = [
  { id: 'XY', glyph: 'view_in_ar', desc: 'Cắt ngang' },
  { id: 'XZ', glyph: 'view_in_ar', desc: 'Cắt dọc' },
  { id: 'YZ', glyph: 'view_in_ar', desc: 'Cắt đứng' },
];
function SegPlane({ value, onChange }) {
  return (
    <div className="v-seg">
      {PLANES.map(p => (
        <div key={p.id} className={`seg ${value===p.id?'active':''}`} onClick={()=>onChange(p.id)}>
          <span className="axis-tag">{p.id}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Number stepper
   ============================================================ */
function NumberStepper({ value, onChange, min=1, max=200 }) {
  const set = (v) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div className="v-stepper">
      <button className="step-btn minus" onClick={()=>set(value-1)}>−</button>
      <input
        className="step-val"
        value={value}
        onChange={(e)=>{ const n = parseInt(e.target.value.replace(/\D/g,''),10); set(isNaN(n)?min:n); }}
        style={{border:'1px solid var(--tb-border)', outline:'none'}}
      />
      <button className="step-btn plus" onClick={()=>set(value+1)}>+</button>
    </div>
  );
}

/* ============================================================
   Progress row (thinking text + green bar)
   ============================================================ */
function ProgressRow({ pct, label }) {
  return (
    <div style={{display:'flex', flexDirection:'column', gap:6, width:'100%'}}>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <span className="thinking">{label}</span>
        <div style={{flex:1}} />
        <span style={{fontFamily:"'JetBrains Mono',monospace", fontSize:11.5, fontWeight:700, color:'#2f3578'}}>{Math.round(pct)}%</span>
      </div>
      <div className="v-progress"><div className="fill" style={{width:`${pct}%`}} /></div>
    </div>
  );
}

/* ============================================================
   CUT PREVIEW — live isometric concrete block + slice planes
   ============================================================ */
function CutPreview({ plane, slices, dims, title, gap = 0.045, badge = true, legend = true, flush, edges }) {
  // model block dimensions (metres; W=x, D=y, H=z)
  const d = dims || { x: 3.2, y: 1.7, z: 2.1 };
  const W = d.x, D = d.y, H = d.z;

  // isometric projection
  const A = Math.PI / 6; // 30deg
  const cos = Math.cos(A), sin = Math.sin(A);
  const proj = (x, y, z) => ({ x: (x - y) * cos, y: (x + y) * sin - z });

  // fit transform from full block corners
  const corners = [];
  for (const x of [0, W]) for (const y of [0, D]) for (const z of [0, H]) corners.push(proj(x, y, z));
  const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const VBW = 460, VBH = 360, pad = 54;
  const scale = Math.min((VBW - 2*pad)/(maxX-minX), (VBH - 2*pad)/(maxY-minY));
  const ox = (VBW - (maxX-minX)*scale)/2 - minX*scale;
  const oy = (VBH - (maxY-minY)*scale)/2 - minY*scale;
  const P = (x,y,z) => { const p = proj(x,y,z); return [ox + p.x*scale, oy + p.y*scale]; };
  const pts = (arr) => arr.map(([x,y,z]) => P(x,y,z).join(',')).join(' ');

  // axis along which we slice
  const axis = plane === 'XY' ? 'z' : plane === 'XZ' ? 'y' : 'x';
  const span = axis === 'z' ? H : axis === 'y' ? D : W;
  const g = span * gap; // exploded gap

  // normalized cut edges (0..1); uniform unless explicit custom edges supplied
  const E = (edges && edges.length >= 2) ? edges : Array.from({length: slices+1}, (_, i) => i/slices);
  const nSlices = E.length - 1;

  // build slice sub-boxes
  const boxes = [];
  for (let i = 0; i < nSlices; i++) {
    const a = E[i] * span + (i === 0 ? 0 : g/2);
    const b = E[i+1] * span - (i === nSlices-1 ? 0 : g/2);
    let bx;
    if (axis === 'z') bx = { x0:0, x1:W, y0:0, y1:D, z0:a, z1:b };
    else if (axis === 'y') bx = { x0:0, x1:W, y0:a, y1:b, z0:0, z1:H };
    else bx = { x0:a, x1:b, y0:0, y1:D, z0:0, z1:H };
    const cx = (bx.x0+bx.x1)/2, cy = (bx.y0+bx.y1)/2, cz = (bx.z0+bx.z1)/2;
    bx.depth = (cx + cy) - cz*0.55; // painter key: smaller = farther
    bx.i = i;
    boxes.push(bx);
  }
  boxes.sort((p,q) => p.depth - q.depth);

  // colors (concrete, shaded per face) + alternating slice tint
  const faceCol = (kind, i) => {
    const odd = i % 2 === 1;
    if (kind === 'top')   return odd ? '#efe7d6' : '#f5efe2';
    if (kind === 'front') return odd ? '#d6ccb8' : '#ded4c1';
    return odd ? '#c3b9a2' : '#cbc1ab'; // right
  };
  const EDGE = '#8a8270';
  const CUT = '#E34234';

  // accumulate the freshly-cut faces to highlight (the plane between slices)
  const cutFaces = [];
  const drawn = boxes.map((bx) => {
    const top   = [[bx.x0,bx.y0,bx.z1],[bx.x1,bx.y0,bx.z1],[bx.x1,bx.y1,bx.z1],[bx.x0,bx.y1,bx.z1]];
    const front = [[bx.x0,bx.y0,bx.z0],[bx.x1,bx.y0,bx.z0],[bx.x1,bx.y0,bx.z1],[bx.x0,bx.y0,bx.z1]];
    const right = [[bx.x1,bx.y0,bx.z0],[bx.x1,bx.y1,bx.z0],[bx.x1,bx.y1,bx.z1],[bx.x1,bx.y0,bx.z1]];
    return { bx, top, front, right };
  });

  // slice-number badge anchor: midpoint of top-front edge of each slice
  const badges = boxes.map((bx) => {
    const mid = axis === 'z'
      ? P((bx.x0+bx.x1)/2, 0, (bx.z0+bx.z1)/2)
      : axis === 'y'
        ? P(W, (bx.y0+bx.y1)/2, H)
        : P((bx.x0+bx.x1)/2, 0, H);
    return { i: bx.i, x: mid[0], y: mid[1] };
  });

  const planeLabel = { XY:'Mặt phẳng XY', XZ:'Mặt phẳng XZ', YZ:'Mặt phẳng YZ' }[plane];
  const dirLabel = { z:'theo cao độ Z', y:'theo phương Y', x:'theo phương X' }[axis];

  // ground shadow
  const sh = [P(0,0,0),P(W,0,0),P(W,D,0),P(0,D,0)];

  return (
    <div className={`preview-stage ${flush?'flush':''}`}>
      <div className="preview-grid" />
      <svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
           style={{position:'relative', display:'block'}}>
        <defs>
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(40,30,10,0.10)" strokeWidth="1" />
          </pattern>
        </defs>

        {/* ground shadow */}
        <polygon points={pts(sh)} fill="rgba(30,35,91,0.10)"
                 transform={`translate(${0.10*scale}, ${0.06*scale})`} />

        {drawn.map(({ bx, top, front, right }) => (
          <g key={bx.i}>
            <polygon points={pts(right)} fill={faceCol('right', bx.i)} stroke={EDGE} strokeWidth="1" strokeLinejoin="round" />
            <polygon points={pts(right)} fill="url(#hatch)" stroke="none" />
            <polygon points={pts(front)} fill={faceCol('front', bx.i)} stroke={EDGE} strokeWidth="1" strokeLinejoin="round" />
            <polygon points={pts(front)} fill="url(#hatch)" stroke="none" />
            <polygon points={pts(top)} fill={faceCol('top', bx.i)} stroke={EDGE} strokeWidth="1.1" strokeLinejoin="round" />
            <polygon points={pts(top)} fill="url(#hatch)" stroke="none" />
          </g>
        ))}

        {/* cut-line emphasis between adjacent slices (dashed red saw line on top edge) */}
        {boxes.length > 1 && Array.from({length: nSlices-1}).map((_, k) => {
          const t = E[k+1] * span;
          let p1, p2;
          if (axis === 'z') { p1 = P(0,0,t); p2 = P(W,0,t); }     // front edge ring
          else if (axis === 'y') { p1 = P(0,t,H); p2 = P(W,t,H); } // top edge
          else { p1 = P(t,0,H); p2 = P(t,D,H); }                   // top edge
          return <line key={k} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]}
                       stroke={CUT} strokeWidth="1.6" strokeDasharray="5 3" opacity="0.85" />;
        })}

        {/* slice number badges (only if not too many) */}
        {nSlices <= 14 && badges.map(b => (
          <g key={b.i} transform={`translate(${b.x}, ${b.y})`}>
            <circle r="9" fill="#1E235B" />
            <text textAnchor="middle" dy="3.4" fontFamily="'JetBrains Mono', monospace"
                  fontSize="9.5" fontWeight="600" fill="white">{b.i+1}</text>
          </g>
        ))}
      </svg>

      {badge && (
        <div className="preview-badge" style={{flexDirection:'column', alignItems:'flex-start', gap:3}}>
          {title && (
            <div style={{display:'flex', alignItems:'center', gap:5}}>
              <span className="mi" style={{fontSize:13}}>deployed_code</span>
              <span style={{maxWidth:210, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{title}</span>
            </div>
          )}
          <div style={{fontWeight:600, color:'#555'}}>{planeLabel} · {slices} lát {dirLabel}</div>
        </div>
      )}
      {legend && (
        <div className="preview-legend">
          <div className="lg"><span className="sw" style={{background:'#E34234'}} /> Mạch cắt</div>
          <div className="lg"><span className="sw" style={{background:'#ded4c1'}} /> Khối bê tông</div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  WindowsChrome, AppStrip, VGroup, VTopBox, VCheck, VRadio,
  SegPlane, PLANES, NumberStepper, ProgressRow, CutPreview,
});
