# Review for design_12
Verdict: revise
Score: 71
Critical: 0
Major: 2
Minor: 3

## 1. Итоговая оценка
Вариант в целом сильный: у него есть связный control plane, понятный state machine и хорошая опора на корпус по sealing, background migration и transition cost. Но в текущем виде он всё ещё не дотягивает до полностью определённой архитектуры для диплома: decision engine слишком абстрактен, а `sealed object` фактически превращается в скрытое ограничение по типу workload.

## 2. Scoring Breakdown
- Архитектурная ясность и целостность: 17/25
- Data flow и transitions: 14/20
- Опора на конспекты: 16/20
- Реализуемость: 10/15
- Соответствие теме: 9/10
- Novelty без фантазирования: 5/10

## 3. Critical Findings
Нет критических замечаний.

## 4. Major Findings
- [design_12.md:43-47, 81-83, 112-135](/Users/dobr2003/Desktop/diplom/designs/design_12.md) Политика температуры и выбор перехода описаны слишком абстрактно. В тексте есть `Telemetry collector`, `Estimator`, `score(s)`, веса и hysteresis, но нет конкретной модели температуры, правил вычисления классов, способа выбора окна, или метода калибровки `w_storage / w_access / w_transition / w_repair / w_reliability` и `epsilon`. По brief'у здесь должна быть именно формализованная политика, а сейчас decision engine остаётся схемой общего вида.
- [design_12.md:4, 36-38, 56-61, 74, 80-89, 171](/Users/dobr2003/Desktop/diplom/designs/design_12.md) `sealed object` введён как единственная unit of control, но его scope не ограничен явно. Из flow следует, что объект мигрирует только после sealing, а до этого не меняет redundancy, однако не сказано, что происходит с late writes, reopen, periodic updates или с workload'ами, которые никогда не seal'ятся. В результате архитектура выглядит применимой только к append-only или строго immutable данным, хотя это ограничение нужно либо честно зафиксировать, либо расширить модель.

## 5. Minor Findings
- [design_12.md:63-75, 93-110](/Users/dobr2003/Desktop/diplom/designs/design_12.md) Candidate set и graph transition выглядят правдоподобно, но им не хватает более явной спецификации допустимых пар схем для первого прототипа. Сейчас `conversion-friendly` звучит корректно, но слишком широко.
- [design_12.md:137-163, 175-196](/Users/dobr2003/Desktop/diplom/designs/design_12.md) Корпус использован хорошо, но влияние части источников остаётся декларативным. `er_store`, `hyres`, `zebra`, `ec_store` и `identifying_hot_cold` перечислены как constraints, однако не видно, какой именно knob каждый из них закрепляет в этой архитектуре.
- [design_12.md:118-129, 140-148](/Users/dobr2003/Desktop/diplom/designs/design_12.md) Метрики и evaluation plan широкие, но не хватает явной матрицы сценариев для `sealed` vs `unsealed` объектов и для update-heavy workload. Это не ломает идею, но ослабляет проверяемость proposal.

## 6. Что исправить перед следующим раундом
- Зафиксировать конкретную temperature policy: как считается температура, как выбираются веса и пороги, и какой критерий делает переход выгодным.
- Явно обозначить, что `sealed object` - это либо намеренное ограничение темы на immutable / append-only data, либо расширить архитектуру на update path.
- Сузить первый admissible set transitions и связать каждый переход с конкретным source-backed justification, чтобы policy выглядела не только синтезом, но и реализуемым design point.

