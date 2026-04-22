# Архитектурные варианты

Этот каталог хранит конкурсный пул вариантов архитектуры дипломной системы.

Формат:

- `design_01.md` ... `design_NN.md` — сами варианты
- `reviews/design_01.md` ... — sidecar review reports
- `selection-log.md` — журнал генерации subsets, score и отборов
- `rubric.md` — зафиксированная рубрика оценки

Основные файлы:

- [finalists.md](./finalists.md)
- [selection-log.md](./selection-log.md)
- [rubric.md](./rubric.md)
- [design_16_glossary.md](./design_16_glossary.md)
- [design_16_diagrams.md](./design_16_diagrams.md)

Варианты:

- [design_01.md](./design_01.md)
- [design_02.md](./design_02.md)
- [design_03.md](./design_03.md)
- [design_04.md](./design_04.md)
- [design_05.md](./design_05.md)
- [design_06.md](./design_06.md)
- [design_07.md](./design_07.md)
- [design_08.md](./design_08.md)
- [design_09.md](./design_09.md)
- [design_10.md](./design_10.md)
- [design_11.md](./design_11.md)
- [design_12.md](./design_12.md)
- [design_13.md](./design_13.md)
- [design_14.md](./design_14.md)
- [design_15.md](./design_15.md)
- [design_16.md](./design_16.md)

Review reports:

- [reviews/design_01.md](./reviews/design_01.md)
- [reviews/design_01_round2.md](./reviews/design_01_round2.md)
- [reviews/design_02.md](./reviews/design_02.md)
- [reviews/design_02_round2.md](./reviews/design_02_round2.md)
- [reviews/design_03.md](./reviews/design_03.md)
- [reviews/design_03_round2.md](./reviews/design_03_round2.md)
- [reviews/design_04.md](./reviews/design_04.md)
- [reviews/design_05.md](./reviews/design_05.md)
- [reviews/design_06.md](./reviews/design_06.md)
- [reviews/design_06_round2.md](./reviews/design_06_round2.md)
- [reviews/design_07.md](./reviews/design_07.md)
- [reviews/design_08.md](./reviews/design_08.md)
- [reviews/design_08_round2.md](./reviews/design_08_round2.md)
- [reviews/design_09.md](./reviews/design_09.md)
- [reviews/design_10.md](./reviews/design_10.md)
- [reviews/design_10_round2.md](./reviews/design_10_round2.md)
- [reviews/design_11.md](./reviews/design_11.md)
- [reviews/design_12.md](./reviews/design_12.md)
- [reviews/design_13.md](./reviews/design_13.md)
- [reviews/design_14.md](./reviews/design_14.md)
- [reviews/design_15.md](./reviews/design_15.md)
- [reviews/design_15_round2.md](./reviews/design_15_round2.md)
- [reviews/design_15_round3.md](./reviews/design_15_round3.md)
- [reviews/design_16.md](./reviews/design_16.md)
- [reviews/design_16_round2.md](./reviews/design_16_round2.md)

Основные правила:

- каждый вариант обязан учитывать весь корпус `conspects/*.md`;
- вариант может работать в режиме `accent subset`, `full-corpus synthesis` или `study-plan-driven`;
- в режиме `accent subset` подмножество влияет только на акценты и должно включать не менее `30%` корпуса;
- в режиме `full-corpus synthesis` выделенного subset нет, но дизайн обязан явно показывать синтез всего корпуса без размытия архитектурных решений;
- в режиме `study-plan-driven` дизайн тоже использует весь корпус, но его каркас и приоритеты должны следовать reading clusters из `study-plan.md`;
- reviewer выставляет findings и score по фиксированной рубрике;
- в следующий раунд проходят варианты по score и tie-break rules.
