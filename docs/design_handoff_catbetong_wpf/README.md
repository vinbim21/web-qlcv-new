# Handoff: "Cắt bê tông" (ConcreteCut) — WPF Dialog

## Overview
This is a Revit-hosted modal tool that lets a user slice concrete elements (sàn / dầm / tường / cột) into multiple lát cắt (slices). The user picks elements, chooses a cutting plane, sets how the slices are distributed, watches a live isometric preview, then runs the cut.

The target implementation is **WPF (XAML + C#)** styled with the existing **VinCADTools design system** resource dictionaries:
`VinColors.xaml`, `VinButton.xaml`, `VinTextBox.xaml`, `VinGroupBox.xaml`, `VinRadioButton.xaml`.

## About the Design Files
The files in `design-reference/` are a **design reference created in HTML/React** — a clickable prototype showing the intended look and behavior. **They are NOT production code to copy.** The task is to **recreate this design in WPF** using the existing VinCADTools `Style`/`ControlTemplate` resources and standard WPF controls. Where this doc gives hex values, fonts and metrics, they are the source of truth — but always prefer an existing VinCADTools style/brush if one already matches.

Open `design-reference/Cat Be Tong.html` in a browser to interact with it. The relevant design is the **first artboard: "Cắt bê tông — bố cục 2 cột"** (component `VariationD` in the HTML). The other artboards (A/B/C) are earlier alternatives — ignore them unless referenced.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interactions are final. Recreate the layout faithfully, but map every visual to a VinCADTools resource where one exists (buttons, textboxes, groupbox, radio, colors).

---

## Window / Dialog shell
- A standard WPF `Window` (Revit-hosted modal). Suggested initial client size ≈ **980 × 660 px**, resizable.
- Standard OS title bar shows the window icon + title **"Cắt bê tông — ConcreteCut"**.
- Below the title bar, two fixed strips and a footer wrap a 2-column content grid:

```
┌─ Window title bar (OS) ───────────────────────────────────┐
├─ App identity strip (white, 1px bottom border) ───────────┤
├─ Content Grid: [ 368px controls │ * preview ] ────────────┤
├─ Footer (white, 1px top border) ──────────────────────────┤
└───────────────────────────────────────────────────────────┘
```

Recommended root layout: `DockPanel` → AppStrip (Top), Footer (Bottom), then a `Grid` (Fill) with `ColumnDefinitions="368, *"`.

### App identity strip
- Padding `9,9,14,9`; background `#FFFFFF`; bottom border `1px #E5E5E5`.
- Left: name **"CẮT BÊ TÔNG"** — Oswald SemiBold 18px, `#1E235B`, uppercase, letter-spacing ~0.4px.
  Followed by sub **"· ConcreteCut for Revit"** — 11.5px bold `#666`.
- Right (right-aligned): live stat — Oswald SemiBold 12.5px `#2f3578`, e.g. **`2 ĐỐI TƯỢNG · 12,40 m³`** (the count and volume in bold `#1E235B`, a faint `·` separator).

---

## Screens / Views

There is one view with three control groups (left) and a preview (right).

### Left column — control stack
`StackPanel`, padding `12`, vertical gap `11` between groups, with the StatTiles row at the bottom. Right border `1px #E5E5E5`. (Make it scrollable as a safety net, but at 660px height it fits without scrolling.)

Every group is a **GroupBox** (use `VinGroupBox` style):
- Border `1px #D3D3D3`, corner radius `8`, background `#FFFFFF`, drop shadow `0 0 6px rgba(102,102,102,0.16)`.
- **Header bar**: background `#EBEBEB`, bottom border `1px #D3D3D3`, padding `6,6,10,6`, height ~30px. Contains:
  - A square **number badge** `17×17`, radius 3, background `#2f3578`, white Oswald 11px bold (the "1"/"2"/"3").
  - Title text — 12.5px bold `#2f3578`.
  - A right-aligned **count chip** (optional per group): white pill, border `1px #D3D3D3`, radius 10, padding `0,0,7,0` → `0 7px`, Oswald SemiBold 11px `#1E235B`. E.g. `2 ĐT`, `XZ`, `5 lát`.
- **Body**: padding `12`.

---

#### Group 1 — "Chọn đối tượng" (Select objects)
Header badge **1**, title **"Chọn đối tượng"**, count chip shows `{n} ĐT` when elements are selected.

Body: a single horizontal row (gap ~18px) of **two circular RadioButtons** in one group:

| Option | Label | Hint (below label) | Leading icon |
|---|---|---|---|
| `pick` (default) | **Pick chọn** | "Click từng cấu kiện" | touch_app / pointer |
| `sweep` | **Quét chọn** | "Khoanh vùng nhiều" | select_all / marquee |

**Circular radio styling (recreate as a WPF RadioButton `ControlTemplate`, or use `VinRadioButton` if it renders a classic circle):**
- Outer dot: `22×22` ellipse, `2px` border `#ABADB3`, white fill.
- Selected: border becomes `#BA6C28`; an inner `11×11` ellipse filled with the **gold gradient** (see tokens) scales in (spring ease); add a focus glow `0 0 0 3px rgba(226,172,36,0.16)`.
- Hover (unselected): border `#7EB4EA`.
- Label: 14px bold `#1E235B`. Optional 16px leading glyph at 70% opacity.
- Hint: 11px semibold `#8a8d99`.

> NOTE: the existing `VinRadioButton.xaml` in the system is the gold **pill** style (a `Fml` radio with a cyan indicator bar). The wireframe explicitly asked for the **classic circular** radio described above — build/extend a style for that, don't reuse the pill.

---

#### Group 2 — "Mặt phẳng cắt" (Cutting plane)
Header badge **2**, title **"Mặt phẳng cắt"**, count chip = current plane (`XY` / `XZ` / `YZ`).

Body: one row, `gap 8`, items stretch to equal height:
- A **segmented selector** of 3 mutually-exclusive `ToggleButton`s: **XY**, **XZ** (default), **YZ**.
  - Each: white, `1px #ABADB3` border, radius 6, min-width 58, padding `6,6,0,6` (`6px 0`), text 13px bold `#1E235B`, Oswald with letter-spacing 1px for the axis tag.
  - Hover: border `#7EB4EA`.
  - **Active**: gold gradient background, border `#BA6C28`, subtle shadow.
- A spacer pushes the last item right.
- A **blue "Pick" button** (the `Pick mặt phẳng` action): icon + "Pick", lets the user pick a reference plane in the model. Use the **blue action button** style (see tokens), height ~30, radius 6.

---

#### Group 3 — "Số lượng lát cắt" (Slice count / distribution)
Header badge **3**, title **"Số lượng lát cắt"**, count chip = `{slices} lát`.

Body: vertical stack, gap 12.
1. A full-width **segmented selector** of 3 mode `ToggleButton`s (same seg styling as Group 2, each `flex:1`, padding `8px 0`, icon + label):
   - **Chia đều** (`equal`, default) — divide into N equal slices. icon: line-spacing.
   - **Theo k/c** (`spacing`) — uniform spacing in mm. icon: straighten/ruler.
   - **K/c riêng** (`custom`) — per-slice thicknesses. icon: tune/sliders.
2. A **mode-dependent control area**:
   - **equal** → left: label "Số lát cắt" + a **NumberStepper** (− / value / +), min 1 max 120. Right (right-aligned): label "Bề dày / lát" + readout `{thickness} mm` (mono 18px `#2f3578`). `thickness = dimAlongAxis / count`.
   - **spacing** → left: label "Khoảng cách lát" + NumberStepper, min 20 max dimAlongAxis. Right: label "Số lát (≈)" + readout `{slices}`; if there's a remainder >1mm show `+ dư {remainder}mm` in `#CC8926`. `slices = floor(dim / spacing)`.
   - **custom** → a **TextBox** labeled "Bề dày từng lát (mm)" accepting a comma list e.g. `300, 500, 600, 400` (monospace). Below: an info line (11px `#777`, gold info glyph) "Nhập lần lượt bề dày mỗi lát… Phần còn dư thành lát cuối." + right-aligned `{slices} lát`.

**NumberStepper** (recreate as a small UserControl): height 34. Minus/Plus buttons `34px` wide, background `#d6dce4`, border `1px #ABADB3`, `#1E235B` glyphs (− / +) 18px; hover `#BCC4CF`. Center value box width ~66, white, mono (JetBrains Mono) 17px medium `#1E235B`, centered. Left button rounds left corners, right button rounds right corners.

> Multi-object note: the prototype supports selecting several elements, each with its own slice config; an "Áp dụng tất cả" affordance copies the active config to all. The current wireframe-driven layout keeps the per-object row hidden for a single object. If you support multi-select, re-introduce a compact active-object row + "Tất cả" button above the mode selector (it exists in the HTML, currently removed for the single-object case).

---

#### StatTiles (bottom of left column)
A 3-column grid, gap 8. Each tile: background `#F7F8FA`, border `1px #ECECEC`, radius 6, padding `8,8,10,8`.
- Big value: mono 16px medium `#2f3578`.
- Label: 10px uppercase bold `#888`, letter-spacing 0.6.
- Tiles: **`{slices}` LÁT · ĐANG CHỌN** · **`{objectCount}` ĐỐI TƯỢNG** · **`{totalSlices}` TỔNG LÁT CẮT** (total = sum of slices over all selected objects).

---

### Right column — "Xem trước" (Preview)
A GroupBox filling the column (margin 12), background of the column `#F4F5F7`.
- Header: visibility glyph + **"Xem trước"** + right count chip `{plane} · {slices} lát`.
- Body (flush, no padding): a **live isometric render** of the concrete block, split into the current number of slices along the active axis, slightly exploded so cut gaps show.

**Preview rendering details** (implement with `Viewport3D`/HelixToolkit OR a 2D `DrawingVisual` using the projection below — 2D iso is simplest and matches the prototype):
- Background: radial gradient white → `#e4e7ee`; faint grid overlay (lines `rgba(47,53,120,0.05)`, 26px cells).
- Isometric projection at 30°: `cos=cos(30°), sin=sin(30°)`; `screen.x = (x - y)·cos`, `screen.y = (x + y)·sin - z`. Fit/scale all 8 block corners into the viewport with ~54px padding.
- Block dimensions come from the active element (metres): W=x, D=y, H=z. Slice axis: plane XY→Z, XZ→Y, YZ→X.
- Draw slices back-to-front (painter's algorithm). Each slice box draws 3 faces:
  - top `#f5efe2` / `#efe7d6` (alternating), front `#ded4c1` / `#d6ccb8`, right `#cbc1ab` / `#c3b9a2`.
  - Edge stroke `#8a8270` ~1px; a 45° hatch overlay `rgba(40,30,10,0.10)` on each face.
- **Cut lines**: dashed red `#E34234`, ~1.6px, dash `5 3`, drawn on the top/front edge between adjacent slices.
- **Slice number badges** (only when slices ≤ 14): navy `#1E235B` circle r≈9 with white mono number, anchored near each slice.
- For **custom** mode the slice boundaries are uneven — derive normalized edges from the cumulative comma list (see `customEdges` in the HTML) and use those instead of equal divisions.
- Legend bottom-right (white 82% panel): **■ Mạch cắt** (red) · **■ Khối bê tông** (concrete).
- Badge top-left: element name + `{plane} · {slices} lát theo {axis}`.

---

## Footer
White, top border `1px #E5E5E5`, padding `10,10,14,10`, horizontal, items vertically centered. Three states:
1. **Idle**: spacer, then **"HUỶ"** (ghost/cancel button), then primary **"CẮT {n} ĐT · {totalSlices} LÁT"** (or `CẮT ({slices} LÁT)` for a single object). Primary disabled when nothing selected.
2. **Running**: a progress row replaces the buttons — animated "thinking" label "Đang dựng mặt cắt & tách khối…" (navy shimmer text), right-aligned `{pct}%` (mono), and a green progress bar (`#66d855→#40ba0f→#008000`, 18px tall, radius 6, white track, light-gray border). Simulated 0→100 then completes.
3. **Done**: green check + "Đã tạo {totalSlices} lát trên {n} đối tượng", spacer, **"LÀM LẠI"** button to reset.

**Primary (gold) button**: gold gradient background, text `#1E235B`, radius 5, height 34, padding `0 20`, bold 14px, material elevation shadow. Disabled: light gray bg, white text, no shadow.
**Cancel/ghost button**: transparent, `#1E235B`, height 34, padding `0 14`, bold 13px; hover `rgba(30,35,91,0.06)`.

---

## Interactions & Behavior
- Selecting a radio in Group 1 switches `selectMethod` between `pick` / `sweep` (affects how the model-pick action behaves; both ultimately add elements to the selection).
- Clicking XY/XZ/YZ changes the cutting `plane` → preview re-renders, slice axis changes, count chip + readouts update. "Pick" lets the user pick a reference plane in the model.
- Switching slice mode (Chia đều / Theo k/c / K/c riêng) swaps the control area and recomputes slices.
- NumberStepper ± and direct typing clamp to min/max and live-update the preview + StatTiles + footer label.
- The custom textbox parses on each change; invalid/empty → at least 1 slice.
- **CẮT** runs a simulated progress (≈180ms ticks, +7–23% each) to 100%, then shows the Done state. In the real tool this is where the Revit geometry split happens (replace the timer with the actual cut operation + real progress reporting).
- Transitions: radio dot spring-in ~140ms; toggle/segment background change ~120ms; progress bar width ease ~250ms; shimmer text loop 1.8s.

## State Management
Per-dialog state (see `useCut` in the HTML for the reference model):
- `objects: Element[]` — selected Revit elements (id, name, category, icon, dims in mm).
- `selectMethod: 'pick' | 'sweep'`.
- `plane: 'XY' | 'XZ' | 'YZ'`.
- Per-object slice config keyed by element id: `{ mode: 'equal'|'spacing'|'custom', count, spacing, custom: string }`.
- `activeId` — which object's config the controls edit.
- `running, progress, done` — for the footer.
- Derived: `sliceCountOf(o)`, `slices`, `thickness`, `remainder`, `totalSlices`, `totalVolume`, custom `edges[]`.

## Design Tokens
**Colors**
- Gold scale: `#E2AC24` `#E0A925` `#CC8926` `#BA6C28`. Gold gradient (90°): `#E2AC24 0% → #E0A925 33% → #CC8926 66% → #BA6C28 100%`. Gold highlight gradient: `#F4C76A → #F2C269 → #E5A46A → #D6896C`.
- Navy: `#1E235B` (primary), `#2f3578` (secondary).
- Blue action gradient (180°): `#5da3d5 → #3f95d1 → #2483c5 → #1074ba`; hover `#7DB5DD → #65AADA → #509CD1 → #4090C8`.
- Green progress gradient (90°): `#66d855 10% → #40ba0f 50% → #008000 100%`.
- Cut/red: `#E34234` (saw line), `#FF5A5A`/`#FF2D2D`/`#CC0000` (danger).
- Neutrals: textbox border `#ABADB3`, hover `#7EB4EA`, focus `#569DE5`; groupbox border `#D3D3D3`, header bg `#EBEBEB`; app bg `#F4F5F7`; ink `#1A1A1A`; util gray `#d6dce4` / hover `#BCC4CF`, util border `#b8c0cc`.
- Concrete faces: top `#f5efe2`/`#efe7d6`, front `#ded4c1`/`#d6ccb8`, right `#cbc1ab`/`#c3b9a2`, edge `#8a8270`.

**Typography**
- Body / labels: **Carlito** (Calibri metric-compatible), fallback Calibri/Segoe UI.
- Display / headings / axis tags / stat values: **Oswald** SemiBold, uppercase, slight letter-spacing.
- Numeric readouts / monospace: **JetBrains Mono** (fallback Roboto Mono / Consolas).
- Icons: Material Symbols Rounded in the web ref — in WPF use the project's icon set / Segoe MDL2 / vector paths.

**Spacing & shape**
- Corner radius: controls 5–6, group/tile 6–8, number badge 3, pill chips 10, radio/ellipse full.
- Common gaps: 8, 11, 12, 18. Group body padding 12. Strip/footer padding ~9–10 / 14.
- Shadows: groupbox `0 0 6px rgba(102,102,102,0.16)`; primary button material elevation `0 3px 1px -2px rgba(0,0,0,.2), 0 2px 2px rgba(0,0,0,.14), 0 1px 5px rgba(0,0,0,.12)`; blue/util button `1px 1px 5px lightgray` / `0 0 8px rgba(102,102,102,0.18)`.
- Control heights: textbox 32, stepper / primary / cancel 34, blue/util action 30, group header ~30.

## Assets
- `design-reference/wireframe.png` — the original hand-drawn layout that drove this design.
- No bitmap assets are required; everything is drawn with shapes/vectors. Icons should come from the host app's existing icon set.

## Files
- `design-reference/Cat Be Tong.html` — the interactive prototype (open in a browser). Target design = first artboard, React component **`VariationD`**.
- `design-reference/components.jsx` — reusable UI pieces: `WindowsChrome`, `AppStrip`, `VGroup` (GroupBox), `VRadio` (circular radio), `SegPlane`, `NumberStepper`, `ProgressRow`, `CutPreview` (the iso renderer + projection math), `VTopBox` (floating-label textbox).
- `design-reference/styles.css` — all VinCADTools-derived tokens & component CSS (exact values mirrored in the tokens section above).
- `design-reference/design-canvas.jsx` — only the prototype's pan/zoom canvas wrapper; not part of the WPF design.
