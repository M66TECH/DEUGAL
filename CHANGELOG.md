# Changelog

Format inspire de Keep a Changelog. Versions gerees avec SemVer.

## 0.6.0

### Ajouts

- Filtre --since sur list: durees en m, h, d ou w appliquees a la date de modification.
- Export partiel: export accepte --tag, --lang et --since pour ne sauvegarder qu une partie du store.
- Commande history: historique git du store apres deugal sync, avec limite et sortie JSON.
- Commande doctor: diagnostic du node, du dossier de donnees, du store, des sauvegardes, de la config et du depot git.

### Corrections

- Le test de push vers un remote inexistant n attend plus de reponse reseau et ne depasse plus le delai.

## 0.5.0

### Ajouts

- Commande sync: le store est versionne dans un depot git local du dossier de donnees, avec remote optionnel et push.
- Commande dedupe (avec --dry-run): supprime les doublons de contenu en gardant le plus utilise.
- Cle de config color (auto, always, never) qui complete l option --no-color.

### Corrections

- Les titres sont reduits a une seule ligne propre a l ajout comme a la modification.

## 0.4.0

### Ajouts

- Recherche floue sur les tags en sous-sequence (3 caracteres minimum).
- Suppression de plusieurs snippets en une commande avec rapport d'echecs detaille.
- Filtre --lang sur list.
- Commande recover pour lister et restaurer les sauvegardes .bak.
- Commande tag rename pour renommer un tag sur tous les snippets.
- Fichier de config avec preferences editor, sort, limit et sous-commandes config set/reset.
- Script de completion pour bash, zsh et powershell via completions, alimente par candidates.

### Technique

- readStdin Reinement: lecture par evenements avec periode de grace, sans doublons.

## 0.3.0

### Ajouts

- Option --no-color et couche couleur refactorree (honore NO_COLOR et FORCE_COLOR).
- Commande recent avec tri par date de creation.
- Commandes pin et unpin, snippets epingules en tete des listes.
- export - vers stdout et import - depuis l'entree pipee.
- Rotation automatique de trois sauvegardes du fichier de donnees.
- Filtre --tag sur search. Coverage vitest avec seuils en CI.

## 0.2.0

### Ajouts

- Recherche floue sur les titres en sous-sequence.
- Commande related: snippets partageant des tags avec un snippet donne.
- Alias find pour search.

## 0.1.0

### Ajouts

- Premiere version: add, list, search, show, use, edit, rm, tag, tags, export, import, stats, config.
- Stockage local JSON atomique dans DEUGAL_HOME ou ~/.deugal.
- Tests vitest et CI GitHub Actions multi-OS.
