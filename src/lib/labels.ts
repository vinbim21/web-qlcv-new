// Nhãn tiếng Việt + màu cho các enum.

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  LEVEL_1: "Cấp 1",
  LEVEL_2: "Cấp 2",
  LEVEL_3: "Cấp 3",
};
export const ROLE_OPTIONS = ["ADMIN", "LEVEL_1", "LEVEL_2", "LEVEL_3"] as const;

export const TASK_STATUS_LABEL: Record<string, string> = {
  CHUA_LAM: "Chưa thực hiện",
  DANG_LAM: "Đang thực hiện",
  HOAN_THANH: "Hoàn thành",
  TAM_DUNG: "Tạm dừng",
  QUA_HAN: "Quá hạn", // suy ra, không lưu DB
};
export const TASK_STATUS_OPTIONS = ["CHUA_LAM", "DANG_LAM", "HOAN_THANH", "TAM_DUNG"] as const;

export const PRIORITY_LABEL: Record<string, string> = {
  CAO: "Cao",
  TRUNG_BINH: "Trung bình",
  THAP: "Thấp",
};
export const PRIORITY_OPTIONS = ["CAO", "TRUNG_BINH", "THAP"] as const;

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  DANG_THUC_HIEN: "Đang thực hiện",
  TAM_DUNG: "Tạm dừng",
  HOAN_THANH: "Hoàn thành",
};
export const PROJECT_STATUS_OPTIONS = ["DANG_THUC_HIEN", "TAM_DUNG", "HOAN_THANH"] as const;

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case "HOAN_THANH":
      return "success";
    case "DANG_LAM":
      return "default";
    case "TAM_DUNG":
      return "secondary";
    case "QUA_HAN":
      return "destructive";
    default:
      return "outline";
  }
}

export function priorityVariant(p: string): BadgeVariant {
  switch (p) {
    case "CAO":
      return "destructive";
    case "TRUNG_BINH":
      return "warning";
    default:
      return "secondary";
  }
}
