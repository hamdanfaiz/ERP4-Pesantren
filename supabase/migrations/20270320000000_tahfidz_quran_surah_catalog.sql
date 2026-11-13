-- Canonical Quran Surah references for Tahfidz entry.
-- Reference data is global and non-tenant-specific; access is server-only.
BEGIN;

CREATE TABLE IF NOT EXISTS public.quran_surahs (
  surah_number SMALLINT PRIMARY KEY CHECK (surah_number BETWEEN 1 AND 114),
  name_latin TEXT NOT NULL UNIQUE CHECK (length(btrim(name_latin)) BETWEEN 1 AND 80),
  ayah_count SMALLINT NOT NULL CHECK (ayah_count BETWEEN 1 AND 286),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.quran_surahs (surah_number, name_latin, ayah_count)
SELECT seed.surah_number, seed.name_latin, seed.ayah_count
FROM jsonb_to_recordset($quran_catalog$
[
  {"surah_number":1,"name_latin":"Al-Fatihah","ayah_count":7},
  {"surah_number":2,"name_latin":"Al-Baqarah","ayah_count":286},
  {"surah_number":3,"name_latin":"Ali 'Imran","ayah_count":200},
  {"surah_number":4,"name_latin":"An-Nisa'","ayah_count":176},
  {"surah_number":5,"name_latin":"Al-Ma'idah","ayah_count":120},
  {"surah_number":6,"name_latin":"Al-An'am","ayah_count":165},
  {"surah_number":7,"name_latin":"Al-A'raf","ayah_count":206},
  {"surah_number":8,"name_latin":"Al-Anfal","ayah_count":75},
  {"surah_number":9,"name_latin":"At-Taubah","ayah_count":129},
  {"surah_number":10,"name_latin":"Yunus","ayah_count":109},
  {"surah_number":11,"name_latin":"Hud","ayah_count":123},
  {"surah_number":12,"name_latin":"Yusuf","ayah_count":111},
  {"surah_number":13,"name_latin":"Ar-Ra'd","ayah_count":43},
  {"surah_number":14,"name_latin":"Ibrahim","ayah_count":52},
  {"surah_number":15,"name_latin":"Al-Hijr","ayah_count":99},
  {"surah_number":16,"name_latin":"An-Nahl","ayah_count":128},
  {"surah_number":17,"name_latin":"Al-Isra'","ayah_count":111},
  {"surah_number":18,"name_latin":"Al-Kahf","ayah_count":110},
  {"surah_number":19,"name_latin":"Maryam","ayah_count":98},
  {"surah_number":20,"name_latin":"Taha","ayah_count":135},
  {"surah_number":21,"name_latin":"Al-Anbiya'","ayah_count":112},
  {"surah_number":22,"name_latin":"Al-Hajj","ayah_count":78},
  {"surah_number":23,"name_latin":"Al-Mu'minun","ayah_count":118},
  {"surah_number":24,"name_latin":"An-Nur","ayah_count":64},
  {"surah_number":25,"name_latin":"Al-Furqan","ayah_count":77},
  {"surah_number":26,"name_latin":"Asy-Syu'ara'","ayah_count":227},
  {"surah_number":27,"name_latin":"An-Naml","ayah_count":93},
  {"surah_number":28,"name_latin":"Al-Qasas","ayah_count":88},
  {"surah_number":29,"name_latin":"Al-'Ankabut","ayah_count":69},
  {"surah_number":30,"name_latin":"Ar-Rum","ayah_count":60},
  {"surah_number":31,"name_latin":"Luqman","ayah_count":34},
  {"surah_number":32,"name_latin":"As-Sajdah","ayah_count":30},
  {"surah_number":33,"name_latin":"Al-Ahzab","ayah_count":73},
  {"surah_number":34,"name_latin":"Saba'","ayah_count":54},
  {"surah_number":35,"name_latin":"Fatir","ayah_count":45},
  {"surah_number":36,"name_latin":"Yasin","ayah_count":83},
  {"surah_number":37,"name_latin":"As-Saffat","ayah_count":182},
  {"surah_number":38,"name_latin":"Sad","ayah_count":88},
  {"surah_number":39,"name_latin":"Az-Zumar","ayah_count":75},
  {"surah_number":40,"name_latin":"Ghafir","ayah_count":85},
  {"surah_number":41,"name_latin":"Fussilat","ayah_count":54},
  {"surah_number":42,"name_latin":"Asy-Syura","ayah_count":53},
  {"surah_number":43,"name_latin":"Az-Zukhruf","ayah_count":89},
  {"surah_number":44,"name_latin":"Ad-Dukhan","ayah_count":59},
  {"surah_number":45,"name_latin":"Al-Jasiyah","ayah_count":37},
  {"surah_number":46,"name_latin":"Al-Ahqaf","ayah_count":35},
  {"surah_number":47,"name_latin":"Muhammad","ayah_count":38},
  {"surah_number":48,"name_latin":"Al-Fath","ayah_count":29},
  {"surah_number":49,"name_latin":"Al-Hujurat","ayah_count":18},
  {"surah_number":50,"name_latin":"Qaf","ayah_count":45},
  {"surah_number":51,"name_latin":"Az-Zariyat","ayah_count":60},
  {"surah_number":52,"name_latin":"At-Tur","ayah_count":49},
  {"surah_number":53,"name_latin":"An-Najm","ayah_count":62},
  {"surah_number":54,"name_latin":"Al-Qamar","ayah_count":55},
  {"surah_number":55,"name_latin":"Ar-Rahman","ayah_count":78},
  {"surah_number":56,"name_latin":"Al-Waqi'ah","ayah_count":96},
  {"surah_number":57,"name_latin":"Al-Hadid","ayah_count":29},
  {"surah_number":58,"name_latin":"Al-Mujadilah","ayah_count":22},
  {"surah_number":59,"name_latin":"Al-Hasyr","ayah_count":24},
  {"surah_number":60,"name_latin":"Al-Mumtahanah","ayah_count":13},
  {"surah_number":61,"name_latin":"As-Saff","ayah_count":14},
  {"surah_number":62,"name_latin":"Al-Jumu'ah","ayah_count":11},
  {"surah_number":63,"name_latin":"Al-Munafiqun","ayah_count":11},
  {"surah_number":64,"name_latin":"At-Tagabun","ayah_count":18},
  {"surah_number":65,"name_latin":"At-Talaq","ayah_count":12},
  {"surah_number":66,"name_latin":"At-Tahrim","ayah_count":12},
  {"surah_number":67,"name_latin":"Al-Mulk","ayah_count":30},
  {"surah_number":68,"name_latin":"Al-Qalam","ayah_count":52},
  {"surah_number":69,"name_latin":"Al-Haqqah","ayah_count":52},
  {"surah_number":70,"name_latin":"Al-Ma'arij","ayah_count":44},
  {"surah_number":71,"name_latin":"Nuh","ayah_count":28},
  {"surah_number":72,"name_latin":"Al-Jinn","ayah_count":28},
  {"surah_number":73,"name_latin":"Al-Muzzammil","ayah_count":20},
  {"surah_number":74,"name_latin":"Al-Muddassir","ayah_count":56},
  {"surah_number":75,"name_latin":"Al-Qiyamah","ayah_count":40},
  {"surah_number":76,"name_latin":"Al-Insan","ayah_count":31},
  {"surah_number":77,"name_latin":"Al-Mursalat","ayah_count":50},
  {"surah_number":78,"name_latin":"An-Naba'","ayah_count":40},
  {"surah_number":79,"name_latin":"An-Nazi'at","ayah_count":46},
  {"surah_number":80,"name_latin":"'Abasa","ayah_count":42},
  {"surah_number":81,"name_latin":"At-Takwir","ayah_count":29},
  {"surah_number":82,"name_latin":"Al-Infitar","ayah_count":19},
  {"surah_number":83,"name_latin":"Al-Mutaffifin","ayah_count":36},
  {"surah_number":84,"name_latin":"Al-Insyiqaq","ayah_count":25},
  {"surah_number":85,"name_latin":"Al-Buruj","ayah_count":22},
  {"surah_number":86,"name_latin":"At-Tariq","ayah_count":17},
  {"surah_number":87,"name_latin":"Al-A'la","ayah_count":19},
  {"surah_number":88,"name_latin":"Al-Gasyiyah","ayah_count":26},
  {"surah_number":89,"name_latin":"Al-Fajr","ayah_count":30},
  {"surah_number":90,"name_latin":"Al-Balad","ayah_count":20},
  {"surah_number":91,"name_latin":"Asy-Syams","ayah_count":15},
  {"surah_number":92,"name_latin":"Al-Lail","ayah_count":21},
  {"surah_number":93,"name_latin":"Ad-Duha","ayah_count":11},
  {"surah_number":94,"name_latin":"Al-Insyirah","ayah_count":8},
  {"surah_number":95,"name_latin":"At-Tin","ayah_count":8},
  {"surah_number":96,"name_latin":"Al-'Alaq","ayah_count":19},
  {"surah_number":97,"name_latin":"Al-Qadr","ayah_count":5},
  {"surah_number":98,"name_latin":"Al-Bayyinah","ayah_count":8},
  {"surah_number":99,"name_latin":"Az-Zalzalah","ayah_count":8},
  {"surah_number":100,"name_latin":"Al-'Adiyat","ayah_count":11},
  {"surah_number":101,"name_latin":"Al-Qari'ah","ayah_count":11},
  {"surah_number":102,"name_latin":"At-Takasur","ayah_count":8},
  {"surah_number":103,"name_latin":"Al-'Asr","ayah_count":3},
  {"surah_number":104,"name_latin":"Al-Humazah","ayah_count":9},
  {"surah_number":105,"name_latin":"Al-Fil","ayah_count":5},
  {"surah_number":106,"name_latin":"Quraisy","ayah_count":4},
  {"surah_number":107,"name_latin":"Al-Ma'un","ayah_count":7},
  {"surah_number":108,"name_latin":"Al-Kausar","ayah_count":3},
  {"surah_number":109,"name_latin":"Al-Kafirun","ayah_count":6},
  {"surah_number":110,"name_latin":"An-Nasr","ayah_count":3},
  {"surah_number":111,"name_latin":"Al-Lahab","ayah_count":5},
  {"surah_number":112,"name_latin":"Al-Ikhlas","ayah_count":4},
  {"surah_number":113,"name_latin":"Al-Falaq","ayah_count":5},
  {"surah_number":114,"name_latin":"An-Nas","ayah_count":6}
]
$quran_catalog$::jsonb) AS seed(surah_number SMALLINT, name_latin TEXT, ayah_count SMALLINT)
ON CONFLICT (surah_number) DO UPDATE
SET name_latin = EXCLUDED.name_latin,
    ayah_count = EXCLUDED.ayah_count;

DO $$
DECLARE
  v_count INTEGER;
  v_total_ayahs INTEGER;
BEGIN
  SELECT count(*), sum(ayah_count)::INTEGER
  INTO v_count, v_total_ayahs
  FROM public.quran_surahs;
  IF v_count <> 114 OR v_total_ayahs <> 6236
    OR (SELECT min(surah_number) FROM public.quran_surahs) <> 1
    OR (SELECT max(surah_number) FROM public.quran_surahs) <> 114 THEN
    RAISE EXCEPTION 'Katalog Surah tidak lengkap atau jumlah ayat tidak konsisten';
  END IF;
END;
$$;

ALTER TABLE public.tahfidz_records
  ADD COLUMN IF NOT EXISTS surah_number SMALLINT;

UPDATE public.tahfidz_records AS record
SET surah_number = catalog.surah_number
FROM public.quran_surahs AS catalog
WHERE lower(btrim(record.surah_name)) = lower(catalog.name_latin);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tahfidz_records'::regclass
      AND conname = 'tahfidz_records_surah_number_fk'
  ) THEN
    ALTER TABLE public.tahfidz_records
      ADD CONSTRAINT tahfidz_records_surah_number_fk
      FOREIGN KEY (surah_number) REFERENCES public.quran_surahs(surah_number) ON DELETE RESTRICT;
  END IF;
END;
$$;

ALTER TABLE public.quran_surahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quran_surahs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quran_surahs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.quran_surahs TO service_role;
COMMENT ON TABLE public.quran_surahs IS
  'Referensi global nomor dan jumlah ayat per Surah; hanya dapat dibaca server tepercaya.';

CREATE OR REPLACE FUNCTION public.validate_tahfidz_quran_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_catalog public.quran_surahs%ROWTYPE;
BEGIN
  SELECT * INTO v_catalog
  FROM public.quran_surahs
  WHERE lower(name_latin) = lower(btrim(COALESCE(NEW.surah_name, '')));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Surah setoran tidak ditemukan pada katalog referensi' USING ERRCODE = '23514';
  END IF;
  IF NEW.surah_number IS NOT NULL AND NEW.surah_number <> v_catalog.surah_number THEN
    RAISE EXCEPTION 'Nomor Surah tidak sesuai dengan nama Surah' USING ERRCODE = '23514';
  END IF;
  IF NEW.ayah_start IS NULL OR NEW.ayah_end IS NULL
    OR NEW.ayah_start < 1 OR NEW.ayah_end < NEW.ayah_start
    OR NEW.ayah_end > v_catalog.ayah_count THEN
    RAISE EXCEPTION 'Rentang ayat melampaui jumlah ayat Surah' USING ERRCODE = '23514';
  END IF;

  NEW.surah_number := v_catalog.surah_number;
  NEW.surah_name := v_catalog.name_latin;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tahfidz_records_validate_quran_reference_insert ON public.tahfidz_records;
CREATE TRIGGER tahfidz_records_validate_quran_reference_insert
  BEFORE INSERT ON public.tahfidz_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_tahfidz_quran_reference();

DROP TRIGGER IF EXISTS tahfidz_records_validate_quran_reference_update ON public.tahfidz_records;
CREATE TRIGGER tahfidz_records_validate_quran_reference_update
  BEFORE UPDATE OF surah_name, surah_number, ayah_start, ayah_end
  ON public.tahfidz_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_tahfidz_quran_reference();

REVOKE ALL ON FUNCTION public.validate_tahfidz_quran_reference() FROM PUBLIC, anon, authenticated;
COMMENT ON COLUMN public.tahfidz_records.surah_number IS
  'Relasi opsional untuk riwayat lama; seluruh setoran baru diikat ke katalog Surah oleh trigger.';

COMMIT;


