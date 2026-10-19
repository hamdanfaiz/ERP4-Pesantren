with open('src/pages/GeneralAffairManager.tsx', 'r') as f:
    content = f.read()

old_code = """      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setItems(data);
      }, (error) => {"""

new_code = """      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a: any, b: any) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return tB - tA;
        });
        setItems(data);
      }, (error) => {"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('src/pages/GeneralAffairManager.tsx', 'w') as f:
        f.write(content)
    print("Patched successfully")
else:
    print("Not found")
