import re

with open('src/pages/GeneralAffairManager.tsx', 'r') as f:
    content = f.read()

# Add Firestore imports
if "import { db }" not in content:
    content = content.replace(
        "import React, { useState } from 'react';", 
        "import React, { useState, useEffect } from 'react';\nimport { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';\nimport { db } from '../firebase';"
    )

# Add Pencil icon
if "Pencil" not in content:
    content = content.replace("CheckCircle, Tag,", "CheckCircle, Tag, Pencil,")

with open('src/pages/GeneralAffairManager.tsx', 'w') as f:
    f.write(content)
