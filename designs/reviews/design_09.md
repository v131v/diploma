# Review for design_09
Verdict: revise
Score: 70
Critical: 0
Major: 2
Minor: 2

## 1. Итоговая оценка
Дизайн хорошо попадает в тему диплома: он связывает `Morph`, `HSM`, `Zebra`, `HeART`, `RapidRAID` и wide `LRC` в одну лестницу состояний и в целом остаётся в пределах корпуса конспектов. Сильнее всего здесь работает сама композиция: горячий слой, промежуточный bridge, demand-ranked EC и холодный LRC слой действительно складываются в правдоподобную hybrid-storage architecture.

Сейчас, однако, это всё ещё архитектурный каркас, а не завершённая схема. Главные пробелы - отсутствие одной зафиксированной granularity для управляемого объекта и отсутствие явного state machine для переходов между tier'ами. Пока эти две вещи не формализованы, дизайн читается как сильная идея с хорошими building blocks, но не как исполнимый control loop.

## 2. Scoring Breakdown
- Архитектурная ясность и целостность: 16/25
- Data flow и transitions: 12/20
- Опора на конспекты: 17/20
- Реализуемость: 11/15
- Соответствие теме: 10/10
- Novelty без фантазирования: 4/10

## 3. Critical Findings
Нет.

## 4. Major Findings
- Не зафиксирован один уровень управления, на котором живёт весь пайплайн. В тексте одновременно фигурируют `unit`, `data`, `chunk`, `stripe`, `replica` и `sealed or transition-eligible units` ([designs/design_09.md#L35](/Users/dobr2003/Desktop/diplom/designs/design_09.md#L35), [designs/design_09.md#L45](/Users/dobr2003/Desktop/diplom/designs/design_09.md#L45), [designs/design_09.md#L60](/Users/dobr2003/Desktop/diplom/designs/design_09.md#L60)). Без ответа на вопрос, что именно мигрирует между tier'ами - файл, объект, extent, stripe или блок - невозможно честно определить layout, metadata model и cost model. Для architecture-reviewer это серьёзная лакуна.
- Decision engine описан как набор сигналов и guardrails, но не как правило перехода. `Telemetry collector`, `Temperature and demand estimator`, `Policy engine` и `Transition planner` названы, но в тексте нет явной state machine с порогами, hysteresis bands, tie-break rules и разрешёнными edges между `hot -> bridge -> warm -> cold` ([designs/design_09.md#L34](/Users/dobr2003/Desktop/diplom/designs/design_09.md#L34), [designs/design_09.md#L68](/Users/dobr2003/Desktop/diplom/designs/design_09.md#L68), [designs/design_09.md#L75](/Users/dobr2003/Desktop/diplom/designs/design_09.md#L75)). На фоне `HSM` и `Zebra`, где policy уже задана более конкретно, здесь архитектура пока остаётся декларативной.

## 5. Minor Findings
- `Code family registry` задекларирован как ограничитель search space, но не видно, по каким именно признакам схема считается `transition-friendly` или `repair-friendly` ([designs/design_09.md#L43](/Users/dobr2003/Desktop/diplom/designs/design_09.md#L43), [designs/design_09.md#L56](/Users/dobr2003/Desktop/diplom/designs/design_09.md#L56)). Сейчас это полезная идея, но ещё не операциональная часть архитектуры.
- `Metrics / Evaluation Plan` хороший по составу метрик, но не хватает минимальной матрицы сценариев: какие workload traces, какие доли hot/warm/cold, какие baseline configurations и как именно измеряется выигрыш каждого transition edge ([designs/design_09.md#L77](/Users/dobr2003/Desktop/diplom/designs/design_09.md#L77), [designs/design_09.md#L88](/Users/dobr2003/Desktop/diplom/designs/design_09.md#L88)). Без этого воспроизводимость и проверка переходов остаются слишком абстрактными.

## 6. Что исправить перед следующим раундом
- Зафиксировать один основной substrate и одну granularity для managed data unit.
- Описать transition policy как явный state machine: входы, выходы, пороги, hysteresis и допустимые переходы между tier'ами.
- Привязать `Code family registry` к конкретным критериям выбора, чтобы стало понятно, какие схемы реально поддерживают дешёвые переходы, а какие нет.
- Дать минимальный evaluation matrix, где каждый edge пайплайна проверяется на конкретных workload scenarios и baseline'ах.
