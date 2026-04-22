# Review for design_04
Verdict: revise
Score: 68
Critical: 0
Major: 3
Minor: 2

## 1. Итоговая оценка
Идея перспективная и хорошо собрана из подходящих источников: здесь есть `Morph` для lifecycle-pipeline, `HSM` для multi-signal policy и `Convertible Codes`/`LRC` для дешёвых переходов. Но в текущем виде архитектура слишком широкая и местами слишком абстрактная: не зафиксирован один substrate, не определён конкретный decision engine, а переходы между состояниями описаны скорее как намерение, чем как исполнимый data flow.

## 2. Scoring Breakdown
- Архитектурная ясность и целостность: 15/25
- Data flow и transitions: 12/20
- Опора на конспекты: 13/20
- Реализуемость: 10/15
- Соответствие теме: 9/10
- Novelty без фантазирования: 9/10

## 3. Critical Findings
- Нет.

## 4. Major Findings
- `designs/design_04.md:44-45, 77-78` слишком широко заявляет, что архитектура одинаково подходит для object storage, DFS extents и SSTable-like units. В корпусе конспектов эти направления живут в разных допущениях и на разных control/data plane уровнях: `Morph` привязан к HDFS-like file system, `ER-Store` к tablet-oriented DB, `ELECT` к SSTable-level tiering. Пока substrate не выбран, невозможно честно проверить ни layout, ни metadata model, ни transition protocol.
- `designs/design_04.md:32-35, 53-58` decision engine и policy layer перечисляют сигналы, но не задают саму политику. Неясно, какая именно функция принимает решение, какие пороги или ограничения используются, в какой момент выбирается tier, а в какой - конкретная EC/LRC-конфигурация. На фоне `HSM` с явными порогами и hysteresis, и `Zebra` с формальной оптимизацией, это выглядит как архитектурная лакуна, а не как намеренно оставленная абстракция.
- `designs/design_04.md:47-51, 55-58` transition flow описан как `hot -> warm -> cold`, но не определяет, какие именно переходы допустимы, где unit становится `sealed` или `transition-eligible`, и как выбирается механизм конверсии для каждого hop. В корпусе есть отдельные механизмы для разных частей этой цепочки (`Morph` для hybrid->EC, `Convertible Codes` и `LRC convertible` для EC-to-EC, `RapidRAID` для дешёвого archival path), но текст не связывает их в один исполнимый граф переходов.

## 5. Minor Findings
- `designs/design_04.md:36, 42` формулировка про `metadata / index components for cold tier` слишком расплывчата. Лучше явно разделить control metadata и data-side index, иначе непонятно, что именно хранится в control plane, а что в data plane.
- `designs/design_04.md:49-50` блок `Update` и `Repair` смешивает универсальную политику с substrate-specific механизмами. Для `ER-Store` update path действительно важен, но для `Morph` и `RapidRAID` это не центральный объект; стоит либо развести ветки по substrate, либо пометить их как опциональные реализации.

## 6. Что исправить перед следующим раундом
- Зафиксировать один основной substrate или явно разделить архитектуру на несколько режимов с разными control/data-plane допущениями.
- Переписать policy layer в виде конкретного decision rule или state machine: входы, выходы, пороги, hysteresis, условия перехода и выбор target schema.
- Описать transition graph по шагам: sealed/eligible criteria, допустимые hop'ы, механизм конверсии для каждого hop и связь с update/repair path.
- После этого сократить общие формулировки и оставить только те источники, которые напрямую поддерживают выбранный вариант архитектуры.
