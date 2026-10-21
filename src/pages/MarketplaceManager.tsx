import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import { useAuth } from '../contexts/AuthContext';
import React, { useState, useMemo, useEffect } from 'react';
import { 
  ShoppingBag, Search, Plus, Filter, LayoutGrid, Package, 
  ShoppingCart, Store, TrendingUp, Tag, Star, Clock, CheckCircle2, Truck, Activity, X
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, AreaChart, Area } from 'recharts';
import { cn } from '../lib/utils';
import { collection, onSnapshot, addDoc, updateDoc, doc, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../firebaseUtils';

// MOCK DATA (Fallback)
const INITIAL_PRODUCTS = [
  { id: 'P-001', name: 'Seragam Lengkap Putra (SMP)', category: 'Uniforms', price: 350000, stock: 150, rating: 4.8, seller: 'Koperasi', image: '👕' },
  { id: 'P-002', name: 'Kitab Fathul Qorib Berharakat', category: 'Books', price: 45000, stock: 300, rating: 4.9, seller: 'Koperasi', image: '📚' },
  { id: 'P-003', name: 'Robusta Coffee Bean (250g)', category: 'Student Biz', price: 45000, stock: 50, rating: 4.7, seller: 'Kantin Kls 12', image: '☕' },
  { id: 'P-004', name: 'Jilbab Bergo Instan', category: 'Uniforms', price: 65000, stock: 120, rating: 4.9, seller: 'Koperasi', image: '🧕' },
  { id: 'P-005', name: 'Kaligrafi Kayu Jati 3D', category: 'Student Biz', price: 1500000, stock: 3, rating: 5.0, seller: 'Ekskul Kriya', image: '🖼️' },
  { id: 'P-006', name: 'Totebag As-Salam', category: 'Merchandise', price: 65000, stock: 80, rating: 4.5, seller: 'Alumni Store', image: '👜' },
  { id: 'P-007', name: 'Madu Hutan Liar (500ml)', category: 'Student Biz', price: 120000, stock: 35, rating: 4.8, seller: 'Koperasi', image: '🍯' },
  { id: 'P-008', name: 'Buku Tulis Custom (Pack 10)', category: 'Books', price: 40000, stock: 500, rating: 4.6, seller: 'Koperasi', image: '📓' },
];

const CATEGORIES = ['All', 'Uniforms', 'Books', 'Student Biz', 'Merchandise'];

const INITIAL_ORDERS = [
  { id: 'ORD-1001', customer: 'Ibu Rahma', type: 'Parent', date: '2026-06-15 14:30', total: 415000, status: 'Processing', items: 2 },
  { id: 'ORD-1002', customer: 'Budi Santoso', type: 'Alumni', date: '2026-06-15 09:15', total: 65000, status: 'Ready to Ship', items: 1 },
  { id: 'ORD-1003', customer: 'Ahmad Fadil', type: 'Public', date: '2026-06-14 10:20', total: 1500000, status: 'Delivered', items: 1 },
  { id: 'ORD-1004', customer: 'Hj. Siti Hawa', type: 'Parent', date: '2026-06-16 08:00', total: 255000, status: 'Pending', items: 3 },
  { id: 'ORD-1005', customer: 'Faisal Akbar', type: 'Alumni', date: '2026-06-12 11:45', total: 180000, status: 'Delivered', items: 2 },
];

const SALES_DATA = [
  { name: 'Mon', uniform: 4000, books: 2400, biz: 1500 },
  { name: 'Tue', uniform: 3000, books: 1398, biz: 2000 },
  { name: 'Wed', uniform: 2000, books: 9800, biz: 2500 },
  { name: 'Thu', uniform: 2780, books: 3908, biz: 3000 },
  { name: 'Fri', uniform: 1890, books: 4800, biz: 4000 },
  { name: 'Sat', uniform: 2390, books: 3800, biz: 6000 },
  { name: 'Sun', uniform: 3490, books: 4300, biz: 8000 },
];

export function MarketplaceManager() {
  const { user, role } = useAuth();
  const canManageMarketplaceOrders = ['Admin', 'SuperAdmin'].includes(role);
  const [activeTab, setActiveTab] = useState<'storefront' | 'orders' | 'inventory' | 'analytics'>('storefront');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<any[]>(INITIAL_PRODUCTS);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', category: 'Uniforms', price: 0, stock: 0, seller: 'Koperasi', image: '📦' });
  const [orders, setOrders] = useState<any[]>(INITIAL_ORDERS);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  useEffect(() => {
    let seededProducts = false;
    let seededOrders = false;

    const unsubProducts = onSnapshot(tenantScopedQuery(collection(db, 'marketplace_products'), user?.tenantId), async (snapshot) => {
      if (snapshot.empty && !seededProducts) {
        seededProducts = true;
        for (const p of INITIAL_PRODUCTS) {
          try {
            const scopedId = `${user?.tenantId || '__tenant_scope_unavailable__'}__${p.id}`;
            await setDoc(doc(db, 'marketplace_products', scopedId), tenantRecord(user?.tenantId, { ...p, id: scopedId }));
          } catch (e) {
            console.error('Error seeding product', e);
          }
        }
      } else if (!snapshot.empty) {
        setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })));
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'marketplace_products'));
    
    const ordersQuery = tenantScopedQuery(collection(db, 'marketplace_orders'), user?.tenantId, ...(canManageMarketplaceOrders ? [] : [where('createdByUid', '==', user?.uid || '__tenant_scope_unavailable__')]));
    const unsubOrders = onSnapshot(ordersQuery, async (snapshot) => {
      if (snapshot.empty && !seededOrders && canManageMarketplaceOrders) {
        seededOrders = true;
        for (const o of INITIAL_ORDERS) {
          try {
            const scopedId = `${user?.tenantId || '__tenant_scope_unavailable__'}__${o.id}`;
            await setDoc(doc(db, 'marketplace_orders', scopedId), tenantRecord(user?.tenantId, { ...o, id: scopedId, createdByUid: user?.uid }));
          } catch (e) {
            console.error('Error seeding order', e);
          }
        }
      } else if (!snapshot.empty) {
        setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'marketplace_orders'));

    return () => {
      unsubProducts();
      unsubOrders();
    };
  }, [user?.tenantId, user?.uid, role, user?.modulePermissions?.marketplace]);

  const [cart, setCart] = useState<{product: any, quantity: number}[]>([]);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [checkoutDetails, setCheckoutDetails] = useState({ customer: '', type: 'Parent' });

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQuantity = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const executeTransaction = async () => {
    if (cart.length === 0 || !checkoutDetails.customer) return;

    const newOrder = {
      createdByUid: user?.uid,
      customer: checkoutDetails.customer,
      type: checkoutDetails.type,
      date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      total: cartTotal,
      status: 'Pending',
      items: cartItemsCount
    };

    try {
      await addDoc(collection(db, 'marketplace_orders'), tenantRecord(user?.tenantId, newOrder));
      
      // Inventory changes require a manager; shopper orders never write product stock.
      if (canManageMarketplaceOrders) for (const item of cart) {
        if (item.product.id && !item.product.id.startsWith('P-')) { // Avoid updating mock items if they don't have a real id
          const productRef = doc(db, 'marketplace_products', item.product.id);
          await updateDoc(productRef, {
            stock: Math.max(0, item.product.stock - item.quantity)
          });
        }
      }
      
      setCart([]);
      setIsCartModalOpen(false);
      setCheckoutDetails({ customer: '', type: 'Parent' });
      setActiveTab('orders');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'marketplace_orders');
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      (selectedCategory === 'All' || p.category === selectedCategory) &&
      p.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [selectedCategory, search, products]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Store className="w-8 h-8 text-pink-500" />
            DPesantren Marketplace
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            E-commerce hub connecting parents, alumni, and public to student products & uniform sales.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg overflow-x-auto w-full md:w-auto">
            {(['storefront', 'orders', 'inventory', 'analytics'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-medium transition-all capitalize whitespace-nowrap",
                  activeTab === tab 
                    ? "bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setIsCartModalOpen(true)}
            className="relative p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <ShoppingCart className="w-6 h-6" />
            {cartItemsCount > 0 && (
              <span className="absolute top-0 right-0 w-5 h-5 bg-pink-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white dark:border-slate-950">
                {cartItemsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mt-6">
        {activeTab === 'storefront' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {CATEGORIES.map(c => (
                  <button 
                    key={c}
                    onClick={() => setSelectedCategory(c)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border",
                      selectedCategory === c 
                        ? "bg-pink-600 text-white border-pink-600" 
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="relative w-full md:w-64 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search products..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full text-sm focus:outline-none focus:border-pink-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 ml:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredProducts.map(p => (
                <div key={p.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group cursor-pointer flex flex-col">
                  <div className="h-40 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-6xl relative">
                    {p.image}
                    <div className="absolute top-2 right-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur px-2 py-1 rounded-md text-xs font-bold shadow-sm flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" /> {p.rating}
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-pink-500 tracking-wider mb-1 block">
                      {p.category}
                    </span>
                    <h3 className="font-bold text-slate-900 dark:text-white leading-tight mb-2 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors line-clamp-2">
                      {p.name}
                    </h3>
                    <p className="text-xs text-slate-500 mb-4 flex items-center gap-1">
                      <Store className="w-3 h-3" /> {p.seller}
                    </p>
                    <div className="mt-auto flex items-end justify-between">
                      <div>
                        <div className="text-lg font-bold text-slate-900 dark:text-white">
                          Rp {p.price.toLocaleString('id-ID')}
                        </div>
                        <div className="text-xs text-slate-500">Stock: {p.stock}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); addToCart(p); }} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-pink-600 hover:text-white transition-colors">
                        <ShoppingBag className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredProducts.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No products found matching your criteria.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-6 animate-in fade-in duration-300">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
               <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-200">12</h4>
                    <p className="text-sm border-slate-500 text-slate-500 font-medium">Pending Orders</p>
                  </div>
               </div>
               <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-200">28</h4>
                    <p className="text-sm border-slate-500 text-slate-500 font-medium">Ready / Shipped</p>
                  </div>
               </div>
               <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-200">156</h4>
                    <p className="text-sm border-slate-500 text-slate-500 font-medium">Delivered (This Month)</p>
                  </div>
               </div>
             </div>

             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 dark:text-slate-200">Recent Orders</h3>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition">Export</button>
                  </div>
                </div>
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Order ID</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Customer</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Date/Time</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Status</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                     {orders.map(order => (
                       <tr key={order.id} onClick={() => setSelectedOrder(order)} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                          <td className="px-6 py-4">
                             <div className="font-mono text-pink-600 dark:text-pink-400 font-medium">{order.id}</div>
                             <div className="text-xs text-slate-500">{order.items} item(s)</div>
                          </td>
                          <td className="px-6 py-4">
                             <div className="font-bold text-slate-800 dark:text-slate-200">{order.customer}</div>
                             <div className="text-xs text-slate-500">{order.type}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                             {order.date}
                          </td>
                          <td className="px-6 py-4">
                             <span className={cn(
                               "px-2.5 py-1 text-xs font-bold rounded-md flex items-center w-max gap-1.5 uppercase tracking-wider",
                               order.status === 'Processing' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                               order.status === 'Pending' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                               order.status === 'Ready to Ship' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                               "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                             )}>
                               {order.status === 'Processing' && <Activity className="w-3 h-3" />}
                               {order.status === 'Ready to Ship' && <Truck className="w-3 h-3" />}
                               {order.status === 'Delivered' && <CheckCircle2 className="w-3 h-3" />}
                               {order.status === 'Pending' && <Clock className="w-3 h-3" />}
                               {order.status}
                             </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                             <div className="font-bold text-slate-800 dark:text-slate-200">
                               Rp {order.total.toLocaleString('id-ID')}
                             </div>
                             <button className="text-xs text-pink-500 hover:underline mt-1">View Details</button>
                          </td>
                       </tr>
                     ))}
                  </tbody>
                </table>
             </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in duration-300">
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               {[
                 { title: 'Total Revenue', value: 'Rp 45.2M', trend: '+12.5%', isUp: true },
                 { title: 'Orders Today', value: '34', trend: '+5.2%', isUp: true },
                 { title: 'Avg. Order Value', value: 'Rp 340K', trend: '-2.1%', isUp: false },
                 { title: 'Conversion Rate', value: '4.8%', trend: '+0.4%', isUp: true },
               ].map((stat, i) => (
                 <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <p className="text-sm text-slate-500 font-medium">{stat.title}</p>
                    <p className="text-3xl font-bold text-slate-800 dark:text-white mt-2">{stat.value}</p>
                    <p className={cn("text-xs flex items-center gap-1 mt-2 font-medium", stat.isUp ? "text-emerald-500" : "text-rose-500")}>
                       <TrendingUp className={cn("w-3 h-3", !stat.isUp && "rotate-180")} /> {stat.trend} from last week
                    </p>
                 </div>
               ))}
             </div>

             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
                 <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6">Sales Category Trend (Weekly)</h3>
                 <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                       <AreaChart data={SALES_DATA} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                         <defs>
                           <linearGradient id="colorUniform" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#ec4899" stopOpacity={0.8}/>
                             <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                           </linearGradient>
                           <linearGradient id="colorBooks" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                             <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                           </linearGradient>
                           <linearGradient id="colorBiz" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                             <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                           </linearGradient>
                         </defs>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                         <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                         <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                         <Tooltip contentStyle={{ backgroundColor: 'rgb(30, 41, 59)', border: 'none', borderRadius: '8px', color: '#fff' }} />
                         <Area type="monotone" dataKey="uniform" stroke="#ec4899" fillOpacity={1} fill="url(#colorUniform)" stackId="1" />
                         <Area type="monotone" dataKey="books" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorBooks)" stackId="1" />
                         <Area type="monotone" dataKey="biz" stroke="#10b981" fillOpacity={1} fill="url(#colorBiz)" stackId="1" />
                       </AreaChart>
                    </ResponsiveContainer>
                 </div>
             </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-4">
               <div>
                 <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Inventory Management</h2>
                 <p className="text-slate-500 text-sm">Manage products, verify student entrepreneur seller accounts, and sync inventory from cooperative.</p>
               </div>
               <button 
                 onClick={() => setIsAddProductModalOpen(true)}
                 className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-medium transition text-sm">
                 <Plus className="w-4 h-4" /> Add New Product
               </button>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Product</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Category</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Price</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Stock</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Seller</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                     {products.map(product => (
                       <tr key={product.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-xl">
                                   {product.image}
                                </div>
                                <div>
                                   <div className="font-bold text-slate-800 dark:text-slate-200">{product.name}</div>
                                   <div className="text-xs text-slate-500 font-mono">{product.id}</div>
                                </div>
                             </div>
                          </td>
                          <td className="px-6 py-4">
                             <span className="px-2.5 py-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-md text-xs font-medium">
                               {product.category}
                             </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">
                             Rp {product.price.toLocaleString('id-ID')}
                          </td>
                          <td className="px-6 py-4">
                             <span className={cn(
                               "font-medium",
                               product.stock < 10 ? "text-rose-500" : "text-slate-700 dark:text-slate-300"
                             )}>
                               {product.stock} units
                             </span>
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                             {product.seller}
                          </td>
                          <td className="px-6 py-4 text-right">
                             <button className="text-pink-600 dark:text-pink-400 hover:underline text-xs font-medium">Edit</button>
                          </td>
                       </tr>
                     ))}
                  </tbody>
                </table>
             </div>
          </div>
        )}
      </div>

      {isAddProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add New Product</h3>
              <button onClick={() => setIsAddProductModalOpen(false)} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
                 <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Product Name</label>
                <input type="text" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                <select value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500">
                  {CATEGORIES.filter(c => c !== 'All').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Price (Rp)</label>
                  <input type="number" value={newProduct.price || ''} onChange={e => setNewProduct({...newProduct, price: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Stock</label>
                  <input type="number" value={newProduct.stock || ''} onChange={e => setNewProduct({...newProduct, stock: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Seller / Vendor</label>
                <input type="text" value={newProduct.seller} onChange={e => setNewProduct({...newProduct, seller: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500" />
              </div>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button onClick={() => setIsAddProductModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
              <button onClick={async () => {
                if (newProduct.name && newProduct.price > 0) {
                  try {
                    await addDoc(collection(db, 'marketplace_products'), tenantRecord(user?.tenantId, {
                      ...newProduct,
                      rating: 0
                    }));
                    setIsAddProductModalOpen(false);
                    setNewProduct({ name: '', category: 'Uniforms', price: 0, stock: 0, seller: 'Koperasi', image: '📦' });
                  } catch (error) {
                    handleFirestoreError(error, OperationType.CREATE, 'marketplace_products');
                  }
                }
              }} className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white text-sm font-medium rounded-lg transition-colors">Add Product</button>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Order Details</h3>
              <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
                 <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h4 className="text-xl font-bold text-slate-800 dark:text-slate-200 font-mono">{selectedOrder.id}</h4>
                  <p className="text-sm text-slate-500">{selectedOrder.date}</p>
                </div>
                <span className={cn(
                  "px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 uppercase tracking-wider",
                  selectedOrder.status === 'Processing' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                  selectedOrder.status === 'Pending' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                  selectedOrder.status === 'Ready to Ship' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                )}>
                  {selectedOrder.status}
                </span>
              </div>
              
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                     <p className="text-xs text-slate-500 font-medium mb-1">Customer</p>
                     <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{selectedOrder.customer}</p>
                     <p className="text-xs text-slate-500">{selectedOrder.type}</p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                     <p className="text-xs text-slate-500 font-medium mb-1">Total Amount</p>
                     <p className="text-lg font-bold text-pink-600 dark:text-pink-400">Rp {selectedOrder.total.toLocaleString('id-ID')}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Update Status</label>
                <select 
                  value={selectedOrder.status} 
                  onChange={async e => {
                    const newStatus = e.target.value;
                    setSelectedOrder({...selectedOrder, status: newStatus});
                    if (selectedOrder.id && !selectedOrder.id.startsWith('ORD-100')) {
                      try {
                        await updateDoc(doc(db, 'marketplace_orders', selectedOrder.id), {
                          status: newStatus
                        });
                      } catch (error) {
                        handleFirestoreError(error, OperationType.UPDATE, 'marketplace_orders');
                      }
                    } else {
                      setOrders(orders.map(o => o.id === selectedOrder.id ? {...o, status: newStatus} : o));
                    }
                  }} 
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500">
                  <option value="Pending">Pending</option>
                  <option value="Processing">Processing</option>
                  <option value="Ready to Ship">Ready to Ship</option>
                  <option value="Delivered">Delivered</option>
                </select>
              </div>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button onClick={() => setSelectedOrder(null)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
      {isCartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-pink-600" />
                Your Cart
              </h3>
              <button onClick={() => setIsCartModalOpen(false)} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
                 <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">Your cart is empty.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map(item => (
                    <div key={item.product.id} className="flex gap-4 p-4 border border-slate-100 dark:border-slate-800 rounded-lg">
                      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-3xl shrink-0">
                        {item.product.image}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm leading-tight mb-1">{item.product.name}</h4>
                        <div className="text-pink-600 dark:text-pink-400 font-bold text-sm mb-2">Rp {item.product.price.toLocaleString('id-ID')}</div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg">
                            <button onClick={() => updateQuantity(item.product.id, -1)} className="px-2.5 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-bold">-</button>
                            <span className="text-sm font-medium w-8 text-center">{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.product.id, 1)} className="px-2.5 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-bold">+</button>
                          </div>
                          <button onClick={() => removeFromCart(item.product.id)} className="text-xs text-rose-500 hover:underline">Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-slate-500 font-medium">Total Amount:</span>
                      <span className="text-xl font-bold text-slate-800 dark:text-white">Rp {cartTotal.toLocaleString('id-ID')}</span>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Customer Name</label>
                        <input type="text" value={checkoutDetails.customer} onChange={e => setCheckoutDetails({...checkoutDetails, customer: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500" placeholder="Enter customer name" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Customer Type</label>
                        <select value={checkoutDetails.type} onChange={e => setCheckoutDetails({...checkoutDetails, type: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500">
                          <option value="Parent">Parent</option>
                          <option value="Alumni">Alumni</option>
                          <option value="Public">Public</option>
                          <option value="Student">Student</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsCartModalOpen(false)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors">Cancel</button>
              <button onClick={executeTransaction} disabled={cart.length === 0 || !checkoutDetails.customer} className="px-6 py-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                Checkout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

