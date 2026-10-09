import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

export default function AnalyticsChart({ data }) {
  return (
    <div style={{ width: "100%", height: 220 }} role="img" aria-label="Email deliverability breakdown chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eaedf3" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "#666e7a", fontSize: 12 }} axisLine={{ stroke: "#eaedf3" }} tickLine={false} />
          <YAxis tick={{ fill: "#666e7a", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12.5, boxShadow: "0 4px 14px rgba(25, 36, 53, 0.08)", color: "#192435" }} labelStyle={{ color: "#192435", fontWeight: 600 }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
