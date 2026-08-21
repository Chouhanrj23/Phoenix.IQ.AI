# P4-10 -- real repository graph demo: spring-petclinic

## REAL REPOSITORY DATA (not sample/test data)

Repository: https://github.com/spring-projects/spring-petclinic.git
Pinned revision requested: 88e37c15cf6fc8490b01bc3e8e2c800cec1ac272
Resolved revision: 88e37c15cf6fc8490b01bc3e8e2c800cec1ac272
Revision matches pin: true
Artifacts read: 54
Read failures: 0

Java files parsed: 30
Parse failures: 0
Bridged canonical objects: 12
Bridged canonical relationships: 29

## Stage 3 -- OKF bundle (P3-09)

Bundle validates: true
Source references resolve: true
OKF YAML round-trips: true

## Stage 4 -- graph mapping (P4-01)

Mapped nodes: 12
Mapped relationships: 29
Unmappable elements (kinds this bundle produced with no graph mapping): 0

## Stage 5 -- Neo4j write operations (P4-02)

Node write operations: 12
Relationship write operations: 29

## Stage 6 -- Neo4j ingestion (P4-03/P4-04)

Starting a real, ephemeral Neo4j instance via Testcontainers...
Nodes ingested: 12
Relationships ingested: 29

Re-running the SAME ingestion a second time, to demonstrate idempotency...
Nodes ingested (2nd run): 12
Relationships ingested (2nd run): 29

## Stage 7 -- graph query-back (P4-07)

Nodes in Neo4j after ingestion: 12
Relationships in Neo4j after ingestion: 29
Idempotency confirmed: node/relationship count unchanged after re-ingestion (12 nodes, 29 relationships, both runs).

### Representative real nodes (first 10)

- (:Api {id: "api-1ba5dbbb916a3f8c", label: "WelcomeController"})
- (:Api {id: "api-2ca89ca285a8f472", label: "OwnerController"})
- (:Api {id: "api-8808040d90fd5194", label: "VisitController"})
- (:Api {id: "api-d05ec2c74095c218", label: "CrashController"})
- (:Api {id: "api-e65ae4aa94d82d5d", label: "VetController"})
- (:Api {id: "api-f7040584d84949f8", label: "PetController"})
- (:Entity {id: "entity-2531e5ce7b896ae3", label: "Owner"})
- (:Entity {id: "entity-5b214fa8440d9db9", label: "Visit"})
- (:Entity {id: "entity-7362ae070b5727c1", label: "PetType"})
- (:Entity {id: "entity-86c4baaa9e0c2da1", label: "Specialty"})

### Representative real relationships (first 10)

- (PetController)-[:DEPENDS_ON]->(Owner)
- (PetController)-[:DEPENDS_ON]->(Owner)
- (Vet)-[:DEPENDS_ON]->(Specialty)
- (OwnerController)-[:DEPENDS_ON]->(Owner)
- (OwnerController)-[:DEPENDS_ON]->(Owner)
- (Vet)-[:HAS_ASSOCIATION]->(Specialty)
- (Owner)-[:DEPENDS_ON]->(Pet)
- (Pet)-[:DEPENDS_ON]->(Visit)
- (Owner)-[:HAS_ASSOCIATION]->(Pet)
- (Owner)-[:DEPENDS_ON]->(Pet)

## Stage 8 -- consistency validation (P4-09)

Consistent: true
Differences: 0
Unmappable OKF elements (not a graph inconsistency -- no P4-01 mapping exists for their kind): 0

## Sample/test data disclosure

This demo graph contains ONLY objects/relationships bridged from the real spring-petclinic source above -- no hand-authored sample OKF (e.g. the P2-11 aurora-commerce sample) was ingested into this graph. Every node/relationship listed above is repository-derived.

## Limitations

- Only `integration.api` and `domain.entity` OKF kinds have a real Phase 3 producer today -- this demo graph accordingly contains only `Api`/`Entity` nodes and `DEPENDS_ON`/`HAS_ASSOCIATION` relationships, not the full 15-kind/19-relationship-type vocabulary P4-01 is capable of mapping. See docs/phase-4/README.md for the full producer-coverage table.
- This run used a fresh, ephemeral Testcontainers Neo4j instance for reproducibility, not the persistent docker-compose instance a developer would run locally -- both are exercised by the test suite and documented separately in docs/phase-4/README.md.

Full generated OKF document written to C:\Users\OPEN_OS\Desktop\Phoenix.IQ.AI\Phoenix.ai\packages\graph-persistence\samples\spring-petclinic-graph-demo.okf.yaml
