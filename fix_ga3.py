import re

with open('src/pages/GeneralAffairManager.tsx', 'r') as f:
    content = f.read()

old_code = """  useEffect(() => {
    const q = query(collection(db, 'master_data'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(data);
    }, (error) => {
      console.error("Error fetching master data:", error);
    });
    return () => unsubscribe();
  }, []);"""

new_code = """  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const q = query(collection(db, 'master_data'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setItems(data);
      }, (error) => {
        console.error("Error fetching master data:", error);
        setErrorMsg(error.message);
      });
      return () => unsubscribe();
    } catch (e: any) {
      console.error("Crash in useEffect:", e);
      setErrorMsg(e.message);
    }
  }, []);"""

if old_code in content:
    content = content.replace(old_code, new_code)
    
    # Also inject errorMsg into the UI
    render_old = """      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Master Data General Affair</h3>"""
    render_new = """      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Master Data General Affair</h3>
        {errorMsg && <div className="text-red-500 text-sm bg-red-100 p-2 rounded">{errorMsg}</div>}"""
    content = content.replace(render_old, render_new)

    with open('src/pages/GeneralAffairManager.tsx', 'w') as f:
        f.write(content)
    print("Patched successfully")
else:
    print("old_code not found")
