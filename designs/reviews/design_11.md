# Review for design_11
Verdict: revise
Score: 77
Critical: 0
Major: 2
Minor: 1

## 1. Итоговая оценка
`design_11` заметно сильнее большинства ранних вариантов: у него есть единый control plane, одна каноническая единица управления, явный transition graph и хорошая опора на корпус по `Morph`, `Convertible Codes`, `LRC`, `HSM`, `Zebra`, `EC-Store` и `HeART`. Это уже не набор разрозненных идей, а цельная архитектурная рамка. Но сейчас она все еще не до конца приземлена в исполнимую policy: не определено, как именно формируется и sealing-ится `sealed object stripe`, и не хватает edge-specific правил для переходов, поэтому граф пока выглядит более как сильная концепция, чем как готовый control loop.

## 2. Scoring Breakdown
- Архитектурная ясность и целостность: 19/25
- Data flow и transitions: 14/20
- Опора на конспекты: 16/20
- Реализуемость: 10/15
- Соответствие теме: 10/10
- Novelty без фантазирования: 8/10

## 3. Critical Findings
Нет.

## 4. Major Findings
- Не определён операциональный смысл `sealed object stripe` как единицы миграции. В [designs/design_11.md](/Users/dobr2003/Desktop/diplom/designs/design_11.md#L4), [designs/design_11.md](/Users/dobr2003/Desktop/diplom/designs/design_11.md#L54) и [designs/design_11.md](/Users/dobr2003/Desktop/diplom/designs/design_11.md#L78) stripe объявлен единственной внутренней гранулярностью для хранения, repair и migration, но не сказано, как объект упаковывается в stripe, что происходит с частично заполненными или маленькими объектами и по какому признаку объект становится sealable. Для architecture-reviewer это существенная лакуна: без этого control plane не может реально запускать migration path. В корпусе есть сильные примеры lifecycle-переходов на уровне файла, extent, SSTable и tablet, но они тоже не закрывают именно packing/sealing semantics для object-stripe abstraction ([conspects/morph_sosp_2024.md](/Users/dobr2003/Desktop/diplom/conspects/morph_sosp_2024.md#L120), [conspects/azure_ec_atc_2012.md](/Users/dobr2003/Desktop/diplom/conspects/azure_ec_atc_2012.md#L6), [conspects/elect_fast_2024.md](/Users/dobr2003/Desktop/diplom/conspects/elect_fast_2024.md#L4)).
- Transition graph пока описан скорее названиями ребер, чем исполнимыми условиями. В [designs/design_11.md](/Users/dobr2003/Desktop/diplom/designs/design_11.md#L45), [designs/design_11.md](/Users/dobr2003/Desktop/diplom/designs/design_11.md#L90) и [designs/design_11.md](/Users/dobr2003/Desktop/diplom/designs/design_11.md#L116) есть `State graph`, `R3 -> H -> E -> L -> A`, cost model и hysteresis, но нет таблицы admissibility по ребрам, нет порогов или формальных trigger conditions для каждого перехода и нет явного ответа, в какой точке включается `No-op` versus `move`. При такой формулировке decision engine остается слишком общим: он может сравнивать costs, но не определяет, когда именно допустимы `R3 -> H` или `E -> L`. Это слабее, чем требуют `Morph`, `Convertible Codes` и `EC survey`, где transition cost и limits на переходы описаны как отдельный объект анализа, а не только как общая идея ([conspects/morph_sosp_2024.md](/Users/dobr2003/Desktop/diplom/conspects/morph_sosp_2024.md#L61), [conspects/convertible_codes_it_2022.md](/Users/dobr2003/Desktop/diplom/conspects/convertible_codes_it_2022.md#L35), [conspects/ec_survey_tos_2024.md](/Users/dobr2003/Desktop/diplom/conspects/ec_survey_tos_2024.md#L43)).

## 5. Minor Findings
- `A`-слой выглядит недообоснованным как отдельное состояние. В [designs/design_11.md](/Users/dobr2003/Desktop/diplom/designs/design_11.md#L65) и [designs/design_11.md](/Users/dobr2003/Desktop/diplom/designs/design_11.md#L96) archival refinement описан только как optional step, но не показано, что он дает принципиально новое поведение по сравнению с `L` и почему его стоит держать отдельным узлом графа, а не просто частным случаем cold-LRC layout.

## 6. Что исправить перед следующим раундом
- Зафиксировать, как именно объект становится `sealed object stripe`: packing rule, минимальный/максимальный размер, поведение для маленьких объектов и момент закрытия записи.
- Превратить transition graph в таблицу ребер с условиями запуска, guardrails, stop conditions и объяснением, чем `R3 -> H` отличается от `H -> E` и `E -> L` не только по имени, но и по policy.
- Либо отдельно обосновать `A` как уникальный archival state с отличным repair profile, либо слить его с `L`, если он не добавляет новой архитектурной ценности.

Изменённые файлы: [designs/reviews/design_11.md](/Users/dobr2003/Desktop/diplom/designs/reviews/design_11.md)
