# Review for design_07

Verdict: revise
Score: 70
Critical: 0
Major: 4
Minor: 1

## 1. Итоговая оценка
Вариант хорошо попадает в тему диплома и опирается на правильный набор источников: `f4`, `HSM`, `Morph`, `HyRES`, `LRC` и benchmark-подход для object storage. Архитектурная идея сильная, но в текущем виде это еще не полноценная система, а скорее убедительный каркас: decision engine слишком общий, переходы между состояниями описаны не до конца, а часть источников используется как прямые архитектурные опоры там, где они дают только теоретический или локальный baseline.

## 2. Scoring Breakdown
- Архитектурная ясность и целостность: 17/25
- Data flow и transitions: 13/20
- Опора на конспекты: 14/20
- Реализуемость: 10/15
- Соответствие теме: 9/10
- Novelty без фантазирования: 7/10

## 3. Critical Findings
- Нет критических замечаний.

## 4. Major Findings
- Не определена явная state machine для переходов hot -> warm -> cold и обратных переходов. В `Policy and controller plane` и `Data Flow` есть только общий cost-based chooser, но нет точных trigger conditions, правил возврата на более "горячий" уровень и явного hysteresis protocol. Это делает decision engine слишком расплывчатым для архитектурного варианта. См. [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L52-L60), [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L89-L99), [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L110-L116).
- Warm tier описан как `replica + EC stripe`, но неясно, это временная transitional state или устойчивая dual-representation. Не определено, кто и когда удаляет replica component, как долго живут обе формы одновременно и как metadata фиксирует этот двойной режим. Из-за этого storage layout и реальная цена warm layer остаются размытыми. См. [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L62-L82), [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L95-L97).
- Не зафиксирован scope по mutability и lifecycle semantics объектов. Текст выглядит как immutable/sealed-object pipeline, но это нигде не сказано явно, а handling updates, overwrites и churn для часто меняющихся объектов не описан. Для object storage это существенная assumption gap, потому что именно она определяет, можно ли вообще опираться на f4/Morph-style transitions. См. [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L63-L70), [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L78-L98), [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L143-L150).
- Связь с корпусом местами слишком свободная: `Convertible Codes`, `HyRES` и `LRC` описаны так, будто они являются прямыми модулями одной системы, хотя по конспектам это либо теоретические building blocks, либо отдельные baselines с другими ограничениями и scope. Сейчас Source Map больше напоминает список вдохновляющих работ, чем явную трассировку "источник -> архитектурное решение". См. [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L20-L26), [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L57-L70), [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L152-L166).

## 5. Minor Findings
- Temperature profiler собран из правильных сигналов, но не зафиксированы observation window, refresh cadence и sampling policy. Из-за этого температура данных пока воспроизводится только на уровне идеи, а не на уровне определяемого механизма. См. [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L43-L46), [design_07.md](/Users/dobr2003/Desktop/diplom/designs/design_07.md#L91-L92).

## 6. Что исправить перед следующим раундом
- Зафиксировать точную state machine для hot, warm и cold с явными правилами переходов вперед и назад, включая hysteresis и cooldown.
- Разделить warm tier на transitional phase и steady-state phase, либо честно выбрать один вариант и описать, когда удаляется replica component.
- Явно определить scope: immutable objects, sealed objects, append-only workload или более общий object storage lifecycle.
- В `Source Map` развести источники на direct baselines, theoretical foundations и constraint papers, чтобы не смешивать system papers с code-theory papers.
- Параметризовать temperature profiler хотя бы на уровне окна, периода пересчета и источника сигнала.
