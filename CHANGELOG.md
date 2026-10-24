# Changelog

Format inspire de Keep a Changelog. Versions gerees avec SemVer.

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
