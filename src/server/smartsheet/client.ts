// Smartsheet REST API 2.0 client — CHỈ dùng từ Server Action / route handler (Node runtime).
// KHÔNG import vào config.base.ts / proxy (edge).

const API = "https://api.smartsheet.com/2.0";

/** Workspace "Viện Thiết Kế" (có thể override qua env). */
export const SMARTSHEET_WORKSPACE_ID =
  process.env.SMARTSHEET_WORKSPACE_ID ?? "7167964840519556";

/** Gọi API kèm Bearer token; tự retry khi bị rate-limit 429 (theo Retry-After). */
async function ssFetch<T>(token: string, path: string, retries = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 429 && attempt < retries) {
      const retryAfter = Number(res.headers.get("Retry-After")) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
      continue;
    }
    if (res.status === 401) throw new Error("Token Smartsheet không hợp lệ hoặc đã bị thu hồi");
    if (res.status === 403) throw new Error("Token không có quyền truy cập workspace Viện Thiết Kế");
    if (res.status === 404) throw new Error("Không tìm thấy dữ liệu trên Smartsheet (404)");
    if (!res.ok) throw new Error(`Smartsheet API lỗi ${res.status}`);
    return (await res.json()) as T;
  }
}

/** Kiểm tra token: trả về email tài khoản Smartsheet nếu hợp lệ. */
export async function validateToken(token: string): Promise<string> {
  const me = await ssFetch<{ email?: string }>(token, "/users/me");
  return me.email ?? "(không rõ email)";
}

// ---------- Cây workspace (1 request — nguồn modifiedAt cho incremental sync) ----------

type ApiSheetStub = { id: number; name: string; modifiedAt?: string; permalink?: string };
type ApiFolder = { name: string; folders?: ApiFolder[]; sheets?: ApiSheetStub[] };

export type SheetInfo = {
  sheetId: string;
  name: string;
  folderName: string; // folder cấp 1 = "Folder dự án"
  modifiedAt: Date | null;
  permalink: string | null;
};

/** Tải toàn bộ cây workspace, trả Map sheetId → thông tin (tên, folder cấp 1, modifiedAt). */
export async function getWorkspaceSheetMap(token: string): Promise<Map<string, SheetInfo>> {
  const ws = await ssFetch<ApiFolder & { sheets?: ApiSheetStub[] }>(
    token,
    `/workspaces/${SMARTSHEET_WORKSPACE_ID}?loadAll=true`,
  );
  const map = new Map<string, SheetInfo>();
  const addSheets = (sheets: ApiSheetStub[] | undefined, folderName: string) => {
    for (const s of sheets ?? []) {
      map.set(String(s.id), {
        sheetId: String(s.id),
        name: s.name,
        folderName,
        modifiedAt: s.modifiedAt ? new Date(s.modifiedAt) : null,
        permalink: s.permalink ?? null,
      });
    }
  };
  const walk = (folder: ApiFolder, topName: string) => {
    addSheets(folder.sheets, topName);
    for (const child of folder.folders ?? []) walk(child, topName);
  };
  addSheets(ws.sheets, "(Ngoài folder)");
  for (const top of ws.folders ?? []) walk(top, top.name);
  return map;
}

/**
 * Chạy tác vụ theo nhóm song song có giới hạn (Smartsheet cho ~300 request/phút).
 * Giữ nguyên thứ tự kết quả theo thứ tự đầu vào.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------- Tải + parse 1 sheet ----------

type ApiCell = { columnId: number; value?: unknown; displayValue?: string };
type ApiRow = { id: number; rowNumber?: number; cells?: ApiCell[] };
type ApiSheet = {
  id: number;
  name: string;
  modifiedAt?: string;
  permalink?: string;
  columns: { id: number; title: string; type?: string }[];
  rows?: ApiRow[];
};

export type ParsedBimRow = {
  rowId: string;
  rowNumber: number | null;
  maGoi: string | null;
  hoSo: string | null;
  boMon: string | null;
  batDau: Date | null;
  phatHanhPD: Date | null;
  tinhTrang: string | null;
  chuTri: string | null;
  cbth1: string | null;
  cbth2: string | null;
  ghiChu: string | null;
};

// Map tên cột (đã chuẩn hóa) → field. Sheet đổi thứ tự cột vẫn đọc đúng vì match theo TÊN.
const COLUMN_ALIASES: Record<string, keyof Omit<ParsedBimRow, "rowId" | "rowNumber">> = {
  "id gói thiết kế": "maGoi",
  "hồ sơ thiết kế": "hoSo",
  "bộ môn": "boMon",
  "bắt đầu": "batDau",
  "ngày phát hành pd": "phatHanhPD",
  "tình trạng": "tinhTrang",
  "chủ trì": "chuTri",
  cbth1: "cbth1",
  "cbth 1": "cbth1",
  cbth2: "cbth2",
  "cbth 2": "cbth2",
  "ghi chú": "ghiChu",
};

const normalizeHeader = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

const cellText = (c: ApiCell | undefined): string => {
  if (!c) return "";
  if (c.displayValue != null && c.displayValue !== "") return String(c.displayValue).trim();
  if (c.value != null) return String(c.value).trim();
  return "";
};

const parseDate = (c: ApiCell | undefined): Date | null => {
  if (!c) return null;
  const raw = typeof c.value === "string" ? c.value : cellText(c);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/); // cột DATE của Smartsheet: value = ISO "YYYY-MM-DD"
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export type FetchedSheet = {
  sheetId: string;
  name: string;
  modifiedAt: Date | null;
  permalink: string | null;
  bimRows: ParsedBimRow[];
};

/** Tải 1 sheet và lọc sẵn các dòng có Bộ môn chứa "BIM" (gồm cả "P. BIM"). */
export async function fetchSheetBimRows(token: string, sheetId: string): Promise<FetchedSheet> {
  const sheet = await ssFetch<ApiSheet>(token, `/sheets/${sheetId}?include=objectValue&level=2`);

  const colField = new Map<number, keyof Omit<ParsedBimRow, "rowId" | "rowNumber">>();
  for (const col of sheet.columns) {
    const field = COLUMN_ALIASES[normalizeHeader(col.title)];
    if (field) colField.set(col.id, field);
  }

  const bimRows: ParsedBimRow[] = [];
  const hasBoMon = [...colField.values()].includes("boMon");
  if (hasBoMon) {
    for (const row of sheet.rows ?? []) {
      const byField = new Map<string, ApiCell>();
      for (const cell of row.cells ?? []) {
        const field = colField.get(cell.columnId);
        if (field) byField.set(field, cell);
      }
      const boMon = cellText(byField.get("boMon"));
      if (!boMon.toUpperCase().includes("BIM")) continue;
      bimRows.push({
        rowId: String(row.id),
        rowNumber: row.rowNumber ?? null,
        maGoi: cellText(byField.get("maGoi")) || null,
        hoSo: cellText(byField.get("hoSo")) || null,
        boMon: boMon || null,
        batDau: parseDate(byField.get("batDau")),
        phatHanhPD: parseDate(byField.get("phatHanhPD")),
        tinhTrang: cellText(byField.get("tinhTrang")) || null,
        chuTri: cellText(byField.get("chuTri")) || null,
        cbth1: cellText(byField.get("cbth1")) || null,
        cbth2: cellText(byField.get("cbth2")) || null,
        ghiChu: cellText(byField.get("ghiChu")) || null,
      });
    }
  }

  return {
    sheetId: String(sheet.id),
    name: sheet.name,
    modifiedAt: sheet.modifiedAt ? new Date(sheet.modifiedAt) : null,
    permalink: sheet.permalink ?? null,
    bimRows,
  };
}
