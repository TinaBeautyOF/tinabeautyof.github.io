-- ============================================================
-- TinaBeauty — Mise à jour de la base de données
-- Exécutez ce script dans l'éditeur SQL de Supabase
-- ============================================================

-- 1. Nouvelle table : catégories dynamiques
CREATE TABLE IF NOT EXISTS public.categories (
  id         UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
  nom        TEXT  NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.categories DISABLE ROW LEVEL SECURITY;

-- 2. Migrer les catégories existantes depuis prestations
INSERT INTO public.categories (nom)
SELECT DISTINCT categorie FROM public.prestations
ON CONFLICT (nom) DO NOTHING;

-- Ajouter aussi les catégories par défaut si pas déjà là
INSERT INTO public.categories (nom) VALUES ('Onglerie'), ('Esthétique')
ON CONFLICT (nom) DO NOTHING;

-- 3. Supprimer la contrainte CHECK fixe sur prestations.categorie
--    (elle bloquait les nouvelles catégories)
ALTER TABLE public.prestations
DROP CONSTRAINT IF EXISTS prestations_categorie_check;

-- 4. Ajouter le champ statut dans rendezvous
ALTER TABLE public.rendezvous
ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'en_attente';

-- Mettre à jour les lignes existantes (NULL → en_attente)
UPDATE public.rendezvous SET statut = 'en_attente' WHERE statut IS NULL;

-- Rendre le champ obligatoire
ALTER TABLE public.rendezvous ALTER COLUMN statut SET NOT NULL;
ALTER TABLE public.rendezvous ALTER COLUMN statut SET DEFAULT 'en_attente';

-- Contrainte sur les valeurs autorisées
ALTER TABLE public.rendezvous
DROP CONSTRAINT IF EXISTS rendezvous_statut_check;
ALTER TABLE public.rendezvous
ADD CONSTRAINT rendezvous_statut_check
CHECK (statut IN ('en_attente', 'presente', 'absente'));

-- ============================================================
-- Vérification : les 5 tables doivent exister
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public';
-- ============================================================
