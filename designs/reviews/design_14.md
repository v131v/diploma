# Review for design_14
Verdict: revise
Score: 79
Critical: 0
Major: 2
Minor: 1

## 1. Итоговая оценка
`design_14` выглядит как один из самых цельных вариантов в этой серии: у него есть единая управляемая сущность, понятный lifecycle, хороший набор опорных paper'ов и честно проговоренная граница между прямой опорой на корпус и собственным synthesis. Это сильная архитектурная рамка для диплома. Но сейчас она ещё не до конца приземлена в исполнимую policy: не зафиксировано, как `SDU` реально соотносится с разными уровнями гранулярности из корпуса, и transition graph местами противоречит сам себе.

## 2. Scoring Breakdown
- Архитектурная ясность и целостность: 19/25
- Data flow и transitions: 14/20
- Опора на конспекты: 15/20
- Реализуемость: 11/15
- Соответствие теме: 10/10
- Novelty без фантазирования: 10/10

## 3. Critical Findings
Нет.

## 4. Major Findings
- Не зафиксирован операциональный смысл `SDU` как единицы миграции. В [designs/design_14.md](/Users/dobr2003/Desktop/diplom/designs/design_14.md#L4), [designs/design_14.md](/Users/dobr2003/Desktop/diplom/designs/design_14.md#L50) и [designs/design_14.md](/Users/dobr2003/Desktop/diplom/designs/design_14.md#L64) `SDU` объявлен атомарной сущностью, но из корпуса видно, что источники работают на разных уровнях: `Morph` - file-lifetime и DFS-level transition logic, `ELECT` - SSTable-level redundancy transitioning, `Azure` - sealed extents, `ER-Store` - tablets. Эти уровни не сведены в явную mapping rule, поэтому пока неясно, как именно `SDU` пакуется, sealing-ится и что считается его фактической granularity. Это серьёзная архитектурная лакуна и слабое место связи с конспектами ([conspects/morph_sosp_2024.md](/Users/dobr2003/Desktop/diplom/conspects/morph_sosp_2024.md#L102), [conspects/elect_fast_2024.md](/Users/dobr2003/Desktop/diplom/conspects/elect_fast_2024.md#L22), [conspects/azure_ec_atc_2012.md](/Users/dobr2003/Desktop/diplom/conspects/azure_ec_atc_2012.md#L55)).
- Transition graph описан не полностью и внутри себя конфликтует. В [designs/design_14.md](/Users/dobr2003/Desktop/diplom/designs/design_14.md#L61), [designs/design_14.md](/Users/dobr2003/Desktop/diplom/designs/design_14.md#L68), [designs/design_14.md](/Users/dobr2003/Desktop/diplom/designs/design_14.md#L70) и [designs/design_14.md](/Users/dobr2003/Desktop/diplom/designs/design_14.md#L92) одновременно утверждаются `Bridge-H` как единственный переходный буфер, adjacent-only policy и direct `Hot-R3 -> Cold-EC` after sealing. Это противоречие делает decision engine неисполняемым в текущем виде: непонятно, разрешён ли скачок через состояние, или `Bridge-H` обязателен всегда. На фоне `Morph`, `ELECT`, `HSM` и survey задача transition selection должна быть оформлена как явная admissibility matrix, а не только как narrative policy ([conspects/morph_sosp_2024.md](/Users/dobr2003/Desktop/diplom/conspects/morph_sosp_2024.md#L54), [conspects/elect_fast_2024.md](/Users/dobr2003/Desktop/diplom/conspects/elect_fast_2024.md#L32), [conspects/hsm_ieee_access_2024.md](/Users/dobr2003/Desktop/diplom/conspects/hsm_ieee_access_2024.md#L51), [conspects/ec_survey_tos_2024.md](/Users/dobr2003/Desktop/diplom/conspects/ec_survey_tos_2024.md#L141)).

## 5. Minor Findings
- `DeepCold-LRC` выглядит чуть более speculative, чем остальные состояния. В [designs/design_14.md](/Users/dobr2003/Desktop/diplom/designs/design_14.md#L55) и [designs/design_14.md](/Users/dobr2003/Desktop/diplom/designs/design_14.md#L73) он введён как отдельный state, но конспекты скорее поддерживают LRC как cold/archival design point и baseline по repair locality, чем как обязательную третью cold-tier ступень. Без дополнительного обоснования это состояние можно оставить, но лучше явно показать, чем оно отличается от `Cold-EC` по workload и cost model ([conspects/xoring_elephants_arxiv_2013.md](/Users/dobr2003/Desktop/diplom/conspects/xoring_elephants_arxiv_2013.md#L66), [conspects/wide_lrc_fast_2023.md](/Users/dobr2003/Desktop/diplom/conspects/wide_lrc_fast_2023.md#L45)).

## 6. Что исправить перед следующим раундом
- Зафиксировать одно операциональное определение `SDU`: что именно является единицей sealing, migration и repair, и как это маппится на file / extent / SSTable / tablet / object substrate.
- Превратить transitions в явную таблицу ребер с условиями запуска, обязательностью `Bridge-H`, допустимыми обходами и критериями full re-encode.
- Либо ужать `DeepCold-LRC` до частного варианта `Cold-EC`, либо дать для него отдельный trigger и cost profile.

Изменённые файлы: [designs/reviews/design_14.md](/Users/dobr2003/Desktop/diplom/designs/reviews/design_14.md)
