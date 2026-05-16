# Diagrams for `design_17`

Этот файл собирает схемы для [design_17.md](./design_17.md): компоненты, связи, dual-loop control, lifecycle pipeline, transition protocol и ключевые сущности control plane.

## 1. Компоненты и связи

```mermaid
flowchart LR
    subgraph Clients["Clients / workload"]
        W["Writes"]
        R["Reads"]
    end

    subgraph Temp["Temperature analysis"]
        ALC["Access-log collector"]
        HWIN["H = N / T policy windows"]
        EWMA["EWMA smoothing"]
        HYST["Hysteresis + class mapper"]
        LIFE["Lifetime tracker"]
    end

    subgraph Decision["Decision engine"]
        SIG["Signal priority engine"]
        ADJ["Adjacency selector"]
        DEBT["Transition debt check"]
        POUT["desired_state writer"]
    end

    subgraph Control["Metadata / control plane"]
        SRU["sru_registry"]
        COH["cohort_registry"]
        TR["transition_registry"]
        POL["policy_epoch / state_epoch store"]
    end

    subgraph Orch["Transition orchestration"]
        CA["cohort_assembler"]
        PG["placement_gate"]
        BG["budget_gate"]
        CC["commit_coordinator"]
        CL["cleanup_daemon"]
    end

    subgraph Data["Storage nodes / data plane"]
        RIP["Replica ingest workers"]
        HYW["Hybrid materializer"]
        RSW["RS workers"]
        LRCW["LRC workers"]
        REPW["Repair workers"]
    end

    W --> RIP
    R --> RIP
    R --> SRU

    RIP --> ALC
    RIP --> SRU
    RIP --> HYW

    ALC --> HWIN
    HWIN --> EWMA
    EWMA --> HYST
    LIFE --> HYST
    HYST --> SIG
    REPW --> SIG
    TR --> ADJ
    SIG --> ADJ
    ADJ --> DEBT
    DEBT --> POUT
    POUT --> SRU
    POUT --> POL

    SRU --> CA
    TR --> CA
    CA --> PG
    CA --> BG
    PG --> CC
    BG --> CC
    CC --> COH
    CC --> SRU
    CC --> CL

    CC --> HYW
    CC --> RSW
    CC --> LRCW
    REPW -. repair priority over migration .-> CC
    CL --> SRU
```

## 2. Dual-loop / policy-execution control

```mermaid
flowchart TD
    T["Telemetry + policy window"] --> P1["Loop 1: choose desired_state per SRU"]
    P1 --> S1["Compute heat_ewma + lifetime_stage + global_utilization + repair_pressure + reliability_band"]
    S1 --> S2{"Reliability or repair veto?"}
    S2 -- "Yes" --> HOLD["Keep current state"]
    S2 -- "No" --> S3["Pick one adjacent target from transition graph"]
    S3 --> S4{"Transition debt pays off?"}
    S4 -- "No" --> HOLD
    S4 -- "Yes" --> S5["Write desired_state only"]

    S5 --> P2["Loop 2: materialize desired_state safely"]
    P2 --> E1["Assemble cohort by {current_state, desired_state, fragment_size_class, placement_class, policy_epoch}"]
    E1 --> E2{"cohort_width reached before waiting_deadline?"}
    E2 -- "No" --> DEF["Deferred for next policy cycle"]
    E2 -- "Yes" --> E3["Run placement_gate + budget_gate + desync check"]
    E3 --> E4{"All gates pass?"}
    E4 -- "No" --> DEF
    E4 -- "Yes" --> E5["prepare -> verify -> metadata flip -> retire"]
    E5 --> OK["Commit new generation_id"]

    HOLD --> T
    DEF --> T
    OK --> T
```

## 3. Lifecycle pipeline и reference family

```mermaid
stateDiagram-v2
    [*] --> R3 : ingest / mutable writes
    R3 --> HY : seal extent + initial materialization
    HY --> RS63 : cooling
    RS63 --> LRC12 : cooling
    LRC12 --> LRC24 : cooling

    state "R3-Active\npre-seal only" as R3
    state "Hy(1,RS(6,3))\nsealed hot bridge" as HY
    state "RS(6,3)\nsealed warm state" as RS63
    state "LRC(12,2,2)\nsealed cold state" as LRC12
    state "LRC(24,4,2)\nsealed deep-cold state" as LRC24

    LRC12 --> HY : promote-copy on reheating
    LRC24 --> HY : promote-copy on reheating

    note right of R3
        R3 is outside lifecycle policy.
        Policy starts after sealing.
    end note

    note right of HY
        Reference family is fixed for v1:
        Hy -> RS -> LRC(12) -> wide LRC(24)
    end note

    note right of RS63
        Arbitrary jumps are forbidden.
        Only explicit adjacent transitions are valid.
    end note
```

## 4. Transition protocol for one cohort

```mermaid
sequenceDiagram
    participant DE as Decision engine
    participant SRU as sru_registry
    participant CA as cohort_assembler
    participant G as placement/budget gates
    participant CC as commit_coordinator
    participant DP as data-plane workers
    participant COH as cohort_registry
    participant CL as cleanup_daemon

    DE->>SRU: set desired_state for eligible SRU
    SRU->>CA: expose compatible units
    CA->>CA: group by current_state, desired_state, fragment_size_class, placement_class, policy_epoch
    CA->>G: candidate cohort
    G-->>CA: pass or defer

    alt cohort incomplete or gates failed
        CA-->>SRU: record waiting / defer reason
    else cohort ready
        CA->>CC: open transition job
        CC->>COH: persist pending_job, target generation, waiting_deadline
        CC->>DP: prepare target fragments in staging
        DP-->>CC: completion + checksums
        CC->>G: verify completeness, placement, budget, desync

        alt verify failed or desired_state changed after prepare
            CC->>COH: mark aborted + abort_reason
            CC->>CL: cleanup staging generation
            CL-->>SRU: clear pending_job and requeue SRU
        else verify passed
            CC->>COH: metadata flip to committed generation_id
            CC->>SRU: state := desired_state, state_epoch++
            CC->>COH: old generation -> retiring
            CC->>CL: retire old layout after grace period
        end
    end
```

## 5. Модель control-plane entities

```mermaid
flowchart TB
    subgraph Units["Policy and execution units"]
        SRUOBJ["SRU\nsealed extent\nfixed size class\npolicy unit"]
        COHORTOBJ["Coding cohort\nexecution unit\natomic commit scope"]
    end

    subgraph Registries["Registries"]
        SRUREC["sru_registry record\nunit_id\nstate\ndesired_state\nheat_ewma\nlifetime_stage\nreliability_band\nrepair_pressure\npolicy_epoch\nstate_epoch\npending_job"]
        COHREC["cohort_registry record\ncohort_id\nsource_state\ntarget_state\ngeneration_id\nwaiting_deadline\nabort_reason\nstatus"]
        TRREC["transition_registry edge\nallowed_next\ncohort_width\ntransition_type\nfragment_size_class\nplacement_class\ncost model"]
    end

    subgraph Generations["Committed vs staging layout"]
        AUTH["Authoritative generation\nserves reads and repair"]
        STAGE["Staging generation\nprepare / verify only"]
        RET["Retiring generation\ngrace-period cleanup"]
    end

    SRUOBJ --> SRUREC
    SRUREC --> COHORTOBJ
    COHORTOBJ --> COHREC
    TRREC --> SRUREC
    TRREC --> COHREC
    COHREC --> AUTH
    COHREC --> STAGE
    COHREC --> RET
```

## 6. Основные operational paths

```mermaid
flowchart LR
    IN["Client ingest"] --> R3["R3-Active"]
    R3 --> SEAL["Seal extent -> create SRU"]
    SEAL --> HY["Hy(1,RS(6,3))"]
    HY --> RS["RS(6,3)"]
    RS --> L12["LRC(12,2,2)"]
    L12 --> L24["LRC(24,4,2)"]

    R3 -. reads .-> RR["Replica-first reads"]
    HY -. reads .-> RR
    RS -. reads .-> ER["Systematic EC reads"]
    L12 -. reads .-> LR["Local/systematic reads"]
    L24 -. reads .-> LR

    RS -. degraded .-> DEC["Decode path"]
    L12 -. degraded .-> DEC
    L24 -. degraded .-> DEC

    HY -. repair .-> RH["Replica-assisted repair"]
    RS -. repair .-> RG["Global RS repair"]
    L12 -. repair .-> RL["Local-first LRC repair"]
    L24 -. repair .-> RL

    L12 -. reheating .-> PROMO["Promote-copy job"]
    L24 -. reheating .-> PROMO
    PROMO --> HY

    RG -. backlog blocks cooling .-> RS
    RL -. backlog blocks cooling .-> L12
```

## 7. Пользовательский API и ingest-слой

```mermaid
flowchart LR
    subgraph Client["Клиент / пользовательский API"]
        CU["Создать объект"]
        AU["Дополнить объект"]
        FU["Завершить запись"]
        RU["Чтение / чтение диапазона"]
    end

    subgraph ObjectView["Представление объекта и metadata"]
        OBJ["Пространство объектов\nпользователь видит один объект/blob"]
        SPLIT["Объект = sealed prefix + active tail"]
        OIDX["Индекс extent-ов объекта\nотображает логические смещения в extents"]
        WCTX["Контекст записи\nтекущий active tail + следующее смещение"]
    end

    subgraph Ingest["Ingest-слой (до sealing)"]
        R3["R3-Active\nреплицируемый mutable ingest"]
        AEXT["Активный extent\nтекущий хвост для записи"]
        FULL{"Extent заполнен\nили вызвано завершение?"}
        SEAL["Seal extent"]
        NEXT["Открыть следующий active tail\nесли объект ещё открыт"]
    end

    subgraph PostSeal["Передача после sealing"]
        SRU["Создать SRU\nодин sealed extent = один SRU"]
        HYM["Начальная hybrid materialization"]
        HY["Hy(1,RS(6,3))\nпервое состояние под lifecycle-policy"]
    end

    CU --> OBJ
    OBJ --> SPLIT
    OBJ --> WCTX
    SPLIT --> OIDX

    AU --> WCTX
    WCTX --> AEXT
    AEXT --> R3
    AEXT --> FULL
    FULL -- "Нет" --> AEXT
    FULL -- "Да" --> SEAL
    FU --> FULL

    SEAL --> OIDX
    SEAL --> SRU
    SEAL --> NEXT
    NEXT --> WCTX

    SRU --> HYM
    HYM --> HY

    RU --> OIDX
    RU --> AEXT
```

## 8. MVP Stripe-First Policy / Execution Model

**8.1 Политика**

```mermaid
flowchart LR
    ACC["Счётчики\nпо SRU"] --> EW["Обновить\nheat_ewma"]
    EW --> AGG["Агрегировать\nheat по stripe"]
    AGG --> STR["StripeRecord\ncurrent_state\nstripeHeat"]
    STR --> CAND["Построить\ncandidate"]
    CAND --> SCORE["Посчитать\nbenefitScore"]
    SCORE --> WAIT["Очередь\nwaiting"]
```

**8.2 Запуск**

```mermaid
flowchart LR
    WAIT["Очередь\nwaiting"] --> DEAD{"Пора\nзапускать?"}
    DEAD -- "Нет" --> WAIT
    DEAD -- "Да" --> RECHECK["Перепроверить\nbenefit и ресурсы"]
    RECHECK -- "benefit <= 0" --> DROP["expired"]
    RECHECK -- "benefit > 0" --> PREP["prepare"]
    PREP --> VER["verify"]
    VER --> FLIP["metadata flip"]
    FLIP --> RET["retire"]
```

Ключевая идея этой схемы:

- `heat` считается на `SRU`;
- `current_state` и aggregated heat живут на `StripeRecord`;
- `desired_state` и `benefitScore` живут на `TransitionCandidate`;
- в wait queue лежат только полные executable candidates, поэтому timeout означает `launch or expire`, а не partial commit.
