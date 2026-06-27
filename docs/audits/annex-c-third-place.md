# Auditoria: bracket do 3º lugar × Anexo C (FWC 2026)

## Veredito

**Não segue o Anexo C.** O conjunto de grupos permitidos por slot está correto,
mas a forma de escolher *qual* 3º vai para *qual* slot está errada.

## Onde está o bug

`apps/api/src/domain/bracket/bracket-engine.ts` → `assignThirdsToSlots()`

A função usa **backtracking que retorna o *primeiro* emparelhamento válido**
(bipartite matching) que respeite os conjuntos `allowedGroups` de
`fifa-2026-bracket-map.ts`. Os `allowedGroups` conferem com o Anexo C
(verificado: as 8 listas batem exatamente com a união de 3ºs que cada vencedor
enfrenta nas 495 opções). O problema é que **esses conjuntos NÃO determinam um
emparelhamento único**.

Conferência contra as 495 combinações oficiais do Anexo C (extraídas do PDF):

| Métrica | Resultado |
|---|---|
| Combinações com **mais de um** emparelhamento válido sob os `allowedGroups` | **495 / 495** |
| Combinações em que a atribuição oficial nem é um matching válido | 0 / 495 |

Ou seja: em **toda** combinação existe ambiguidade, e o Anexo C fixa exatamente
uma resposta. O código resolve essa ambiguidade pela **ordem do array de 3ºs**
(a ordem de ranking vinda de `pickBestThirds`), e não pela tabela oficial.
Resultado: o emparelhamento gerado frequentemente difere do regulamento, e —
pior — pode mudar conforme o ranking dos 3ºs, mesmo com os mesmos 8 grupos
classificados.

Exemplo (Opção 1 do Anexo C, grupos E F G H I J K L):

```
Oficial: 1B↔3J, 1D↔3I
Válido p/ o código mas ERRADO: 1B↔3I, 1D↔3J   (ambos os grupos I e J são
permitidos para 1B e 1D, então o backtracking pode pegar o par trocado)
```

## Quem foi afetado — SQL

`apps/api/prisma/audit/annex-c-third-place-affected.sql`

A consulta é **autossuficiente e exata** (não precisa rodar o motor): o payload
de cada palpite já contém os 8 confrontos de melhor-3º que o motor gravou. Dela
deriva-se a combinação de 8 grupos prevista pelo usuário e o grupo vencedor de
cada confronto; o Anexo C (embutido como CTE de 3960 linhas = 495 × 8) diz qual
3º *deveria* estar em cada slot. Onde diverge = afetado.

Saída: 1 linha por usuário com `confrontos_errados`, as `divergencias`
(`R32-XX: pos 3Y / Anexo C exige 3Z`) e os pontos de KO já lançados nesses
confrontos. Há ainda uma consulta companion que aplica o mesmo teste ao bracket
**oficial** (tabela `matches`).

Os 8 confrontos de melhor-3º na R32 (slot inferior = melhor-3º):
`R32-74 (1E)`, `R32-77 (1I)`, `R32-79 (1A)`, `R32-80 (1L)`,
`R32-81 (1D)`, `R32-82 (1G)`, `R32-85 (1B)`, `R32-87 (1K)`.

## Correção (fora do escopo desta auditoria)

Trocar a busca por matching arbitrário por uma **tabela de lookup do Anexo C**:
dado o conjunto dos 8 grupos classificados (a chave da combinação), aplicar a
linha correspondente do Anexo C (vencedor → grupo do 3º). O dump usado nesta
auditoria já tem as 495 linhas prontas para virar essa tabela.
