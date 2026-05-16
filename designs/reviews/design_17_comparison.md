# design_17 comparison vs design_15 / design_16

Основа сравнения: `design_15.md`, `design_16.md`, `design_17.md`; финальные review (`design_15_round3.md`, `design_16_round2.md`, `designs/reviews/design_17.md`); `nir.txt`; `formal-brief.md`; `study-plan.md`; `designs/rubric.md`.

## 1) Rubric score (0-100) для design_17
- `design_17`: **94/100** (из финального review, `pass`, `critical=0`, `major=0`, `minor=2`).
- По rubric это верхний диапазон; архитектурно вариант зрелый и сопоставим с лучшими предыдущими.

## 2) NIR-match (0-10): design_15 vs design_16 vs design_17
- `design_15`: **7.8/10**
- `design_16`: **8.3/10**
- `design_17`: **9.4/10**

Кратко: `design_17` ближе всего к НИР, потому что почти дословно держит целевой каркас `Hy -> RS -> LRC -> wide LRC`, temperature + disk-utilization логику, и cost-aware переходы. `design_16` уже хорошо отражает идею lifecycle + orchestration, но его reference profile дальше от NIR-пайплайна. `design_15` технически сильный, но более специальный (SSTable-specific и family-gated RS focus), поэтому match с НИР ниже.

## 3) Implementation complexity (1-5) для design_17
- `design_17`: **4/5**

Пояснение границы prototype/simulator: сложность выше средней из-за cohort-level orchestration (`prepare/verify/flip/retire`), safety gates и multi-stage pipeline. При этом граница реалистична: делать `decision + control protocol prototype` и `trace-driven discrete-event extent simulator`, без full storage engine и без low-level codec optimization (это снижает риск до выполнимого дипломного масштаба).

## 4) Вывод: лучше или хуже предыдущих
- По теме диплома (`formal-brief` + `nir`): **лучше** `design_15` и `design_16`, так как наиболее точно воспроизводит целевой NIR-сценарий (pipeline состояний, temperature framing, utilization сигнал, критерий выгодности перехода).
- По реализуемости: **лучше `design_16`**, потому что явно закрывает его прошлую слабость через sensitivity sweep и фиксированную границу симулятора; **примерно на уровне `design_15`**, но чуть сложнее в оркестрации.
- Итоговый баланс: `design_17` выглядит как наиболее сильный кандидат для дипломной линии “NIR-aligned architecture + проверяемый simulator-first execution path”, несмотря на чуть более высокую инженерную сложность control plane.
