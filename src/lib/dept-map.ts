// Gộp 11 Bộ môn (Discipline) về 4 Phòng cho Báo cáo "từng phòng".
// Map đề xuất — chỉnh ở đây nếu phòng tổ chức lại bộ môn.
//   XD   ← BIM, KT (Kiến trúc), KC (Kết cấu)
//   MEPF ← MEPF, DI (Điện), DN (Điện nhẹ), NU (Cấp thoát nước), DH (Điều hòa), PC (Phòng cháy)
//   HT   ← HT (Hạ tầng)
//   IT   ← IT

export type Phong = "XD" | "MEPF" | "HT" | "IT";

export const PHONG_ORDER: Phong[] = ["XD", "MEPF", "HT", "IT"];

export const PHONG_LABEL: Record<Phong, string> = {
  XD: "BIM XD",
  MEPF: "MEPF",
  HT: "HT",
  IT: "IT",
};

const DISCIPLINE_TO_PHONG: Record<string, Phong> = {
  BIM: "XD",
  KT: "XD",
  KC: "XD",
  MEPF: "MEPF",
  DI: "MEPF",
  DN: "MEPF",
  NU: "MEPF",
  DH: "MEPF",
  PC: "MEPF",
  HT: "HT",
  IT: "IT",
};

/** Phòng của một bộ môn (theo code). null = chưa xác định → gom vào "Chưa phân phòng". */
export function phongOf(disciplineCode?: string | null): Phong | null {
  if (!disciplineCode) return null;
  return DISCIPLINE_TO_PHONG[disciplineCode] ?? null;
}
