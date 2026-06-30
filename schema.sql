-- ============================================================
-- TinaBeauty — Schéma Supabase
-- Exécutez ce script dans l'éditeur SQL de votre projet Supabase
-- ============================================================

-- Table : prestations
CREATE TABLE IF NOT EXISTS public.prestations (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nom        TEXT        NOT NULL,
  prix       NUMERIC(10,2) NOT NULL DEFAULT 0,
  categorie  TEXT        NOT NULL DEFAULT 'Esthétique'
              CHECK (categorie IN ('Onglerie', 'Esthétique')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table : clientes
CREATE TABLE IF NOT EXISTS public.clientes (
  id         UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
  nom        TEXT,
  prenom     TEXT,
  telephone  TEXT,
  telephone2 TEXT,
  instagram  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table : rendezvous
CREATE TABLE IF NOT EXISTS public.rendezvous (
  id          UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
  date        DATE  NOT NULL,
  creneau     TEXT  NOT NULL,
  cliente_id  UUID  REFERENCES public.clientes(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Table pivot : rendezvous ↔ prestations
CREATE TABLE IF NOT EXISTS public.rendezvous_prestations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rendezvous_id   UUID REFERENCES public.rendezvous(id)  ON DELETE CASCADE,
  prestation_id   UUID REFERENCES public.prestations(id) ON DELETE CASCADE
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_rdv_date        ON public.rendezvous(date);
CREATE INDEX IF NOT EXISTS idx_rdv_cliente     ON public.rendezvous(cliente_id);
CREATE INDEX IF NOT EXISTS idx_rdvp_rdv        ON public.rendezvous_prestations(rendezvous_id);
CREATE INDEX IF NOT EXISTS idx_rdvp_prest      ON public.rendezvous_prestations(prestation_id);

-- ⚠️  Désactiver RLS pour une application mono-utilisateur sans auth
--     (ou configurer des policies si vous ajoutez une authentification)
ALTER TABLE public.prestations          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rendezvous           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rendezvous_prestations DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- DONNÉES EXEMPLES — Supprimez ou adaptez selon vos besoins
-- ============================================================

INSERT INTO public.prestations (nom, prix, categorie) VALUES
  ('Pose gel couleur',        2500,  'Onglerie'),
  ('Manucure classique',      1200,  'Onglerie'),
  ('Dépose gel',               800,  'Onglerie'),
  ('French gel',              2800,  'Onglerie'),
  ('Baby boomer',             3000,  'Onglerie'),
  ('Nail art (motif)',        3500,  'Onglerie'),
  ('Épilation sourcils',       500,  'Esthétique'),
  ('Épilation lèvre supérieure', 400, 'Esthétique'),
  ('Épilation jambes complètes', 1800,'Esthétique'),
  ('Soin du visage hydratant', 3000, 'Esthétique'),
  ('Masque purifiant',        2000,  'Esthétique'),
  ('Maquillage occasion',     4000,  'Esthétique')
ON CONFLICT DO NOTHING;

INSERT INTO public.clientes (nom, prenom, telephone) VALUES
  ('Bensalem',  'Amira',   '0550 12 34 56'),
  ('Hadj Ali',  'Nadia',   '0661 78 90 12'),
  ('Boudiaf',   'Sara',    '0770 23 45 67'),
  ('Mekki',     'Lynda',   '0555 34 56 78'),
  ('Zeroual',   'Imane',   '0699 45 67 89'),
  ('Kerboua',   'Asma',    '0560 11 22 33'),
  ('Ouali',     'Sabrina', '0771 44 55 66'),
  ('Mansouri',  'Yasmine', '0662 77 88 99')
ON CONFLICT DO NOTHING;
