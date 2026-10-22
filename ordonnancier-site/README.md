# Ordonnancier

Site web réservé aux médecins pour rédiger des ordonnances et les télécharger en PDF (A5 ou A4).

**Utiliser le site :** ouvrez la page GitHub Pages du dépôt (lien dans la section *About*).

## Comptes médecins

- Chaque médecin crée son compte avec son **numéro RPPS**, son nom et son prénom. Ces trois informations sont vérifiées dans l’**annuaire santé officiel** (extraction RPPS de l’Agence du Numérique en Santé, profession « Médecin »). Un numéro RPPS ne peut servir qu’à un seul compte.
- La connexion se fait par e-mail et mot de passe, après confirmation de l’adresse e-mail.
- L’identité imprimée sur les ordonnances (nom, prénom, RPPS) vient du profil vérifié et ne peut pas être modifiée.
- **Les PDF sont générés par le serveur**, uniquement pour un médecin connecté (fonction `supabase/functions/ordonnance-pdf`).

Limite : la vérification prouve que le numéro RPPS appartient à un médecin portant ce nom, pas que la personne qui s’inscrit est ce médecin. Seule la connexion par carte CPS / e-CPS (Pro Santé Connect) apporte cette garantie.

## Configuration de l’espace

À la première connexion, un assistant en 4 étapes guide le médecin : identité (spécialité, titres), cabinet (adresse, téléphone, n° AM, conventionnement), style des ordonnances (couleur, police Moderne ou Classique, en-tête à gauche ou centré, format A5 ou A4, avec aperçu en direct) et signature. Tout reste modifiable ensuite dans *Paramètres*.

## Administration

Le créateur de la plateforme dispose d’un compte administrateur (créé côté serveur, sans RPPS). En se connectant, il arrive sur l’espace d’administration : liste des médecins inscrits (identité, RPPS, e-mail, spécialité, ville, date d’inscription, dernière connexion, nombre de patients et d’ordonnances), statut du compte, export CSV et suspension ou réactivation d’un compte. L’administrateur ne voit jamais les patients ni le contenu des ordonnances.

## Fonctionnalités

- Ordonnances simples, **bizones ALD**, examens de biologie, d’imagerie et prescriptions de soins.
- Médicaments en DCI : dosage, forme, posologie, durée, quantité, mention *non substituable* (MTE, EFG, CIF), *hors AMM*.
- **Recherche instantanée** dans la base publique des médicaments (DCI ou nom commercial), avec posologies usuelles adultes proposées pour les molécules courantes.
- Fichier patients (âge calculé, poids, ALD, allergies affichées en alerte), historique, renouvellement en un clic.
- Favoris, modèles d’ordonnance, aperçu en direct, brouillon sauvegardé automatiquement, raccourcis clavier.

## Où sont les données ?

Les comptes, patients, favoris et ordonnances sont stockés dans une base **Supabase hébergée à Paris** (région `eu-west-3`). Chaque médecin n’accède qu’à ses propres données (règles de sécurité au niveau des lignes, voir `supabase/schema.sql`).

Supabase n’est pas un hébergeur certifié **HDS** (hébergement de données de santé), exigé en France pour les données de santé à caractère personnel.

## Base des médicaments

`medicaments.json` est extrait de la [Base de données publique des médicaments](https://base-donnees-publique.medicaments.gouv.fr/) (ANSM), publiée sous [Licence Ouverte / Open Licence](https://www.etalab.gouv.fr/licence-ouverte-open-licence) : seuls les médicaments commercialisés sont retenus. Mise à jour : `outils/build_bdpm.py`.

Le référentiel RPPS provient de l’[extraction en libre accès de l’annuaire santé](https://www.data.gouv.fr/fr/datasets/annuaire-sante-extractions-des-donnees-en-libre-acces-des-professionnels-intervenant-dans-le-systeme-de-sante-rpps/) (Agence du Numérique en Santé, Licence Ouverte). Mise à jour : `outils/extract_rpps.py`.

Les posologies usuelles proposées sont indicatives et ne proviennent pas des RCP : elles doivent être vérifiées et adaptées à chaque patient.

## Avertissements

- Ce site met en page des prescriptions. Il ne vérifie ni les interactions, ni les contre-indications, ni les posologies.
- Ce n’est pas un logiciel d’aide à la prescription certifié par la HAS, ni un service de prescription électronique (e-prescription).
- Les médicaments stupéfiants et assimilés exigent une ordonnance sécurisée et ne peuvent pas être prescrits avec ce site.

## Développement

- `index.html` est généré à partir de `source/ordonnancier.html` : `python3 outils/build_site.py source/ordonnancier.html index.html`.
- La clé Supabase présente dans `index.html` est la clé publique « anon » : elle est faite pour être visible ; l’accès aux données est protégé par les règles de sécurité de la base.
