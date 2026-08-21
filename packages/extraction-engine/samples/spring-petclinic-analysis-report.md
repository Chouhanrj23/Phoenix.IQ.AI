# P3-11 POC -- positive-path: analyzing https://github.com/spring-projects/spring-petclinic.git (real, uncurated Spring Boot/JPA repository)

Pinned revision requested: 88e37c15cf6fc8490b01bc3e8e2c800cec1ac272
Resolved revision: 88e37c15cf6fc8490b01bc3e8e2c800cec1ac272
Revision matches pin: true
Commit subject: issue #2584: fix relation "unique_owner_pet_name" already exists in PostgreSQL
Committed at: 2026-07-30T12:10:46+01:00
Shallow clone: true
Total tracked files (after excluding .git, .mvn, .idea, .vscode, target, node_modules): 130

Top 15 file extensions by count:
.java 49
.properties 15
.html 12
.yml 8
.sql 7
.txt 4
.png 4
.scss 4
(no extension) 3
.xml 3
.svg 3
.gradle 2
.eot 2
.ttf 2
.woff 2

Java source files found (.java): 49

Java-extraction-relevant artifacts read: 54
Read failures: 0

Java modules discovered (Maven/Gradle build files found): 2
Files successfully parsed as Java: 30
Parse failures: 0
Distinct packages: 5
Types extracted (classes/interfaces/enums/records/annotations): 25
Methods extracted: 87
Call graph edges: 209
Type-dependency edges: 193
Spring controllers: 6
REST routes: 17
JPA entities: 6
Spring Data repositories: 3
Application config keys: 22
Config cross-references (@Value/@ConfigurationProperties/System.getenv sites): 0
Bridged canonical objects: 12
Bridged canonical relationships (Phase 4 prerequisite fix, dependsOn/hasAssociation): 29

## Representative extracted facts

### Maven/Gradle modules discovered

- build.gradle (gradle) -- org.springframework.samples:?:4.0.0-SNAPSHOT, 30 main source files, 19 test source files
- pom.xml (maven) -- org.springframework.samples:spring-petclinic:4.0.0-SNAPSHOT, 0 main source files, 0 test source files

### Spring MVC controllers and routes (first 5 controllers)

- `org.springframework.samples.petclinic.owner.OwnerController` (src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java:48)
  GET /owners/new -> initCreationForm()
  POST /owners/new -> processCreationForm()
  GET /owners/find -> initFindForm()
  GET /owners -> processFindForm(query:page)
  GET /owners/{ownerId}/edit -> initUpdateOwnerForm()
  POST /owners/{ownerId}/edit -> processUpdateOwnerForm(path:ownerId)
- `org.springframework.samples.petclinic.owner.PetController` (src/main/java/org/springframework/samples/petclinic/owner/PetController.java:47)
  GET /owners/{ownerId}/pets/new -> initCreationForm()
  POST /owners/{ownerId}/pets/new -> processCreationForm()
  GET /owners/{ownerId}/pets/{petId}/edit -> initUpdateForm()
  POST /owners/{ownerId}/pets/{petId}/edit -> processUpdateForm()
- `org.springframework.samples.petclinic.owner.VisitController` (src/main/java/org/springframework/samples/petclinic/owner/VisitController.java:42)
  GET /owners/{ownerId}/pets/{petId}/visits/new -> initNewVisitForm()
  POST /owners/{ownerId}/pets/{petId}/visits/new -> processNewVisitForm(path:petId)
- `org.springframework.samples.petclinic.system.CrashController` (src/main/java/org/springframework/samples/petclinic/system/CrashController.java:28)
  GET /oups -> triggerException()
- `org.springframework.samples.petclinic.system.WelcomeController` (src/main/java/org/springframework/samples/petclinic/system/WelcomeController.java:22)
  GET / -> welcome()

### JPA entities (all)

- `org.springframework.samples.petclinic.owner.Owner` -> table "owners", id fields [], 4 columns, 1 associations (src/main/java/org/springframework/samples/petclinic/owner/Owner.java:47)
  OneToMany pets: Pet
- `org.springframework.samples.petclinic.owner.Pet` -> table "pets", id fields [], 3 columns, 2 associations (src/main/java/org/springframework/samples/petclinic/owner/Pet.java:44)
  ManyToOne type: PetType
  OneToMany visits: Visit
- `org.springframework.samples.petclinic.owner.PetType` -> table "types", id fields [], 0 columns, 0 associations (src/main/java/org/springframework/samples/petclinic/owner/PetType.java:26)
- `org.springframework.samples.petclinic.owner.Visit` -> table "visits", id fields [], 2 columns, 0 associations (src/main/java/org/springframework/samples/petclinic/owner/Visit.java:34)
- `org.springframework.samples.petclinic.vet.Specialty` -> table "specialties", id fields [], 0 columns, 0 associations (src/main/java/org/springframework/samples/petclinic/vet/Specialty.java:28)
- `org.springframework.samples.petclinic.vet.Vet` -> table "vets", id fields [], 1 columns, 1 associations (src/main/java/org/springframework/samples/petclinic/vet/Vet.java:43)
  ManyToMany specialties: Specialty

### Bridged relationships (all) -- real, directly-evidenced edges between bridged objects

- PetController --dependsOn({"relation":"paramType"})--> Owner
- PetController --dependsOn({"relation":"paramType"})--> Owner
- Vet --dependsOn({"relation":"paramType"})--> Specialty
- OwnerController --dependsOn({"relation":"returnType"})--> Owner
- OwnerController --dependsOn({"relation":"paramType"})--> Owner
- Owner --dependsOn({"relation":"returnType"})--> Pet
- Pet --dependsOn({"relation":"paramType"})--> Visit
- Owner --dependsOn({"relation":"returnType"})--> Pet
- PetController --dependsOn({"relation":"paramType"})--> Owner
- OwnerController --dependsOn({"relation":"paramType"})--> Owner
- Owner --dependsOn({"relation":"paramType"})--> Pet
- Owner --dependsOn({"relation":"paramType"})--> Visit
- PetController --dependsOn({"relation":"returnType"})--> Owner
- VisitController --dependsOn({"relation":"paramType"})--> Visit
- Owner --dependsOn({"relation":"returnType"})--> Pet
- PetController --dependsOn({"relation":"paramType"})--> Pet
- VisitController --dependsOn({"relation":"returnType"})--> Visit
- PetController --dependsOn({"relation":"paramType"})--> Pet
- PetController --dependsOn({"relation":"paramType"})--> Owner
- VisitController --dependsOn({"relation":"paramType"})--> Owner
- PetController --dependsOn({"relation":"paramType"})--> Pet
- OwnerController --dependsOn({"relation":"paramType"})--> Owner
- Pet --dependsOn({"relation":"paramType"})--> PetType
- PetController --dependsOn({"relation":"returnType"})--> Pet
- Pet --dependsOn({"relation":"returnType"})--> PetType
- Vet --hasAssociation({"associationKind":"ManyToMany","fieldName":"specialties"})--> Specialty
- Owner --hasAssociation({"associationKind":"OneToMany","fieldName":"pets"})--> Pet
- Pet --hasAssociation({"associationKind":"OneToMany","fieldName":"visits"})--> Visit
- Pet --hasAssociation({"associationKind":"ManyToOne","fieldName":"type"})--> PetType

### Spring Data repositories (all)

- `org.springframework.samples.petclinic.owner.OwnerRepository` extends JpaRepository<Owner, Integer>, 2 declared query methods (src/main/java/org/springframework/samples/petclinic/owner/OwnerRepository.java:36)
- `org.springframework.samples.petclinic.owner.PetTypeRepository` extends JpaRepository<PetType, Integer>, 1 declared query methods (src/main/java/org/springframework/samples/petclinic/owner/PetTypeRepository.java:30)
- `org.springframework.samples.petclinic.vet.VetRepository` extends Repository<Vet, Integer>, 2 declared query methods (src/main/java/org/springframework/samples/petclinic/vet/VetRepository.java:38)

### Application configuration keys found (values redacted where the key looks sensitive)

- src/main/resources/application-mysql.properties:2 database = mysql
- src/main/resources/application-mysql.properties:3 spring.datasource.url = ${MYSQL_URL:jdbc:mysql://localhost/petclinic}
- src/main/resources/application-mysql.properties:4 spring.datasource.username = ${MYSQL_USER:petclinic}
- src/main/resources/application-mysql.properties:5 spring.datasource.password = (redacted)
- src/main/resources/application-mysql.properties:7 spring.sql.init.mode = always
- src/main/resources/application-postgres.properties:2 database = postgres
- src/main/resources/application-postgres.properties:3 spring.datasource.url = ${POSTGRES_URL:jdbc:postgresql://localhost/petclinic}
- src/main/resources/application-postgres.properties:4 spring.datasource.username = ${POSTGRES_USER:petclinic}
- src/main/resources/application-postgres.properties:5 spring.datasource.password = (redacted)
- src/main/resources/application-postgres.properties:7 spring.sql.init.mode = always
- src/main/resources/application.properties:2 database = h2
- src/main/resources/application.properties:3 spring.sql.init.schema-locations = classpath*:db/${database}/schema.sql
- src/main/resources/application.properties:4 spring.sql.init.data-locations = classpath*:db/${database}/data.sql
- src/main/resources/application.properties:7 spring.thymeleaf.mode = HTML
- src/main/resources/application.properties:10 spring.jpa.hibernate.ddl-auto = none
- src/main/resources/application.properties:11 spring.jpa.open-in-view = false
- src/main/resources/application.properties:12 spring.jpa.hibernate.naming.physical-strategy = org.hibernate.boot.model.naming.PhysicalNamingStrategySnakeCaseImpl
- src/main/resources/application.properties:13 spring.jpa.properties.hibernate.default_batch_fetch_size = 16
- src/main/resources/application.properties:16 spring.messages.basename = messages/messages
- src/main/resources/application.properties:21 management.endpoints.web.exposure.include = *
- src/main/resources/application.properties:24 logging.level.org.springframework = INFO
- src/main/resources/application.properties:29 spring.web.resources.cache.cachecontrol.max-age = 12h

### Provenance -- one representative fact of each kind, showing what was actually stamped

- Entity `org.springframework.samples.petclinic.owner.Owner`.provenance = {"sourceId":"repo://spring-petclinic","sourceVersion":"88e37c15cf6fc8490b01bc3e8e2c800cec1ac272","derivedBy":"extraction-engine","derivedAt":"2026-08-19T19:54:32.764Z"}
- Controller `org.springframework.samples.petclinic.owner.OwnerController`.provenance = {"sourceId":"repo://spring-petclinic","sourceVersion":"88e37c15cf6fc8490b01bc3e8e2c800cec1ac272","derivedBy":"extraction-engine","derivedAt":"2026-08-19T19:54:32.764Z"}
- Bridged canonical object `api-2ca89ca285a8f472` (integration.api).metadata.provenance = [{"sourceId":"repo://spring-petclinic","sourceType":"source-code","derivedBy":"extraction-engine","derivedAt":"2026-08-19T19:54:32.764Z"}]
  .evidence = [{"id":"evidence-0e0381fdb6e01a75","sourceId":"repo://spring-petclinic","locator":"src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java#L48-L179","capturedAt":"2026-08-19T19:54:32.764Z","sourceVersion":"88e37c15cf6fc8490b01bc3e8e2c800cec1ac272"}]
  .confidenceDetail = {"basis":"observed"}

## OKF mapping and validation

Bundle validates against the real validateCanonicalKnowledgeBundle: true
Every provenance/evidence sourceId resolves against the sources registry: true
OKF YAML document generated: 1077 lines
OKF YAML round-trips through the real parseAndValidateOkfYaml: true

Full generated OKF document written to C:\Users\OPEN_OS\Desktop\Phoenix.IQ.AI\Phoenix.ai\packages\extraction-engine\samples\spring-petclinic.okf.yaml
