# Review for design_06
Verdict: revise
Score: 72
Critical: 0
Major: 2
Minor: 2

## 1. Итоговая оценка
Вариант сильный по теме и хорошо попадает в линию `replication -> hybrid -> EC/LRC`, но пока это скорее убедительный каркас, чем завершённая архитектура. Главные проблемы - размытая единица миграции/хранения и недостаточно формализованный decision engine, из-за чего переходы остаются на уровне общих слов.

## 2. Scoring Breakdown
- Архитектурная ясность и целостность: 18/25
- Data flow и transitions: 13/20
- Опора на конспекты: 14/20
- Реализуемость: 11/15
- Соответствие теме: 9/10
- Novelty без фантазирования: 7/10

## 3. Critical Findings
- Нет.

## 4. Major Findings
- В тексте не зафиксирован один конкретный deployment substrate и одна единица миграции. Одновременно используются file/blob-level примеры (`f4`), tablet-level (`ER-Store`), SSTable-level (`ELECT`) и disk-group-level (`HeART`) логики, но архитектура не говорит, на каком уровне реально происходят `observer -> policy -> conversion -> repair`. Из-за этого components описаны отдельно, но не складываются в проверяемую систему с единым data model. См. [design_06.md](/Users/dobr2003/Desktop/diplom/designs/design_06.md#L37-L66) и [design_06.md](/Users/dobr2003/Desktop/diplom/designs/design_06.md#L141-L159).
- Decision engine и transitions остаются слишком эвристичными. `Policy layer` говорит о порогах и cost comparison, но не определяет state machine, hysteresis, критерии переходов `hot -> warm -> cold`, а также условия возврата `warm -> hot`. Для варианта, который делает акцент на cheap transitions, это слишком слабая формализация. В конспектах `HSM` и `ER-Store` есть более конкретные правила переключения и conversion cycle, но здесь они не перенесены в явном виде. См. [design_06.md](/Users/dobr2003/Desktop/diplom/designs/design_06.md#L48-L57) и [design_06.md](/Users/dobr2003/Desktop/diplom/designs/design_06.md#L93-L108).

## 5. Minor Findings
- `RapidRAID` в `Conversion planner` используется слишком широко как источник для `replication -> EC` migration. По конспекту это прежде всего pipelined encoding / archival bottleneck, а не полноценный lifecycle controller, поэтому ссылку лучше сузить до поддержки самого encoding path. См. [design_06.md](/Users/dobr2003/Desktop/diplom/designs/design_06.md#L53-L56) и [design_06.md](/Users/dobr2003/Desktop/diplom/designs/design_06.md#L146-L149).
- `Cold storage engine` перечисляет `RS`, `wide LRC` и `local parity groups`, но критерии выбора между ними пока слишком общие. Для сильной архитектуры лучше явно привязать выбор к метрикам из конспектов, например repair traffic, degraded-read cost, maintenance robustness или MTTDL. См. [design_06.md](/Users/dobr2003/Desktop/diplom/designs/design_06.md#L58-L66) и [design_06.md](/Users/dobr2003/Desktop/diplom/designs/design_06.md#L73-L76).

## 6. Что исправить перед следующим раундом
- Зафиксировать один основной substrate и одну гранулярность миграции, чтобы `observer`, `metadata` и `conversion planner` работали на одной и той же модели данных.
- Формализовать transition policy: какие сигналы считаются входом, какие пороги или hysteresis используются, когда именно система меняет состояние и кто инициирует обратный переход.
- Уточнить роль `RapidRAID` и добавить явные критерии выбора cold-tier code family, а не только список возможных вариантов.
