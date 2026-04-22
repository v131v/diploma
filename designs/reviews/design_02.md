# Review for design_02
Verdict: revise
Score: 76
Critical: 0
Major: 3
Minor: 2

## 1. Итоговая оценка
Вариант сильный по теме и хорошо собран из подходящих baseline-источников: здесь есть lifecycle-логика, multi-stage tiering, учёт conversion cost и попытка связать temperature policy с состоянием кластера. Это уже выглядит как основа архитектуры дипломной системы, а не как набор разрозненных идей.

Слабое место сейчас не в теме, а в исполнимости. Архитектура пока слишком абстрактна в трёх точках: не зафиксирован один substrate и единица данных, не разведены разные типы переходов между схемами, и decision engine описан как набор сигналов без явного правила выбора. Из-за этого вариант нужно доуточнить перед следующим раундом.

## 2. Scoring Breakdown
- Архитектурная ясность и целостность: 18/25
- Data flow и transitions: 13/20
- Опора на конспекты: 16/20
- Реализуемость: 11/15
- Соответствие теме: 10/10
- Novelty без фантазирования: 8/10

## 3. Critical Findings
Нет.

## 4. Major Findings
- `designs/design_02.md:41-68` не фиксирует один substrate и одну единицу управления. В тексте одновременно фигурируют `object`, `file`, `tablet`, `SSTable`, `stripe`, а в корпусе конспектов эти модели живут в разных допущениях и control planes: `Morph` - file-system, `ER-Store` - tablet-oriented DB, `ELECT` - SSTable-level tiering, `Azure` и `f4` - extent/BLOB-oriented storage. Пока не выбран хотя бы один базовый уровень, нельзя однозначно проверить ни layout, ни metadata model, ни protocol переходов.
- `designs/design_02.md:53-85` смешивает разные механизмы перехода в один общий `conversion-aware` путь. Но в корпусе это разные вещи: у `Morph` есть free replication-to-EC через deletion of replicas и отдельный EC-to-EC transcode, у `Convertible Codes` речь идёт о cost-optimal EC-to-EC conversion в merge regime, а `HSM`/`ER-Store`/`ELECT` описывают policy-driven tiering и batch migration, а не единый universal conversion protocol. Сейчас неясно, какой именно механизм применяется для `replication -> warm`, `warm -> EC`, `EC -> wider LRC` и `rollback`.
- `designs/design_02.md:42-46, 75-83` decision engine задан только через перечень сигналов, но не через правило выбора. Не определены приоритеты между temperature, utilization и reliability shift, нет явной hysteresis/threshold policy, не сказано, когда система должна переходить в warm tier, а когда сразу в cold tier, и кто имеет право инициировать migration. На фоне `HSM`, `Zebra` и `HeART`, где decision logic хоть и эвристичен, но всё же формализован, это выглядит как архитектурная лакуна.

## 5. Minor Findings
- `designs/design_02.md:52-56` границы между `Warm tier` и `Cold tier` пока слишком расплывчаты. Сейчас warm tier описан как промежуточная зона, но не ясно, является ли он 2-way replication, hybrid redundancy, partial EC или просто staging state перед sealing.
- `designs/design_02.md:101-110` план оценки хороший, но в нём полезно явно разделить прямые baselines из конспектов и синтезированные baselines, чтобы не смешивать empirical evidence из разных substrate-ов с вашей собственной композицией архитектуры.

## 6. Что исправить перед следующим раундом
- Зафиксировать один основной substrate или явно разделить архитектуру на несколько режимов с разными допущениями по data model и control plane.
- Переписать transition flow в виде небольшой state machine: source state, trigger, target state, conversion mechanism, rollback/failure behavior.
- Уточнить decision rule для policy layer: какие сигналы обязательны, какие вторичны, где hysteresis, и кто инициирует переход.
- Ясно определить, что именно означает `warm tier` в этой архитектуре: hybrid redundancy, staged replication или отдельный intermediate coding state.
