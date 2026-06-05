"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { removeVietnameseTones } from "@/lib/utils";

export type NormRow = {
  userId: string;
  userName: string;
  task: string; // đầu việc (level5)
  ctName: string; // loại hình công trình
  ctOrder: number;
  times: number; // số lần làm (số việc)
  hours: number; // tổng giờ công
  norm: number; // định mức = hours / times
  deptNorm: number; // định mức TB toàn phòng cho (đầu việc × loại CT)
};

function fmt(n: number): string {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

export function NormReport({ rows, cts }: { rows: NormRow[]; cts: string[] }) {
  const users = React.useMemo(
    () => [...new Set(rows.map((r) => r.userName))].sort((a, b) => a.localeCompare(b, "vi")),
    [rows],
  );
  const [fUser, setFUser] = React.useState("");
  const [fCt, setFCt] = React.useState("");
  const [q, setQ] = React.useState("");

  const filtered = React.useMemo(() => {
    const qn = removeVietnameseTones(q.trim());
    return rows
      .filter((r) => (fUser ? r.userName === fUser : true))
      .filter((r) => (fCt ? r.ctName === fCt : true))
      .filter((r) => (qn ? removeVietnameseTones(r.task).includes(qn) : true))
      .sort(
        (a, b) =>
          a.userName.localeCompare(b.userName, "vi") ||
          a.ctOrder - b.ctOrder ||
          a.task.localeCompare(b.task, "vi"),
      );
  }, [rows, fUser, fCt, q]);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 py-10 text-center text-sm text-muted-foreground">
          <p>Chưa có dữ liệu định mức.</p>
          <p>
            Cần: ① đánh dấu việc <b>“cần đo định mức”</b> (ở /manage), ② nhập <b>timesheet</b> giờ công
            cho các việc đó, ③ gán <b>Loại hình công trình</b> cho dự án.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-3">
        <Select value={fUser} onChange={(e) => setFUser(e.target.value)}>
          <option value="">— Tất cả nhân sự —</option>
          {users.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
        <Select value={fCt} onChange={(e) => setFCt(e.target.value)}>
          <option value="">— Tất cả loại hình —</option>
          {cts.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Input placeholder="Tìm đầu việc..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-4">
          <p className="pb-3 text-xs text-muted-foreground">
            Định mức = tổng giờ công ÷ số lần làm, cho từng <b>người × đầu việc × loại hình công trình</b>.
            Cột “TB phòng” là định mức trung bình toàn phòng của cùng đầu việc &amp; loại hình để so sánh.
            ({filtered.length} dòng)
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhân sự</TableHead>
                <TableHead>Đầu việc</TableHead>
                <TableHead>Loại hình CT</TableHead>
                <TableHead className="text-right">Số lần</TableHead>
                <TableHead className="text-right">Tổng giờ</TableHead>
                <TableHead className="text-right">Định mức (giờ/lần)</TableHead>
                <TableHead className="text-right">TB phòng</TableHead>
                <TableHead className="text-right">So phòng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, i) => {
                const diff = r.deptNorm > 0 ? Math.round(((r.norm - r.deptNorm) / r.deptNorm) * 100) : 0;
                const cls = diff > 0 ? "text-red-600" : diff < 0 ? "text-emerald-600" : "text-muted-foreground";
                return (
                  <TableRow key={`${r.userId}-${r.task}-${r.ctName}-${i}`}>
                    <TableCell className="font-medium">{r.userName}</TableCell>
                    <TableCell className="max-w-xs">{r.task}</TableCell>
                    <TableCell className="text-xs">{r.ctName}</TableCell>
                    <TableCell className="text-right">{r.times}</TableCell>
                    <TableCell className="text-right">{fmt(r.hours)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(r.norm)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt(r.deptNorm)}</TableCell>
                    <TableCell className={`text-right text-sm ${cls}`}>
                      {diff > 0 ? "+" : ""}
                      {diff}%
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Không có dòng nào khớp bộ lọc
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
