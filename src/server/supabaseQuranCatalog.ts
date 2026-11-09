type SurahReferenceRow = {
  surah_number: number;
  name_latin: string;
  ayah_count: number;
};

export type QuranSurahReference = {
  nomor: number;
  namaLatin: string;
  jumlahAyat: number;
};

export class SupabaseQuranCatalogError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseQuranCatalogError";
    this.status = status;
  }
}

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) {
    throw new SupabaseQuranCatalogError(503, "Katalog Surah belum tersedia.");
  }
  return { baseUrl, serviceKey };
}

export async function listSupabaseQuranSurahs(): Promise<QuranSurahReference[]> {
  const { baseUrl, serviceKey } = serviceConfig();
  const params = new URLSearchParams({
    select: "surah_number,name_latin,ayah_count",
    order: "surah_number.asc",
    limit: "115",
  });
  const headers = new Headers({ apikey: serviceKey, Accept: "application/json" });
  if (!serviceKey.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${serviceKey}`);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/rest/v1/quran_surahs?${params}`, {
      headers,
      cache: "no-store",
    });
  } catch (error: any) {
    console.error("Supabase Quran catalog request failed:", error?.name || "error");
    throw new SupabaseQuranCatalogError(503, "Katalog Surah belum dapat dimuat. Silakan coba kembali.");
  }

  if (!response.ok) {
    console.error("Supabase Quran catalog returned:", response.status);
    throw new SupabaseQuranCatalogError(503, "Katalog Surah belum dapat dimuat. Silakan coba kembali.");
  }

  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    throw new SupabaseQuranCatalogError(503, "Katalog Surah belum dapat dimuat. Silakan coba kembali.");
  }
  if (!Array.isArray(rows) || rows.length !== 114) {
    throw new SupabaseQuranCatalogError(503, "Katalog Surah belum lengkap. Silakan hubungi administrator.");
  }

  const catalog = rows.map((row: SurahReferenceRow, index: number) => {
    const expectedNumber = index + 1;
    if (Number(row?.surah_number) !== expectedNumber
      || typeof row?.name_latin !== "string"
      || !row.name_latin.trim()
      || !Number.isInteger(Number(row?.ayah_count))
      || Number(row.ayah_count) < 1
      || Number(row.ayah_count) > 286) {
      throw new SupabaseQuranCatalogError(503, "Katalog Surah belum valid. Silakan hubungi administrator.");
    }
    return {
      nomor: expectedNumber,
      namaLatin: row.name_latin.trim(),
      jumlahAyat: Number(row.ayah_count),
    };
  });

  const uniqueNames = new Set(catalog.map((surah) => surah.namaLatin.toLocaleLowerCase("id-ID")));
  if (uniqueNames.size !== 114) {
    throw new SupabaseQuranCatalogError(503, "Katalog Surah berisi nama duplikat. Silakan hubungi administrator.");
  }
  return catalog;
}
