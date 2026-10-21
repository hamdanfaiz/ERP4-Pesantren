import React, { useState, useRef, useEffect } from "react";
import {
  Bell,
  Search,
  ChevronDown,
  User,
  Sparkles,
  Loader2,
  X,
  ExternalLink,
  Download,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Tenant } from "../types";
import Markdown from "react-markdown";
import { cn } from "../lib/utils";
import { getAllMasterDataRecords } from "../data/mockRecords";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { collection, addDoc } from "firebase/firestore";
import { getAuthSession } from "../authSession";
import { db } from "../firebase";

interface HeaderProps {
  currentTenant: Tenant;
  branding?: {
    logoUrl?: string;
    schoolName?: string;
  };
}

export function Header({ currentTenant, branding }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    answer: string;
    chartData?: {
      type: "bar" | "pie";
      title: string;
      data: { name: string; value: number }[];
    };
    sources: any[];
  } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const exportChartToPDF = async () => {
    if (!searchResult?.chartData) return;
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(searchResult.chartData.title, 14, 15);
      
      const chartElement = document.getElementById("search-chart-container");
      if (chartElement) {
        const canvas = await html2canvas(chartElement, { scale: 2, backgroundColor: "#ffffff" });
        const imgData = canvas.toDataURL("image/png");
        const pdfWidth = doc.internal.pageSize.getWidth();
        const imgProps = doc.getImageProperties(imgData);
        const margin = 14;
        const imgWidth = pdfWidth - margin * 2;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
        
        doc.addImage(imgData, "PNG", margin, 20, imgWidth, imgHeight);
        
        const startY = 20 + imgHeight + 10;
        const tableBody = searchResult.chartData.data.map(item => [item.name, item.value.toString()]);
        
        autoTable(doc, {
          startY,
          head: [["Name / Category", "Value"]],
          body: tableBody,
          theme: "striped",
          headStyles: { fillColor: [16, 185, 129] },
        });
      }
      
      doc.save("Data_Summary.pdf");
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setIsSearchOpen(true);
    setSearchResult(null);
    setFeedbackGiven(null);
    try {
      const records = getAllMasterDataRecords();
      const response = await fetch("/api/header-ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, records }),
      });
      const data = await response.json();
      setSearchResult(data);
    } catch (e) {
      console.error(e);
      setSearchResult({
        answer: "An error occurred while searching.",
        sources: [],
      });
    } finally {
      setIsSearching(false);
    }
  };

  const [feedbackGiven, setFeedbackGiven] = useState<"up" | "down" | null>(null);

  const handleRating = async (rating: "up" | "down") => {
    if (feedbackGiven) return;
    setFeedbackGiven(rating);
    try {
      await addDoc(collection(db, "SearchLogs"), {
        query: searchQuery,
        rating,
        createdAt: new Date().toISOString(),
        userId: getAuthSession()?.uid || "anonymous",
      });
    } catch (error) {
      console.error("Failed to save search log:", error);
    }
  };

  return (
    <header className="h-16 glass-panel flex items-center justify-between px-6 sticky top-0 z-10 w-full print:hidden border-t-0 border-x-0 rounded-none bg-white/40 dark:bg-black/40 border-b border-slate-200/50 dark:border-white/10 erp-shell-header">
      <div className="flex justify-between items-center w-full">
        <div className="flex items-center gap-4">
          {/* Multi-Tenant Selector Mockup */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg  hover:bg-slate-200 dark:bg-white/10 cursor-pointer transition-colors bg-slate-100 dark:bg-white/5">
            {branding?.logoUrl ? (
               <img src={branding.logoUrl} alt="Logo" className="w-6 h-6 object-contain rounded bg-slate-100 dark:bg-white/5" />
            ) : (
               <div className="w-6 h-6 bg-emerald-900/50 rounded text-emerald-400 flex items-center justify-center font-bold text-xs">
                 {branding?.schoolName ? branding.schoolName.charAt(0) : currentTenant.name.charAt(0)}
               </div>
            )}
            <div className="flex flex-col max-w-[150px]">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 leading-none truncate">
                {branding?.schoolName || currentTenant.name}
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                {currentTenant.type}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-500 ml-2" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative" ref={searchRef}>
            <form onSubmit={handleSearch} className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchResult || isSearching) setIsSearchOpen(true);
                }}
                placeholder="Ask AI about santri, master data..."
                className="pl-9 pr-10 py-2  rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 w-80 bg-slate-50 dark:bg-[#0a0a0a] text-slate-700 dark:text-slate-300 transition-all hover:glass-panel"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 rounded"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            </form>

            {isSearchOpen &&
              searchQuery.trim() !== "" &&
              (isSearching || searchResult) && (
                <div className="absolute top-full right-0 mt-2 w-[450px] max-h-[80vh] overflow-y-auto bg-slate-50 dark:bg-[#0a0a0a]  rounded-xl shadow-2xl flex flex-col z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="p-3 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-black/40 sticky top-0 z-10">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                      <Sparkles className="w-4 h-4" />
                      AI Search Results
                    </div>
                    <button
                      onClick={() => setIsSearchOpen(false)}
                      className="text-slate-500 hover:text-slate-700 dark:text-slate-300 p-1 rounded-md hover:bg-slate-100 dark:bg-white/5 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {isSearching ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-3 text-emerald-500/80">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <span className="text-xs font-medium tracking-wide">
                          Searching master data & web...
                        </span>
                      </div>
                    ) : searchResult ? (
                      <div className="space-y-4">
                        <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline">
                          <Markdown>{searchResult.answer}</Markdown>
                        </div>

                        {searchResult.chartData && searchResult.chartData.data && searchResult.chartData.data.length > 0 && (
                          <div className="mt-4 p-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f0f0f] rounded-xl shadow-sm">
                            <div className="flex justify-between items-center mb-4">
                              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                {searchResult.chartData.title}
                              </h4>
                              <button 
                                onClick={exportChartToPDF}
                                disabled={isExporting}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                              >
                                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                Export PDF
                              </button>
                            </div>
                            <div id="search-chart-container" className="h-64 w-full bg-white dark:bg-[#0f0f0f]">
                              <ResponsiveContainer width="100%" height="100%">
                                {searchResult.chartData.type === 'pie' ? (
                                  <PieChart>
                                    <Pie
                                      data={searchResult.chartData.data}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={60}
                                      outerRadius={80}
                                      paddingAngle={5}
                                      dataKey="value"
                                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    >
                                      {searchResult.chartData.data.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                                      ))}
                                    </Pie>
                                    <Tooltip
                                      contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderColor: '#333', color: '#fff' }}
                                      itemStyle={{ color: '#10b981' }}
                                    />
                                  </PieChart>
                                ) : (
                                  <BarChart data={searchResult.chartData.data}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                      contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderColor: '#333', color: '#fff' }}
                                      itemStyle={{ color: '#10b981' }}
                                    />
                                    <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                                  </BarChart>
                                )}
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {searchResult.sources &&
                          searchResult.sources.length > 0 && (
                            <div className="pt-4 border-t border-slate-200 dark:border-white/5 mt-4">
                              <h4 className="text-xs font-semibold tracking-wider text-slate-500 uppercase mb-3">
                                Sources
                              </h4>
                              <div className="flex flex-col gap-2">
                                {searchResult.sources.map(
                                  (source: any, i: number) => {
                                    const web = source.web;
                                    if (!web) return null;
                                    return (
                                      <a
                                        key={i}
                                        href={web.uri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-colors group"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <h5 className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate group-hover:text-emerald-400 transition-colors">
                                            {web.title || web.uri}
                                          </h5>
                                          <p className="text-xs text-slate-500 truncate">
                                            {web.uri}
                                          </p>
                                        </div>
                                        <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 flex-shrink-0" />
                                      </a>
                                    );
                                  },
                                )}
                              </div>
                            </div>
                          )}

                        <div className="pt-4 border-t border-slate-200 dark:border-white/5 mt-4 flex items-center justify-between">
                          <span className="text-xs text-slate-500">Was this answer helpful?</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRating("up")}
                              disabled={feedbackGiven !== null}
                              className={cn(
                                "p-1.5 rounded-md border transition-colors",
                                feedbackGiven === "up" 
                                  ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-500" 
                                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                              )}
                            >
                              <ThumbsUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRating("down")}
                              disabled={feedbackGiven !== null}
                              className={cn(
                                "p-1.5 rounded-md border transition-colors",
                                feedbackGiven === "down" 
                                  ? "bg-red-500/20 border-red-500/30 text-red-500" 
                                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                              )}
                            >
                              <ThumbsDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                      </div>
                    ) : null}
                  </div>
                </div>
              )}
          </div>

          <button className="relative p-2 rounded-full hover:bg-slate-200 dark:bg-white/10 transition-colors text-slate-500 dark:text-slate-400">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-2 w-2 h-2 bg-emerald-500 rounded-full border-2 border-[#0a0a0a]"></span>
          </button>

          <div className="h-8 w-px bg-slate-200 dark:bg-white/10 mx-2"></div>

          <div className="flex items-center gap-3 cursor-pointer group">
            <div className="text-right hidden md:block">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-emerald-400 transition-colors">
                Ahmad Fauzi
              </div>
              <div className="text-xs text-slate-500">Super Admin Yayasan</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-emerald-900/30 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <User className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
