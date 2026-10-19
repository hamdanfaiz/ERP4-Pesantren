import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateUniqueId(category: string, existingData?: any[]) {
  const consonants = category.toUpperCase().replace(/[^A-Z]/g, '').replace(/[AEIOU]/g, '');
  const prefix = (consonants.substring(0, 3) + 'XXX').substring(0, 3);
  
  if (existingData && existingData.length > 0) {
    let maxSeq = 0;
    existingData.forEach(item => {
      if (item.id && item.id.startsWith(`${prefix}-`)) {
        const seqStr = item.id.substring(4);
        const seq = parseInt(seqStr, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });
    const nextSeq = (maxSeq + 1).toString().padStart(4, '0');
    return `${prefix}-${nextSeq}`;
  }
  
  const nextSeq = Math.floor(1000 + Math.random() * 9000).toString();
  return `${prefix}-${nextSeq}`;
}
