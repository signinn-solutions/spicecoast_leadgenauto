import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

export default function AnalyticsChart({ data }) {
  return (
    <div style={{ width: "100%", height: 220 }} role="img" aria-label="Email deliverability breakdown chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3e503e" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "#c9d0c0", fontSize: 12 }} axisLine={{ stroke: "#3e503e" }} tickLine={false} />
          <YAxis tick={{ fill: "#c9d0c0", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ background: "#1b241b", border: "1px solid #3e503e", borderRadius: 8, fontSize: 12.5 }} labelStyle={{ color: "#f5f4ea" }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
