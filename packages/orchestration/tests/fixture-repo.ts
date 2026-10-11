import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createGitRepositoryConnector,
  type SourceRepositoryDescriptor,
} from '@phoenix-ai/ingestion-connectors';

/**
 * A real git repository for the end-to-end tests: a small Spring Boot order
 * service, committed with real `git`, read back by the real git connector.
 * Nothing downstream of the connector is faked -- the point of the suite is
 * that every real stage handles real input.
 *
 * Deliberately includes what a real repository contains and the pipeline
 * must handle:
 *  - secrets in config and code (the redaction gate must remove them before
 *    extraction, and they must appear in NO output);
 *  - an email address in a README (PII);
 *  - a binary file the gate cannot scan (must be quarantined, and reported);
 *  - a path containing a space (the P8 locator fix).
 */

export const SECRETS = {
  datasourcePassword: 'orders-db-pass-9271',
  urlPassword: 'pgpass-4417',
  paymentSecret: 'sk_live_93fA7cQ2xZ',
  ownerEmail: 'orders-team@example.com',
} as const;

const FILES: Record<string, string> = {
  'pom.xml': `<?xml version="1.0"?>
<project>
  <groupId>com.example.orders</groupId>
  <artifactId>order-service</artifactId>
  <version>1.0.0</version>
</project>
`,
  'src/main/java/com/example/orders/Customer.java': `package com.example.orders;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "customers")
public class Customer {
  @Id
  private Long id;
  private String name;
}
`,
  'src/main/java/com/example/orders/Order.java': `package com.example.orders;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "orders")
public class Order {
  @Id
  private Long id;
  private String status;
  @ManyToOne
  private Customer customer;
}
`,
  'src/main/java/com/example/orders/OrderRepository.java': `package com.example.orders;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, Long> {
}
`,
  'src/main/java/com/example/orders/OrderController.java': `package com.example.orders;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/orders")
public class OrderController {

  private static final String PAYMENT_SECRET = "${SECRETS.paymentSecret}";

  private final OrderRepository repository;

  public OrderController(OrderRepository repository) {
    this.repository = repository;
  }

  @PostMapping
  public Order createOrder(@RequestBody Order order) {
    return repository.save(order);
  }

  @GetMapping("/{id}")
  public Order getOrder(@PathVariable Long id) {
    return repository.findById(id).orElseThrow();
  }

  @PutMapping("/{id}/cancel")
  public Order cancelOrder(@PathVariable Long id) {
    return repository.findById(id).orElseThrow();
  }
}
`,
  'src/main/resources/application.properties': `spring.application.name=order-service
spring.datasource.url=jdbc:postgresql://orders:${SECRETS.urlPassword}@db:5432/orders
spring.datasource.username=orders
spring.datasource.password=${SECRETS.datasourcePassword}
`,
  'README.md': `# Order service\n\nOwned by ${SECRETS.ownerEmail}.\n`,
};

/** A minimal, real PNG header -- binary content the redaction gate cannot scan. */
const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

export const FIXTURE_SOURCE_ID = 'repo://example/order-service';

export interface FixtureRepo {
  readonly root: string;
  readonly head: string;
  readonly descriptor: SourceRepositoryDescriptor;
  readonly connector: ReturnType<typeof createGitRepositoryConnector>;
  /** P8: commit further changes (a later run's input); returns the new HEAD. */
  commit(
    files: Readonly<Record<string, string>>,
    options: { message: string; date: string; authorEmail?: string },
  ): string;
  dispose(): void;
}

interface CommitIdentity {
  readonly date: string;
  readonly authorEmail: string;
}

const INITIAL: CommitIdentity = {
  date: '2026-09-01T09:00:00+00:00',
  authorEmail: 'test@example.invalid',
};

function git(args: readonly string[], cwd: string, identity: CommitIdentity = INITIAL): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Phoenix Test',
      GIT_AUTHOR_EMAIL: identity.authorEmail,
      GIT_COMMITTER_NAME: 'Phoenix Test',
      GIT_COMMITTER_EMAIL: identity.authorEmail,
      GIT_AUTHOR_DATE: identity.date,
      GIT_COMMITTER_DATE: identity.date,
    },
  });
}

function writeFiles(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, '..'), { recursive: true });
    writeFileSync(absolute, content, 'utf8');
  }
}

export { FILES as FIXTURE_FILES };

export function createFixtureRepo(): FixtureRepo {
  const parent = mkdtempSync(join(tmpdir(), 'phoenix-p8-e2e-'));
  const root = join(parent, 'order service');
  mkdirSync(root, { recursive: true });
  writeFiles(root, FILES);
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'logo.png'), PNG_BYTES);

  git(['init', '-q', '-b', 'main'], root);
  git(['config', 'core.autocrlf', 'false'], root);
  git(['add', '--all'], root);
  git(['commit', '-q', '-m', 'Order service'], root);
  const head = git(['rev-parse', 'HEAD'], root).trim();

  return {
    root,
    head,
    descriptor: {
      id: FIXTURE_SOURCE_ID,
      sourceType: 'source-code',
      label: 'order-service (P8 end-to-end fixture)',
      locator: `file://${encodeURI(root.replace(/\\/g, '/'))}`,
      repository: { kind: 'local-directory' },
    },
    connector: createGitRepositoryConnector(),
    commit(files, { message, date, authorEmail }) {
      const identity = { date, authorEmail: authorEmail ?? INITIAL.authorEmail };
      writeFiles(root, files);
      git(['add', '--all'], root, identity);
      git(['commit', '-q', '-m', message], root, identity);
      return git(['rev-parse', 'HEAD'], root, identity).trim();
    },
    dispose: () => rmSync(parent, { recursive: true, force: true }),
  };
}
