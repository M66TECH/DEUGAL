# Contribuer a DEUGAL

Merci de ton interet. Ce document decrit le workflow attendu pour toutes les contributions.

## Politique de branches

Le projet suit une logique de type trunk-based, comme les grands projets open source:

- **master est la seule branche permanente.** Elle doit toujours etre livrable: tests verts, build OK.
- **Les branches sont ephemeres.** Une branche vit le temps d'une session de travail, puis est fusionnee et supprimee. On ne garde jamais plus de quelques branches ouvertes.
- **Les versions sont des tags, pas des branches.** Une release = un tag `v0.4.0` pose sur master, jamais une branche de release figee.
- **Fusion avec merge commit** (`git merge --no-ff`) pour garder visible le contour de chaque unite de travail.
- **PRs bienvenues** pour les contributions externes: une PR courte et ciblee est plus simple a relire qu'une branche qui traine.

### Nommage

- `feat/nom-court` pour une fonctionnalite
- `fix/nom-court` pour un correctif
- `docs/sujet`, `chore/sujet`, `ci/sujet` pour le reste

### Conseils

- Regroupe les micro-changements lies dans une seule branche coherente plutot que dix micro-branches.
- Rebase ou fusionne master dans ta branche si elle traine plus d'un jour.
- Verifie localement avant fusion: `npm run typecheck`, `npm test`, `npm run build`.

## Messages de commit

- En francais, sans caracteres speciaux ni accents (compatibilite encodage).
- Premiere ligne courte et explicite: "Ajout de la commande recent".
- Un commit = une intention (code, tests, docs separent si possible).
- Les commits de fusion documentent la branche: "Fusion de la branche <nom>".

## Tests

- Toute nouvelle commande ou logique core doit avoir des tests vitest.
- Les tests CLI passent par `main()` avec un DEUGAL_HOME temporaire.
- Coverage minimale: 70% lignes, 65% fonctions (verifie en CI).

## Style de code

- TypeScript strict, modules ESM (`import type` obligatoire avec verbatimModuleSyntax).
- Pas de commentaires dans le code, sauf demande explicite.
- Pas de nouvelle dependance sans justification dans la description du commit.

## Signaler un bug

Ouvre une issue avec: commande lancee, sortie complete, version de node (`node -v`), OS.
