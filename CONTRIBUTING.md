# Contribuer a DEUGAL

Merci de ton interet. Ce document decrit le workflow attendu pour toutes les contributions.

## Workflow branches

1. Une branche par fonctionnalite, depuis master :
   `git checkout -b feat/nom-fonctionnalite`
2. Developpe avec les tests correspondants.
3. Verifie localement : `npm run typecheck`, `npm test`, `npm run build`.
4. Merge de la branche dans master avec un merge commit :
   `git checkout master && git merge --no-ff feat/nom-fonctionnalite`
5. Supprime la branche : `git branch -d feat/nom-fonctionnalite`

## Messages de commit

- En francais, sans caracteres speciaux ni accents (compatibilite encodage).
- Premiere ligne courte et explicite : "Ajout de la commande recent".
- Un commit = une intention (code, tests, docs separent si possible).

## Tests

- Toute nouvelle commande ou logique core doit avoir des tests vitest.
- Les tests CLI passent par `main()` avec un DEUGAL_HOME temporaire.
- Coverage minimale : 70% lignes, 65% fonctions (verifie en CI).

## Style de code

- TypeScript strict, modules ESM (`import type` obligatoire avec verbatimModuleSyntax).
- Pas de commentaires dans le code, sauf demande explicite.
- Pas de nouvelle dependance sans justification dans la description du commit.

## Signaler un bug

Ouvre une issue avec : commande lancee, sortie complete, version de node (`node -v`), OS.
