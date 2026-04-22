# Design 08. Conversion-aware lifecycle pipeline with cheap EC/LRC transitions

## Short Idea
Этот вариант трактует систему хранения как управляемый коридор переходов между состояниями одной канонической immutable-единицы. В control plane единица проходит через `3-way replication -> hybrid replica + EC -> RS -> LRC/wide LRC`, а каждое переключение разрешается только по заранее описанному графу и после проверки `access cost`, placement rules и reliability guardrails.

## Accent Subset
Этот вариант специально акцентирует:
- `convertible_codes_it_2022` - формальная метрика `access cost` и цена EC-to-EC conversion.
- `ec_survey_tos_2024` - общая рамка `redundancy transitioning` и системных trade-off.
- `elect_fast_2024` - hotness-aware SSTable-level transitioning и background offloading.
- `er_store_scientific_programming_2021` - трёхклассная `hot / warm / cold` policy и temperature conversion table.
- `lrc_convertible_arxiv_2023` - conversion для LRC с сохранением locality и оптимальным access cost.
- `xoring_elephants_arxiv_2013` - locality и repair-efficient EC как базовый холодный слой.

Именно этот поднабор задает тон варианту: не binary hot/cold split, а конверсионно-ориентированный pipeline, где cold tier выбирается так, чтобы следующие переходы оставались дешёвыми.

## Corpus Considered
Весь корпус `conspects/*.md` учитывается как общий контекст и как набор ограничений на допустимые design choices.

- EC-теория и границы переходов: `ec_survey_tos_2024`, `convertible_codes_it_2022`, `lrc_convertible_arxiv_2023`, `xoring_elephants_arxiv_2013`, `wide_lrc_fast_2023`, `azure_ec_atc_2012`, `hyres_arxiv_2025`.
- Lifecycle и hybrid storage: `morph_sosp_2024`, `er_store_scientific_programming_2021`, `elect_fast_2024`, `f4_osdi_2014`, `rapidraid_arxiv_2012`.
- Temperature-aware и infrastructure-aware policy: `hsm_ieee_access_2024`, `zebra_iwqos_2016`, `identifying_hot_cold_icde_2013`, `heart_fast_2019`.
- Latency, placement and access planning: `ec_store_icdcs_2018`, `benchmarking_ec_object_storage_fgcs_2025`.

## Problem
Одна фиксированная схема избыточности не решает сразу три задачи:
- горячие данные должны оставаться быстрыми на чтении и записи;
- холодные данные должны быть дешевыми по storage overhead;
- переходы между схемами не должны съедать выгоду от более экономичного слоя.

Проблема усиливается тем, что смена EC-параметров сама по себе имеет стоимость: приходится читать часть старых символов, записывать новые, учитывать locality и не нарушать repair efficiency. Поэтому архитектура должна оптимизировать не только steady-state размещение, но и сам путь между состояниями.

Все решения ниже относятся к одной канонической единице перехода: immutable sealed lifecycle unit. В source papers эта единица может называться по-разному, но в этой архитектуре это не разные уровни, а одна и та же единица, для которой меняется redundancy state.

## Architecture Components
Архитектура строится как control plane поверх storage data plane.

- `Telemetry collector` собирает access history, age proxy, read/write intensity, disk utilization и сигналы надежности.
- `Temperature estimator` переводит историю обращений в heat score, demand rank или temperature class.
- `Transition graph` задает явные допустимые ребра между состояниями и помечает, какие из них требуют sealed units, а какие могут выполняться в фоне.
- `Policy engine` выбирает допустимый target state только среди ребер transition graph и решает, нужен ли переход из replication в hybrid, из hybrid в EC или из EC в LRC.
- `Conversion planner` строит конкретный переход по выбранному ребру и проверяет, что он укладывается в допустимый `access cost`.
- `Layout manager` раскладывает data, parity и replicas по fault domains и удерживает locality для repair-sensitive layers.
- `Repair and recovery service` обслуживает degraded reads, rebuild и фоновое восстановление после отказов.
- `Metadata service` хранит текущую схему, состояние перехода, список допустимых next states и параметры выбранных code families.
- `Code family registry` фиксирует, какие пары схем вообще можно соединить дешёвым transcode path, чтобы policy не выбирала заведомо дорогой target.

## Data Layout
Базовый layout организован как коридор состояний для одной immutable lifecycle unit.

- `Hot tier`: 3-way replication для данных с высокой частотой доступа и чувствительным write path.
- `Warm tier`: гибридный слой `replica + EC`, где реплика держит быстрый критический путь, а EC уже готовит экономичный следующий шаг.
- `Cold tier`: RS-слой для sealed данных, если нужен простой и предсказуемый archival режим.
- `Deep cold tier`: LRC-слой, если важны repair traffic, degraded-read cost и locality.
- `Optional archive refinement`: wide LRC или другой locality-aware cold layout, если placement robustness и maintenance constraints это позволяют.

Layout-ограничения:
- data и parity одной unit нельзя класть в один fault domain;
- local groups должны оставаться repairable без полного чтения unit;
- target code families должны быть conversion-friendly, а не просто формально экономичными;
- metadata о схеме и состоянии transition хранится отдельно от самой единицы;
- для sealed units transition должен быть asynchronous, чтобы не блокировать write path.

## Data Flow
Поток данных устроен как последовательность управляемых переходов.

1. Новая запись попадает в hot tier и получает replication-first placement.
2. Telemetry слой собирает историю обращений, age proxy, utilization и reliability signal, после чего temperature estimator обновляет класс единицы.
3. Если единица остается горячей, система не форсирует conversion и держит `3-way replication`.
4. Если единица остывает и становится eligible for background migration, controller переводит ее в `hybrid replica + EC`, пока replication path еще остается живым.
5. После sealing и стабилизации единицы controller удаляет replica component и завершает переход в RS state.
6. Если холодная единица выгоднее обслуживается через locality-aware repair, `EC-to-EC` transcode переводит ее из RS в LRC-friendly state.
7. Read path для hot units идет через replicas, а cold units читаются через EC/LRC reconstruction только тогда, когда это действительно нужно.
8. Repair и migration выполняются асинхронно и отдельно от клиентского critical path.

## Transition Graph
Явные допустимые ребра здесь важнее общих слов про "охлаждение".

- `3-way replication -> hybrid replica + EC`: первый переход для горячей, но уже conversion-eligible unit; он дешевле полного re-encode, потому что replica path остается рабочим, пока parity достраивается в фоне.
- `hybrid replica + EC -> RS`: переход для sealed unit, когда parity уже готова и replica component можно безопасно удалить без потери нужного read/write поведения.
- `RS -> LRC`: переход для холодной sealed unit, если registry отмечает пару как conversion-friendly и выигрыша от locality достаточно, чтобы окупить дополнительный `access cost`.
- `RS -> wide LRC`: более поздний cold transition, когда placement robustness и maintenance constraints важнее минимального storage overhead.
- `skip-edges are illegal by default`: прямой прыжок `3-way replication -> RS/LRC` не является default legal edge; сначала нужен bridge state, если unit еще живет на write path.
- `no transition`: если current state не имеет legal edge в registry или ожидаемая экономия не превышает conversion cost, unit остается в текущем state.

## Policy Layer
Policy layer здесь не бинарный и не сводится к одному порогу.

- Температура данных оценивается по access history на фиксированном окне, как в hot/cold literature и temperature-aware storage papers.
- Demand skew и multi-tier ranking можно использовать вместо грубого `hot/cold`, если workload сильно неоднороден.
- Global disk utilization остается вторым управляющим сигналом, потому что горячесть сама по себе не показывает давление на capacity.
- Reliability state конкретных groups выступает guardrail: если группа дисков выглядит хуже других, policy не должна отправлять туда чувствительные stripes без необходимости.
- `Decision rule` сначала фильтрует candidate edges через transition graph и code family registry, а потом сравнивает expected steady-state gain с `Conversion cost` и `repair cost`.
- `Conversion cost` и `repair cost` проверяются явно; переход разрешается только если ожидаемая экономия выше стоимости конверсии.
- Hysteresis нужен, чтобы система не дергалась между режимами на шумных traces.
- `Code family registry` ограничивает search space, чтобы policy выбирала только те переходы, которые можно сделать дешевле full re-encode.
- Temperature signal может предложить переход, но не может обойти отсутствие legal edge или failure guardrail.

## Metrics / Evaluation Plan
Оценка должна смотреть не только на storage savings, но и на поведение transition path.

- `storage overhead` по состояниям и по всей системе;
- `read latency` и `tail latency` для hot и cold units;
- `write latency` и влияние на ingest path;
- `conversion access cost`, `transition IO` и `transition network traffic` для каждого edge отдельно;
- `repair traffic`, `degraded-read latency` и `recovery time`;
- `placement robustness`, `MTTDL` и доля units, которые остаются в разрешенной температурной зоне;
- `policy stability`, то есть частота лишних переключений и sensitivity к окну оценки;
- `migration efficiency`, то есть сколько I/O и сети съел переход относительно ожидаемой экономии.
- `upload / download / delete / waiting time` из benchmarking framing, если evaluation идет в object-storage-like режиме.

План сравнения:
- против `3-way replication`;
- против static RS и static LRC;
- против hot/cold split без multi-step pipeline;
- против hybrid storage без explicit conversion-cost model;
- против policy, которая учитывает только temperature, но не reliability или utilization;
- против policy, которая учитывает только reliability, но игнорирует temperature.

Сценарии проверки:

- `Age-skewed lifecycle trace`: имитирует то, что источники вроде F4 и ELECT используют age, request rate и delete rate как сигнал охлаждения.
- `Transition-heavy trace`: проверяет, окупаются ли `3R -> Hybrid -> RS -> LRC` переходы на жизненном цикле единицы, где значимы migration/transcode cost и background offloading.
- `Reliability-heterogeneous placement`: использует HeART-style guardrail, чтобы проверить, что policy не выбирает запрещенные target states в слабых disk groups.
- `Size bands`: результаты нужно показывать отдельно для разных размеров immutable unit, а не усреднять их в одну цифру, потому что conversion cost и repair traffic зависят от размера.

## Trade-offs / Risks / Assumptions
- Более гибкий pipeline улучшает steady-state баланс, но усложняет control plane и metadata.
- Conversion-friendly families ограничивают пространство допустимых схем, зато делают переходы дешевле и предсказуемее.
- LRC лучше для locality and repair, но не обязателен как лучший выбор для всех cold workloads.
- Если temperature estimate шумный, система может начать oscillate между соседними state'ами.
- Если background conversion слишком агрессивен, он начнет конкурировать с клиентским I/O.
- Архитектура предполагает, что данные можно явно выделять в immutable lifecycle units, которые либо seal, либо переводятся в background conversion phase.
- Если инфраструктура неоднородна по надежности, reliability guardrail может перевесить чисто temperature-driven choice.
- Это управляемый компромисс, а не обещание универсальной оптимальности.

## Source Map
- `ec_survey_tos_2024`: общая рамка trade-off между storage efficiency, performance, reliability и `redundancy transitioning`.
- `convertible_codes_it_2022`: формальная метрика `access cost` и нижние границы на conversion.
- `lrc_convertible_arxiv_2023`: conversion-aware LRC и сохранение locality при переходе.
- `xoring_elephants_arxiv_2013`: repair-efficient EC, locality и cold archival baseline.
- `benchmarking_ec_object_storage_fgcs_2025`: метрики `upload/download/delete/waiting time`, fault tolerance и benchmark framing.
- `er_store_scientific_programming_2021`: трёхклассная policy `hot / warm / cold`, temperature conversion table и update-path split.
- `elect_fast_2024`: SSTable-level hotness-aware transitioning и offloading менее горячих данных.
- `morph_sosp_2024`: lifecycle pipeline, hybrid redundancy и cheap first transition.
- `f4_osdi_2014`: warm tier, transparent migration и age-based temperature proxy.
- `hsm_ieee_access_2024`: heat plus global disk utilization и hysteresis-style switching.
- `zebra_iwqos_2016`: demand-aware tiering и multi-level EC parameter selection.
- `identifying_hot_cold_icde_2013`: batch hot/cold classification и exponential smoothing.
- `heart_fast_2019`: infrastructure reliability как second control signal.
- `ec_store_icdcs_2018`: latency-aware EC access planning и chunk movement inside EC layer.
- `azure_ec_atc_2012`: sealed extents, background EC и cheap reconstruction with LRC.
- `wide_lrc_fast_2023`: practical wide LRC design, placement robustness и maintenance constraints.
- `rapidraid_arxiv_2012`: pipelined archival migration from replication to EC.
- `hyres_arxiv_2025`: formal hybrid redundancy model and comparison of storage cost, file loss probability and repair traffic.
