# Changelog

Format inspire de Keep a Changelog. Versions gerees avec SemVer.

## 1.0.1

### Corrections

- Les options --limit, --from, -n et le compteur de recent refusent des valeurs non numeriques au lieu d afficher un resultat vide.
- Un titre vide est signale comme tel, au lieu d accuser a tort un contenu vide.
- Les fichiers absents ou illisibles (import, import-lines, migrate) produisent un message clair au lieu d une erreur ENOENT brute.

## 1.0.0

Premiere version stable. L API du fichier de donnees est figee (schema 1) et la commande migrate garantit les mises a niveau.

### Ajouts

- Commande migrate: repare et met a niveau un store (ids manquants ou dupliques, tags texte, dates invalides, titres multilignes), avec --dry-run.
- Page de presentation publiee via GitHub Pages et workflow de deploiement.
- Paquet npm pret a publier: publishConfig public, fichiers limites au strict necessaire, prepublishOnly qui verifie types, tests et build.

### Corrections

- Les fichiers JSON contenant un BOM UTF-8 (PowerShell, Notepad) sont acceptes au lieu d etre rejetes.
- migrate fonctionne sur les stores des versions precedentes et refuse ceux d une version plus recente.

## 0.9.0

### Ajouts

- Commande browse (alias ui): navigateur interactif pour parcourir les snippets, filtrer en tapant, previsualiser, copier, utiliser ou editer sans retaper les ids.

## 0.8.0

### Ajouts

- Commande similar: detecte les contenus quasi identiques avec un seuil de ressemblance (distance d edition).
- Commande import-lines: importe un snippet par ligne depuis un fichier texte de commandes, avec --dry-run, --tag et --lang.
- Option --copy sur show, avec --no-track pour ne pas incrementer le compteur d utilisation.

## 0.7.0

### Ajouts

- Recherche par expression reguliere avec --regex, et option --case-sensitive pour exiger la casse.
- Export et import au format CSV (colonnes title, content, tags, language, description), compatible tableur.
- Filtres --tag, --lang et --since sur recent et stats.
- stats affiche le nombre d utilisations totales et les tags les plus utilises.

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
