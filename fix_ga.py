import re

with open('src/pages/GeneralAffairManager.tsx', 'r') as f:
    content = f.read()

# 1. Add interactive features to MasterDataGA
old_master_data = """const MasterDataGA = () => {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Master Data General Affair</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { title: "Kategori Asset", count: 12, icon: QrCode, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400" },
          { title: "Lokasi Ruangan", count: 48, icon: MapPin, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400" },
          { title: "Data Vendor", count: 24, icon: Users, color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400" },
          { title: "Kendaraan", count: 8, icon: Car, color: "text-rose-600 bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400" },
          { title: "Data Menu Dapur", count: 56, icon: Coffee, color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400" },
          { title: "Kategori Tiket", count: 6, icon: Tag, color: "text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-400" }
        ].map((item, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer group">
            <div className="flex items-center justify-between mb-4">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", item.color)}>
                <item.icon className="w-6 h-6" />
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-1">{item.title}</h4>
            <div className="text-sm text-slate-500">{item.count} items</div>
          </div>
        ))}
      </div>
    </div>
  );
};"""

new_master_data = """const MasterDataGA = () => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [mockItems, setMockItems] = useState([
    { id: 1, name: 'Elektronik', type: 'Kategori Asset' },
    { id: 2, name: 'Furnitur', type: 'Kategori Asset' },
    { id: 3, name: 'Gedung A', type: 'Lokasi Ruangan' },
    { id: 4, name: 'Gedung B', type: 'Lokasi Ruangan' },
  ]);
  const [newItemName, setNewItemName] = useState('');

  const handleAddItem = () => {
    if (!newItemName || !activeCategory) return;
    setMockItems([...mockItems, { id: Date.now(), name: newItemName, type: activeCategory }]);
    setNewItemName('');
  };

  const categories = [
    { title: "Kategori Asset", count: mockItems.filter(i => i.type === 'Kategori Asset').length || 12, icon: QrCode, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400" },
    { title: "Lokasi Ruangan", count: mockItems.filter(i => i.type === 'Lokasi Ruangan').length || 48, icon: MapPin, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400" },
    { title: "Data Vendor", count: mockItems.filter(i => i.type === 'Data Vendor').length || 24, icon: Users, color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400" },
    { title: "Kendaraan", count: mockItems.filter(i => i.type === 'Kendaraan').length || 8, icon: Car, color: "text-rose-600 bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400" },
    { title: "Data Menu Dapur", count: mockItems.filter(i => i.type === 'Data Menu Dapur').length || 56, icon: Coffee, color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400" },
    { title: "Kategori Tiket", count: mockItems.filter(i => i.type === 'Kategori Tiket').length || 6, icon: Tag, color: "text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-400" }
  ];

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Master Data General Affair</h3>
        {activeCategory && (
          <button onClick={() => setActiveCategory(null)} className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> Kembali ke Kategori
          </button>
        )}
      </div>

      {!activeCategory ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {categories.map((item, idx) => (
            <div 
              key={idx} 
              onClick={() => setActiveCategory(item.title)}
              className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer group shadow-sm hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", item.color)}>
                  <item.icon className="w-6 h-6" />
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
              </div>
              <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-1">{item.title}</h4>
              <div className="text-sm text-slate-500">{item.count} items</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm animate-in slide-in-from-right-4">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
            <h4 className="font-medium text-slate-700 dark:text-slate-300">Daftar {activeCategory}</h4>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                placeholder="Tambah data baru..."
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <button 
                onClick={handleAddItem}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Tambah
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {mockItems.filter(i => i.type === activeCategory).length === 0 ? (
              <div className="p-8 text-center text-slate-500">Belum ada data untuk {activeCategory}.</div>
            ) : (
              mockItems.filter(i => i.type === activeCategory).map((item, idx) => (
                <div key={item.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex justify-between items-center group">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 font-mono text-xs">{idx + 1}</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{item.name}</span>
                  </div>
                  <button 
                    onClick={() => setMockItems(mockItems.filter(i => i.id !== item.id))}
                    className="text-rose-500 hover:text-rose-700 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};"""

content = content.replace(old_master_data, new_master_data)

with open('src/pages/GeneralAffairManager.tsx', 'w') as f:
    f.write(content)

