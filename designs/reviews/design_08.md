# Review for design_08
Verdict: revise
Score: 73
Critical: 0
Major: 3
Minor: 2

## 1. Итоговая оценка
Дизайн в целом хорошо попадает в тему диплома: он связывает temperature-aware storage, hybrid redundancy и conversion-aware transitions в одну понятную архитектурную рамку. Но сейчас это скорее сильный концепт, чем завершённая архитектура: не хватает одного уровня детализации по единице миграции, по явной матрице допустимых переходов и по воспроизводимому evaluation plan.

## 2. Scoring Breakdown
- Архитектурная ясность и целостность: 18/25
- Data flow и transitions: 14/20
- Опора на конспекты: 15/20
- Реализуемость: 10/15
- Соответствие теме: 9/10
- Novelty без фантазирования: 7/10

## 3. Critical Findings
Нет.

## 4. Major Findings
- Не зафиксирован единый уровень, на котором живёт весь пайплайн: в тексте одновременно фигурируют `object`, `tablet`, `SSTable`, `stripe`, `chunk` и `sealed units` ([designs/design_08.md#L36](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L36), [designs/design_08.md#L48](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L48), [designs/design_08.md#L64](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L64), [designs/design_08.md#L108](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L108)). Для review по architecture это серьёзная лакуна: без одной выбранной гранулярности невозможно честно сравнить `access cost`, placement rules и migration semantics с конспектами.
- Граф переходов описан только словами, но не как набор явных допустимых ребер с условиями срабатывания и границами применимости ([designs/design_08.md#L38](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L38), [designs/design_08.md#L39](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L39), [designs/design_08.md#L64](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L64), [designs/design_08.md#L67](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L67), [designs/design_08.md#L81](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L81)). Из-за этого `code family registry` пока выглядит декларативно, а не как реальный control point: не видно, какие переходы гарантированно cheap по Morph/Convertible Codes/LRC-конспектам, а какие потребуют полного re-encode.
- `Metrics / Evaluation Plan` пока перечисляет хорошие метрики, но не задаёт воспроизводимый сценарий проверки: нет набора workload traces, распределения размеров, долей hot/warm/cold, матрицы baseline-конфигураций и правила, как именно мерить пользу каждого transition edge ([designs/design_08.md#L83](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L83), [designs/design_08.md#L95](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L95)). Это ослабляет опору на `benchmarking_ec_object_storage_fgcs_2025` и делает архитектурную проверку пока слишком абстрактной.

## 5. Minor Findings
- `reliability state` введён как guardrail, но не определено, какие именно сигналы его формируют и как он должен взаимодействовать с temperature/utilization policy ([designs/design_08.md#L36](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L36), [designs/design_08.md#L78](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L78), [designs/design_08.md#L109](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L109)). Сейчас это скорее полезная идея из `heart_fast_2019`, чем часть завершённой архитектуры.
- Связь между source map и основным data flow местами слишком широкая: в тексте есть ссылки на `ec_store_icdcs_2018` и `benchmarking_ec_object_storage_fgcs_2025`, но в самом pipeline они пока не проявляются как отдельные архитектурные механизмы, а только как набор метрик и общих ограничений ([designs/design_08.md#L117](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L117), [designs/design_08.md#L126](/Users/dobr2003/Desktop/diplom/designs/design_08.md#L126)). Это не ломает дизайн, но снижает плотность опоры на конспекты.

## 6. Что исправить перед следующим раундом
- Зафиксировать одну рабочую гранулярность системы, а остальные сущности перевести в роли внутри неё.
- Описать переходы как явный граф: source state, target state, условия запуска, ожидаемый cost и источник обоснования в конспектах.
- Привязать evaluation plan к конкретному набору workload сценариев и baseline-сравнений, чтобы каждая метрика имела проверяемый способ измерения.
