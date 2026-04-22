# Review for design_05
Verdict: revise
Score: 70
Critical: 0
Major: 3
Minor: 2

## 1. Итоговая оценка
Вариант выглядит перспективно: он хорошо собирает в одну схему идеи `HSM`, `Morph`, `HeART` и wide `LRC`, а тема диплома выдержана точно. При этом архитектура пока остается на уровне сильного синтеза, а не полностью зафиксированного design: не хватает явного decision engine, фиксированного substrate и проверяемого transition graph.

## 2. Scoring Breakdown
- Архитектурная ясность и целостность: 16/25
- Data flow и transitions: 13/20
- Опора на конспекты: 14/20
- Реализуемость: 10/15
- Соответствие теме: 9/10
- Novelty без фантазирования: 8/10

## 3. Critical Findings
- Нет.

## 4. Major Findings
- `Policy layer` не формализует decision engine. В тексте есть сигналы и candidate states, но не определено, как именно они сводятся к одному решению, какие у них приоритеты и пороги, и по какой целевой функции выбирается переход (`designs/design_05.md`: 20-26, 45-51). По брифу здесь нужен явный критерий, а сейчас момент выбора схемы и запуска transition только подразумевается.
- Substrate и managed unit слишком размыты. Одновременно описаны `LSM-tree`/`SSTable` deployment и file/object deployment, но не выбран основной носитель данных, не разведены metadata boundaries и не объяснено, как меняются операции для разных substrates (`designs/design_05.md`: 32-34, 70). В таком виде архитектура не позволяет однозначно спроектировать control plane и layout manager.
- Связка `EC -> wide LRC` выглядит сильнее, чем ее опора в корпусе. `Morph` действительно поддерживает late-life `EC -> wider EC/LRC`, а wide `LRC` paper дает сильный cold-layer baseline по reliability и placement, но ни один источник не задает полный lifecycle rule для перевода данных в wide `LRC` под одним policy controller (`designs/design_05.md`: 4, 31, 40, 49-51). Здесь есть синтез идей, но связь с конспектами пока остается частично интерпретацией.

## 5. Minor Findings
- Корпус конспектов задействован шире, чем сама архитектура. `ER-Store`, `F4`, `RapidRAID` и `Identifying Hot and Cold Data` фигурируют в source map, но в самом design они почти не влияют на компоненты и transitions. Стоит либо сильнее встроить их в схему, либо сократить список до реально используемых опор.
- Терминология местами дублирует роли. `Policy plane`, `Transition planner`, `Metadata plane` и `control plane` частично пересекаются по ответственности, из-за чего граница между "кто решает" и "кто исполняет" остается размыта. Лучше явно закрепить одну схему разделения обязанностей.

## 6. Что исправить перед следующим раундом
- Зафиксировать один primary substrate и один managed unit.
- Описать decision engine: входные сигналы, правило выбора, пороги и порядок приоритетов.
- Нарисовать явный transition graph с допустимыми edges, rollback path и условиями для `EC -> wide LRC`.
- Сжать или переименовать overlapping planes so responsibilities are unique.
- Уточнить, какие источники являются direct architectural basis, а какие только background.
