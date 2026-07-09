"use client";

import Link from "next/link";
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type RecentTask = {
  id: string;
  name: string;
  level2: string | null;
  level3: string | null;
  groupCode: string | null;
  disciplineCode: string | null;
  phaseName: string | null;
  assignedOn: string; // ISO date, đã tính sẵn ở server (createdAt hoặc startApprovedAt, cái nào gần hơn)
};

// Điền vào ô tìm kiếm của /tasks: Dự án, Loại hình, Hạng mục, Công việc (AND bằng dấu phẩy).
function taskQuery(t: RecentTask): string {
  return [t.groupCode, t.level2, t.level3, t.name].filter(Boolean).join(", ");
}

// "Xem tất cả": OR (dấu "|") giữa từng việc.
function buildViewAllQuery(tasks: RecentTask[]): string {
  return tasks.map(taskQuery).join(" | ");
}

export function RecentTasksCard({ tasks }: { tasks: RecentTask[] }) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === tasks.length ? new Set() : new Set(tasks.map((t) => t.id))));
  }

  // Có việc đang được tick → "Xem tất cả" chỉ đưa đúng các việc đó sang /tasks; không tick gì → đưa hết như cũ.
  const tasksForViewAll = selected.size > 0 ? tasks.filter((t) => selected.has(t.id)) : tasks;
  const viewAllQuery = buildViewAllQuery(tasksForViewAll);
  const viewAllLabel = selected.size > 0 ? `Xem ${selected.size} việc đã chọn →` : "Xem tất cả trong Công việc của tôi →";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Việc vừa được giao (7 ngày qua) — {tasks.length} việc</CardTitle>
        {tasks.length > 0 ? (
          <Link
            href={`/tasks?q=${encodeURIComponent(viewAllQuery)}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {viewAllLabel}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có việc nào mới được giao trong 7 ngày qua.</p>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-8 pb-2 pr-1">
                    <input
                      type="checkbox"
                      checked={selected.size === tasks.length}
                      onChange={toggleAll}
                      aria-label="Chọn tất cả"
                      className="size-3.5 accent-slate-700"
                    />
                  </th>
                  <th className="pb-2 pr-3 font-medium">Dự án</th>
                  <th className="pb-2 pr-3 font-medium">Loại hình</th>
                  <th className="pb-2 pr-3 font-medium">Hạng mục</th>
                  <th className="pb-2 pr-3 font-medium">Công việc</th>
                  <th className="pb-2 pr-3 font-medium">Bộ môn</th>
                  <th className="pb-2 pr-3 font-medium">Giai đoạn</th>
                  <th className="pb-2 font-medium">Ngày giao</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const href = `/tasks?q=${encodeURIComponent(taskQuery(t))}`;
                  const isSel = selected.has(t.id);
                  return (
                    <tr key={t.id} className={cn("border-b last:border-0 hover:bg-muted/50", isSel && "bg-primary/5")}>
                      <td className="py-1.5 pr-1">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggle(t.id)}
                          aria-label={`Chọn ${t.name}`}
                          className="size-3.5 accent-slate-700"
                        />
                      </td>
                      <td className="p-0">
                        <Link href={href} className="block py-1.5 pr-3">
                          {t.groupCode ?? "—"}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={href} className="block py-1.5 pr-3">
                          {t.level2 || "—"}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={href} className="block py-1.5 pr-3">
                          {t.level3 || "—"}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={href} className="block py-1.5 pr-3">
                          {t.name}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={href} className="block py-1.5 pr-3">
                          {t.disciplineCode ?? "—"}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={href} className="block py-1.5 pr-3">
                          {t.phaseName ?? "—"}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={href} className="block whitespace-nowrap py-1.5 text-muted-foreground">
                          {new Date(t.assignedOn).toLocaleDateString("vi-VN")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
