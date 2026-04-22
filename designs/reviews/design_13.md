# Review for design_13
Verdict: revise
Score: 72
Critical: 0
Major: 3
Minor: 2

## 1. Итоговая оценка
Design_13 выглядит цельным и хорошо организованным: у него понятный control plane, аккуратный data flow и ясная идея не пускать policy в критический путь записи. Это сильный архитектурный каркас для sealed-extent storage, но сейчас он слишком сильно сужает исходную тему диплома. В результате дизайн хорошо отвечает на вопрос "как управлять переходом sealed extent из replication в EC", но пока слабо отвечает на более важный для brief вопрос о многоступенчатом pipeline схем хранения и стоимости переходов между EC/LRC состояниями.

## 2. Scoring Breakdown
- Архитектурная ясность и целостность: 20/25
- Data flow и transitions: 12/20
- Опора на конспекты: 13/20
- Реализуемость: 11/15
- Соответствие теме: 8/10
- Novelty без фантазирования: 8/10

## 3. Critical Findings
Нет.

## 4. Major Findings
- Дизайн сводит холодную часть к одному fixed EC family и только к переходам `R3 -> R2 -> EC` с обратными шагами, см. [design_13.md](/Users/dobr2003/Desktop/diplom/designs/design_13.md#L52). Это убирает из архитектуры центральную для brief и конспектов линию `Morph` / `convertible codes`: дешевый `EC-to-EC` переход, multi-stage pipeline и выбор среди нескольких допустимых конечных схем. Пока это выглядит как архитектурное сужение темы, а не как осознанный фокус.
- Правило "все решения только после seal" слишком жесткое для темы temperature-aware storage, см. [design_13.md](/Users/dobr2003/Desktop/diplom/designs/design_13.md#L50) и [design_13.md](/Users/dobr2003/Desktop/diplom/designs/design_13.md#L82). Источники действительно поддерживают sealed extents и background transcode, но они же показывают periodic reclassification, lifecycle management и policy loops, которые работают на всем жизненном цикле данных, а не только после seal. В текущем виде дизайн не объясняет, что делать с долгоживущими active extents и как policy реагирует на heat / space pressure до seal.
- Policy layer описан как score function, но не доведён до уровня верифицируемой системы, см. [design_13.md](/Users/dobr2003/Desktop/diplom/designs/design_13.md#L95). Не хватает операционализации budget, weights и guardrails: неясно, в каких единицах измеряется conversion budget, как калибруются `conversion_cost` / `latency_penalty` / `reliability_penalty`, и как `Placement manager` проверяет feasibility по fault / upgrade domains. Это делает решение понятным концептуально, но пока слабым как исполнимая архитектура.

## 5. Minor Findings
- `Telemetry collector` собирает слишком много сигналов сразу, но дизайн не разделяет, какие из них обязательны для решения, а какие только вспомогательные, см. [design_13.md](/Users/dobr2003/Desktop/diplom/designs/design_13.md#L34). Из-за этого control loop выглядит более широким, чем реально используется в policy.
- План оценки не проверяет напрямую `EC-to-EC` conversion и не сравнивает дизайн с гибридным baseline вида `replica + EC`, который хорошо поддержан в `Morph`, см. [design_13.md](/Users/dobr2003/Desktop/diplom/designs/design_13.md#L128). Без этого трудно доказать, что предложенный pipeline выигрывает именно в той части, которую сильнее всего подчеркивает corpus.

## 6. Что исправить перед следующим раундом
- Добавить хотя бы один промежуточный EC/LRC state или отдельный cold-lifecycle branch, чтобы `convertible codes` и `EC-to-EC` transitions стали частью архитектуры, а не только ссылкой в источниках.
- Явно описать, почему policy ограничена sealed extents, и как система обслуживает active extents, если они остаются горячими дольше обычного.
- Формализовать budget и scoring: что именно измеряет `conversion_cost`, какой порог допускает planner, и как placement feasibility проверяется на fault / upgrade domain уровне.
- Расширить evaluation так, чтобы она сравнивала не только transition stress и hysteresis, но и conversion между двумя EC-схемами, а также baseline с hybrid redundancy.
