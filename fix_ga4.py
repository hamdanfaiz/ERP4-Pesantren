with open('src/pages/GeneralAffairManager.tsx', 'r') as f:
    content = f.read()

content = content.replace("query(collection(db, 'master_data'), orderBy('createdAt', 'desc'))", "query(collection(db, 'master_data'))")

with open('src/pages/GeneralAffairManager.tsx', 'w') as f:
    f.write(content)
