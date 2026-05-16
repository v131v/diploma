# Diagrams for `design_16`

Этот файл собирает схемы для [design_16.md](./design_16.md): компоненты, связи, lifecycle pipeline, transition protocol и ключевые сущности control plane.

## 1. Компоненты и связи

```mermaid
flowchart LR
    subgraph Clients["Clients / workload"]
        W["Writes"]
        R["Reads"]
    end

    subgraph Temp["Temperature analysis"]
        ALC["Access-log collector"]
        BC["Batch classifier"]
        SL["Smoothing layer"]
        LT["Lifetime tracker"]
    end

    subgraph Decision["Decision engine"]
        SC["State classifier"]
        SS["State scorer"]
        TR["Transition registry"]
        PDA["Promotion / demotion arbiter"]
    end

    subgraph Control["Metadata / control plane"]
        UR["Unit registry"]
        CR["Cohort registry"]
        TS["Telemetry store"]
        PSS["Policy snapshot store"]
    end

    subgraph Orch["Transition orchestration"]
        CA["Cohort assembler"]
        PG["Placement gate"]
        BG["Budget gate"]
        CC["Commit coordinator"]
        FP["Fallback planner"]
        CD["Cleanup daemon"]
    end

    subgraph Data["Storage nodes / data plane"]
        RIP["Replica ingest pool"]
        HW["Hybrid workers"]
        CEW["Convertible EC workers"]
        ALW["Archive LRC workers"]
        RW["Repair workers"]
    end

    W --> RIP
    R --> RIP
    R --> UR

    RIP --> ALC
    RIP --> UR
    RIP --> HW

    ALC --> BC
    BC --> SL
    SL --> SC
    LT --> SC

    TS --> SC
    TS --> PSS
    SC --> SS
    TR --> SS
    SS --> PDA
    PDA --> UR
    PDA --> PSS

    UR --> CA
    TR --> CA
    CA --> PG
    CA --> BG
    PG --> CC
    BG --> CC
    CC --> CR
    CC --> UR
    CC --> FP
    CC --> CD

    CC --> HW
    CC --> CEW
    CC --> ALW

    RW --> TS
    RW --> UR
    RW -.priority over migration.-> CC
```

## 2. Dual-loop controller

```mermaid
flowchart TD
    T["Telemetry and policy windows"] --> C1["Loop 1: choose desired_state"]
    C1 --> S1["Heat + lifetime classification"]
    S1 --> S2{"Hard veto?"}
    S2 -- "Reliability band bad" --> HOLD1["Hold current state"]
    S2 -- "Repair pressure high" --> HOLD1
    S2 -- "No" --> S3["Pick next admissible state from registry"]
    S3 --> S4{"Transition debt pays off?"}
    S4 -- "No" --> HOLD1
    S4 -- "Yes" --> DS["Write desired_state to Unit registry"]

    DS --> C2["Loop 2: materialize desired_state safely"]
    C2 --> A1["Assemble compatible cohort"]
    A1 --> A2{"cohort_width reached before waiting_deadline?"}
    A2 -- "No" --> D1["Deferred / re-evaluate"]
    A2 -- "Yes" --> A3["Placement gate + Budget gate"]
    A3 --> A4{"Gates passed?"}
    A4 -- "No" --> D1
    A4 -- "Yes" --> A5["prepare -> verify -> metadata flip -> retire"]
    A5 --> OK["Committed new generation"]

    D1 --> T
    HOLD1 --> T
    OK --> T
```

## 3. Lifetime pipeline и reference family

```mermaid
stateDiagram-v2
    [*] --> R3 : ingest / mutable writes
    R3 --> Hy : post-seal background materialization
    Hy --> RS62 : cooling after hot window
    RS62 --> RS122 : family-local widening
    RS122 --> LRC : late-life archive re-encode

    state "R3-Active" as R3
    state "Hy-Bridge\nHy(1, RS(6,2))" as Hy
    state "EC-Convertible\nRS(6,2)" as RS62
    state "EC-Convertible(next)\nRS(12,2)" as RS122
    state "LRC-Archive\nLRC(12,2,2)" as LRC

    Hy --> R3 : reheating promotion
    RS62 --> Hy : reheating promotion
    RS122 --> Hy : reheating promotion
    LRC --> Hy : reheating promotion

    note right of R3
        Mutable ingest lives here.
        Policy manages only sealed units.
    end note

    note right of RS62
        Cheap transitions are only
        predeclared adjacent moves
        inside one family.
    end note

    note right of LRC
        Archive step is allowed,
        but not assumed cheap.
    end note
```

## 4. Transition protocol for one cohort

```mermaid
sequenceDiagram
    participant DE as Decision engine
    participant UR as Unit registry
    participant CA as Cohort assembler
    participant G as Placement/Budget gates
    participant CC as Commit coordinator
    participant DP as Data-plane workers
    participant CR as Cohort registry
    participant CD as Cleanup daemon

    DE->>UR: set desired_state for eligible SRU
    UR->>CA: expose compatible sealed units
    CA->>CA: check same current_state / desired_state / family / placement / policy_epoch
    CA->>G: candidate cohort
    G-->>CA: pass or defer

    alt waiting_window expired or gates failed
        CA-->>UR: mark deferred reason
    else cohort ready and gates passed
        CA->>CC: open transition job
        CC->>CR: persist target generation and progress
        CC->>DP: prepare target fragments in staging
        DP-->>CC: checksums + fragment completion
        CC->>G: verify placement diversity and budget compliance

        alt verify failed or desired_state desync after prepare
            CC->>CR: mark aborted
            CC->>CD: cleanup staging generation
            CD-->>UR: return SRU to re-evaluation queue
        else verify passed
            CC->>CR: metadata flip to new generation_id
            CC->>UR: state := desired_state
            CC->>CR: old layout -> retiring
            CC->>CD: retire old layout after grace period
        end
    end
```

## 5. Модель сущностей control plane

```mermaid
flowchart TB
    subgraph PolicyUnit["Policy unit"]
        SRU["SRU\nsealed extent\n1-3 GiB\none sealed_epoch"]
    end

    subgraph ControlEntities["Control-plane entities"]
        UREC["Unit registry record\nunit_id\nstate\ndesired_state\nfamily_id\nheat_score\npolicy_epoch\nstate_epoch"]
        COH["Transition cohort\nsame family_id\nsame placement_class\nsame fragment_size_class\nsame target transition"]
        CREC["Cohort registry record\ncommitted generation_id\nwaiting_deadline\nsource/target cohorts"]
        GENA["Authoritative generation"]
        GENS["Staging generation"]
    end

    subgraph Family["Family registry"]
        FREF["F_ref\nR3 -> Hy -> RS(6,2) -> RS(12,2) -> LRC(12,2,2)"]
        RULES["For each edge:\nallowed_next\ntransition_type\ncohort_width\nwaiting_window\nexpected_cost_model"]
    end

    SRU --> UREC
    UREC --> COH
    COH --> CREC
    CREC --> GENA
    CREC --> GENS
    FREF --> RULES
    RULES --> UREC
    RULES --> COH
```

## 6. Основные operational paths

```mermaid
flowchart LR
    IN["Ingest"] --> R3["R3-Active"]
    R3 --> SEAL["Seal extent -> create SRU"]
    SEAL --> HY["Hy-Bridge build"]
    HY --> EC["EC-Convertible"]
    EC --> ARC["LRC-Archive"]

    R3 -.reads.-> RR["Replica-first reads"]
    HY -.reads.-> RR
    EC -.reads.-> ER["Systematic EC reads / degraded decode"]
    ARC -.reads.-> LR["Local repair/read first"]

    HY -.repair.-> RP1["Replica-assisted repair"]
    EC -.repair.-> RP2["EC family repair"]
    ARC -.repair.-> RP3["Local repair preferred"]

    ARC -.reheat.-> PROMO["Promotion copy-out job"]
    EC -.reheat.-> PROMO
    HY -.reheat.-> PROMO
    PROMO --> HY
```
