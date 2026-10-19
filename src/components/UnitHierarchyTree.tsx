import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ChevronRight, ChevronDown, Building2, Layers } from 'lucide-react';

interface Unit {
  id: string;
  name: string;
  code: string;
  status: string;
  description: string;
  parentUnitId?: string;
}

interface TreeNodeProps {
  unit: Unit;
  childrenMap: Map<string, Unit[]>;
  level: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({ unit, childrenMap, level }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const children = childrenMap.get(unit.id) || [];
  const hasChildren = children.length > 0;

  return (
    <div className="flex flex-col">
      <div 
        className={`flex items-center py-2 px-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer transition-colors ${level === 0 ? 'mt-2' : ''}`}
        style={{ paddingLeft: `${level * 1.5 + 0.75}rem` }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-center w-5 h-5 mr-1 text-slate-400">
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : (
            <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          )}
        </div>
        
        {level === 0 ? (
          <Building2 className="w-4 h-4 mr-2 text-indigo-500" />
        ) : (
          <Layers className="w-4 h-4 mr-2 text-emerald-500" />
        )}
        
        <span className="font-medium text-sm text-slate-800 dark:text-slate-200">
          {unit.name}
        </span>
        
        {unit.code && (
          <span className="ml-2 text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {unit.code}
          </span>
        )}
        
        <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          unit.status === 'Active' 
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' 
            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
        }`}>
          {unit.status}
        </span>
      </div>

      {isExpanded && hasChildren && (
        <div className="flex flex-col relative before:absolute before:left-[1.375rem] before:top-0 before:bottom-0 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
          {children.map(child => (
            <TreeNode 
              key={child.id} 
              unit={child} 
              childrenMap={childrenMap} 
              level={level + 1} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const UnitHierarchyTree: React.FC = () => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'units'), (snapshot) => {
      const fetchedUnits = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      })) as Unit[];
      
      setUnits(fetchedUnits);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-500">
        <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mr-3" />
        Loading hierarchy...
      </div>
    );
  }

  // Build parent-child map
  const childrenMap = new Map<string, Unit[]>();
  const rootUnits: Unit[] = [];

  units.forEach(unit => {
    if (!unit.parentUnitId) {
      rootUnits.push(unit);
    } else {
      if (!childrenMap.has(unit.parentUnitId)) {
        childrenMap.set(unit.parentUnitId, []);
      }
      childrenMap.get(unit.parentUnitId)!.push(unit);
    }
  });

  if (units.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
        <Building2 className="w-8 h-8 mx-auto mb-3 opacity-50" />
        <p className="font-medium text-sm">No units registered yet.</p>
        <p className="text-xs mt-1">Register a new unit to build the hierarchy.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-500" />
          Unit Hierarchy Tree
        </h3>
      </div>
      <div className="p-2 overflow-x-auto">
        <div className="min-w-[400px]">
          {rootUnits.map(rootUnit => (
            <TreeNode 
              key={rootUnit.id} 
              unit={rootUnit} 
              childrenMap={childrenMap} 
              level={0} 
            />
          ))}
        </div>
      </div>
    </div>
  );
};
