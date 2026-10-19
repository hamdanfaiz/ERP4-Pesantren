import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { db } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Layers } from 'lucide-react';

interface StructureNode {
  id: string;
  name: string;
  type: string;
  category: string;
  parentCode?: string;
  status: string;
}

export const StructureHierarchyD3: React.FC = () => {
  const d3Container = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<StructureNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch all master data related to structure
    const structureCategories = ["Yayasan", "Kampus", "Gedung", "Kamar", "Kelas", "Halaqah"];
    
    // We fetch all master_data since Firebase 'in' queries are limited to 10
    // and we might need to fetch them all anyway. We'll filter on the client.
    const unsubscribe = onSnapshot(collection(db, 'master_data'), (snapshot) => {
      const fetchedNodes: StructureNode[] = [];
      snapshot.docs.forEach(doc => {
        const docData = doc.data();
        if (structureCategories.includes(docData.category)) {
          fetchedNodes.push({
            id: docData.id || doc.id,
            name: docData.name || 'Unnamed',
            type: docData.type || docData.category,
            category: docData.category,
            parentCode: docData.parentCode || '',
            status: docData.status || 'Active'
          });
        }
      });
      setData(fetchedNodes);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isLoading || !data.length || !d3Container.current) return;

    // Clear previous SVG
    d3.select(d3Container.current).selectAll('*').remove();

    // Prepare hierarchical data
    // We might have multiple root nodes (Yayasans), so we create a dummy root
    const rootData = { id: 'ROOT', name: 'Organisasi', type: 'Root', category: 'Root' };
    
    const stratify = d3.stratify<any>()
      .id(d => d.id)
      .parentId(d => {
        if (d.id === 'ROOT') return undefined;
        if (d.category === 'Yayasan') return 'ROOT';
        return d.parentCode || 'ROOT'; // Default to root if no parent found, preventing errors
      });

    let hierarchicalData;
    try {
        // Ensure all parents exist, if not, attach them to ROOT
        const allIds = new Set(data.map(d => d.id));
        allIds.add('ROOT');
        
        const safeData = data.map(d => {
            let parentId = d.parentCode;
            if (d.category === 'Yayasan') parentId = 'ROOT';
            else if (!parentId || !allIds.has(parentId)) parentId = 'ROOT';
            return { ...d, parentCode: parentId };
        });

        hierarchicalData = stratify([rootData, ...safeData]);
    } catch (e) {
        console.error("D3 stratify error", e);
        // Display error or fallback
        d3.select(d3Container.current).append('div').text('Invalid hierarchy data (circular reference or missing parents).');
        return;
    }

    const margin = { top: 20, right: 120, bottom: 20, left: 120 };
    const width = d3Container.current.clientWidth - margin.left - margin.right;
    
    // Calculate dynamic height based on number of nodes
    const height = Math.max(500, hierarchicalData.descendants().length * 40) - margin.top - margin.bottom;

    const svg = d3.select(d3Container.current)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const tree = d3.tree<any>().size([height, width]);
    const root = d3.hierarchy(hierarchicalData);
    
    // Initial configuration: collapse nodes deeper than level 2
    root.descendants().forEach((d: any) => {
        d._children = d.children; // Save children for toggling
        if (d.depth > 1) {
            d.children = null;
        }
    });

    let i = 0;
    const duration = 750;

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'Yayasan': return '#6366f1'; // Indigo
            case 'Kampus': return '#3b82f6'; // Blue
            case 'Gedung': return '#10b981'; // Emerald
            case 'Kamar': return '#f59e0b'; // Amber
            case 'Kelas': return '#ec4899'; // Pink
            case 'Halaqah': return '#8b5cf6'; // Violet
            default: return '#94a3b8'; // Slate
        }
    };

    function update(source: any) {
        const treeData = tree(root);
        const nodes = treeData.descendants();
        const links = treeData.descendants().slice(1);

        // Normalize for fixed-depth
        nodes.forEach((d: any) => { d.y = d.depth * 180; });

        // ****************** Nodes section ***************************
        const node = svg.selectAll<SVGGElement, any>('g.node')
            .data(nodes, (d: any) => d.id || (d.id = ++i));

        const nodeEnter = node.enter().append('g')
            .attr('class', 'node')
            .attr('transform', d => `translate(${source.y0 || 0},${source.x0 || 0})`)
            .on('click', (event, d: any) => {
                if (d.children) {
                    d._children = d.children;
                    d.children = null;
                } else {
                    d.children = d._children;
                    d._children = null;
                }
                update(d);
            });

        // Add Circle for the nodes
        nodeEnter.append('circle')
            .attr('class', 'node')
            .attr('r', 1e-6)
            .style('fill', (d: any) => d._children ? getCategoryColor(d.data.data.category) : '#fff')
            .style('stroke', (d: any) => getCategoryColor(d.data.data.category))
            .style('stroke-width', '2px')
            .style('cursor', 'pointer');

        // Add labels for the nodes
        nodeEnter.append('text')
            .attr('dy', '.35em')
            .attr('x', (d: any) => d.children || d._children ? -13 : 13)
            .attr('text-anchor', (d: any) => d.children || d._children ? 'end' : 'start')
            .text((d: any) => d.data.data.name)
            .style('fill', 'currentColor')
            .style('font-size', '12px')
            .style('font-weight', (d: any) => d.data.data.category === 'Root' ? 'bold' : 'normal')
            .style('text-shadow', '0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff')
            .attr('class', 'dark:text-white dark:text-shadow-none');
            
        // Add category tags
        nodeEnter.append('text')
            .attr('dy', '1.5em')
            .attr('x', (d: any) => d.children || d._children ? -13 : 13)
            .attr('text-anchor', (d: any) => d.children || d._children ? 'end' : 'start')
            .text((d: any) => d.data.data.category !== 'Root' ? d.data.data.category : '')
            .style('fill', (d: any) => getCategoryColor(d.data.data.category))
            .style('font-size', '9px')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.5px');

        // UPDATE
        const nodeUpdate = nodeEnter.merge(node);

        nodeUpdate.transition()
            .duration(duration)
            .attr('transform', (d: any) => `translate(${d.y},${d.x})`);

        nodeUpdate.select('circle.node')
            .attr('r', 8)
            .style('fill', (d: any) => d._children ? getCategoryColor(d.data.data.category) : '#fff')
            .attr('cursor', 'pointer');

        // EXIT
        const nodeExit = node.exit().transition()
            .duration(duration)
            .attr('transform', d => `translate(${source.y},${source.x})`)
            .remove();

        nodeExit.select('circle')
            .attr('r', 1e-6);

        nodeExit.select('text')
            .style('fill-opacity', 1e-6);

        // ****************** links section ***************************
        const link = svg.selectAll<SVGPathElement, any>('path.link')
            .data(links, (d: any) => d.id);

        const linkEnter = link.enter().insert('path', 'g')
            .attr('class', 'link')
            .attr('d', d => {
                const o = { x: source.x0 || 0, y: source.y0 || 0 };
                return diagonal(o, o);
            })
            .style('fill', 'none')
            .style('stroke', '#cbd5e1')
            .style('stroke-width', '1.5px');

        const linkUpdate = linkEnter.merge(link);

        linkUpdate.transition()
            .duration(duration)
            .attr('d', (d: any) => diagonal(d, d.parent))
            .style('stroke', 'currentColor')
            .attr('class', 'text-slate-200 dark:text-slate-800');

        const linkExit = link.exit().transition()
            .duration(duration)
            .attr('d', d => {
                const o = { x: source.x, y: source.y };
                return diagonal(o, o);
            })
            .remove();

        nodes.forEach((d: any) => {
            d.x0 = d.x;
            d.y0 = d.y;
        });
    }

    function diagonal(s: any, d: any) {
        return `M ${s.y} ${s.x}
                C ${(s.y + d.y) / 2} ${s.x},
                  ${(s.y + d.y) / 2} ${d.x},
                  ${d.y} ${d.x}`;
    }

    update(root);
    
    // Handle resizing window (simple re-render)
    const handleResize = () => {
        // Debounce or just clear/re-draw?
        // We will just let React handle it if width changes, but D3 container width might need observer
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data, isLoading]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <div className="text-sm">Loading structure map...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="p-12 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
        <Layers className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <h3 className="font-semibold text-lg text-slate-700 dark:text-slate-300 mb-1">No Structure Data</h3>
        <p className="text-sm">Add Yayasan, Kampus, Gedung, or Kelas data to generate the map.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[600px] bg-white dark:bg-[#0a0a0a] rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden flex flex-col relative group shadow-sm">
        <div className="absolute top-4 left-4 z-10 bg-white/90 dark:bg-black/90 backdrop-blur border border-slate-200 dark:border-white/10 rounded-lg p-3 shadow-lg">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-emerald-500" />
                Structure Map
            </h3>
            <div className="space-y-1.5">
                {[
                    { label: 'Yayasan', color: 'bg-indigo-500' },
                    { label: 'Kampus', color: 'bg-blue-500' },
                    { label: 'Gedung', color: 'bg-emerald-500' },
                    { label: 'Kamar', color: 'bg-amber-500' },
                    { label: 'Kelas', color: 'bg-pink-500' },
                    { label: 'Halaqah', color: 'bg-violet-500' },
                ].map(legend => (
                    <div key={legend.label} className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400">
                        <div className={`w-2 h-2 rounded-full ${legend.color}`}></div>
                        {legend.label}
                    </div>
                ))}
            </div>
            <div className="mt-3 text-[9px] text-slate-400 dark:text-slate-500 italic">Click nodes to expand/collapse</div>
        </div>
        <div 
            ref={d3Container} 
            className="w-full h-full overflow-auto flex-1 custom-scrollbar cursor-grab active:cursor-grabbing"
            style={{ minHeight: '600px' }}
        />
    </div>
  );
};
