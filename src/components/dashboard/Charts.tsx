"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Цвета серий: киноварь, мох, охра и тёплый графит. Без «дашборд-радуги».
const COLORS = ["#b23a2b", "#4f5d45", "#a97924", "#7d6b58", "#8f2c1f"];

export function MonthlyBars({ data }: { data: { month: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="2 4" stroke="currentColor" opacity={0.18} />
        <XAxis dataKey="month" fontSize={11} tick={{ fill: "currentColor" }} tickLine={false} />
        <YAxis
          fontSize={11}
          allowDecimals={false}
          tick={{ fill: "currentColor" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "currentColor", opacity: 0.06 }}
          contentStyle={{ borderRadius: 2, borderColor: "#b7ac9a", fontSize: 12 }}
        />
        <Bar dataKey="count" fill="#b23a2b" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusPie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          outerRadius={82}
          label={{ fill: "currentColor", fontSize: 11 }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 2, borderColor: "#b7ac9a", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-sm border border-dashed p-4 text-center text-sm opacity-60">
      {text}
    </div>
  );
}
