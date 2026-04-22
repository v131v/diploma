# Review for design_15

Verdict: revise
Score: 89
Critical: 0
Major: 1
Minor: 2

## 1. Итоговая оценка

`design_15` заметно укрепился по сравнению с предыдущим раундом. Оба прошлых major по сути закрыты: документ теперь жёстко разводит pre-seal `R3-Active` и post-seal `SRU`, так что lifecycle-policy работает только по immutable units ([design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L47), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L48), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L55), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L80)); кроме того, `family-gated` часть теперь задана как конкретный design point с фиксированным `FG-RS-12-4-Cauchy-v1`, явным cheap merge path и честной границей для `LRC-Archive` ([design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L6), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L102), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L108), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L115)).

Оставшаяся проблема уже не про расплывчатость, а про исполнимость orchestration. Документ определяет policy unit как отдельный sealed SSTable (`SRU`), но сами `RS`/`LRC` transitions описывает как stripe-level operations, которым нужен cohort-level metadata/control plane. Пока этот слой не зафиксирован, ключевой переход `RS-Narrow -> RS-Wide` остаётся не полностью верифицируемым, поэтому до `pass` вариант ещё не дотягивает.

## 2. Scoring Breakdown
- Архитектурная ясность и целостность: 22/25
- Data flow и transitions: 17/20
- Опора на конспекты: 19/20
- Реализуемость: 12/15
- Соответствие теме: 10/10
- Novelty без фантазирования: 9/10

## 3. Critical Findings
- Нет.

## 4. Major Findings
- Прояснённый `SRU` всё ещё не совпадает с единицей encoding/transition. По тексту `SRU` создаётся на один sealed SSTable и именно он является объектом policy и metadata registry ([design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L48), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L60), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L123)). Но сами post-seal states определены через участие в `RS(6,4)` / `RS(12,4)` stripes, а cheap transition требует merge двух whole sister stripes ([design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L88), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L93), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L95), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L109), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L147), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L175)). Это означает, что реальной operational unit здесь становится не одиночный `SRU`, а `coding group`/cohort из нескольких `SRU`, для которого нужны как минимум `coding_group_id`, membership, stripe generation, atomic metadata flip и правила совместного blocking/retry. И ELECT, и Morph именно так и мыслят EC metadata: не по отдельному объекту в вакууме, а по coding group / hybrid block с явной transcode coordination ([elect_fast_2024.md](/Users/dobr2003/Desktop/diplom/conspects/elect_fast_2024.md#L33), [elect_fast_2024.md](/Users/dobr2003/Desktop/diplom/conspects/elect_fast_2024.md#L76), [elect_fast_2024.md](/Users/dobr2003/Desktop/diplom/conspects/elect_fast_2024.md#L77), [morph_sosp_2024.md](/Users/dobr2003/Desktop/diplom/conspects/morph_sosp_2024.md#L72), [morph_sosp_2024.md](/Users/dobr2003/Desktop/diplom/conspects/morph_sosp_2024.md#L111), [morph_sosp_2024.md](/Users/dobr2003/Desktop/diplom/conspects/morph_sosp_2024.md#L119)). Пока этот слой не добавлен, непонятно, кто именно принимает merge-решение для обоих `RS(6,4)` stripes сразу, как частичный успех/сбой отражается в registry и что означает `state` для одного `SRU`, если его stripe cohort ещё не завершил transition.

## 5. Minor Findings
- Evaluation пока не проверяет один из самых рискованных operational эффектов самой архитектуры: как часто `SRU` застревают в `RS-Narrow` из-за отсутствия подходящей sister stripe. Документ честно допускает такой stall ([design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L179)), но в метриках нет ни `merge eligibility rate`, ни `time spent waiting for sister stripe`, ни доли объектов, которые так и не доходят до `RS-Wide` ([design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L187), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L194), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L195)). Для дизайна, который опирается на один конкретный cheap merge path, это стоило бы сделать явной частью оценки.
- Baselines стали уже и лучше привязаны к `v1`, но они всё ещё не изолируют главный claim про выгоду family-gated merge. Есть сравнение с прямым `R3 -> RS(12,4)` и с вариантом без позднего tiers ([design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L199), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L201), [design_15.md](/Users/dobr2003/Desktop/diplom/designs/design_15.md#L202)), однако нет baseline вида "тот же pipeline, но `RS(6,4) -> RS(12,4)` через full re-encode". Без такого сравнения трудно количественно показать, что именно family-gated cheap conversion, а не просто наличие дополнительного warm tier, даёт выигрыш по transition IO и network traffic.

## 6. Что исправить перед следующим раундом
- Зафиксировать второй уровень сущностей: помимо `SRU` ввести явный `coding_group` / `stripe cohort` с membership metadata, состоянием группы и atomic transition protocol для `RS-Narrow -> RS-Wide` и `RS-Wide -> LRC-Archive`.
- Явно описать, как per-SRU policy и group-level execution взаимодействуют: кто инициирует merge, кто блокирует cohort при repair/backlog, как делается metadata flip при частичном сбое и в какой момент `state` отдельного `SRU` считается изменённым.
- Добавить в evaluation метрики по доступности sister stripes и отдельный baseline с full re-encode на шаге `RS(6,4) -> RS(12,4)`, чтобы доказать пользу именно cheap merge path, а не просто многоступенчатого pipeline.
