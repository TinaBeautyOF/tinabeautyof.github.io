# TinaBeauty

Application PWA de gestion pour salon d'esthétique.

## Fonctionnalités

- **Accueil** : rendez-vous du jour et de demain, marquage présente/absente d'un clic.
- **Planning** : vue hebdomadaire (samedi → vendredi) avec créneaux cliquables.
- **Prestations** : gestion des prestations par catégories dynamiques.
- **Clientes** : annuaire, import de contacts (Android/iOS), historique par cliente.
- **Finances** :
  - suivi des achats du salon (nom + prix + date) ;
  - chiffre d'affaire et bénéfice estimé (semaine / mois / année) en tenant compte des crédits et soldes clientes.
- **Crédit / Solde** : sur chaque rendez-vous, indiquez si la cliente vous doit de l'argent (crédit) ou si vous gardez de la monnaie pour elle (solde). Le solde global de la cliente est calculé automatiquement.

## Stack

- HTML / CSS / JavaScript vanilla
- Supabase (PostgreSQL) pour le stockage
- Service Worker pour le mode hors ligne

## Installation

1. Créer un projet Supabase et exécuter `schema.sql` puis `schema_update.sql` dans l'éditeur SQL.
2. Renseigner l'URL et la clé anonyme dans `app.js`.
3. Héberger les fichiers sur n'importe quel serveur web statique (GitHub Pages, Netlify, etc.).
4. Depuis un mobile, ajouter l'application à l'écran d'accueil.
