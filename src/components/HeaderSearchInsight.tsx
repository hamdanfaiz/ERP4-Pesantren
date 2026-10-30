import React from "react";
import Markdown from "react-markdown";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { Download, Loader2 } from "lucide-react";

type ChartData = {
  type: "bar" | "pie";
  title: string;
  data: { name: string; value: number }[];
};

export function HeaderSearchInsight({
  answer,
  chartData,
  isExporting,
  onExport,
}: {
  answer: string;
  chartData?: ChartData;
  isExporting: boolean;
  onExport: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline">
        <Markdown>{answer}</Markdown>
      </div>
      {chartData && chartData.data.length > 0 && (
        <div className="mt-4 p-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f0f0f] rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{chartData.title}</h4>
            <button type="button" onClick={onExport} disabled={isExporting} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Ekspor PDF
            </button>
          </div>
          <div id="search-chart-container" className="h-64 w-full bg-white dark:bg-[#0f0f0f]">
            <ResponsiveContainer width="100%" height="100%">
              {chartData.type === "pie" ? (
                <PieChart><Pie data={chartData.data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label={({ name, percent }) => name + " " + (percent * 100).toFixed(0) + "%"}>
                  {chartData.data.map((_, index) => <Cell key={"cell-" + index} fill={["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"][index % 5]} />)}
                </Pie><Tooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", borderColor: "#333", color: "#fff" }} itemStyle={{ color: "#10b981" }} /></PieChart>
              ) : (
                <BarChart data={chartData.data}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} /><Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", borderColor: "#333", color: "#fff" }} itemStyle={{ color: "#10b981" }} /><Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} /></BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
